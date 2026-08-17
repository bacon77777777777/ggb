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
  /** 容器高度（px）。機台區是 375 × 375×(932/750) ≒ 466 */
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
const PACK_W = 2.15;   // 原型是滿版 demo；商品頁機台區只有 375×466，卡包要放大才撐得起來
const PACK_H_DEFAULT = PACK_W * (PACK_MM_H / PACK_MM_W);
const BULGE = 0.1;
const CRIMP = 0.1;
const TEX_W = 640;
const CAM_Z = 9;
const FOV = 36;
/** 卡包底緣站在這個高度（地板在 y=0）。高度不同的卡包一律底部對齊，像站在檯面上 */
const FLOOR_Y = 0.35;





/** 往內削掉的像素數（貼圖座標）。描邊約 2px，放大到 640 寬約 3px，取 4 保險 */
const EDGE_SHAVE = 4;

/**
 * 削掉卡包外緣那圈深色描邊。
 *
 * 卡包圖**本身就烙著一圈 1～2px 的深色描邊**（實測 01a.webp 邊界像素是
 * 11,66,36 → 0,21,0，幾乎純黑）。原型看不到它，是因為原型把圖 cover 裁切成
 * 62×116（比原圖窄很多），左右那圈剛好被裁掉；我們改成保留圖片比例後就露出來了。
 * 描邊沿著上下的鋸齒邊也有，所以單純裁四邊切不乾淨。
 *
 * 做法：alpha 先硬化（半透明一律當透明，去掉會混進黑色的過渡像素），
 * 再用四鄰域往內侵蝕幾圈，描邊那一圈就跟著不見。
 */
function shaveEdge(x: CanvasRenderingContext2D, w: number, h: number) {
  const img = x.getImageData(0, 0, w, h);
  const a = img.data;
  let cur = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) cur[i] = a[i * 4 + 3] > 200 ? 1 : 0;

  for (let k = 0; k < EDGE_SHAVE; k++) {
    const next = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let xx = 1; xx < w - 1; xx++) {
        const i = row + xx;
        if (cur[i] && cur[i - 1] && cur[i + 1] && cur[i - w] && cur[i + w]) next[i] = 1;
      }
    }
    cur = next;
  }

  for (let i = 0; i < w * h; i++) a[i * 4 + 3] = cur[i] ? 255 : 0;

  /*
   * 光把 alpha 設 0 還不夠：**透明像素的 RGB 還留著剛削掉的那圈黑**，
   * 貼圖做 mipmap 與雙線性內插時會把它們混回邊緣，看起來就還是有黑邊。
   * 所以把邊界顏色往外「暈開」幾圈填掉透明區（業界常說的 alpha bleed）。
   */
  const opaque = Uint8Array.from(cur);
  for (let k = 0; k < EDGE_SHAVE + 2; k++) {
    const grown = Uint8Array.from(opaque);
    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let xx = 1; xx < w - 1; xx++) {
        const i = row + xx;
        if (opaque[i]) continue;
        const src = opaque[i - 1] ? i - 1 : opaque[i + 1] ? i + 1
                  : opaque[i - w] ? i - w : opaque[i + w] ? i + w : -1;
        if (src < 0) continue;
        a[i * 4] = a[src * 4];
        a[i * 4 + 1] = a[src * 4 + 1];
        a[i * 4 + 2] = a[src * 4 + 2];
        grown[i] = 1;
      }
    }
    opaque.set(grown);
  }

  x.putImageData(img, 0, 0);
}

/**
 * 圖片決定卡包比例：寬固定、高照圖片比例算，所以圖不裁切也不變形
 * （原型是 cover 裁切成固定的 62×116，長寬比不同的卡包圖會被切掉頭尾）。
 *
 * ⚠️ 不要再套圓角與鋸齒撕線：卡包圖**本身就已經去背、帶著自己的鋸齒邊**，
 * 再切一次只會在邊緣多出半透明像素。而去背圖的透明區 RGB 是純黑，
 * 那些半透明像素縮放時會把黑色混進來 —— 那就是卡包周圍那圈黑邊的來源。
 */
