'use client';

/**
 * 卡包 3D 輪播展示（抽卡商品頁上半部）
 *
 * 移植自老闆的原型 public/images/card/pack-showcase.jsx（TCG Pocket 構圖）：
 * 淺色攝影棚、地板倒影、主包置中、側包貼齊畫面邊微轉角、更後方隱約背面包。
 *
 * 對外介面刻意跟被取代的 PackSelectionCarousel 一模一樣
 * （packStyles / onActiveStyleChange / goToNext / getActiveIndex），
 * 商品頁的「換一批」「立即開包」才不用跟著改。
 *
 * 卡包正反面圖與自動翻轉由後台「抽獎模組設定 → 抽卡 → 參數設定」決定，
 * 存在 machine_theme_params.theme = 'card_pack'。**留空時退回內建的五款卡包圖**
 * —— 不然沒設圖的商品輪播會五格長得一模一樣。
 */

import { useEffect, useImperativeHandle, useRef, forwardRef, useState } from 'react';
import * as THREE from 'three';
import { createClient } from '@/lib/supabase/client';

export type PackShowcase3DHandle = {
  goToNext: () => void;
  getActiveIndex: () => number;
};

type Props = {
  packStyles: string[];
  onActiveStyleChange?: (styleId: string) => void;
  /** 容器高度（px）。商品頁上半部是固定高度，不是滿版 */
  height?: number;
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

// 實體卡包比例（窄高版）62 × 116 mm，等比縮放進 3D 世界
const PACK_MM_W = 62;
const PACK_MM_H = 116;
const PACK_W = 1.75;
const PACK_H = PACK_W * (PACK_MM_H / PACK_MM_W);
const BULGE = 0.1;
const CRIMP = 0.1;
const TEX_W = 640;
const TEX_H = Math.round(TEX_W * (PACK_MM_H / PACK_MM_W));
const TEX_R = 14;
const CAM_Z = 9;
const FOV = 36;
const BASE_Y = 0.35 + PACK_H / 2;

/** 圓角裁切路徑 —— 卡包四角不是直角 */
function roundPath(x: CanvasRenderingContext2D, w: number, h: number, r: number) {
  x.beginPath();
  x.moveTo(r, 0); x.lineTo(w - r, 0); x.quadraticCurveTo(w, 0, w, r);
  x.lineTo(w, h - r); x.quadraticCurveTo(w, h, w - r, h);
  x.lineTo(r, h); x.quadraticCurveTo(0, h, 0, h - r);
  x.lineTo(0, r); x.quadraticCurveTo(0, 0, r, 0);
  x.closePath();
}

/** 上下緣的鋸齒撕線（destination-out 挖掉，才有真的缺口而不是畫上去的） */
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

/** 上下封口的壓紋 */
function crimpStrip(x: CanvasRenderingContext2D, y0: number, h: number) {
  const g = x.createLinearGradient(0, y0, 0, y0 + h);
  g.addColorStop(0, '#cfc4e8'); g.addColorStop(0.5, '#efeaf8'); g.addColorStop(1, '#b9aede');
  x.fillStyle = g; x.fillRect(0, y0, TEX_W, h);
  x.strokeStyle = 'rgba(110,95,160,0.5)'; x.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const yy = y0 + h * (0.25 + i * 0.17);
    x.beginPath();
    for (let px = 0; px <= TEX_W; px += 14) {
      const off = (px / 14) % 2 === 0 ? -2.5 : 2.5;
      if (px === 0) x.moveTo(px, yy + off); else x.lineTo(px, yy + off);
    }
    x.stroke();
  }
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

/** 圖片鋪滿卡包（cover），再套圓角與撕線 */
function imageTexture(img: HTMLImageElement) {
  return makeTexture(x => {
    const s = Math.max(TEX_W / img.width, TEX_H / img.height);
    const w2 = img.width * s, h2 = img.height * s;
    x.drawImage(img, (TEX_W - w2) / 2, (TEX_H - h2) / 2, w2, h2);
  });
}

/** 讀圖：R2 是跨網域，沒有 crossOrigin 會變成 tainted canvas 而整張黑掉 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** 卡包不是平面：中間鼓起、上下封口收窄 */
function buildPackGeo() {
  const geo = new THREE.PlaneGeometry(PACK_W, PACK_H, 48, 84);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i);
    const u = px / PACK_W + 0.5, v = py / PACK_H + 0.5;
    const vv = (v - CRIMP) / (1 - 2 * CRIMP);
    const envV = vv <= 0 || vv >= 1 ? 0 : Math.pow(Math.sin(Math.PI * vv), 0.5);
    const envU = Math.pow(Math.sin(Math.PI * u), 0.75);
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
  if (ad === 0) return { x: 0, z: 0, s: 1, rot: 0, dim: 1 };
  if (ad === 1) {
    const z = -0.9;
    const halfW = tanV * (CAM_Z - z) * aspect;
    return { x: sg * halfW, z, s: 0.95, rot: sg * 0.45, dim: 0.72 };
  }
  const z = -2.2;
  const halfW = tanV * (CAM_Z - z) * aspect;
  return { x: sg * (halfW * 0.72 + (ad - 2) * 0.4), z, s: 0.8, rot: Math.PI, dim: 0.45 };
}

