'use client';

/**
 * 盒玩販賣機 —— 立體物理版（blindbox_mode5）
 *
 * 跟 Mode2/3/4 最大的不同：盒子是真的 3D 方塊（three.js），掉落走
 * 真物理引擎（matter.js），會翻滾、會落在不同的面、會互相堆疊。
 * 底圖用「離軸投影」保持 1:1 不變形 —— 直接轉鏡頭的話平面美術會
 * 被壓成梯形，只有盒子該拿到俯視角。
 *
 * 交互流程：換一批 / 立即開盒 / 試試看（按鈕在頁面底部操作欄，
 * 照一番賞的樣式）→ 掉盒 → 全部落定浮出「點擊取物」→ 點取物口
 * → onAnimationComplete() → 由商品頁彈既有的恭喜視窗
 *
 * 手感參數存在 machine_theme_params（後台「抽獎模組設定 → 參數設定」
 * 可調），讀不到就用 DEFAULTS。座標系直接拿原圖 750×932 當世界單位。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as Matter from 'matter-js';
import { createClient } from '@/lib/supabase/client';

export interface BlindboxMachineMode5Props {
  machineState: 'idle' | 'animating';
  drawCount: number;
  boxImageUrl?: string;
  remaining: number;
  onAnimationComplete?: () => void;
  onPush?: () => void;
  onPurchase?: () => void;
  onTrial?: () => void;
  isSoldOut?: boolean;
  onLoaded?: () => void;
  /** 換一批：頁面每按一次就遞增，機台看到變化才動作。
   *  按鈕已移到頁面底部操作欄（老闆指定照一番賞），機台本身不再畫按鈕 */
  restockSignal?: number;
}

const ASSETS = '/images/blindbox/mode5';

const ART_W = 750, ART_H = 932, HALF = Math.PI / 2;
const S = 0.80;   // 原型 v2 放大：櫃口淨高 163/154 的 65%/69%
const BW = 100 * S, BH = 133 * S, BD = 78 * S;

/** 依 bg 實測：隔板柱 x、層板面 y */
const SLOT_XS = [122, 245, 370, 494, 613];
/** 層板面前緣：取到「推出到底時含 yaw 的最前下角投影」還留 4px 餘裕 */
const ROW_FLOOR = [390, 573];
/** 依 front 實測：取物口黑色遮罩範圍 */
const TRAY = { left: 108, right: 640, top: 640, bottom: 780, cx: 374, cy: 710 };
/** 底部漏斗碰撞範圍 */
const CHUTE = { topY: 596.765, floorY: 815.087, neckL: 109.933, neckR: 633.523 };
const STEP = BD + 4, INCLINE = 18, PUSH_Z = 34, Z_EMPH = 1.2, TRAY_Z = 20, HANDOFF = 1.15;
const ADV_TAIL = 260, ADV_SOLO = 460, FADE_MS = 380;

/** 後台沒設定時的預設（與 backend/app/settings/modules/machineParams.ts 對齊） */
const DEFAULTS = {
  stock: 1, jitter: 140, pushMs: 430, push: 3.3,
  fov: 36, camUp: 300, lit: 1.2, volume: 0.8,
  gravity: 1.5, rest: 0.16, friction: 0.5, air: 0.014, tumble: 0.75,
  shake: true, shadow: true,
};
type Params = typeof DEFAULTS;

type Phase = 'stock' | 'push' | 'tip' | 'phys' | 'advance' | 'fade' | 'out' | 'gone';

interface Box {
  group: THREE.Group;
  mesh: THREE.Mesh;
  mats: THREE.MeshStandardMaterial[];
  shadow: THREE.Mesh;
  body: Matter.Body | null;
  slot: { x: number; y: number; floorY: number; row: number; z0: number; startAt: number; pushMs: number };
  depth: number;
  won: boolean;
  fadeT: number; fadeIn: boolean; advSolo: boolean;
  jx: number; z0: number; zBase: number; restY: number; floorY: number; zCur: number;
  phase: Phase; queued: boolean; startAt: number; pushMs: number;
  pushT: number; advT: number; outT: number; tipMs: number;
  fx: number; curH: number; theta: number; omega: number; rest: number; spin: number; wob: number;
  psi0: number; dCom: number; I2: number;
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch { return false; }
}

