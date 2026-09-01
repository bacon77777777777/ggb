'use client';

/**
 * 卡包 3D 輪播展示（抽卡商品頁上半部）
 *
 * **這份是老闆原型 `docs/prototypes/`／`public/images/card/pack-showcase.jsx` 的 1:1 移植。**
 * 場景、打光、地板倒影、卡包幾何體、貼圖處理、輪播槽位、互動手勢全部照抄，
 * 連淺色攝影棚背景都照原型（老闆指定：先一比一呈現原型，再疊我們要的接口）。
 *
 * ⚠️ 不要再自行「改良」尺寸、比例或邊緣處理。之前擅自把卡包放大、改成
 * 依圖片比例縮放、又自己削邊，結果側面出現黑縫、邊緣出現黑邊 ——
 * 那些都是原型本來沒有的問題，全是改動帶出來的。
 *
 * 只有三處是宿主必要的調整：
 *   1. 版面：原型是 100vh 滿版 demo，這裡填滿容器（機台區 375×466）
 *   2. 對外介面：跟被取代的 PackSelectionCarousel 一致
 *      （packStyles／onActiveStyleChange／goToNext／getActiveIndex），
 *      商品頁的「換一批」「立即開包」才不用改
 *   3. 資料來源：原型的「上傳正面／背面／旋轉開關」是 demo 按鈕，
 *      改讀後台參數（machine_theme_params.theme = 'card_pack'）
 *
 * 另外補了原型沒有的三件防護：WebGL 建不起來的退路、資源釋放、圖片 crossOrigin。
 */

import { useEffect, useImperativeHandle, useRef, forwardRef, useState } from 'react';
import * as THREE from 'three';
import { createClient } from '@/lib/supabase/client';
import SoundToggle from '@/components/ui/SoundToggle';
import { swoosh, unlockPackAudio } from '@/lib/packSfx';
import { asset } from '@/lib/asset';
import { PACK_RATIO } from './packSpec';
import { createOceanSkyLayer } from './oceanSkyLayer';
import {
  nightAmount, parseSkyOverride, skyGradientCss, skyHorizonRgb, skyProgressAtHour,
  skyProgressNow, solarPhaseAtHour, solarPhaseNow,
} from '@/lib/oceanSky';

export type PackShowcase3DHandle = {
  goToNext: () => void;
  getActiveIndex: () => number;
};

type Props = {
  packStyles: string[];
  onActiveStyleChange?: (styleId: string) => void;
  /** 容器高度（px）。機台區是 375 × 375×(932/750) ≒ 466 */
  height?: number;
  /**
   * 指定卡包正／背面圖，蓋過後台參數與內建款式。
   * 卡包模式用：玩家買的是「這一檔商品的卡包」，樣式必須固定且由商品決定，
   * 不能每次進頁面都隨機換一款（老闆 2026-08-18）。
   */
  frontImage?: string;
  backImage?: string;
};

type Params = {
  frontImage: string;
  backImage: string;
  autoSpin: boolean;
  spinSpeed: number;
  idleDelay: number;
};

const DEFAULTS: Params = {
  frontImage: '',
  backImage: '',
  autoSpin: true,
  spinSpeed: 0.008,
  idleDelay: 1.2,
};

// ── 以下常數與函式全部照原型 ────────────────────────────────────
// 實體卡包比例，等比縮放進 3D 世界。比例本身在 packSpec —— 撕開封口的演出
// 吃的是同一份，不要在這裡改數字（見 packSpec 的說明）
const PACK_W = 1.75, PACK_H = PACK_W * PACK_RATIO;
const BULGE = 0.1;
const CRIMP = 0.1;
const TEX_W = 640, TEX_H = Math.round(TEX_W * PACK_RATIO), TEX_R = 14;
const CAM_Z = 9, FOV = 36;
const BASE_Y = 0.35 + PACK_H / 2;

// ── 老闆指定、與原型不同的三處（集中在這裡，之後微調不用翻程式）──────
/** 主卡包放大倍率（原型是 1）*/
const MAIN_SCALE = 1.38;
/** 主卡包放大後的中心高度（底緣仍站在地板上）*/
const MAIN_CENTER_Y = 0.35 + (PACK_H * MAIN_SCALE) / 2;
/**
 * 鏡頭視點高度。原型是壓低 0.55 去看地板；這裡對準主卡包中心再往下一點，
 * 卡包才會落在畫面正中。跟著 MAIN_SCALE 走，改大小不用重調這個值。
 */
