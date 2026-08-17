import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

// ── GGB 卡包輪播展示(TCG Pocket 構圖/配色) ──
// 淺藍白攝影棚、地板倒影。主卡包正面近距置中,
// 側包貼齊畫面邊微轉角度,更後方隱約背面包。無限輪迴+滑動切換。

// 實體卡包比例(窄高版) 62 × 116 mm,等比縮放進 3D 世界
const PACK_MM_W = 62, PACK_MM_H = 116;
const PACK_W = 1.75, PACK_H = PACK_W * (PACK_MM_H / PACK_MM_W);
const BULGE = 0.1;
const CRIMP = 0.1;
const TEX_W = 640, TEX_H = Math.round(TEX_W * (PACK_MM_H / PACK_MM_W)), TEX_R = 14;
const CAM_Z = 9, FOV = 36;
const BASE_Y = 0.35 + PACK_H / 2;

const THEMES = [
  { c1: "#c9a6ff", c2: "#4a2382", vol: "01" },
  { c1: "#b48cff", c2: "#3a1a6e", vol: "02" },
  { c1: "#9d6ef7", c2: "#2e1259", vol: "03" },
  { c1: "#8a5cf0", c2: "#250e4a", vol: "04" },
  { c1: "#7a4ae6", c2: "#1d0a3c", vol: "05" },
];

function roundPath(x, w, h, r) {
  x.beginPath();
  x.moveTo(r, 0); x.lineTo(w - r, 0); x.quadraticCurveTo(w, 0, w, r);
  x.lineTo(w, h - r); x.quadraticCurveTo(w, h, w - r, h);
  x.lineTo(r, h); x.quadraticCurveTo(0, h, 0, h - r);
  x.lineTo(0, r); x.quadraticCurveTo(0, 0, r, 0);
  x.closePath();
}

function serrate(x) {
  x.save();
  x.globalCompositeOperation = "destination-out";
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

function crimpStrip(x, y0, h) {
  const g = x.createLinearGradient(0, y0, 0, y0 + h);
  g.addColorStop(0, "#cfc4e8"); g.addColorStop(0.5, "#efeaf8"); g.addColorStop(1, "#b9aede");
  x.fillStyle = g; x.fillRect(0, y0, TEX_W, h);
  x.strokeStyle = "rgba(110,95,160,0.5)"; x.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const yy = y0 + h * (0.25 + i * 0.17);
    x.beginPath();
    for (let px = 0; px <= TEX_W; px += 14) {
      const off = (px / 14) % 2 === 0 ? -2.5 : 2.5;
      px === 0 ? x.moveTo(px, yy + off) : x.lineTo(px, yy + off);
    }
    x.stroke();
  }
}

function star(x, cx, cy, R, r, n = 5) {
  x.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const rad = i % 2 === 0 ? R : r;
    const a = (Math.PI / n) * i - Math.PI / 2;
    const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
    i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
  }
  x.closePath();
}