const PackShowcase3D = forwardRef<PackShowcase3DHandle, Props>(
  ({ packStyles, onActiveStyleChange, height = 360 }, ref) => {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const curRef = useRef(0);
    const paramsRef = useRef<Params>(DEFAULTS);
    const goRef = useRef<((d: number) => void) | null>(null);
    const notifyRef = useRef(onActiveStyleChange);
    const [params, setParams] = useState<Params>(DEFAULTS);
    const [ready, setReady] = useState(false);
    const [fallback, setFallback] = useState(false);

    useEffect(() => { notifyRef.current = onActiveStyleChange; });
    useEffect(() => { paramsRef.current = params; }, [params]);

    // 後台參數（讀不到就用預設，展示照樣能看）
    useEffect(() => {
      createClient()
        .from('machine_theme_params')
        .select('params')
        .eq('theme', 'card_pack')
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

    // 參數讀完才建場景：貼圖在建場景時就決定，先建再換會閃一次內建圖
    useEffect(() => {
      if (!ready) return;
      const mount = mountRef.current;
      if (!mount) return;

      const N = Math.max(packStyles.length, 1);
      const W = mount.clientWidth || 375;
      const H = mount.clientHeight || height;

      const scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0xe9edf7, 7, 16);

      const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.1, 100);
      camera.position.set(0, BASE_Y - 0.55, CAM_Z);
      camera.lookAt(0, BASE_Y - 0.55, 0);

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

      // ── 燈光（明亮棚）──
      scene.add(new THREE.AmbientLight(0xffffff, 0.95));
      const key = new THREE.DirectionalLight(0xffffff, 0.75);
      key.position.set(3, 8, 6);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
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
      const shadowMat = new THREE.ShadowMaterial({ opacity: 0.13 });
      const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
      shadowPlane.rotation.x = -Math.PI / 2;
      shadowPlane.position.y = 0.001;
      shadowPlane.receiveShadow = true;
      scene.add(shadowPlane);

      const fadeCnv = document.createElement('canvas');
      fadeCnv.width = fadeCnv.height = 512;
      const fx = fadeCnv.getContext('2d')!;
      const fg = fx.createRadialGradient(256, 256, 40, 256, 256, 256);
      fg.addColorStop(0, 'rgba(213,219,236,0.35)');
      fg.addColorStop(0.55, 'rgba(213,219,236,0.85)');
      fg.addColorStop(1, 'rgba(213,219,236,1)');
      fx.fillStyle = fg; fx.fillRect(0, 0, 512, 512);
      const fadeTex = new THREE.CanvasTexture(fadeCnv);
      const fadeGeo = new THREE.PlaneGeometry(40, 40);
      const fadeMat = new THREE.MeshBasicMaterial({ map: fadeTex, transparent: true, depthWrite: false });
      const fade = new THREE.Mesh(fadeGeo, fadeMat);
      fade.rotation.x = -Math.PI / 2;
      fade.renderOrder = 3;
      scene.add(fade);

      // ── 卡包們（含地板倒影）──
      const geo = buildPackGeo();
      const textures: THREE.Texture[] = [fadeTex];
      const materials: THREE.Material[] = [shadowMat, fadeMat];
      const packs: {
        grp: THREE.Group; rGrp: THREE.Group;
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

        packs.push({ grp, rGrp, mats: [frontMat, backMat, rFrontMat, rBackMat], rot: slot.rot });
      }

      /*
       * 貼圖：後台有設就整批用同一張（一個商品一款卡包），
       * 沒設才照 packStyles 給每格不同的內建卡包圖 —— 否則五格會長得一模一樣。
       */
      let disposed = false;
      const applyTextures = async () => {
        const p = paramsRef.current;
        for (let i = 0; i < N; i++) {
          const style = packStyles[i] ?? '01';
          const frontSrc = p.frontImage || `/images/card/pack/${style}a.webp`;
          const backSrc = p.backImage || `/images/card/pack/${style}b.webp`;
          try {
            const [fImg, bImg] = await Promise.all([loadImage(frontSrc), loadImage(backSrc)]);
            if (disposed) return;
            const fTex = imageTexture(fImg);
            const bTex = imageTexture(bImg);
            textures.push(fTex, bTex);
            const [fm, bm, rfm, rbm] = packs[i].mats;
            fm.map = fTex; rfm.map = fTex;
            bm.map = bTex; rbm.map = bTex;
            [fm, bm, rfm, rbm].forEach(m => { m.needsUpdate = true; });
          } catch {
            // 圖掛了就讓那格保持無貼圖（alphaTest 會讓它整片透明），不要中斷其他格
          }
        }
      };
      applyTextures();

      // ── 互動：慢拖=旋轉，快滑=切換 ──
      let dragging = false, lastX = 0, vel = 0, idle = 0, startX = 0, startT = 0;
      const el = renderer.domElement;
      const down = (e: PointerEvent) => {
        dragging = true;
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
      el.style.touchAction = 'pan-y';   // 只吃橫向；直向留給頁面捲動

      let raf = 0, t = 0;
      const loop = () => {
        raf = requestAnimationFrame(loop);
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
          const bob = isCur ? Math.sin(t * 1.3) * 0.05 : 0;
          g.position.x += (slot.x - g.position.x) * 0.12;
          g.position.z += (slot.z - g.position.z) * 0.12;
          g.position.y = BASE_Y * (isCur ? 1 : 0.97) + bob;
          const s = g.scale.x + (slot.s - g.scale.x) * 0.12;
          g.scale.set(s, s, s);
          g.rotation.y = pk.rot;
          const c = pk.mats[0].color.r + (slot.dim - pk.mats[0].color.r) * 0.15;
          pk.mats.forEach(m => m.color.setScalar(c));
          // 倒影同步
          pk.rGrp.position.set(g.position.x, -g.position.y, g.position.z);
          pk.rGrp.scale.set(s, -s, s);
          pk.rGrp.rotation.y = pk.rot;
        });

        renderer.render(scene, camera);
      };
      loop();

      const onResize = () => {
        const w = mount.clientWidth, h = mount.clientHeight;
        if (!w || !h) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', onResize);

      return () => {
        disposed = true;
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        el.removeEventListener('pointerdown', down);
        goRef.current = null;
        // 原型只 dispose renderer，貼圖與 geometry 會留在 GPU；
        // 商品頁是逛完一個換一個，不收會一路累積到當掉
        geo.dispose();
        shadowGeo.dispose();
        fadeGeo.dispose();
        textures.forEach(x => x.dispose());
        materials.forEach(m => m.dispose());
        renderer.dispose();
        if (el.parentNode === mount) mount.removeChild(el);
      };
      // packStyles 換一批時要重建（貼圖跟著換）
    }, [ready, packStyles, height]);

    if (fallback) {
      const style = packStyles[0] ?? '01';
      const src = params.frontImage || `/images/card/pack/${style}a.webp`;
      return (
        <div className="w-full flex items-center justify-center" style={{ height }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" style={{ height: height * 0.82, objectFit: 'contain' }} />
        </div>
      );
    }

    return <div ref={mountRef} className="w-full" style={{ height }} />;
  }
);

PackShowcase3D.displayName = 'PackShowcase3D';
export default PackShowcase3D;