const CAM_LOOK_Y = MAIN_CENTER_Y - 0.12;
/**
 * 投射陰影的貼圖大小。太小雖然糊，但會出現階梯狀鋸齒（老闆回報）；
 * 拉回 512 並把濃度壓很淡，看得見的影子交給下面那層柔霧橢圓負責。
 */
const SHADOW_MAP = 512;
/** 卡包正下方那圈柔霧接觸陰影的濃度與大小（原型沒有，老闆要求加的）*/
const BLOB_OPACITY = 0.55, BLOB_W = 1.6, BLOB_H = 0.62;

function roundPath(x: CanvasRenderingContext2D, w: number, h: number, r: number) {
  x.beginPath();
  x.moveTo(r, 0); x.lineTo(w - r, 0); x.quadraticCurveTo(w, 0, w, r);
  x.lineTo(w, h - r); x.quadraticCurveTo(w, h, w - r, h);
  x.lineTo(r, h); x.quadraticCurveTo(0, h, 0, h - r);
  x.lineTo(0, r); x.quadraticCurveTo(0, 0, r, 0);
  x.closePath();
}

function serrate(x: CanvasRenderingContext2D) {
  x.save();
  x.globalCompositeOperation = 'destination-out';
  const tw = 16, th = 9;
  x.beginPath();
  for (let px = 0; px < TEX_W; px += tw) {
    x.moveTo(px, 0); x.lineTo(px + tw / 2, th); x.lineTo(px + tw, 0);
  }
  x.fill();
  x.beginPath();
  for (let px = 0; px < TEX_W; px += tw) {
    x.moveTo(px + tw / 2, TEX_H - th); x.lineTo(px, TEX_H); x.lineTo(px + tw, TEX_H);
    x.lineTo(px + tw / 2, TEX_H - th);
  }
  x.fill();
  x.restore();
}