function makeTexture(draw) {
  const c = document.createElement("canvas");
  c.width = TEX_W; c.height = TEX_H;
  const x = c.getContext("2d");
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

function frontArt(theme) {
  return makeTexture((x) => {
    const g = x.createLinearGradient(0, 0, 0, TEX_H);
    g.addColorStop(0, theme.c1); g.addColorStop(1, theme.c2);
    x.fillStyle = g; x.fillRect(0, 0, TEX_W, TEX_H);
    const glow = x.createRadialGradient(TEX_W / 2, TEX_H * 0.46, 40, TEX_W / 2, TEX_H * 0.46, 300);
    glow.addColorStop(0, "rgba(255,255,255,0.5)"); glow.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = glow; x.fillRect(0, 0, TEX_W, TEX_H);
    star(x, TEX_W / 2, TEX_H * 0.46, 150, 62);
    x.fillStyle = "rgba(255,255,255,0.92)"; x.fill();
    x.strokeStyle = theme.c2; x.lineWidth = 8; x.stroke();
    x.textAlign = "center";
    x.fillStyle = "#ffffff";
    x.font = "900 110px sans-serif";
    x.fillText("GGB", TEX_W / 2, TEX_H * 0.2);
    x.font = "800 40px sans-serif";
    x.fillText("BOOSTER PACK", TEX_W / 2, TEX_H * 0.26);
    x.font = "800 44px sans-serif";
    x.fillStyle = "rgba(255,255,255,0.85)";
    x.fillText("VOL. " + theme.vol, TEX_W / 2, TEX_H * 0.78);
    crimpStrip(x, 0, TEX_H * CRIMP);
    crimpStrip(x, TEX_H * (1 - CRIMP), TEX_H * CRIMP);
  });
}

function backArt() {
  return makeTexture((x) => {
    const g = x.createLinearGradient(0, 0, 0, TEX_H);
    g.addColorStop(0, "#5a2f9e"); g.addColorStop(1, "#1d0a3c");
    x.fillStyle = g; x.fillRect(0, 0, TEX_W, TEX_H);
    x.textAlign = "center";
    star(x, TEX_W / 2, TEX_H / 2, 120, 50);
    x.fillStyle = "#ffc64b"; x.fill();
    x.fillStyle = "#1d0a3c";
    x.font = "900 64px sans-serif";
    x.fillText("GGB", TEX_W / 2, TEX_H / 2 + 22);
    x.fillStyle = "rgba(255,198,75,0.85)";
    x.font = "800 44px sans-serif";
    x.fillText("吉吉比", TEX_W / 2, TEX_H / 2 + 200);
    crimpStrip(x, 0, TEX_H * CRIMP);
    crimpStrip(x, TEX_H * (1 - CRIMP), TEX_H * CRIMP);
  });
}

function imageTexture(img) {
  return makeTexture((x) => {
    const s = Math.max(TEX_W / img.width, TEX_H / img.height);
    const w2 = img.width * s, h2 = img.height * s;
    x.drawImage(img, (TEX_W - w2) / 2, (TEX_H - h2) / 2, w2, h2);
  });
}

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

// 輪播槽位:0=主包 / ±1=側包(貼齊畫面邊,微轉角) / ±2以上=遠包(背面)
function slotFor(d, aspect) {
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

// ── 音效(WebAudio 合成,免音檔) ──
const audio = {
  ctx: null, noise: null, enabled: true,
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      const len = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  },
  // 切換卡包:咻
  swoosh() {
    if (!this.enabled) return;
    this.ensure();
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.2;
    f.frequency.setValueAtTime(2200, t);
    f.frequency.exponentialRampToValueAtTime(350, t + 0.28);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t); src.stop(t + 0.32);
  },
  // 開始拖曳:鋁箔窸窣
  crinkle() {
    if (!this.enabled) return;
    this.ensure();
    const c = this.ctx, t = c.currentTime;
    for (let k = 0; k < 4; k++) {
      const st = t + k * 0.028 + Math.random() * 0.015;
      const src = c.createBufferSource(); src.buffer = this.noise;
      const f = c.createBiquadFilter(); f.type = "highpass";
      f.frequency.value = 2600 + Math.random() * 2200;
      const g = c.createGain();
      g.gain.setValueAtTime(0.001, st);
      g.gain.exponentialRampToValueAtTime(0.1 + Math.random() * 0.06, st + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.05);
      src.connect(f); f.connect(g); g.connect(c.destination);
      src.start(st); src.stop(st + 0.06);
    }
  },
  // 上傳完成:叮
  pop() {
    if (!this.enabled) return;
    this.ensure();
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(540, t);
    o.frequency.exponentialRampToValueAtTime(960, t + 0.12);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + 0.24);
  },
};

