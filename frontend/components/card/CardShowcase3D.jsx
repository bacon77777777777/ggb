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
const CORNER = 0.175;   // 圓角半徑（0.12 → 0.175，畫面上約 +6px，老闆 2026-08-19）
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

/*
 * 貼圖還沒載好時用的空白圖。
 *
 * 原型這裡畫的是深藍／深紅底 ＋「正 面」「背 面」「上傳你的卡牌圖片」字樣 ——
 * 那是給示範頁看的。線上一開彈窗會先閃出那塊深色模型才換成真的卡（老闆回報），
 * 改成全透明，並且在正面貼圖載好之前整個卡片都不顯示，改用「載入中…」。
 */
function makePlaceholder() {
  const texH = Math.round(TEX_W * DEFAULT_RATIO);
  return roundedTexture(texH, () => {});
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
  /* 放大時整塊改成全螢幕：WebGL 只畫在畫布裡，容器維持 320px 高的話，
     放大後卡片會被框裁掉、只看得到中間（老闆 2026-08-19「不要侷限容器裡」）。
     用 ref 轉交 setter，不把 expanded 放進場景 effect 的相依 —— 那會重建場景、
     旋轉角度與縮放倍率都會被重置 */
  const [expanded, setExpanded] = useState(false);

  useEffect(() => { stateRef.current.auto = autoSpin; }, [autoSpin]);
  useEffect(() => { stateRef.current.speed = spinSpeed; }, [spinSpeed]);

  useEffect(() => {
    const mount = mountRef.current;
    const W = mount.clientWidth, H = mount.clientHeight;

    const scene = new THREE.Scene();
    /* 白底（老闆 2026-08-19）。霧色要跟著換 —— 留著原本的深藍霧，
       卡片邊緣會蒙上一層藍灰，在白底上看起來像沒去乾淨的背景 */
    scene.background = new THREE.Color(0xffffff);
    scene.fog = new THREE.Fog(0xffffff, 9, 18);

    const camera = new THREE.PerspectiveCamera(36, W / H, 0.1, 100);
    camera.position.set(0, 2.2, 7.2);
    camera.lookAt(0, 1.9, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    // ── 燈光 ──
    // 環境光原本是深藍紫（為深色底調的），白底上會讓卡面整片發灰，改中性
    /*
     * 白底的亮度重調（老闆 2026-08-19「太亮了」）。
     * 原本這組是為深色底配的：環境光 1.15 + 主光 1.35 + 兩盞補光，
     * 深色底看起來剛好，換白底就整片過曝、卡面細節全被洗掉。
     * 兩盞彩色補光原本的作用是「讓卡緣從黑底裡浮出來」—— 白底不需要，
     * 留一點點只為了讓側面有顏色變化，不再負責照亮。
     */
    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const key = new THREE.SpotLight(0xfff6e6, 0.62, 40, Math.PI / 4.5, 0.6, 1.1);
    key.position.set(3.5, 8, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const rimA = new THREE.PointLight(0x5aa0ff, 0.28, 20);
    rimA.position.set(-5, 3, -3);
    scene.add(rimA);
    const rimB = new THREE.PointLight(0xffc64b, 0.2, 20);
    rimB.position.set(5, 1.5, -2.5);
    scene.add(rimB);

    /*
     * 卡片底下的落影。地板在移除底座時一起拿掉了，castShadow 沒有東西接，
     * 所以自己畫一片：徑向漸層（中心深、往外透明）貼在卡片正下方。
     * 沒有這片，卡片看起來像浮在半空中。
     */
    const shCnv = document.createElement("canvas");
    shCnv.width = shCnv.height = 256;
    const sx = shCnv.getContext("2d");
    const sg = sx.createRadialGradient(128, 128, 4, 128, 128, 126);
    sg.addColorStop(0, "rgba(28,34,58,0.42)");
    sg.addColorStop(0.45, "rgba(28,34,58,0.16)");
    sg.addColorStop(1, "rgba(28,34,58,0)");
    sx.fillStyle = sg;
    sx.fillRect(0, 0, 256, 256);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(CARD_W * 1.45, CARD_W * 0.62),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(shCnv),
        transparent: true, depthWrite: false,
      })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    shadow.renderOrder = -1;
    scene.add(shadow);

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
      map: makePlaceholder(), transparent: true, roughness: 0.32, metalness: 0.05,
      clearcoat: 1, clearcoatRoughness: 0.25,
      transparent: true, alphaTest: 0.5,
    });
    const backMat = new THREE.MeshPhysicalMaterial({
      map: makePlaceholder(), transparent: true, roughness: 0.32, metalness: 0.05,
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
    // 正面貼圖載好之前不顯示，避免先閃一下空白卡與落影
    cardGroup.visible = false;
    shadow.visible = false;

    apiRef.current = {
      setVisible(v) { cardGroup.visible = v; shadow.visible = v; },
      /*
       * 放大時把場景底改成透明（老闆 2026-08-19：白背景不要跟著放大）。
       * 白色是「卡片的展示台」，尺寸就該是那塊展示區；全螢幕時整片變白，
       * 看起來像整頁被洗白，而不是把卡片放大來看。
       * 透明之後外層鋪一層淡淡的暗底，卡片浮在頁面之上，像燈箱。
       * 霧一併關掉 —— 霧色是配白底調的，底透明了還留著會在卡緣糊一圈白。
       */
      setStageWhite(v) {
        scene.background = v ? new THREE.Color(0xffffff) : null;
        scene.fog = v ? new THREE.Fog(0xffffff, 9, 18) : null;
      },
      resetZoom() { zoom = 1; applyZoom(); },
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

    // ── 互動:拖曳旋轉 + 兩指縮放 + 慣性 + 自動旋轉 ──
    let dragging = false, lastX = 0, vel = 0, idle = 0;
    const el = renderer.domElement;

    /*
     * 兩指縮放（老闆 2026-08-19）：**只推近／拉遠鏡頭，不碰 turntable.rotation.y**，
     * 所以放大的永遠是「目前轉到的那一面」，不會被拉回正面。
     * zoom 是「相對原始距離的倍率」：2 就是距離減半＝看起來大一倍。
     */
    const CAM_TARGET = new THREE.Vector3(0, 1.9, 0);
    const CAM_DIR = camera.position.clone().sub(CAM_TARGET);   // 注視點 → 鏡頭
    const ZOOM_MIN = 1, ZOOM_MAX = 4;
    /**
     * 收合時的畫布高度。**視覺大小的基準就是它**，見 applyZoom 的說明。
     */
    const BASE_H = Math.max(1, H);
    /*
     * 切全螢幕的門檻，帶遲滯（放大到 EXPAND 才展開、縮回 COLLAPSE 才收起）。
     * 沒有遲滯的話在門檻附近手指抖一下就會全螢幕／收起來回跳。
     */
    const ZOOM_EXPAND = 1.25, ZOOM_COLLAPSE = 1.08;
    let zoom = 1;
    let isBig = false;
    const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

    const applyZoom = () => {
      /*
       * **卡片的視覺大小只跟 zoom 走，不受容器高度影響。**
       *
       * 透視投影下，物體的螢幕像素大小正比於畫布高度。原本鏡頭距離只除以 zoom，
       * 於是切全螢幕的那一刻畫布從 320px 變成整個螢幕（手機約 844），
       * zoom 明明只從 1.00 走到 1.02，卡片卻瞬間放大兩倍多 ——
       * 老闆 2026-09-01 回報的「稍微擴張一點點就跳超大」就是這個。
       *
       * 把 BASE_H / 現在的畫布高 乘進去之後，全螢幕只剩下它該做的事
       *（不要被 320px 的框裁掉），不再自己造成視覺跳動。
       */
      const h = Math.max(1, renderer.domElement.clientHeight || BASE_H);
      const eff = zoom * (BASE_H / h);
      camera.position.copy(CAM_TARGET).add(CAM_DIR.clone().multiplyScalar(1 / eff));
      camera.lookAt(CAM_TARGET);

      // useState 的 setter 身分是穩定的，場景 effect 用 [] 相依也抓得到最新的它
      const next = isBig ? zoom > ZOOM_COLLAPSE : zoom >= ZOOM_EXPAND;
      if (next === isBig) return;
      isBig = next;
      setExpanded(isBig);          // 放大到一定程度才全螢幕，縮回去自動收回
      apiRef.current?.setStageWhite(!isBig);
    };

    const pts = new Map();
    let pinchBase = 0, zoomBase = 1;
    const pinchDist = () => {
      const [a, b] = [...pts.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const down = (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        // 進入縮放：關掉旋轉，免得兩指移動時畫面同時被轉
        dragging = false;
        pinchBase = pinchDist();
        zoomBase = zoom;
      } else if (pts.size === 1) {
        dragging = true; lastX = e.clientX ?? 0;
      }
    };
    const move = (e) => {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size >= 2) {
        if (pinchBase > 0) {
          zoom = clampZoom(zoomBase * (pinchDist() / pinchBase));
          applyZoom();
          idle = 0;
        }
        return;
      }
      if (!dragging) return;
      const x = e.clientX ?? 0;
      const dx = x - lastX;
      lastX = x;
      turntable.rotation.y += dx * 0.009;
      vel = dx * 0.009;
      idle = 0;
    };
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinchBase = 0;
      if (pts.size === 1) {
        // 放開一指後接著單指拖曳：基準點要接上剩下那指，否則畫面會瞬移
        dragging = true;
        lastX = [...pts.values()][0].x;
        vel = 0;
      } else if (pts.size === 0) {
        dragging = false;
      }
    };

    // 桌機用滾輪縮放；連點兩下還原
    const wheel = (e) => {
      e.preventDefault();
      zoom = clampZoom(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
      applyZoom();
      idle = 0;
    };
    const dbl = () => { zoom = 1; applyZoom(); };

    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("dblclick", dbl);
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
        if (stateRef.current.auto && idle > 1.2 && zoom <= 1.05) {
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
      /* 畫布高度變了就要重算鏡頭距離 —— 視覺大小的補償吃的正是這個高度。
         切全螢幕會走到這裡（ResizeObserver 有觀察容器本身） */
      applyZoom();
    };
    window.addEventListener("resize", onResize);
    // 切換全螢幕時容器尺寸會變，但不會觸發 window resize，所以要觀察元素本身
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("dblclick", dbl);
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
        if (side === "front") apiRef.current?.setVisible(true);
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
    <div
      style={expanded
        ? { position: "fixed", inset: 0, zIndex: 3200, background: "rgba(17,20,32,0.55)", backdropFilter: "blur(2px)" }
        : { position: "relative", width: "100%", height, borderRadius: 12, overflow: "hidden" }}
    >
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
      {expanded && (
        <button
          onClick={() => apiRef.current?.resetZoom()}
          style={{
            position: "absolute",
            /* 全螢幕時這顆是貼著整個視窗的，瀏海／動態島會壓在它上面
               （老闆 2026-09-01 回報）。安全區高度各機不同，交給 env() 算 */
            top: "calc(env(safe-area-inset-top, 0px) + 14px)",
            right: 14, zIndex: 2,
            height: 36, padding: "0 16px", borderRadius: 999,
            background: "rgba(0,0,0,.55)", color: "#fff", border: "none",
            fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}
        >
          收起
        </button>
      )}
      {!loaded.front && (
        <div style={{
          position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center",
          color: "#9aa4b8", fontSize: 13, letterSpacing: "0.1em", pointerEvents: "none",
        }}>
          載入中…
        </div>
      )}
    </div>
  );
}