function imageTexture(img: HTMLImageElement) {
  const texH = Math.max(1, Math.round(TEX_W * (img.height / img.width)));
  const c = document.createElement('canvas');
  c.width = TEX_W; c.height = texH;
  const x = c.getContext('2d')!;
  x.drawImage(img, 0, 0, TEX_W, texH);
  shaveEdge(x, TEX_W, texH);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;

  // 寬高為 0（解碼失敗、SVG 沒有內建尺寸）時 ratio 會是 NaN，
  // 傳下去幾何體的 position 會整片變 NaN，three 就一路噴 computeBoundingSphere 警告
  const ratio = img.width > 0 && img.height > 0 ? img.height / img.width : PACK_MM_H / PACK_MM_W;
  return { tex, ratio };
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
function buildPackGeo(packHRaw: number) {
  // 除以 packH 的地方不只一處，這裡先擋掉 0 與 NaN
  const packH = Number.isFinite(packHRaw) && packHRaw > 0 ? packHRaw : PACK_H_DEFAULT;
  const geo = new THREE.PlaneGeometry(PACK_W, packH, 48, 84);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i);
    const u = px / PACK_W + 0.5, v = py / packH + 0.5;
    const vv = (v - CRIMP) / (1 - 2 * CRIMP);
    /*
     * Math.pow(負數, 小數) 是 NaN。PlaneGeometry 的頂點座標是浮點累加出來的，
     * 邊界那圈的 u/v 會差個 1e-16 而讓 sin 變成極小的負數 —— 整片 position
     * 就跟著 NaN，three 每幀噴 computeBoundingSphere 警告。原型的尺寸剛好閃過，
     * 卡包放大後就踩到了。夾住負值即可。
     */
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
  ({ packStyles, onActiveStyleChange, height = 466 }, ref) => {
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
      // 對準卡包中心，卡包才會落在畫面正中央。
      // 每個卡包高度不同（照圖片比例），所以目標高度會跟著當前卡包平滑移動
      let camY = FLOOR_Y + PACK_H_DEFAULT / 2;
      camera.position.set(0, camY, CAM_Z);
      camera.lookAt(0, camY, 0);

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

      /*
       * 原型有一層淺灰的地板霧面（把倒影往外淡出）。那是為淺色攝影棚背景畫的，
       * 蓋在商品頁的機台圖上會變成一塊突兀的灰霧，所以整層拿掉；
       * 倒影改用較低的不透明度收斂，看起來像機台檯面的反光。
       */
      // ── 卡包們（含地板倒影）──
      const textures: THREE.Texture[] = [];
      const materials: THREE.Material[] = [shadowMat];
      const packs: {
        grp: THREE.Group; rGrp: THREE.Group;
        meshes: THREE.Mesh[];
        mats: THREE.MeshPhysicalMaterial[];
        geo: THREE.BufferGeometry;
        /** 卡包高度與中心高度：照圖片比例算，所以每包可能不一樣 */
        packH: number; basY: number;
        rot: number; prevD?: number;
      }[] = [];

      const mk = (map: THREE.Texture | null, refl: boolean) =>
        new THREE.MeshPhysicalMaterial({
          map, roughness: 0.34, metalness: 0.12,
          clearcoat: 1, clearcoatRoughness: 0.3,
          transparent: true, alphaTest: 0.5,
          opacity: refl ? 0.14 : 1, depthWrite: !refl,
        });

      for (let i = 0; i < N; i++) {
        const frontMat = mk(null, false);
        const backMat = mk(null, false);
        const rFrontMat = mk(null, true);
        const rBackMat = mk(null, true);
        materials.push(frontMat, backMat, rFrontMat, rBackMat);

        const geo = buildPackGeo(PACK_H_DEFAULT);
        const grp = new THREE.Group();
        const fMesh = new THREE.Mesh(geo, frontMat);
        fMesh.castShadow = true;
        grp.add(fMesh);
        const bMesh = new THREE.Mesh(geo, backMat);
        bMesh.rotation.y = Math.PI;
        bMesh.castShadow = true;
        grp.add(bMesh);

        const rGrp = new THREE.Group();
        const rf = new THREE.Mesh(geo, rFrontMat);
        const rb = new THREE.Mesh(geo, rBackMat);
        rb.rotation.y = Math.PI;
        rGrp.add(rf); rGrp.add(rb);
        rGrp.renderOrder = 2;
        scene.add(rGrp);

        const slot = slotFor(i, W / H);
        const basY = FLOOR_Y + PACK_H_DEFAULT / 2;
        grp.position.set(slot.x, basY, slot.z);
        grp.rotation.y = slot.rot;
        scene.add(grp);

        packs.push({
          grp, rGrp, meshes: [fMesh, bMesh, rf, rb],
          mats: [frontMat, backMat, rFrontMat, rBackMat],
          geo, packH: PACK_H_DEFAULT, basY, rot: slot.rot,
        });
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
            const f = imageTexture(fImg);
            const bk = imageTexture(bImg);
            textures.push(f.tex, bk.tex);
            const pk = packs[i];
            const [fm, bm, rfm, rbm] = pk.mats;
            fm.map = f.tex; rfm.map = f.tex;
            bm.map = bk.tex; rbm.map = bk.tex;
            [fm, bm, rfm, rbm].forEach(m => { m.needsUpdate = true; });

            // 寬固定、高照正面圖的比例 —— 幾何體要跟著換，否則圖會被壓扁
            const packH = PACK_W * f.ratio;
            if (Number.isFinite(packH) && packH > 0 && Math.abs(packH - pk.packH) > 0.001) {
              const old = pk.geo;
              const geo2 = buildPackGeo(packH);
              pk.meshes.forEach(m => { m.geometry = geo2; });
              pk.geo = geo2;
              pk.packH = packH;
              pk.basY = FLOOR_Y + packH / 2;
              old.dispose();
            }
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
            g.position.set(slot.x, pk.basY * 0.96, slot.z);
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
          g.position.y = pk.basY * (isCur ? 1 : 0.97) + bob;
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

        // 鏡頭高度跟著當前卡包的中心走（不同高度的卡包都會落在畫面正中）
        const wantY = packs[ci].basY;
        camY += (wantY - camY) * 0.12;
        camera.position.y = camY;
        camera.lookAt(0, camY, 0);

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
        packs.forEach(pk => pk.geo.dispose());
        shadowGeo.dispose();
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