export default function PackShowcase() {
  const mountRef = useRef(null);
  const packsRef = useRef([]);
  const curRef = useRef(2);
  const stateRef = useRef({ auto: true });
  const [cur, setCur] = useState(2);
  const [auto, setAuto] = useState(true);
  const [sound, setSound] = useState(true);

  useEffect(() => { curRef.current = cur; }, [cur]);
  useEffect(() => { stateRef.current.auto = auto; }, [auto]);
  useEffect(() => { audio.enabled = sound; }, [sound]);

  useEffect(() => {
    const mount = mountRef.current;
    const W = mount.clientWidth, H = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xe9edf7, 7, 16);

    const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.1, 100);
    camera.position.set(0, BASE_Y - 0.55, CAM_Z);
    camera.lookAt(0, BASE_Y - 0.55, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    // ── 燈光(明亮棚) ──
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

    // ── 地板:接觸陰影 + 倒影淡出層 ──
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.ShadowMaterial({ opacity: 0.13 })
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.001;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    const fadeCnv = document.createElement("canvas");
    fadeCnv.width = fadeCnv.height = 512;
    const fx = fadeCnv.getContext("2d");
    const fg = fx.createRadialGradient(256, 256, 40, 256, 256, 256);
    fg.addColorStop(0, "rgba(213,219,236,0.35)");
    fg.addColorStop(0.55, "rgba(213,219,236,0.85)");
    fg.addColorStop(1, "rgba(213,219,236,1)");
    fx.fillStyle = fg; fx.fillRect(0, 0, 512, 512);
    const fade = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(fadeCnv), transparent: true, depthWrite: false })
    );
    fade.rotation.x = -Math.PI / 2;
    fade.renderOrder = 3;
    scene.add(fade);

    // ── 卡包們(含地板倒影) ──
    const geo = buildPackGeo();
    const backTex = backArt();
    const packs = [];

    THEMES.forEach((theme, i) => {
      const frontTex = frontArt(theme);
      const mk = (map, refl) => new THREE.MeshPhysicalMaterial({
        map, roughness: 0.34, metalness: 0.12,
        clearcoat: 1, clearcoatRoughness: 0.3,
        transparent: true, alphaTest: 0.5,
        opacity: refl ? 0.24 : 1, depthWrite: !refl,
      });
      const frontMat = mk(frontTex, false);
      const backMat = mk(backTex, false);

      const grp = new THREE.Group();
      const fMesh = new THREE.Mesh(geo, frontMat);
      fMesh.castShadow = true;
      grp.add(fMesh);
      const bMesh = new THREE.Mesh(geo, backMat);
      bMesh.rotation.y = Math.PI;
      bMesh.castShadow = true;
      grp.add(bMesh);

      const rFrontMat = mk(frontTex, true);
      const rBackMat = mk(backTex, true);
      const rGrp = new THREE.Group();
      const rf = new THREE.Mesh(geo, rFrontMat); rGrp.add(rf);
      const rb = new THREE.Mesh(geo, rBackMat); rb.rotation.y = Math.PI; rGrp.add(rb);
      rGrp.renderOrder = 2;
      scene.add(rGrp);

      const slot = slotFor(i - 2, W / H);
      grp.position.set(slot.x, BASE_Y, slot.z);
      grp.rotation.y = slot.rot;
      scene.add(grp);
      packs.push({ grp, rGrp, frontMat, backMat, rFrontMat, rBackMat, rot: slot.rot });
    });
    packsRef.current = packs;

    // ── 互動:慢拖=旋轉,快滑=切換 ──
    let dragging = false, lastX = 0, vel = 0, idle = 0, startX = 0, startT = 0, crinkled = false;
    const el = renderer.domElement;
    const down = (e) => {
      dragging = true;
      lastX = e.clientX ?? 0;
      startX = lastX;
      startT = performance.now();
      crinkled = false;
    };
    const move = (e) => {
      if (!dragging) return;
      const x = e.clientX ?? 0;
      const dx = x - lastX;
      lastX = x;
      if (!crinkled && Math.abs(x - startX) > 8) {
        crinkled = true;
        audio.crinkle();
      }
      packs[curRef.current].rot += dx * 0.009;
      vel = dx * 0.009;
      idle = 0;
    };
    const up = () => {
      if (!dragging) return;
      dragging = false;
      const dt = performance.now() - startT;
      const dxTotal = lastX - startX;
      if (dt < 280 && Math.abs(dxTotal) > 70) {
        vel = 0;
        audio.swoosh();
        const dir = dxTotal < 0 ? 1 : -1;
        setCur((c) => (((c + dir) % THEMES.length) + THEMES.length) % THEMES.length);
      }
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    el.style.cursor = "grab";
    el.style.touchAction = "none";

    let raf, t = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      t += 0.016;
      const ci = curRef.current;
      if (!dragging) {
        packs[ci].rot += vel;
        vel *= 0.94;
        idle += 0.016;
        if (stateRef.current.auto && idle > 1.2) packs[ci].rot += 0.008;
      }

      const N = THEMES.length;
      packs.forEach((p, i) => {
        const d = ((((i - ci + 2) % N) + N) % N) - 2;
        const slot = slotFor(d, camera.aspect);
        const isCur = d === 0;
        const g = p.grp;
        if (p.prevD === undefined) p.prevD = d;
        if (Math.abs(d - p.prevD) > 2) {
          g.position.set(slot.x, BASE_Y * 0.96, slot.z);
          g.scale.setScalar(slot.s);
          p.rot = slot.rot;
        }
        p.prevD = d;
        if (!isCur) {
          const diff = slot.rot - (p.rot % (Math.PI * 2));
          p.rot += diff * 0.1;
        }
        const bob = isCur ? Math.sin(t * 1.3) * 0.05 : 0;
        g.position.x += (slot.x - g.position.x) * 0.12;
        g.position.z += (slot.z - g.position.z) * 0.12;
        g.position.y = BASE_Y * (isCur ? 1 : 0.97) + bob;
        const s = g.scale.x + (slot.s - g.scale.x) * 0.12;
        g.scale.set(s, s, s);
        g.rotation.y = p.rot;
        const c = p.frontMat.color.r + (slot.dim - p.frontMat.color.r) * 0.15;
        p.frontMat.color.setScalar(c);
        p.backMat.color.setScalar(c);
        // 倒影同步
        p.rGrp.position.set(g.position.x, -g.position.y, g.position.z);
        p.rGrp.scale.set(s, -s, s);
        p.rGrp.rotation.y = p.rot;
        p.rFrontMat.color.setScalar(c);
        p.rBackMat.color.setScalar(c);
      });

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

  const handleUpload = (side) => (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const tex = imageTexture(img);
        const p = packsRef.current[curRef.current];
        if (!p) return;
        const mats = side === "front" ? [p.frontMat, p.rFrontMat] : [p.backMat, p.rBackMat];
        mats.forEach((m) => { m.map = tex; m.needsUpdate = true; });
        audio.pop();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const go = (d) => {
    audio.swoosh();
    setCur((c) => (((c + d) % THEMES.length) + THEMES.length) % THEMES.length);
  };

  const ui = {
    wrap: { position: "relative", width: "100%", height: "100vh", overflow: "hidden", fontFamily: "'PingFang TC','Noto Sans TC','Microsoft JhengHei',sans-serif", background: "linear-gradient(180deg, #dfe6f4 0%, #f4f6fc 42%, #d5dbec 100%)" },
    canvas: { position: "absolute", inset: 0 },
    head: { position: "absolute", top: 20, left: 22, zIndex: 2, pointerEvents: "none" },
    tag: { fontSize: 11, letterSpacing: "0.3em", color: "#7a4ae6", fontWeight: 700 },
    title: { fontSize: 24, fontWeight: 900, margin: "4px 0 0", color: "#241a4a" },
    arrow: (side) => ({ position: "absolute", top: "46%", [side]: 12, zIndex: 3, width: 44, height: 44, borderRadius: "50%", border: "1px solid #d8ddef", background: "rgba(255,255,255,0.88)", color: "#4a2fa0", fontSize: 22, fontWeight: 900, cursor: "pointer", boxShadow: "0 4px 14px rgba(36,26,74,0.14)" }),
    dots: { position: "absolute", bottom: 104, width: "100%", display: "flex", justifyContent: "center", gap: 8, zIndex: 3 },
    dot: (on) => ({ width: on ? 22 : 8, height: 8, borderRadius: 5, background: on ? "#7a4ae6" : "#c3c9dd", border: "none", cursor: "pointer", transition: "all .25s" }),
    bar: { position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.92)", border: "1px solid #e0e4f2", borderRadius: 14, padding: "9px 14px", zIndex: 3, boxShadow: "0 8px 24px rgba(36,26,74,0.12)", maxWidth: "94%" },
    up: { background: "rgba(122,74,230,0.07)", color: "#7a4ae6", border: "1px dashed #7a4ae6", borderRadius: 9, padding: "7px 12px", fontSize: 13, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" },
    btn: (on) => ({ background: on ? "#7a4ae6" : "transparent", color: on ? "#fff" : "#7a4ae6", border: "1px solid #7a4ae6", borderRadius: 9, padding: "7px 12px", fontSize: 13, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }),
    hint: { position: "absolute", bottom: 128, width: "100%", textAlign: "center", color: "#8b90ab", fontSize: 12, letterSpacing: "0.15em", zIndex: 2, pointerEvents: "none" },
    file: { display: "none" },
  };

  return (
    <div style={ui.wrap}>
      <div ref={mountRef} style={ui.canvas} />
      <div style={ui.head}>
        <div style={ui.tag}>GGB SHOWCASE</div>
        <h1 style={ui.title}>卡包 360° 展示</h1>
      </div>
      <button style={ui.arrow("left")} onClick={() => go(-1)}>‹</button>
      <button style={ui.arrow("right")} onClick={() => go(1)}>›</button>
      <div style={ui.hint}>快 滑 切 換 ・ 慢 拖 旋 轉</div>
      <div style={ui.dots}>
        {THEMES.map((_, i) => (
          <button key={i} style={ui.dot(i === cur)} onClick={() => { if (i !== cur) audio.swoosh(); setCur(i); }} />
        ))}
      </div>
      <div style={ui.bar}>
        <label style={ui.up}>
          上傳正面
          <input type="file" accept="image/*" style={ui.file} onChange={handleUpload("front")} />
        </label>
        <label style={ui.up}>
          上傳背面
          <input type="file" accept="image/*" style={ui.file} onChange={handleUpload("back")} />
        </label>
        <button style={ui.btn(auto)} onClick={() => setAuto(!auto)}>
          {auto ? "旋轉 開" : "旋轉 關"}
        </button>
        <button style={ui.btn(sound)} onClick={() => setSound(!sound)}>
          {sound ? "音效 開" : "音效 關"}
        </button>
      </div>
    </div>
  );
}