function makeTexture(draw: (x: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = TEX_W; c.height = TEX_H;
  const x = c.getContext('2d')!;
  x.clearRect(0, 0, TEX_W, TEX_H);
  x.save();
  roundPath(x, TEX_W, TEX_H, TEX_R);
  x.clip();
  draw(x);
  x.restore();
  serrate(x);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  return t;
}

/** 原型的做法：圖片 cover 進固定的 62×116，再套圓角與撕線 */
function imageTexture(img: HTMLImageElement) {
  return makeTexture((x) => {
    const s = Math.max(TEX_W / img.width, TEX_H / img.height);
    const w2 = img.width * s, h2 = img.height * s;
    x.drawImage(img, (TEX_W - w2) / 2, (TEX_H - h2) / 2, w2, h2);
  });
}

/**
 * 跨網域圖片改走 Next 的同源圖片端點。
 *
 * WebGL 貼圖一定要 crossOrigin='anonymous'，而那要求對方回 Access-Control-Allow-Origin。
 * 我們的 R2 公開桶**沒有**回這個標頭（實測 2026-08-18），所以直接載商品圖會 onerror，
 * 卡包整個變白。`/_next/image` 是同源，由伺服器去抓圖再吐給瀏覽器，完全不經過 CORS。
 * R2 網域已在 next.config 的 remotePatterns 裡，這條路是通的。
 */
function sameOriginSrc(src: string): string {
  if (typeof window === 'undefined') return src;
  if (!/^https?:\/\//i.test(src)) return src;                 // 本站相對路徑
  try {
    if (new URL(src).origin === window.location.origin) return src;
  } catch { return src; }
  return `/_next/image?url=${encodeURIComponent(src)}&w=1080&q=90`;
}

/** 讀圖：卡包圖可能在 R2（跨網域），沒設 crossOrigin 會變 tainted canvas 整張黑掉 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = sameOriginSrc(src);
  });
}

function buildPackGeo() {
  const geo = new THREE.PlaneGeometry(PACK_W, PACK_H, 48, 84);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i);
    const u = px / PACK_W + 0.5, v = py / PACK_H + 0.5;
    const vv = (v - CRIMP) / (1 - 2 * CRIMP);
    // Math.max(0, …)：pow(負數, 小數) 是 NaN，浮點誤差會讓邊界的 sin 變成 -1e-16
    const envV = vv <= 0 || vv >= 1 ? 0 : Math.pow(Math.max(0, Math.sin(Math.PI * vv)), 0.5);
    const envU = Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.75);
    pos.setZ(i, BULGE * envU * envV);
    const t = v > 1 - CRIMP ? (v - (1 - CRIMP)) / CRIMP : v < CRIMP ? (CRIMP - v) / CRIMP : 0;
    if (t > 0) pos.setX(i, px * (1 - 0.05 * t));
  }
  geo.computeVertexNormals();
  return geo;
}

/** 輪播槽位：0=主包 / ±1=側包（貼齊畫面邊、微轉角）/ ±2 以上=遠包（背面） */
function slotFor(d: number, aspect: number) {
  const tanV = Math.tan((FOV * Math.PI) / 360);
  const ad = Math.abs(d), sg = Math.sign(d);
  if (ad === 0) return { x: 0, z: 0, s: MAIN_SCALE, rot: 0, dim: 1 };
  if (ad === 1) {
    const z = -0.9;
    const halfW = tanV * (CAM_Z - z) * aspect;
    return { x: sg * halfW, z, s: 0.95, rot: sg * 0.45, dim: 0.72 };
  }
  const z = -2.2;
  const halfW = tanV * (CAM_Z - z) * aspect;
  return { x: sg * (halfW * 0.72 + (ad - 2) * 0.4), z, s: 0.8, rot: Math.PI, dim: 0.45 };
}

/**
 * 背景底色：跟著台灣時間走的天空漸層（老闆 2026-09-01 指定換掉原本的白棚）。
 *
 * 真正的海景是 WebGL 那一層（`oceanSkyLayer`），這個漸層只是**它還沒畫出來
 * 或畫不出來**時的底：卡包輪播載入中、WebGL 建不起來、`prefers-reduced-motion`。
 * 顏色一樣照當下時刻算，所以退到這條路日夜感還在，也不會閃一下白底。
 *
 * ⚠️ 卡包是兩片曲面組成的殼，轉到側面時中間那道縫會透出背景。以前是淺色棚景
 * 所以看不出來；**換成會變暗的天空之後，深夜可能會重新露出那條縫**。
 * 真的看得到再補一片不透明的芯，不要又把背景改回淺色。
 */
const skyBackground = (s: number) => skyGradientCss(s);

/**
 * 背景的流星。
 *
 * 刻意做成 CSS 圖層而不是丟進 3D 場景 —— 這樣完全不動原型的場景，
 * 也不用多算粒子；瀏覽器的 transform 動畫走合成執行緒，等於零成本。
 * 位置與時間錯開用固定值而不是 Math.random()：每次重繪都重骰的話，
 * 流星會在 React 重新渲染時整批跳位置。
 */
const METEORS = [
  // 只留三顆，而且刻意慢 —— 遠方的流星在視野裡移動得很慢，
  // 之前六顆快速掠過像螢幕保護程式（老闆說「太假」）
  { left: 22, delay: 0,   dur: 11, len: 58, op: 0.6 },
  { left: 62, delay: 3.5, dur: 16, len: 44, op: 0.48 },
  { left: 84, delay: 7,   dur: 13, len: 52, op: 0.55 },
  // 最右邊再補一顆：流星是往左下飄的，只放三顆的話右半部常常整片空著（老闆回報）
  { left: 96, delay: 1.5, dur: 18, len: 38, op: 0.46 },
];

const PackShowcase3D = forwardRef<PackShowcase3DHandle, Props>(
  ({ packStyles, onActiveStyleChange, height = 466, frontImage, backImage }, ref) => {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const curRef = useRef(0);
    const paramsRef = useRef<Params>(DEFAULTS);
    const goRef = useRef<((d: number) => void) | null>(null);
    const notifyRef = useRef(onActiveStyleChange);
    const [params, setParams] = useState<Params>(DEFAULTS);
    const [ready, setReady] = useState(false);
    const [fallback, setFallback] = useState(false);

    /*
     * 天色進度。CSS 底色用 state（每分鐘更新一次就夠，它只是底），
     * WebGL 那層則是每次重算海面時自己讀時鐘，不經過 React。
     *
     * `?sky=14:30` 是開發用的時間覆寫，帶了就固定在那個時刻 ——
     * 要檢查各時段長相不用等一整天。
     */
    const skyOverrideRef = useRef<number | null>(null);
    const [skyS, setSkyS] = useState(0.5);
    useEffect(() => {
      const o = parseSkyOverride(window.location.search);
      skyOverrideRef.current = o;
      const tick = () => setSkyS(o != null ? skyProgressAtHour(o) : skyProgressNow());
      tick();
      if (o != null) return;
      const id = window.setInterval(tick, 60_000);
      return () => window.clearInterval(id);
    }, []);
    /** 當下的天色與太陽位置。兩者刻意分開算 —— 白天色票是平的，太陽卻要一路走 */
    const skyNow = () => {
      const o = skyOverrideRef.current;
      return o != null
        ? { s: skyProgressAtHour(o), sun: solarPhaseAtHour(o) }
        : { s: skyProgressNow(), sun: solarPhaseNow() };
    };
    const skyNowRef = useRef(skyNow);
    skyNowRef.current = skyNow;

    useEffect(() => { notifyRef.current = onActiveStyleChange; });
    // prop 指定的圖優先（卡包模式）；沒給才用後台參數／內建款式
    useEffect(() => {
      paramsRef.current = {
        ...params,
        frontImage: frontImage || params.frontImage,
        backImage: backImage || params.backImage,
      };
    }, [params, frontImage, backImage]);

    // 後台參數（讀不到就用預設，展示照樣能看）
    useEffect(() => {
      createClient()
        .from('machine_theme_params')
        .select('params')
        /* card_showcase＝「商品頁卡包輪播」自己的設定（migration 591）。
           以前讀的是 card_pack（蓄力開卡包模組），等於把商品頁的展示綁在某一個
           開包模組底下 —— 在單抽模式改設定會連卡包模式的商品頁一起改掉。 */
        .eq('theme', 'card_showcase')
        .maybeSingle()
        .then(({ data }) => {
          setParams({ ...DEFAULTS, ...((data?.params as Partial<Params>) ?? {}) });
          setReady(true);
        }, () => setReady(true));
    }, []);

    useImperativeHandle(ref, () => ({
      goToNext: () => goRef.current?.(1),
      getActiveIndex: () => curRef.current,
    }));

    useEffect(() => {
      if (!ready) return;
      const mount = mountRef.current;
      if (!mount) return;

      const N = Math.max(packStyles.length, 1);
      const W = mount.clientWidth || 375;
      const H = mount.clientHeight || height;

      const scene = new THREE.Scene();
      /* 霧色不能再寫死白棚那個 0xe9edf7 —— 側包離鏡頭 9~11、霧的近平面是 7，
         真的吃得到。深夜不跟著換色的話側包會蒙一層灰白霧。下面每幀跟著天空更新 */
      scene.fog = new THREE.Fog(0xe9edf7, 7, 16);

      const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.1, 100);
      camera.position.set(0, CAM_LOOK_Y, CAM_Z);
      camera.lookAt(0, CAM_LOOK_Y, 0);

      /*
       * WebGL 拿不到就整個放棄（舊機、關閉硬體加速、context 數量爆掉都會發生）。
       * 原型沒有這層保護，建構子丟出來會炸掉整個商品頁 —— 卡包看不到是小事，
       * 玩家連「立即開包」都按不到才是大事。
       */
      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        setFallback(true);
        return;
      }
      renderer.setClearColor(0x000000, 0);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(W, H);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      mount.appendChild(renderer.domElement);

      /*
       * 海景背景層（老闆 2026-09-01）。畫在卡包**之前**，所以要自己管清除：
       * autoClear 關掉、每幀手動 clear 一次，然後海景、卡包依序畫上去。
       * 陰影貼圖那一趟 Three 自己會清，不受這個開關影響。
       */
      renderer.autoClear = false;
      const sky = createOceanSkyLayer(renderer);
      const dbSize = new THREE.Vector2();
      const syncSkySize = () => {
        renderer.getDrawingBufferSize(dbSize);
        sky.setSize(dbSize.x, dbSize.y);
      };
      syncSkySize();
      /* 動態效果關掉時海就不動：只有天色會隨時間換，所以三十秒重算一次就夠 */
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const skyInterval = reduceMotion ? 30_000 : undefined;

      // ── 燈光（明亮棚）──
      scene.add(new THREE.AmbientLight(0xffffff, 0.95));
      const key = new THREE.DirectionalLight(0xffffff, 0.75);
      key.position.set(3, 8, 6);
      key.castShadow = true;
      // 原型是 1024，邊緣太銳利像貼上去的紙片；調小讓 PCFSoft 的核心糊開
      key.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
      key.shadow.camera.left = -6; key.shadow.camera.right = 6;
      key.shadow.camera.top = 8; key.shadow.camera.bottom = -2;
      scene.add(key);
      const purple = new THREE.PointLight(0xb48cff, 0.55, 18);
      purple.position.set(-5, 4, -2);
      scene.add(purple);
      const blue = new THREE.PointLight(0x8ab0ff, 0.55, 18);
      blue.position.set(5, 4, -2);
      scene.add(blue);

      // ── 地板：接觸陰影 + 倒影淡出層 ──
      const shadowGeo = new THREE.PlaneGeometry(40, 40);
      // 貼圖調小後陰影變淡，濃度往回加一點才看得出來（原型 0.13）
      const shadowMat = new THREE.ShadowMaterial({ opacity: 0.12 });
      const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
      shadowPlane.rotation.x = -Math.PI / 2;
      shadowPlane.position.y = 0.001;
      shadowPlane.receiveShadow = true;
      scene.add(shadowPlane);

      /*
       * 原型有一層淺灰的地板霧面（把倒影往外淡出）。背景改成老闆這張自帶地板的
       * 棚景之後，那層會整片蓋掉地板的格線，所以拿掉；倒影本來就只有 0.24，
       * 直接落在背景的地板上看起來就像檯面反光。
       */
      /*
       * 卡包正下方的柔霧接觸陰影。
       *
       * 主光在 (3,8,6)，主卡包的投射陰影會落到左後方、剛好被卡包自己擋住，
       * 所以畫面上只看得到側包的影子。這層是貼在地板上、跟著卡包走的柔邊橢圓，
       * 邊緣本來就是漸層，怎麼看都是霧的。
       */
      const blobCnv = document.createElement('canvas');
      blobCnv.width = blobCnv.height = 128;
      const bx = blobCnv.getContext('2d')!;
      const bg = bx.createRadialGradient(64, 64, 4, 64, 64, 64);
      bg.addColorStop(0, 'rgba(90,100,130,1)');
      bg.addColorStop(0.45, 'rgba(90,100,130,0.55)');
      bg.addColorStop(1, 'rgba(90,100,130,0)');
      bx.fillStyle = bg; bx.fillRect(0, 0, 128, 128);
      const blobTex = new THREE.CanvasTexture(blobCnv);
      const blobGeo = new THREE.PlaneGeometry(1, 1);

      // ── 卡包們（含地板倒影）──
      const geo = buildPackGeo();
      const textures: THREE.Texture[] = [blobTex];
      const materials: THREE.Material[] = [shadowMat];
      const packs: {
        grp: THREE.Group; rGrp: THREE.Group;
        blob: THREE.Mesh; blobMat: THREE.MeshBasicMaterial;
        mats: THREE.MeshPhysicalMaterial[];
        rot: number; prevD?: number;
      }[] = [];

      const mk = (map: THREE.Texture | null, refl: boolean) =>
        new THREE.MeshPhysicalMaterial({
          map, roughness: 0.34, metalness: 0.12,
          clearcoat: 1, clearcoatRoughness: 0.3,
          transparent: true, alphaTest: 0.5,
          opacity: refl ? 0.24 : 1, depthWrite: !refl,
        });

      for (let i = 0; i < N; i++) {
        const frontMat = mk(null, false);
        const backMat = mk(null, false);
        const rFrontMat = mk(null, true);
        const rBackMat = mk(null, true);
        materials.push(frontMat, backMat, rFrontMat, rBackMat);

        const grp = new THREE.Group();
        const fMesh = new THREE.Mesh(geo, frontMat);
        fMesh.castShadow = true;
        grp.add(fMesh);
        const bMesh = new THREE.Mesh(geo, backMat);
        bMesh.rotation.y = Math.PI;
        bMesh.castShadow = true;
        grp.add(bMesh);

        const rGrp = new THREE.Group();
        rGrp.add(new THREE.Mesh(geo, rFrontMat));
        const rb = new THREE.Mesh(geo, rBackMat);
        rb.rotation.y = Math.PI;
        rGrp.add(rb);
        rGrp.renderOrder = 2;
        scene.add(rGrp);

        const slot = slotFor(i, W / H);
        grp.position.set(slot.x, BASE_Y, slot.z);
        grp.rotation.y = slot.rot;
        scene.add(grp);

        const blobMat = new THREE.MeshBasicMaterial({
          map: blobTex, transparent: true, depthWrite: false, opacity: BLOB_OPACITY,
        });
        materials.push(blobMat);
        const blob = new THREE.Mesh(blobGeo, blobMat);
        blob.rotation.x = -Math.PI / 2;
        blob.position.set(slot.x, 0.004, slot.z);
        blob.renderOrder = 1;   // 在地板霧面層之下，才不會被它蓋掉
        scene.add(blob);

        packs.push({
          grp, rGrp, blob, blobMat,
          mats: [frontMat, backMat, rFrontMat, rBackMat], rot: slot.rot,
        });
      }

      /*
       * 貼圖：後台有設就整批用同一張（一個商品一款卡包），
       * 沒設才照 packStyles 給每格不同的內建卡包圖 —— 否則每格會長得一模一樣。
       */
      let disposed = false;
      const applyTextures = async () => {
        const p = paramsRef.current;
        for (let i = 0; i < N; i++) {
          const style = packStyles[i] ?? '01';
          const builtinFront = asset(`/images/card/pack/${style}01.webp`);
          const builtinBack = asset(`/images/card/pack/${style}02.webp`);
          // 自訂圖載不到（網址失效、格式不支援…）就退回內建款式 —— 寧可長得不一樣，也不要白色空包
          const loadOr = async (custom: string | undefined, fallback: string) => {
            if (!custom) return loadImage(fallback);
            try { return await loadImage(custom); } catch { return loadImage(fallback); }
          };
          try {
            const [fImg, bImg] = await Promise.all([
              loadOr(p.frontImage, builtinFront),
              loadOr(p.backImage, builtinBack),
            ]);
            if (disposed) return;
            const fTex = imageTexture(fImg);
            const bTex = imageTexture(bImg);
            textures.push(fTex, bTex);
            const [fm, bm, rfm, rbm] = packs[i].mats;
            fm.map = fTex; rfm.map = fTex;
            bm.map = bTex; rbm.map = bTex;
            [fm, bm, rfm, rbm].forEach(m => { m.needsUpdate = true; });
          } catch {
            // 圖掛了就讓那格保持無貼圖，不要中斷其他格
          }
        }
      };
      applyTextures();

      // ── 互動：慢拖=旋轉，快滑=切換 ──
      let dragging = false, lastX = 0, vel = 0, idle = 0, startX = 0, startT = 0;
      const el = renderer.domElement;
      const down = (e: PointerEvent) => {
        dragging = true;
        // iOS 的 AudioContext 要在手勢裡建立，順手在這裡解鎖
        unlockPackAudio();
        /*
         * 這裡原本會播 crinkle()（鋁箔窸窣）。老闆 2026-08-21：**拖曳旋轉當前
         * 卡包不要出聲**，只有輪播切換那一下（swoosh）留著 —— 旋轉是連續動作，
         * 每次按下去都窸窣一聲，滑幾下就變成噪音。
         * unlockPackAudio() 不能一起拿掉：iOS 的 AudioContext 只能在使用者手勢
         * 裡建立，這是整頁唯一保證會先發生的手勢，拿掉的話第一次切換沒聲音。
         */
        lastX = e.clientX ?? 0;
        startX = lastX;
        startT = performance.now();
      };
      const move = (e: PointerEvent) => {
        if (!dragging) return;
        const x = e.clientX ?? 0;
        const dx = x - lastX;
        lastX = x;
        packs[curRef.current].rot += dx * 0.009;
        vel = dx * 0.009;
        idle = 0;
      };
      const go = (dir: number) => {
        swoosh();
        curRef.current = (((curRef.current + dir) % N) + N) % N;
        notifyRef.current?.(packStyles[curRef.current]);
      };
      goRef.current = go;
      const up = () => {
        if (!dragging) return;
        dragging = false;
        const dt = performance.now() - startT;
        const dxTotal = lastX - startX;
        if (dt < 280 && Math.abs(dxTotal) > 70) {
          vel = 0;
          go(dxTotal < 0 ? 1 : -1);
        }
      };
      el.addEventListener('pointerdown', down);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      el.style.cursor = 'grab';
      // 原型是滿版 demo 所以吃掉所有手勢；商品頁下面還有內容，直向要留給頁面捲動
      el.style.touchAction = 'pan-y';

      /* 捲出畫面就整個停下來 —— 商品頁下面還很長，沒必要在看不到的地方燒 GPU */
      let onScreen = true;
      const io = new IntersectionObserver(
        entries => { onScreen = entries.some(e => e.isIntersecting); },
        { rootMargin: '10% 0px' },
      );
      io.observe(mount);

      let raf = 0, t = 0;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        if (!onScreen) return;
        t += 0.016;
        const p = paramsRef.current;
        const ci = curRef.current;
        if (!dragging) {
          packs[ci].rot += vel;
          vel *= 0.94;
          idle += 0.016;
          if (p.autoSpin && idle > p.idleDelay) packs[ci].rot += p.spinSpeed;
        }

        packs.forEach((pk, i) => {
          const d = ((((i - ci + 2) % N) + N) % N) - 2;
          const slot = slotFor(d, camera.aspect);
          const isCur = d === 0;
          const g = pk.grp;
          if (pk.prevD === undefined) pk.prevD = d;
          if (Math.abs(d - pk.prevD) > 2) {
            g.position.set(slot.x, BASE_Y * 0.96, slot.z);
            g.scale.setScalar(slot.s);
            pk.rot = slot.rot;
          }
          pk.prevD = d;
          if (!isCur) {
            const diff = slot.rot - (pk.rot % (Math.PI * 2));
            pk.rot += diff * 0.1;
          }
          /*
           * 縮放是以群組中心為原點，照原型的固定 BASE_Y 放大會讓卡包**底部沉到
           * 地板以下**，影子就被卡包自己蓋住。改成依當下縮放算出「站在地板上」
           * 的中心高度，放大時卡包是往上長而不是往下沉。
           */
          const s = g.scale.x + (slot.s - g.scale.x) * 0.12;
          g.scale.set(s, s, s);
          const standY = 0.35 + (PACK_H * s) / 2;
          const bob = isCur ? Math.sin(t * 1.3) * 0.05 : 0;
          g.position.x += (slot.x - g.position.x) * 0.12;
          g.position.z += (slot.z - g.position.z) * 0.12;
          g.position.y = standY * (isCur ? 1 : 0.97) + bob;
          g.rotation.y = pk.rot;
          const c = pk.mats[0].color.r + (slot.dim - pk.mats[0].color.r) * 0.15;
          pk.mats.forEach(m => m.color.setScalar(c));
          // 接觸陰影跟著卡包走：越大越低的卡包，影子越大越濃
          // 往鏡頭方向挪一點，影子才會露在卡包前面而不是整片被擋住
          pk.blob.position.set(g.position.x, 0.004, g.position.z + 0.28);
          pk.blob.scale.set(BLOB_W * s, BLOB_H * s, 1);
          pk.blobMat.opacity = BLOB_OPACITY * (isCur ? 1 : 0.55);

          // 倒影同步
          pk.rGrp.position.set(g.position.x, -g.position.y, g.position.z);
          pk.rGrp.scale.set(s, -s, s);
          pk.rGrp.rotation.y = pk.rot;
        });

        const { s, sun } = skyNowRef.current();
        const hz = skyHorizonRgb(s);
        scene.fog!.color.setRGB(hz[0], hz[1], hz[2]);

        renderer.clear();
        sky.render(s, sun, reduceMotion ? 0 : t, performance.now(), skyInterval);
        renderer.render(scene, camera);
      };
      loop();

      const onResize = () => {
        const w = mount.clientWidth, h = mount.clientHeight;
        if (!w || !h) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        syncSkySize();
      };
      window.addEventListener('resize', onResize);

      return () => {
        disposed = true;
        cancelAnimationFrame(raf);
        io.disconnect();
        sky.dispose();
        window.removeEventListener('resize', onResize);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        el.removeEventListener('pointerdown', down);
        goRef.current = null;
        // 原型只 dispose renderer，貼圖與 geometry 會留在 GPU；
        // 商品頁是逛完一個換一個，不收會一路累積
        geo.dispose();
        shadowGeo.dispose();
        blobGeo.dispose();
        textures.forEach(x => x.dispose());
        materials.forEach(m => m.dispose());
        renderer.dispose();
        if (el.parentNode === mount) mount.removeChild(el);
      };
    }, [ready, packStyles, height, frontImage, backImage]);

    if (fallback) {
      const style = packStyles[0] ?? '01';
      const src = params.frontImage || asset(`/images/card/pack/${style}01.webp`);
      return (
        <div className="w-full flex items-center justify-center" style={{ height, background: skyBackground(skyS) }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" style={{ height: height * 0.82, objectFit: 'contain' }} />
        </div>
      );
    }

    return (
      <div className="relative w-full overflow-hidden" style={{ height, background: skyBackground(skyS) }}>
        {/*
          流星層。
          **2026-09-01 從畫布底下搬到畫布之上**：背景換成 WebGL 海景之後畫布是
          不透明的，夾在下面等於整層看不到。改疊在上面，並且只在夜裡浮出來 ——
          白色流星配白天的藍天本來就看不見，亮著也只是浪費。
        */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ zIndex: 2, opacity: nightAmount(skyS), transition: 'opacity 1s linear' }}
          aria-hidden
        >
          <style>{`
            @keyframes ggbMeteor {
              0%   { transform: translate3d(0,0,0) rotate(22deg); opacity: 0; }
              12%  { opacity: var(--op); }
              70%  { opacity: var(--op); }
              100% { transform: translate3d(-11vh, 32vh, 0) rotate(22deg); opacity: 0; }
            }
            .ggb-meteor {
              position: absolute; top: -10%;
              width: 2.5px; border-radius: 3px;
              /* 白光暈：尾巴很淡，靠頭部那點亮光帶出來 */
              background: linear-gradient(180deg,
                rgba(255,255,255,0) 0%,
                rgba(255,255,255,0.9) 70%,
                rgba(255,255,255,0.35) 100%);
              filter: drop-shadow(0 0 4px rgba(255,255,255,0.95))
                      drop-shadow(0 0 9px rgba(190,210,255,0.6));
              animation: ggbMeteor var(--dur) linear var(--delay) infinite;
              will-change: transform, opacity;
            }
            /* 流星頭：很小一點光暈 —— 在遠方，不該有明顯的實體 */
            .ggb-meteor::after {
              content: ''; position: absolute; left: 50%; bottom: -2px;
              width: 7px; height: 7px; margin-left: -3.5px; border-radius: 50%;
              background: radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(215,230,255,0.6) 50%, rgba(215,230,255,0) 100%);
            }
            @media (prefers-reduced-motion: reduce) { .ggb-meteor { animation: none; opacity: 0; } }
          `}</style>
          {METEORS.map((m, i) => (
            <span
              key={i}
              className="ggb-meteor"
              style={{
                left: `${m.left}%`,
                height: m.len,
                ['--dur' as string]: `${m.dur}s`,
                ['--delay' as string]: `${m.delay}s`,
                ['--op' as string]: m.op,
              } as React.CSSProperties}
            />
          ))}
        </div>
        {/* 3D 畫布（海景 + 卡包都畫在這一張）。流星改疊在它上面，見上面的說明 */}
        <div ref={mountRef} className="absolute inset-0" style={{ zIndex: 1 }} />

        {/* 音效開關（右上角，同原型）。站上共用 SoundToggle，靜音偏好也共用一份 */}
        <SoundToggle className="absolute right-3 top-3 z-40" />
      </div>
    );
  }
);

PackShowcase3D.displayName = 'PackShowcase3D';
export default PackShowcase3D;