export function BlindboxMachineMode5({
  machineState, drawCount,
  onAnimationComplete, isSoldOut, onLoaded, restockSignal = 0,
}: BlindboxMachineMode5Props) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [readyToPick, setReadyToPick] = useState(false);
  const [params, setParams] = useState<Params>(DEFAULTS);
  const [webglOK] = useState(() => (typeof window === 'undefined' ? true : hasWebGL()));

  // 這些跨 frame 用的東西不放 state —— 每幀 setState 會讓整棵樹重繪
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera;
    engine: Matter.Engine; boxes: Box[]; layers: THREE.Mesh[]; cta: THREE.Mesh;
    matsLit: THREE.MeshStandardMaterial[]; boxGeo: THREE.BoxGeometry; shadowTex: THREE.Texture;
    camZ: number; raf: number; shake: number; acc: number; last: number;
    dropping: boolean; ctaOn: boolean; ctaDinged: boolean; ctaFade: number; pendingDone: boolean; busy: boolean;
  } | null>(null);
  const paramsRef = useRef<Params>(DEFAULTS);
  const doneRef = useRef<(() => void) | undefined>(undefined);
  doneRef.current = onAnimationComplete;
  /* 音效與重擺盒的橋：three.js 迴圈只建一次，要呼叫外面每次 render
     重新產生的函式就得走 ref，不然會抓到第一次的舊 closure */
  const sfxRef = useRef({
    thunk: (_p: number) => {}, rumble: (_p: number) => {}, clack: () => {},
    ding: () => {}, collectSfx: () => {}, whirr: () => {},
  });
  const resetRef = useRef<(() => void) | null>(null);
  const refillRef = useRef<(() => void) | null>(null);

  useEffect(() => { paramsRef.current = params; }, [params]);

  // ── 後台參數（讀不到就用預設，機台照樣能玩）──────────────────────────
  useEffect(() => {
    createClient()
      .from('machine_theme_params')
      .select('params')
      .eq('theme', 'blindbox_mode5')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.params) setParams({ ...DEFAULTS, ...(data.params as Partial<Params>) });
      }, () => {});
  }, []);

  /*
   * 音效：整套 WebAudio 合成，不含任何音檔（照老闆更新後的原型）。
   * 馬達與伺服是常駐 loop，靠 gain 淡進淡出跟著機台狀態走 ——
   * 這是它比一次性 mp3 好的地方：推出時才有伺服聲、停了就安靜。
   */
  const A = useRef<{
    ctx: AudioContext | null; master: GainNode | null;
    noise: AudioBuffer | null; motorG: GainNode | null; servoG: GainNode | null;
  }>({ ctx: null, master: null, noise: null, motorG: null, servoG: null });
  const lastSfx = useRef(0);
  const lastRumble = useRef(0);

  const audioInit = useCallback(() => {
    const a = A.current;
    if (a.ctx) { if (a.ctx.state === 'suspended') void a.ctx.resume(); return; }
    try {
      const Ctx = window.AudioContext
        || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      a.ctx = new Ctx();
    } catch { return; }
    const c = a.ctx;
    a.master = c.createGain();
    a.master.gain.value = paramsRef.current.volume;
    a.master.connect(c.destination);

    // 粉紅噪音（比白噪音耐聽），機械聲的底
    const n = Math.floor(c.sampleRate * 2);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
    }
    a.noise = buf;

    // 機台運作：低頻嗡鳴 + 齒輪噪音 + 轉速抖動
    a.motorG = c.createGain(); a.motorG.gain.value = 0; a.motorG.connect(a.master);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 460; lp.Q.value = 5;
    lp.connect(a.motorG);
    const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 57;
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 86;
    const og = c.createGain(); og.gain.value = 0.45; o1.connect(og); o2.connect(og); og.connect(lp);
    const gn = c.createBufferSource(); gn.buffer = buf; gn.loop = true;
    const gbp = c.createBiquadFilter(); gbp.type = 'bandpass'; gbp.frequency.value = 900; gbp.Q.value = 1.1;
    const gng = c.createGain(); gng.gain.value = 0.5;
    gn.connect(gbp); gbp.connect(gng); gng.connect(a.motorG);
    const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 7.2;
    const lg = c.createGain(); lg.gain.value = 5.5; lfo.connect(lg); lg.connect(o1.frequency);

    // 推桿伺服：高一階的機械嘶聲，只在推出時開
    a.servoG = c.createGain(); a.servoG.gain.value = 0; a.servoG.connect(a.master);
    const sbp = c.createBiquadFilter(); sbp.type = 'bandpass'; sbp.frequency.value = 1750; sbp.Q.value = 3.4;
    sbp.connect(a.servoG);
    const so = c.createOscillator(); so.type = 'square'; so.frequency.value = 214;
    const sog = c.createGain(); sog.gain.value = 0.30; so.connect(sog); sog.connect(sbp);
    const sn = c.createBufferSource(); sn.buffer = buf; sn.loop = true;
    const sng = c.createGain(); sng.gain.value = 0.75; sn.connect(sng); sng.connect(sbp);
    const slfo = c.createOscillator(); slfo.type = 'sawtooth'; slfo.frequency.value = 23;
    const slg = c.createGain(); slg.gain.value = 16; slfo.connect(slg); slg.connect(so.frequency);

    o1.start(); o2.start(); gn.start(); lfo.start(); so.start(); sn.start(); slfo.start();
  }, []);

  const env = useCallback((dur: number, peak: number, t0?: number) => {
    const c = A.current.ctx!;
    const g = c.createGain(), t = t0 ?? c.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(A.current.master!);
    return g;
  }, []);

  const noiseHit = useCallback((dur: number, peak: number, f0: number, f1: number, q: number, t0?: number) => {
    const a = A.current;
    if (!a.ctx || !a.noise) return;
    const c = a.ctx, t = t0 ?? c.currentTime;
    const s2 = c.createBufferSource(); s2.buffer = a.noise;
    s2.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = c.createBiquadFilter();
    f.type = q ? 'bandpass' : 'lowpass';
    if (q) f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    s2.connect(f); f.connect(env(dur, peak, t));
    s2.start(t); s2.stop(t + dur + 0.05);
  }, [env]);

  const tone = useCallback((type: OscillatorType, f0: number, f1: number, dur: number, peak: number, t0?: number) => {
    const c = A.current.ctx;
    if (!c) return;
    const t = t0 ?? c.currentTime;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(env(dur, peak, t)); o.start(t); o.stop(t + dur + 0.05);
  }, [env]);

  /** 紙盒撞擊（力道越大越低沉） */
  const thunk = useCallback((power: number) => {
    noiseHit(0.10 + power * 0.09, 0.06 + power * 0.30, 500 + power * 1900, 260, 0);
    tone('sine', 120 - power * 35, 52, 0.13, 0.11 * power + 0.01);
  }, [noiseHit, tone]);

  /** 機台被砸到的悶響 —— 撞得夠重才觸發，配合鏡頭震動 */
  const rumble = useCallback((power: number) => {
    if (!A.current.ctx) return;
    const now = performance.now();
    if (now - lastRumble.current < 240) return;
    lastRumble.current = now;
    tone('sine', 76, 36, 0.45, 0.26 * power + 0.03);
    noiseHit(0.40, 0.20 * power, 320, 80, 0);
  }, [noiseHit, tone]);

  /** 盒子脫離層板的木質喀噠 */
  const clack = useCallback(() => {
    noiseHit(0.055, 0.16, 2600, 700, 2.2);
    tone('triangle', 320, 190, 0.06, 0.07);
  }, [noiseHit, tone]);

  /** 換一批：滑軌推送 */
  const whirr = useCallback(() => {
    const c = A.current.ctx;
    if (!c) return;
    noiseHit(0.42, 0.13, 700, 2200, 1.6);
    tone('sawtooth', 90, 150, 0.40, 0.045);
    noiseHit(0.10, 0.14, 900, 300, 0, c.currentTime + 0.44);
  }, [noiseHit, tone]);

  /** 「點擊取物」浮現 */
  const ding = useCallback(() => {
    const c = A.current.ctx;
    tone('triangle', 880, 880, 0.28, 0.10);
    tone('triangle', 1318.5, 1318.5, 0.36, 0.075, c ? c.currentTime + 0.09 : 0);
  }, [tone]);

  /** 取物：抽取聲 + 上行琶音 */
  const collectSfx = useCallback(() => {
    const c = A.current.ctx;
    if (!c) return;
    const t = c.currentTime;
    noiseHit(0.26, 0.16, 400, 3200, 1.1, t);
    [0, 4, 7, 12].forEach((semi, i) => {
      const f = 523.25 * Math.pow(2, semi / 12);
      tone('triangle', f, f, 0.7, 0.16, t + 0.06 + i * 0.065);
    });
  }, [noiseHit, tone]);

  const uiClick = useCallback(() => {
    noiseHit(0.05, 0.12, 1800, 600, 2.0);
    tone('square', 620, 380, 0.05, 0.05);
  }, [noiseHit, tone]);

  // 音量跟著後台參數走
  useEffect(() => {
    if (A.current.master) A.current.master.gain.value = params.volume;
  }, [params.volume]);

  // 離開頁面把 AudioContext 收掉，不然常駐 loop 會一直跑
  useEffect(() => () => { void A.current.ctx?.close(); }, []);

  useEffect(() => {
    sfxRef.current = { thunk, rumble, clack, ding, collectSfx, whirr };
  }, [thunk, rumble, clack, ding, collectSfx, whirr]);

  // ── three.js + matter.js 建場 ────────────────────────────────────────────
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !webglOK) { onLoaded?.(); return; }

    const M = Matter;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    stage.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(DEFAULTS.fov, ART_W / ART_H, 10, 8000);
    scene.add(new THREE.AmbientLight(0xffffff, 0.92));
    const dl = new THREE.DirectionalLight(0xffffff, 0.55);
    dl.position.set(-0.45, 1, 0.85);
    scene.add(dl);

    const loader = new THREE.TextureLoader();
    const tex = (src: string) => {
      const t = loader.load(src);
      t.encoding = THREE.sRGBEncoding;
      t.anisotropy = 4;
      return t;
    };
    const TX = (x: number) => x - ART_W / 2;
    const TY = (y: number) => ART_H / 2 - y;

    const layers: THREE.Mesh[] = [];
    const layer = (map: THREE.Texture, z: number, order: number, w?: number, h?: number, cx?: number, cy?: number) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(ART_W, ART_H),
        new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false }),
      );
      m.userData = { z, w: w ?? ART_W, h: h ?? ART_H, cx: cx ?? ART_W / 2, cy: cy ?? ART_H / 2 };
      m.renderOrder = order;
      layers.push(m); scene.add(m);
      return m;
    };

    layer(tex(`${ASSETS}/bg.webp`), -70, 0);
    layer(tex(`${ASSETS}/front.webp`), 240, 30);

    // 「點擊取物」畫在 canvas 上疊在前板之上
    const ctaTex = (() => {
      const W = 720, H = 200, c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d')!;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '700 108px "PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif';
      const txt = '點擊取物', cx = W / 2, cy = H / 2;
      g.shadowColor = 'rgba(255,190,40,0.95)'; g.shadowBlur = 34;
      g.lineJoin = 'round';
      g.strokeStyle = '#5a2a06'; g.lineWidth = 18; g.strokeText(txt, cx, cy);
      g.shadowBlur = 0;
      g.strokeStyle = '#8d4a0d'; g.lineWidth = 8; g.strokeText(txt, cx, cy);
      const grd = g.createLinearGradient(0, cy - 52, 0, cy + 52);
      grd.addColorStop(0, '#fffbdc'); grd.addColorStop(0.45, '#ffe45c'); grd.addColorStop(1, '#ffb420');
      g.fillStyle = grd; g.fillText(txt, cx, cy);
      const t = new THREE.CanvasTexture(c);
      t.encoding = THREE.sRGBEncoding;
      return t;
    })();
    const cta = layer(ctaTex, 285, 40, 380, 106, TRAY.cx, TRAY.cy);
    cta.material.opacity = 0;
    cta.visible = false;

    const shadowTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d')!;
      const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      rg.addColorStop(0, 'rgba(0,0,0,0.8)');
      rg.addColorStop(0.5, 'rgba(0,0,0,0.34)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();

    const boxGeo = new THREE.BoxGeometry(BW, BH, BD);
    const faceTex = ['f3', 'f5', 'f1', 'f2', 'f4', 'f6'].map(n => tex(`${ASSETS}/${n}.webp`));
    const matsDim = faceTex.map(t => new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, metalness: 0 }));
    const matsLit = faceTex.map(t => new THREE.MeshStandardMaterial({
      map: t, roughness: 0.85, metalness: 0,
      emissive: 0xffffff, emissiveMap: t, emissiveIntensity: DEFAULTS.lit,
    }));

    const engine = M.Engine.create({ enableSleeping: true });
    engine.gravity.y = DEFAULTS.gravity;
    engine.positionIterations = 10;
    engine.velocityIterations = 8;

    const wall = (x: number, y: number, w: number, h: number, angle = 0, fric = 0.35) =>
      M.Bodies.rectangle(x, y, w, h, { isStatic: true, angle, friction: fric, restitution: 0.12 });
    const chuteWall = (ax: number, ay: number, bx: number, by: number, th: number, fric: number) => {
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
      const ux = dx / L, uy = dy / L;
      const nx = ax < 375 ? uy : -uy, ny = ax < 375 ? -ux : ux;
      return wall((ax + bx) / 2 - nx * th / 2, (ay + by) / 2 - ny * th / 2, L + 18, th, Math.atan2(dy, dx), fric);
    };
    M.Composite.add(engine.world, [
      wall(375, CHUTE.floorY + 45, 980, 90),
      chuteWall(0, CHUTE.topY, CHUTE.neckL, CHUTE.floorY, 26, 0.06),
      chuteWall(750, CHUTE.topY, CHUTE.neckR, CHUTE.floorY, 26, 0.06),
      wall(-40, 400, 90, 1400), wall(790, 400, 90, 1400),
    ]);

    const S_ = {
      renderer, scene, camera, engine, boxes: [] as Box[], layers, cta,
      matsLit, boxGeo, shadowTex, camZ: 1, raf: 0, shake: 0, acc: 0,
      last: performance.now(), dropping: false, ctaOn: false, ctaDinged: false, ctaFade: 0,
      pendingDone: false, busy: false,
    };
    sceneRef.current = S_;

    // ── 相機：離軸投影（底圖保持 1:1，只有 3D 盒子拿到俯視角）──────────
    const refreshCamera = () => {
      const P = paramsRef.current;
      const camZ = (ART_H / 2) / Math.tan(THREE.MathUtils.degToRad(P.fov / 2));
      S_.camZ = camZ;
      camera.fov = P.fov;
      camera.position.set(0, P.camUp, camZ);
      const n = camera.near, s = n / camZ;
      camera.projectionMatrix.makePerspective(
        -ART_W / 2 * s, ART_W / 2 * s, (ART_H / 2 - P.camUp) * s, (-ART_H / 2 - P.camUp) * s, n, camera.far);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      layers.forEach(m => {
        const u = m.userData as { z: number; w: number; h: number; cx: number; cy: number };
        const k = (camZ - u.z) / camZ;
        m.scale.set(u.w * k / ART_W, u.h * k / ART_H, 1);
        m.position.set(TX(u.cx) * k, P.camUp + (TY(u.cy) - P.camUp) * k, u.z);
      });
    };

    const place = (obj: THREE.Object3D, artX: number, artY: number, z: number) => {
      const k = (S_.camZ - z) / S_.camZ;
      obj.position.set(TX(artX) * k, paramsRef.current.camUp + (TY(artY) - paramsRef.current.camUp) * k, z);
    };

    const setShadow = (b: Box, op: number, sx: number) => {
      const mat = b.shadow.material as THREE.MeshBasicMaterial;
      mat.opacity = paramsRef.current.shadow ? Math.max(0, op) : 0;
      b.shadow.scale.x = BW * 1.5 * sx;
    };
    const setBoxOpacity = (b: Box, o: number) => {
      const t = o < 0.999;
      b.mats.forEach(m => {
        if (m.transparent !== t) { m.transparent = t; m.needsUpdate = true; }
        m.opacity = o;
      });
    };
    const applyDepth = (b: Box, d: number) => {
      b.depth = d;
      b.z0 = b.slot.z0 - STEP * d;
      b.zBase = b.z0;
      b.restY = b.slot.y - INCLINE * d;
      b.floorY = b.slot.floorY - INCLINE * d;
      b.group.visible = true;
      place(b.group, b.slot.x + b.jx, b.restY, b.z0);
      b.group.scale.setScalar(1);
      b.group.rotation.set(0, 0, 0);
      b.mesh.rotation.x = 0;
      b.mesh.material = b.mats;
      setBoxOpacity(b, 1);
      b.shadow.visible = true;
      b.shadow.scale.x = BW * 1.5;
      place(b.shadow, b.slot.x + b.jx, b.floorY - 1, b.z0 - BD / 2 - 3);
      (b.shadow.material as THREE.MeshBasicMaterial).opacity =
        paramsRef.current.shadow ? (d ? 0.28 : 0.42) : 0;
    };

    const makeBox = (slot: Box['slot'], depth: number): Box => {
      const group = new THREE.Group();
      const mats = matsDim.map(m => m.clone());
      const mesh = new THREE.Mesh(boxGeo, mats);
      mesh.rotation.y = (Math.random() - 0.5) * 0.3;
      group.add(mesh);
      const sh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0, depthWrite: false }),
      );
      sh.scale.set(BW * 1.5, BD * 0.9, 1);
      scene.add(group); scene.add(sh);
      const b: Box = {
        group, mesh, mats, shadow: sh, body: null, slot, depth, won: false,
        fadeT: 0, fadeIn: false, advSolo: false,
        jx: (Math.random() - 0.5) * 14, z0: 0, zBase: 0, restY: 0, floorY: 0, zCur: 0,
        phase: 'stock', queued: false, startAt: 0, pushMs: 400, pushT: 0, advT: 0, outT: 0,
        tipMs: 0, fx: 0, curH: 0, theta: 0, omega: 0, rest: HALF, spin: 0, wob: 0,
        psi0: -Math.atan(BD / BH), dCom: Math.hypot(BH, BD) / 2, I2: BH * BH + BD * BD,
      };
      applyDepth(b, depth);
      return b;
    };

    const slotsRef: Box['slot'][] = [];

    /** 擺盒：機台永遠擺滿十格（庫存展示用）。抽幾盒是掉的時候才決定 */
    const resetBoxes = () => {
      S_.boxes.forEach(b => {
        scene.remove(b.group); scene.remove(b.shadow);
        if (b.body) M.Composite.remove(engine.world, b.body);
      });
      S_.boxes = [];
      const stock = paramsRef.current.stock;
      slotsRef.length = 0;
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 5; c++) {
          slotsRef.push({
            x: SLOT_XS[c], y: ROW_FLOOR[r] - BH / 2 - 2, floorY: ROW_FLOOR[r],
            row: r, z0: (Math.random() - 0.5) * 12, startAt: 0, pushMs: 400,
          });
        }
      }
      slotsRef.forEach(slot => {
        for (let d = stock; d >= 0; d--) S_.boxes.push(makeBox(slot, d));
      });
      S_.dropping = false; S_.ctaOn = false; S_.ctaDinged = false; S_.pendingDone = false;
      setReadyToPick(false);
    };

    // 撞擊回饋
    M.Events.on(engine, 'collisionStart', ev => {
      const now = performance.now();
      ev.pairs.forEach(p => {
        const a = p.bodyA, c = p.bodyB;
        const v = Math.hypot(a.velocity.x - c.velocity.x, a.velocity.y - c.velocity.y);
        if (v < 1.2) return;
        const power = Math.min(v / 16, 1);
        S_.boxes.forEach(b => {
          if (b.body !== a && b.body !== c) return;
          b.fx = Math.max(b.fx, power);
          b.wob = Math.max(b.wob, power * 0.20);
        });
        if (paramsRef.current.shake) S_.shake = Math.max(S_.shake, power * 7);
        if (now - lastSfx.current > 45) { lastSfx.current = now; sfxRef.current.thunk(power); }
        if (power > 0.42) sfxRef.current.rumble(power);   // 撞得夠重才震到機台本體
      });
    });

    // ── 各階段更新 ────────────────────────────────────────────────────────
    const updatePush = (b: Box, dt: number) => {
      b.pushT = Math.min(1, b.pushT + dt / b.pushMs);
      const e = b.pushT * b.pushT * (3 - 2 * b.pushT);
      const judder = Math.sin(b.pushT * Math.PI * 13) * 0.9 * (1 - b.pushT);
      b.zBase = b.z0 + PUSH_Z * e;
      const ax = b.slot.x + b.jx + judder, az = b.z0 + PUSH_Z * e * Z_EMPH;
      place(b.group, ax, b.restY + e * 3, az);
      b.group.scale.setScalar(1 + 0.03 * e);
      place(b.shadow, ax, b.floorY - 1, az - BD / 2 - 3);
      setShadow(b, 0.42, e);
      if (b.pushT >= 1) {
        b.phase = 'tip'; b.theta = 0; b.tipMs = 0;
        // 質心一開始在支點後方，推力低於臨界值會倒回層板卡住 → 取臨界值 ×1.3 當下限
        const wCrit = Math.sqrt(6 * (engine.gravity.y * 1000) * b.dCom * (1 - Math.cos(b.psi0)) / b.I2);
        b.omega = Math.max(paramsRef.current.push * (0.86 + Math.random() * 0.28), wCrit * 1.3);
      }
    };

    const updateAdvance = (b: Box, dt: number) => {
      b.advT += dt;
      let p: number, done: boolean;
      if (b.advSolo) {
        const s = Math.min(1, b.advT / ADV_SOLO);
        p = 1 - Math.pow(1 - s, 3); done = b.advT >= ADV_SOLO;
      } else {
        const lock = PUSH_Z / STEP;
        if (b.advT <= b.pushMs) { const e = b.advT / b.pushMs; p = e * e * (3 - 2 * e) * lock; }
        else { const u = Math.min(1, (b.advT - b.pushMs) / ADV_TAIL); p = lock + (1 - lock) * (1 - Math.pow(1 - u, 3)); }
        done = b.advT >= b.pushMs + ADV_TAIL;
      }
      const d = b.depth - p, ax = b.slot.x + b.jx, az = b.slot.z0 - STEP * d;
      place(b.group, ax, b.slot.y - INCLINE * d, az);
      place(b.shadow, ax, b.slot.floorY - INCLINE * d - 1, az - BD / 2 - 3);
      if (done) { applyDepth(b, b.depth - 1); b.phase = 'stock'; b.advSolo = false; }
    };

    const updateFade = (b: Box, dt: number) => {
      b.fadeT += dt;
      const u = Math.min(1, b.fadeT / FADE_MS);
      const mat = b.shadow.material as THREE.MeshBasicMaterial;
      if (b.fadeIn) {
        setBoxOpacity(b, u);
        b.group.scale.setScalar(0.88 + 0.12 * (1 - Math.pow(1 - u, 3)));
        mat.opacity = (paramsRef.current.shadow ? 0.28 : 0) * u;
        if (u >= 1) { b.phase = 'stock'; applyDepth(b, b.depth); }
      } else {
        setBoxOpacity(b, 1 - u);
        b.group.scale.setScalar(1 - 0.14 * u);
        mat.opacity = 0.42 * (1 - u);
        if (u >= 1) { b.phase = 'gone'; b.group.visible = false; b.shadow.visible = false; }
      }
    };

    const silhouette = (t: number) => Math.abs(BH * Math.cos(t)) + Math.abs(BD * Math.sin(t));
    const FACES = [HALF, Math.PI, 3 * HALF, 2 * Math.PI];
    const pickRest = (row: number, amt: number) => {
      if (Math.random() > amt) return HALF;
      const w = row === 1 ? [0.50, 0.30, 0.20, 0.00] : [0.24, 0.20, 0.30, 0.26];
      const r = Math.random(); let s = 0;
      for (let i = 0; i < 4; i++) { s += w[i]; if (r <= s) return FACES[i]; }
      return HALF;
    };

    const handoff = (b: Box) => {
      const P = paramsRef.current;
      const s = Math.sin(b.theta), c = Math.cos(b.theta);
      const vyUp = (-BH / 2 * s + BD / 2 * c) * b.omega;
      const y0 = b.floorY - (BH / 2 * c + BD / 2 * s);
      // 先抽好落定面 → 碰撞盒照那面的輪廓建，出生後不再變（動態縮放會被 Matter 用巨大脈衝彈開）
      b.rest = pickRest(b.slot.row, P.tumble);
      b.curH = silhouette(b.rest);
      const tf = Math.sqrt(2 * Math.max(60, CHUTE.floorY - 40 - y0) / (engine.gravity.y * 1000));
      b.spin = (b.rest - b.theta) / Math.max(0.20, tf);
      const body = M.Bodies.rectangle(b.slot.x + b.jx, y0, BW, b.curH, {
        restitution: P.rest, friction: P.friction, frictionStatic: 0.7,
        frictionAir: P.air, density: 0.0012, slop: 0.02, chamfer: { radius: 3 },
      });
      M.Body.setVelocity(body, { x: (Math.random() - 0.5) * 1.2, y: -vyUp / 60 });
      M.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.09);
      b.body = body; b.phase = 'phys'; b.zCur = b.group.position.z;
      b.mesh.material = matsLit;   // 取物口只透 25%，換補光材質
      sfxRef.current.clack();
      setShadow(b, 0, 1);
      M.Composite.add(engine.world, body);
    };

    const placeTip = (b: Box) => {
      const s = Math.sin(b.theta), c = Math.cos(b.theta);
      const oy = BH / 2 * c + BD / 2 * s, oz = BH / 2 * s - BD / 2 * c;
      const ax = b.slot.x + b.jx, az = b.zBase + (oz + BD / 2) * Z_EMPH;
      place(b.group, ax, b.floorY - oy, az);
      b.mesh.rotation.x = b.theta;
      place(b.shadow, ax, b.floorY - 1, az - BD / 2 - 3);
      setShadow(b, 0.42 * (1 - b.theta / HANDOFF), 1 + b.theta * 0.5);
    };

    // ── 主迴圈 ────────────────────────────────────────────────────────────
    const STEP_MS = 1000 / 60;
    const loop = (now: number) => {
      S_.raf = requestAnimationFrame(loop);
      const P = paramsRef.current;
      const dt = Math.min(now - S_.last, 100); S_.last = now;
      const dtS = dt / 1000;

      S_.acc += dt;
      let guard = 0;
      while (S_.acc >= STEP_MS && guard++ < 5) { M.Engine.update(engine, STEP_MS); S_.acc -= STEP_MS; }

      let waiting = 0, busy = false, settled = 0, inTray = 0, pushing = 0, moving = 0;
      S_.boxes.forEach(b => {
        if (b.queued) {
          if (now >= b.startAt) {
            b.queued = false;
            if (b.depth === 0) { b.phase = 'push'; b.pushT = 0; } else { b.phase = 'advance'; b.advT = 0; }
          } else waiting++;
        }
        if (b.queued || b.phase === 'push' || b.phase === 'tip' || b.phase === 'advance'
          || b.phase === 'fade' || b.phase === 'out') busy = true;
        if (b.phase === 'push') { pushing++; moving++; }
        else if (b.phase === 'advance') moving++;
        if (b.phase === 'phys') { inTray++; if (b.body?.isSleeping) settled++; }
      });
      if (S_.dropping && !waiting) S_.dropping = false;

      const gpx = engine.gravity.y * 1000;
      S_.boxes.forEach(b => {
        if (b.phase === 'push') updatePush(b, dt);
        else if (b.phase === 'advance') updateAdvance(b, dt);
        else if (b.phase === 'fade') updateFade(b, dt);
        else if (b.phase === 'tip') {
          const psi = b.theta + b.psi0;
          b.omega += (3 * gpx * b.dCom * Math.sin(psi) / b.I2) * dtS;
          b.theta += b.omega * dtS;
          if (b.theta < 0) { b.theta = 0; b.omega = Math.abs(b.omega) * 0.35; }
          b.tipMs += dt;
          if (b.tipMs > 1300) b.omega = Math.max(b.omega, 4);   // 保險：絕不允許卡在層板上
          placeTip(b);
          if (b.theta >= HANDOFF) handoff(b);
        } else if (b.phase === 'phys' && b.body) {
          b.zCur += (TRAY_Z - b.zCur) * Math.min(1, 2.6 * dtS);
          place(b.group, b.body.position.x, b.body.position.y, b.zCur);
          b.group.rotation.z = -b.body.angle;
          const speed = b.body.isSleeping ? 0 : (b.body.speed || 0);
          const rst = 1 - Math.min(1, speed / 2.2);
          b.theta += b.spin * dtS * (1 - rst);
          b.theta += (b.rest - b.theta) * Math.min(1, 10 * dtS) * rst;
          b.wob *= Math.pow(0.87, dt / 16.67);
          b.mesh.rotation.x = b.theta + b.wob * Math.sin(now * 0.05);
          if (b.body.isSleeping && b.body.position.y < 690) {   // 卡在導板上的解卡
            M.Sleeping.set(b.body, false);
            M.Body.applyForce(b.body, b.body.position,
              { x: (TRAY.cx - b.body.position.x) * 4e-6, y: 2.2e-3 });
          }
        } else if (b.phase === 'out') {
          b.outT += dt;
          const u = Math.min(1, b.outT / 300);
          b.group.scale.setScalar(1 - u);
          b.group.position.y += 90 * dtS;
          if (u >= 1) { b.phase = 'gone'; b.group.visible = false; b.shadow.visible = false; }
        }

        if (b.fx > 0.001) {
          b.fx *= Math.pow(0.86, dt / 16.67);
          const sc = 1 + b.fx * 0.10;
          b.mesh.scale.set(sc, 1 - b.fx * 0.13, sc);
        } else b.mesh.scale.set(1, 1, 1);
      });

      // 全部落定 → 浮出「點擊取物」
      if (!busy && inTray > 0 && settled === inTray && !S_.ctaOn) {
        if (!S_.ctaDinged) { S_.ctaDinged = true; sfxRef.current.ding(); }
        S_.ctaOn = true;
        setReadyToPick(true);
      }
      S_.ctaFade += ((S_.ctaOn ? 1 : 0) - S_.ctaFade) * Math.min(1, 5 * dtS);
      cta.visible = S_.ctaFade > 0.01;
      if (cta.visible) {
        (cta.material as THREE.MeshBasicMaterial).opacity =
          S_.ctaFade * (0.82 + 0.18 * Math.sin(now * 0.005));
      }
      S_.busy = busy || S_.dropping;

      // 取物動畫跑完 → 通知商品頁彈恭喜視窗
      if (S_.pendingDone && !busy) { S_.pendingDone = false; doneRef.current?.(); }

      const ac = A.current;
      if (ac.ctx) {
        const at = (node: GainNode | null, v: number, tau: number) =>
          node?.gain.setTargetAtTime(v, ac.ctx!.currentTime, tau);
        at(ac.motorG, moving ? 0.15 : 0, moving ? 0.05 : 0.10);
        at(ac.servoG, pushing ? 0.075 : 0, pushing ? 0.04 : 0.07);
      }
      matsLit.forEach(m => { m.emissiveIntensity = P.lit; });
      engine.gravity.y = P.gravity;

      if (S_.shake > 0.01) {
        S_.shake *= Math.pow(0.85, dt / 16.67);
        camera.position.x = (Math.random() - 0.5) * S_.shake;
        camera.position.y = P.camUp + (Math.random() - 0.5) * S_.shake;
      } else {
        camera.position.x = 0;
        camera.position.y = P.camUp;
      }
      camera.position.z = S_.camZ;

      renderer.render(scene, camera);
    };

    const resize = () => {
      const r = stage.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
    };
    window.addEventListener('resize', resize);

    /**
     * 補貨：把每格補回「前排 1 + 備貨 N」的滿載狀態，新盒從最後方淡入。
     * 掉完盒、換一批之後都要補，不然機台會越玩越空。
     */
    const refillSlots = () => {
      const stock = paramsRef.current.stock;
      const want = stock + 1;
      const bySlot = new Map<Box['slot'], Box[]>();
      S_.boxes.forEach(b => {
        if (b.phase === 'gone' || b.phase === 'out' || b.phase === 'phys') return;
        bySlot.set(b.slot, [...(bySlot.get(b.slot) ?? []), b]);
      });
      // 清掉已經消失的盒子，表才不會無限長大
      S_.boxes = S_.boxes.filter(b => {
        if (b.phase !== 'gone') return true;
        scene.remove(b.group); scene.remove(b.shadow);
        return false;
      });
      slotsRef.forEach(slot => {
        const live = (bySlot.get(slot) ?? []).length;
        // 缺幾盒就從最後方往前補：正在遞補的盒子會停在前面的深度，
        // 新盒一律生在最深處淡入
        for (let i = 0; i < want - live; i++) {
          const nb = makeBox(slot, stock - i);
          nb.phase = 'fade'; nb.fadeIn = true; nb.fadeT = 0;
          setBoxOpacity(nb, 0);
          (nb.shadow.material as THREE.MeshBasicMaterial).opacity = 0;
          S_.boxes.push(nb);
        }
      });
    };

    resetRef.current = resetBoxes;
    refillRef.current = refillSlots;
    resize(); refreshCamera(); resetBoxes();
    S_.raf = requestAnimationFrame(loop);
    onLoaded?.();

    // 參數改變（後台調完重進）時重算相機
    const camTimer = setInterval(refreshCamera, 500);

    return () => {
      clearInterval(camTimer);
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(S_.raf);
      // 這顆 engine 只有這台機器在用，整個清掉即可（型別要求三參數，全清更保險）
      M.Events.off(engine, 'collisionStart', () => {});
      M.Engine.clear(engine);
      renderer.dispose();
      if (renderer.domElement.parentNode === stage) stage.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
    // 只建一次場：參數改變靠 paramsRef 即時讀取，不重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webglOK]);

  // ── 開盒：商品頁把 machineState 切成 animating 時觸發 ────────────────────
  useEffect(() => {
    const S_ = sceneRef.current;
    if (!S_ || machineState !== 'animating') return;
    audioInit();
    uiClick();

    const P = paramsRef.current;
    const t0 = performance.now();
    // 抽幾盒就掉幾格（1~10）：挑出還有前排存貨的格子，取前 N 個
    const n = Math.max(1, Math.min(10, drawCount || 1));
    const usable: Box['slot'][] = [];
    S_.boxes.forEach(b => {
      if (b.phase === 'stock' && b.depth === 0 && !usable.includes(b.slot)) usable.push(b.slot);
    });
    const picked = new Set(usable.slice(0, n));
    picked.forEach(slot => {
      slot.startAt = t0 + (slot.row === 1 ? 0 : 60) + Math.random() * P.jitter;
      slot.pushMs = P.pushMs * (0.88 + Math.random() * 0.24);
    });
    S_.boxes.forEach(b => {
      if (b.phase !== 'stock' || !picked.has(b.slot)) return;
      b.startAt = b.slot.startAt;
      b.pushMs = b.slot.pushMs;
      b.queued = true;
      if (b.depth === 0) b.won = true;   // 中獎內容由商品頁的恭喜視窗呈現，這裡只演出
    });
    S_.dropping = true;
    S_.ctaOn = false;
    setReadyToPick(false);
  }, [machineState, drawCount, audioInit, uiClick]);

  // 換一批：前排淡出 → 後排遞補 → 最後方淡入新的一盒
  const firstRestock = useRef(true);
  useEffect(() => {
    if (firstRestock.current) { firstRestock.current = false; return; }
    const S_ = sceneRef.current;
    if (!S_ || machineState !== 'idle') return;
    audioInit(); whirr();
    S_.boxes.forEach(b => {
      if (b.phase !== 'stock') return;
      if (b.depth === 0) { b.phase = 'fade'; b.fadeIn = false; b.fadeT = 0; }
      else { b.phase = 'advance'; b.advT = 0; b.advSolo = true; }
    });
    refillRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restockSignal]);

  // 一輪玩完（回到 idle）自動補貨，機台隨時可再抽
  const prevState = useRef(machineState);
  useEffect(() => {
    if (prevState.current === 'animating' && machineState === 'idle') refillRef.current?.();
    prevState.current = machineState;
  }, [machineState]);

  const collect = useCallback(() => {
    const S_ = sceneRef.current;
    if (!S_ || !S_.ctaOn) return;
    S_.ctaOn = false;
    S_.pendingDone = true;
    collectSfx();
    setReadyToPick(false);
    S_.boxes.forEach(b => {
      if (b.phase !== 'phys') return;
      b.phase = 'out'; b.outT = 0;
      if (b.body) { Matter.Composite.remove(S_.engine.world, b.body); b.body = null; }
    });
  }, [collectSfx]);

  return (
    <div className="relative w-full h-full select-none">
      {/* WebGL 不支援時給提示，不讓玩家卡在黑畫面 */}
      {!webglOK ? (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-900 text-center text-sm text-neutral-300">
          這台機器需要較新的瀏覽器才能顯示，請更新瀏覽器或換一台裝置。
        </div>
      ) : (
        <div
          ref={stageRef}
          className="absolute inset-0"
          onPointerDown={e => {
            if (!readyToPick) return;
            const r = e.currentTarget.getBoundingClientRect();
            const ax = (e.clientX - r.left) / r.width * ART_W;
            const ay = (e.clientY - r.top) / r.height * ART_H;
            if (ax > TRAY.left - 16 && ax < TRAY.right + 16 && ay > TRAY.top - 16 && ay < TRAY.bottom + 16) collect();
          }}
        />
      )}

      {isSoldOut && (
        <div className="pointer-events-none absolute inset-0 flex justify-center items-start pt-16 bg-black/60" style={{ zIndex: 25 }}>
          <div className="inline-flex h-8 items-center px-4 rounded-full bg-black/90 shadow-lg">
            <span className="text-[14px] font-black tracking-widest text-yellow-300">該商品已完抽</span>
          </div>
        </div>
      )}

    </div>
  );
}

export default BlindboxMachineMode5;
