'use client';

/**
 * GGB 卡牌 360° 展示 —— 老闆原型 `public/images/card/card-showcase.jsx` 的移植。
 *
 * **3D 建模、貼圖、旋轉、光影全是原稿，邏輯沒改。** 只換接口：
 *   1. 示範用的「上傳正／背面」改成由 props 帶入商品圖
 *   2. 移除示範用的標題、提示、自動旋轉開關與速度滑桿
 *   3. 跨網域圖片走 /_next/image 同源端點（R2 不回 CORS，直接畫進 canvas 會汙染畫布）
 *
 * 用在卡包模式的「品項詳情」彈窗圖區塊，取代原本的靜態圖。
 */

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/** R2 等跨網域圖片改走同源端點：canvas 貼圖需要 CORS，R2 沒回該標頭 */
function sameOriginSrc(src) {
  if (typeof window === "undefined" || !src) return src;
  if (!/^https?:\/\//i.test(src)) return src;
  try { if (new URL(src).origin === window.location.origin) return src; } catch { return src; }
  return `/_next/image?url=${encodeURIComponent(src)}&w=1080&q=90`;
}

// ── GGB 卡牌 360° 展示模組 ──
// 上傳正/背面圖 → 圓角薄卡 3D 旋轉展示。寬度固定,高度自動跟隨圖片比例。

const CARD_W = 2.75;    // 寬度固定（原型 2.1 → 放大，底座移除後版面空出來了）
const CARD_T = 0.018;   // 厚度(薄)
const CORNER = 0.12;    // 圓角半徑
const TEX_W = 630;
const TEX_R = Math.round((CORNER / CARD_W) * TEX_W); // 貼圖圓角(px)
const DEFAULT_RATIO = 88 / 63;

function roundPath(x, w, h, r) {
  x.beginPath();
  x.moveTo(r, 0);
  x.lineTo(w - r, 0);
  x.quadraticCurveTo(w, 0, w, r);
  x.lineTo(w, h - r);
  x.quadraticCurveTo(w, h, w - r, h);
  x.lineTo(r, h);
  x.quadraticCurveTo(0, h, 0, h - r);
  x.lineTo(0, r);
  x.quadraticCurveTo(0, 0, r, 0);
  x.closePath();
}

function roundedTexture(texH, draw) {
  const c = document.createElement("canvas");
  c.width = TEX_W; c.height = texH;
  const x = c.getContext("2d");
  x.clearRect(0, 0, TEX_W, texH);
  roundPath(x, TEX_W, texH, Math.min(TEX_R, texH / 2 - 1));
  x.clip();
  draw(x, texH);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 8;
  return t;
}

function makePlaceholder(kind) {
  const texH = Math.round(TEX_W * DEFAULT_RATIO);
  return roundedTexture(texH, (x, h) => {
    const g = x.createLinearGradient(0, 0, TEX_W, h);
    if (kind === "front") { g.addColorStop(0, "#141c44"); g.addColorStop(1, "#0b1026"); }
    else { g.addColorStop(0, "#7a1420"); g.addColorStop(1, "#3d0a12"); }
    x.fillStyle = g; x.fillRect(0, 0, TEX_W, h);
    x.strokeStyle = "#ffc64b"; x.lineWidth = 14;
    x.strokeRect(24, 24, TEX_W - 48, h - 48);
    x.fillStyle = "#ffc64b";
    x.font = "900 92px sans-serif"; x.textAlign = "center";
    x.fillText(kind === "front" ? "正 面" : "背 面", TEX_W / 2, h * 0.48);
    if (kind === "front") {
      x.font = "700 34px sans-serif"; x.fillStyle = "#8b96c9";
      x.fillText("上傳你的卡牌圖片", TEX_W / 2, h * 0.57);
    }
  });
}

function imageTexture(img, ratio) {
  // 卡牌比例已跟圖片一致,cover-fit 只是保險
  const texH = Math.round(TEX_W * ratio);
  return roundedTexture(texH, (x, h) => {
    const s = Math.max(TEX_W / img.width, h / img.height);
    const w2 = img.width * s, h2 = img.height * s;
    x.drawImage(img, (TEX_W - w2) / 2, (h - h2) / 2, w2, h2);
  });
}

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function buildCoreGeo(h) {
  const geo = new THREE.ExtrudeGeometry(
    roundedRectShape(CARD_W, h, Math.min(CORNER, h / 2 - 0.01)),
    { depth: CARD_T, bevelEnabled: false, curveSegments: 12 }
  );
  geo.translate(0, 0, -CARD_T / 2);
  return geo;
}

export default function CardShowcase3D({ frontImage, backImage, height = 320, autoSpin = true, spinSpeed = 0.8 }) {
  const mountRef = useRef(null);
  const matRef = useRef({ front: null, back: null });
  const apiRef = useRef(null);
  const stateRef = useRef({ auto: true, speed: 0.8 });
  const [loaded, setLoaded] = useState({ front: false, back: false });

  useEffect(() => { stateRef.current.auto = autoSpin; }, [autoSpin]);
  useEffect(() => { stateRef.current.speed = spinSpeed; }, [spinSpeed]);

  useEffect(() => {
    const mount = mountRef.current;
    const W = mount.clientWidth, H = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1026);
    scene.fog = new THREE.Fog(0x0b1026, 9, 18);

    const camera = new THREE.PerspectiveCamera(36, W / H, 0.1, 100);
    camera.position.set(0, 2.2, 7.2);
    camera.lookAt(0, 1.9, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    // ── 燈光 ──
    scene.add(new THREE.AmbientLight(0x39406e, 1.4));
    const key = new THREE.SpotLight(0xfff3d6, 1.35, 40, Math.PI / 4.5, 0.5, 1.1);
    key.position.set(3.5, 8, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const rimA = new THREE.PointLight(0x5aa0ff, 1.1, 20);
    rimA.position.set(-5, 3, -3);
    scene.add(rimA);
    const rimB = new THREE.PointLight(0xffc64b, 0.8, 20);
    rimB.position.set(5, 1.5, -2.5);
    scene.add(rimB);

    // ── 地板 ──
    const cnv = document.createElement("canvas");
    cnv.width = cnv.height = 512;
    const ctx = cnv.getContext("2d");
    const g = ctx.createRadialGradient(256, 256, 30, 256, 256, 256);
    g.addColorStop(0, "#1c2650");
    g.addColorStop(0.45, "#101737");
    g.addColorStop(1, "#0b1026");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
    // 地板已移除（老闆：底座移除）

    // ── 旋轉台 ──
    const turntable = new THREE.Group();
    /* 底座（圓盤＋金環＋地面光暈）已移除（老闆 2026-08-19）：
       這是原型的展示台，嵌進「品項詳情」彈窗後只是佔掉高度，卡片反而被擠小。
       旋轉台本身保留 —— 卡片掛在它底下，轉的就是它。 */
    scene.add(turntable);

    // ── 卡牌(圓角薄卡,高度可變) ──
    /* 底座沒了，卡片改成對齊鏡頭注視點（camera.lookAt 的 y=1.9）＝畫面正中間，
       不再是「浮在圓盤上方」那個高度 */
    const CENTER_Y = 1.9;
    const dims = { h: CARD_W * DEFAULT_RATIO, baseY: CENTER_Y };

    const cardGroup = new THREE.Group();
    const core = new THREE.Mesh(
      buildCoreGeo(dims.h),
      new THREE.MeshStandardMaterial({ color: 0xe9ecf8, roughness: 0.55 })
    );
    core.castShadow = true;
    cardGroup.add(core);

    const frontMat = new THREE.MeshPhysicalMaterial({
      map: makePlaceholder("front"), roughness: 0.32, metalness: 0.05,
      clearcoat: 1, clearcoatRoughness: 0.25,
      transparent: true, alphaTest: 0.5,
    });
    const backMat = new THREE.MeshPhysicalMaterial({
      map: makePlaceholder("back"), roughness: 0.32, metalness: 0.05,
      clearcoat: 1, clearcoatRoughness: 0.25,
      transparent: true, alphaTest: 0.5,
    });
    matRef.current = { front: frontMat, back: backMat };

    let faceGeo = new THREE.PlaneGeometry(CARD_W, dims.h);
    const front = new THREE.Mesh(faceGeo, frontMat);
    front.position.z = CARD_T / 2 + 0.002;
    cardGroup.add(front);
    const back = new THREE.Mesh(faceGeo, backMat);
    back.rotation.y = Math.PI;
    back.position.z = -(CARD_T / 2 + 0.002);
    cardGroup.add(back);

    cardGroup.position.y = dims.baseY;
    turntable.add(cardGroup);

    // 依圖片比例重建卡牌(寬固定,高跟隨)
    apiRef.current = {
      rebuild(ratio) {
        const r = Math.min(Math.max(ratio, 0.4), 2.6); // 防呆
        dims.h = CARD_W * r;
        dims.baseY = CENTER_Y;
        core.geometry.dispose();
        core.geometry = buildCoreGeo(dims.h);
        faceGeo.dispose();
        faceGeo = new THREE.PlaneGeometry(CARD_W, dims.h);
        front.geometry = faceGeo;
        back.geometry = faceGeo;
      },
    };

    // ── 互動:拖曳 + 慣性 + 自動旋轉 ──
    let dragging = false, lastX = 0, vel = 0, idle = 0;
    const el = renderer.domElement;
    const down = (e) => { dragging = true; lastX = e.clientX ?? 0; };
    const move = (e) => {
      if (!dragging) return;
      const x = e.clientX ?? 0;
      const dx = x - lastX;
      lastX = x;
      turntable.rotation.y += dx * 0.009;
      vel = dx * 0.009;
      idle = 0;
    };
    const up = () => { dragging = false; };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    el.style.cursor = "grab";
    el.style.touchAction = "none";

    let raf, t = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      t += 0.016;
      if (!dragging) {
        turntable.rotation.y += vel;
        vel *= 0.94;
        idle += 0.016;
        if (stateRef.current.auto && idle > 1.2) {
          turntable.rotation.y += 0.011 * stateRef.current.speed;
        }
      }
      cardGroup.position.y = dims.baseY + Math.sin(t * 1.3) * 0.06;
      cardGroup.rotation.z = Math.sin(t * 0.9) * 0.02;
      renderer.render(scene, camera);
    };
    loop();

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      el.removeEventListener("pointerdown", down);
      renderer.dispose();
      mount.removeChild(el);
    };
  }, []);

  /** 依 props 載入正／背面貼圖（原型是 <input type=file>，線上改吃商品資料） */
  useEffect(() => {
    let dead = false;
    const load = (src, side) => {
      if (!src) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (dead) return;
        const ratio = img.height / img.width;
        if (side === "front") apiRef.current?.rebuild(ratio);  // 寬固定，高跟著正面圖比例
        const tex = imageTexture(img, Math.min(Math.max(ratio, 0.4), 2.6));
        const mat = matRef.current[side];
        if (mat) {
          if (mat.map) mat.map.dispose();
          mat.map = tex;
          mat.needsUpdate = true;
        }
        setLoaded((p) => ({ ...p, [side]: true }));
      };
      img.src = sameOriginSrc(src);
    };
    load(frontImage, "front");
    load(backImage, "back");
    return () => { dead = true; };
  }, [frontImage, backImage]);


  return (
    /* 只保留 3D 畫布：標題、提示、上傳鈕、自動旋轉開關與速度滑桿都是示範用的，
       線上是嵌在「品項詳情」彈窗的圖區塊裡，那些控制項會干擾閱讀 */
    <div style={{ position: "relative", width: "100%", height, borderRadius: 12, overflow: "hidden" }}>
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}
