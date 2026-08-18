'use client';

/**
 * 吉吉比・撕開卡包 —— 老闆原型 `public/images/card/ggb-pack-rip.jsx` 的移植。
 *
 * **動畫、物理、音效、版面全部照原型，邏輯一行沒改。** 只做接口上的三件事：
 *   1. 示範用的內嵌 base64 素材 → 由 props 帶入真實商品圖
 *   2. 移除示範用的 ⚙️ 設定面板（換圖、手動選稀有度）→ 線上由商品資料決定
 *   3. 「再撕一包」→ onFinish，交回商品頁決定（進倉庫／再抽一包）
 *
 * 刻意保持 .jsx 不轉 TypeScript：轉型別要動到原型的每一行，
 * 之後老闆再給新版原型就對不起來。tsconfig 的 allowJs 本來就開著。
 */

import React, { useState, useRef, useEffect } from "react";
import { SoundToggle } from "@/components/ui/SoundToggle";
import useSoundMuted from "@/hooks/useSoundMuted";

/* ============================================================
   GGB 撕開卡包 — packs.com "Demo Open" 流程
   1) 畫面任意處左右滑 → 整條封條弧形向後掀（摺線發光+火花）
   2) 撕開後：卡牌全部「背面」像發牌一樣從下往上頂進定位（傾斜堆疊）
   3) 0.5 秒後最上張從左水平旋轉 180° 翻出正面（帶傾斜）
   4) 滑掉 → 下一張自動翻；最後一張 大賞/小賞 光環
   ============================================================ */

const STRIP_FRAC = 0.07;    // 封條高度（撕的支點線位置，越小越靠上）
const PEEL_FACTOR = 0.6;    // 撕完需滑動的螢幕寬倍數（越小越快撕完）
const STRIP_PAD_TOP = 240;  // 封條 canvas 上方預留（掀起空間）
const STRIP_PAD_X = 44;
const STRIP_PAD_RIGHT = 280; // 右側預留：尾端往右上出鏡
const CARD_COUNT_DEFAULT = 5;

/* ---------- 稀有度等級（參考站：最後一張卡背霓虹描邊，藍→紫→金） ---------- */
const TIERS = {
  blue:   { tag: "✨ 稀有", rim: "#6ea8ff", glow: "#8ec2ff", big: false, spark: ["#9fd0ff", "#e6f4ff", "#ffffff"] },
  purple: { tag: "💜 史詩", rim: "#b76bff", glow: "#cf9bff", big: true,  spark: ["#d9a8ff", "#b76bff", "#ffffff"] },
  gold:   { tag: "🏆 傳說", rim: "#ffd54a", glow: "#ffe98a", big: true,  spark: ["#ffd54a", "#ffe98a", "#ff9e3d", "#ffffff"] },
};
const raysBG = (c) => "conic-gradient(from 0deg," +
  Array.from({ length: 8 }, (_, i) => { const a = i * 45; return `${c}00 ${a}deg,${c}cc ${a + 12}deg,${c}00 ${a + 24}deg`; }).join(",") +
  `,${c}00 360deg)`;
const DEAL_STAGGER = 90;    // 每張發牌間隔 ms
const DEAL_DUR = 480;       // 單張上滑時間 ms
const FLIP_DELAY = 500;     // 定位後到翻牌的延遲 ms

/* ---------- 內建素材（吉吉比卡包 / 卡背 / 卡面，可在 ⚙️ 換圖） ---------- */

/* ---------- 銀色壓紋封條貼圖（含小膠囊釦） ---------- */
function makeSealSVG() {
  const ribs = Array.from({ length: 124 }, (_, i) =>
    `<rect x='${i * 5}' y='0' width='2.6' height='160' fill='${i % 2 ? "#9aa4b8" : "#eef2f8"}' opacity='${i % 2 ? 0.55 : 0.8}'/>`
  ).join("");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='620' height='160' viewBox='0 0 620 160'>
  <rect width='620' height='160' fill='#c9d2e2' opacity='.35'/>
  ${ribs}
  <rect width='620' height='160' fill='url(#s)'/>
  <defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'>
    <stop offset='0' stop-color='#fff' stop-opacity='.5'/><stop offset='.5' stop-color='#fff' stop-opacity='0'/>
    <stop offset='1' stop-color='#000' stop-opacity='.22'/>
  </linearGradient></defs>
</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
const SEAL_URL = makeSealSVG();

/* ---------- WebAudio 合成音效 ---------- */
function useSfx(enabled) {
  const ctxRef = useRef(null);
  const ctx = () => {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  };
  const noise = (ac, dur) => {
    const b = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource(); s.buffer = b; return s;
  };
  const api = useRef({});
  api.current.spark = () => {
    if (!enabled) return;
    const ac = ctx(), t = ac.currentTime;
    const s = noise(ac, 0.05);
    const f = ac.createBiquadFilter(); f.type = "bandpass";
    f.frequency.value = 3500 + Math.random() * 4500; f.Q.value = 2;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.15 + Math.random() * 0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    s.connect(f).connect(g).connect(ac.destination); s.start(t);
  };
  api.current.ripDone = () => {
    if (!enabled) return;
    const ac = ctx(), t = ac.currentTime;
    const s = noise(ac, 0.35);
    const f = ac.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.2;
    f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(600, t + 0.3);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    s.connect(f).connect(g).connect(ac.destination); s.start(t);
  };
  api.current.deal = () => { // 發牌：單張啪
    if (!enabled) return;
    const ac = ctx(), t = ac.currentTime;
    const s = noise(ac, 0.035);
    const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 2400;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    s.connect(f).connect(g).connect(ac.destination); s.start(t);
  };
  api.current.flip = () => { // 翻牌
    if (!enabled) return;
    const ac = ctx(), t = ac.currentTime;
    const s = noise(ac, 0.22);
    const f = ac.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.6;
    f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(4200, t + 0.18);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    s.connect(f).connect(g).connect(ac.destination); s.start(t);
    const o = ac.createOscillator(); o.type = "sine"; o.frequency.value = 880;
    const g2 = ac.createGain();
    g2.gain.setValueAtTime(0.001, t + 0.16); g2.gain.exponentialRampToValueAtTime(0.08, t + 0.18);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g2).connect(ac.destination); o.start(t + 0.16); o.stop(t + 0.32);
  };
  api.current.flick = () => {
    if (!enabled) return;
    const ac = ctx(), t = ac.currentTime;
    const s = noise(ac, 0.16);
    const f = ac.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.5;
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(3600, t + 0.14);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    s.connect(f).connect(g).connect(ac.destination); s.start(t);
  };
  api.current.aura = (big) => {
    if (!enabled) return;
    const ac = ctx(), t0 = ac.currentTime;
    const notes = big ? [523.25, 659.25, 783.99, 1046.5] : [523.25, 659.25];
    notes.forEach((fq, i) => {
      const t = t0 + i * (big ? 0.11 : 0.16);
      const o = ac.createOscillator(); o.type = "triangle"; o.frequency.value = fq;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.001, t); g.gain.exponentialRampToValueAtTime(big ? 0.22 : 0.12, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + (big ? 0.9 : 0.5));
      o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 1);
    });
    if (big) {
      const s = noise(ac, 0.8);
      const f = ac.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 7000;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.05, t0 + 0.2); g.gain.exponentialRampToValueAtTime(0.001, t0 + 1);
      s.connect(f).connect(g).connect(ac.destination); s.start(t0 + 0.2);
    }
  };
  return api;
}

/* ============================================================ */
export default function GGBPackRip({
  packImage,
  cardBack,
  cards: cardsProp,
  prizeTier: prizeTierProp = "blue",
  soundDefault = true,
  onFinish,
  onExit,
  title = "吉吉比・撕開卡包",
}) {
  const [phase, setPhase] = useState("idle"); // idle | tearing | ripped | cards | done
  const [progress, setProgress] = useState(0);
  // 素材與稀有度改由商品資料決定（原型是內建 base64 ＋ ⚙️ 手動換）
  const packImg = packImage;
  const cards = cardsProp;
  const prizeTier = prizeTierProp; // blue稀有 / purple史詩 / gold傳說
  // 音效跟著全站靜音偏好走（與盒玩、一番賞同一顆開關），不再自己 useState ——
  // 玩家在商品頁關掉聲音，進了演出又自己響起來的話，那顆開關等於管不到這裡
  const muted = useSoundMuted();
  const sound = !muted;
  const [cardIdx, setCardIdx] = useState(0);
  const [dealt, setDealt] = useState(false);   // 發牌完成
  const [dealing, setDealing] = useState(false); // 發牌動畫進行中（才用階梯延遲）
  const [settled, setSettled] = useState(true);  // 新頂牌是否已從堆疊位滑到頂位
  const [flipped, setFlipped] = useState(false); // 最上張已翻正面
  const [auraOn, setAuraOn] = useState(false);
  const [flash, setFlash] = useState(false);

  const sfx = useSfx(sound);
  const packRef = useRef(null);
  const canvasRef = useRef(null);
  const particles = useRef([]);
  const peel = useRef({ on: false, lastX: 0, sinceSpark: 0 });
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const progRef = useRef(progress); progRef.current = progress;
  const timers = useRef([]);
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.current.push(t); return t; };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const [dims, setDims] = useState({ w: 300, h: 510 });

  useEffect(() => {
    const w = Math.min(300, window.innerWidth * 0.72);
    setDims({ w, h: w * 1.7 });
  }, []);

  /* 火花粒子 */
  useEffect(() => {
    let raf;
    const loop = () => {
      const cv = canvasRef.current;
      if (cv) {
        const c = cv.getContext("2d");
        c.clearRect(0, 0, cv.width, cv.height);
        particles.current = particles.current.filter(p => p.life > 0);
        for (const p of particles.current) {
          p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.life -= 0.03;
          c.globalAlpha = Math.max(p.life, 0);
          c.fillStyle = p.col;
          c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.fill();
        }
        c.globalAlpha = 1;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const emitSparks = (x, y, n, cols = ["#ffd54a", "#fff3b0", "#ff9e3d", "#ffffff"]) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 4;
      particles.current.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5,
        r: 1 + Math.random() * 2.2, life: 0.6 + Math.random() * 0.5,
        col: cols[(Math.random() * cols.length) | 0],
      });
    }
  };

  const foldPoint = () => {
    const rect = packRef.current?.getBoundingClientRect();
    const stage = document.getElementById("ggb-stage")?.getBoundingClientRect();
    if (!rect || !stage) return null;
    const fx = Math.min(0.95, Math.max(0.04, progRef.current * 1.12)); // 剝離支點
    return {
      x: rect.left - stage.left + rect.width * fx,
      y: rect.top - stage.top + rect.height * STRIP_FRAC * 0.85,
    };
  };

  useEffect(() => { // 撕的過程摺線持續冒火花
    if (phase !== "tearing") return;
    const iv = setInterval(() => {
      if (progRef.current > 0.03 && progRef.current < 1) {
        const fp = foldPoint(); if (fp) emitSparks(fp.x, fp.y, 2);
      }
    }, 150);
    return () => clearInterval(iv);
  }, [phase]); // eslint-disable-line

  /* ---------- 撕開：整個畫面 左滑/右滑 都可以 ---------- */
  const onStageDown = (e) => {
    if (phaseRef.current !== "idle" && phaseRef.current !== "tearing") return;
    if (e.target.closest?.("[data-ui]")) return;
    peel.current = { on: true, lastX: e.clientX, sinceSpark: 0 };
    if (phaseRef.current === "idle") setPhase("tearing");
  };
  const onStageMove = (e) => {
    const p = peel.current;
    if (!p.on || (phaseRef.current !== "tearing" && phaseRef.current !== "idle")) return;
    const dx = Math.abs(e.clientX - p.lastX);
    p.lastX = e.clientX;
    if (!dx) return;
    p.sinceSpark += dx;
    if (p.sinceSpark > 14) {
      p.sinceSpark = 0;
      const fp = foldPoint();
      if (fp) emitSparks(fp.x, fp.y, 5);
      sfx.current.spark();
    }
    setProgress(prev => {
      const np = Math.min(1, prev + dx / (window.innerWidth * PEEL_FACTOR));
      if (np >= 1 && prev < 1) finishRip();
      return np;
    });
  };
  const onStageUp = () => { peel.current.on = false; };

  const finishRip = () => {
    peel.current.on = false;
    sfx.current.ripDone();
    setFlash(true); later(() => setFlash(false), 400);
    setPhase("ripped");
    for (let i = 0; i < 8; i++) { const fp = foldPoint(); if (fp) emitSparks(fp.x, fp.y, 5); }
    later(startDeal, 780);
  };

  /* ---------- 發牌 → 自動翻第一張 ---------- */
  const startDeal = () => {
    setPhase("cards");
    setCardIdx(0); setFlipped(false); setAuraOn(false); setDealt(false);
    setSettled(true); setDealing(true);
    requestAnimationFrame(() => requestAnimationFrame(() => setDealt(true)));
    const n = Math.min(cards.length, 8); // 疊太多沒必要全部動畫
    for (let i = 0; i < n; i++) later(() => sfx.current.deal(), i * DEAL_STAGGER);
    const dealDone = (n - 1) * DEAL_STAGGER + DEAL_DUR;
    later(() => setDealing(false), dealDone);
    later(() => { if (cards.length > 1) flipTop(0); }, dealDone + FLIP_DELAY); // 只剩最後一張時等玩家點
  };

  const flipTop = (idx) => {
    if (phaseRef.current !== "cards") return;
    setFlipped(true);
    sfx.current.flip();
    if (idx === cards.length - 1) {
      later(() => {
        setAuraOn(true);
        setFlash(true); later(() => setFlash(false), 450);
        const T2 = TIERS[prizeTier] || TIERS.blue;
        sfx.current.aura(T2.big);
        const stage = document.getElementById("ggb-stage")?.getBoundingClientRect();
        if (stage) emitSparks(stage.width / 2, stage.height / 2, T2.big ? 60 : 30, T2.spark);
      }, 380);
    }
  };

  /**
   * SKIP：直接跳到最後一張並翻開（老闆指定）。
   * 中間那幾張不逐張演，但最後一張的光環／火花照跑 —— 那是整包的收尾，跳掉就沒有壓軸了。
   */
  /**
   * SKIP 三段式（老闆指定），按鈕一直在：
   *   還沒到最後一張 → 快速翻過中間幾張，停在最後一張的卡背
   *   已在最後一張但沒翻 → 翻開它
   *   最後一張已翻開   → 收掉演出，回商品頁跳「恭喜獲得」
   */
  const skipToLast = () => {
    if (phaseRef.current !== "cards") return;
    const lastIdx = cards.length - 1;
    if (cardIdx >= lastIdx) {
      timers.current.forEach(clearTimeout); timers.current = [];
      if (!flipped) { flipTop(lastIdx); return; }
      setAuraOn(false);
      if (onFinish) onFinish();
      return;
    }
    timers.current.forEach(clearTimeout); timers.current = [];
    const last = lastIdx;
    const STEP = 130;                       // 每張之間的間隔：看得出在翻，又不拖
    let t = 0;
    for (let i = cardIdx; i < last; i++) {
      const next = i + 1;
      later(() => {
        setCardOffset({ x: 0, y: 0 });
        setCardIdx(next);
        setSettled(true);
        if (next < last) {
          // 中間那幾張快速翻開給玩家看過去
          setFlipped(true);
          sfx.current.flip();
        } else {
          // 最後一張停在卡背，不自動翻 —— 大賞就在這個位置，
          // 那一下要留給玩家自己點，跟不按 SKIP 時的收尾一致（老闆指定）
          setFlipped(false);
        }
      }, (t += STEP));
    }
  };

  /* ---------- 卡牌滑掉 / 點擊 ---------- */
  const cardDrag = useRef({ on: false, sx: 0, sy: 0, dx: 0, dy: 0, t: 0 });
  const [cardOffset, setCardOffset] = useState({ x: 0, y: 0 });
  const [tilt, setTilt] = useState({ x: 0, y: 0 }); // 翻開後 3D 傾斜
  const [flying, setFlying] = useState(null);
  const isLast = cardIdx === cards.length - 1;

  /* 紫/金等級：最後一張卡背周圍閃電電弧（參考站紫光閃電，隨機劈啪） */
  const [boltTick, setBoltTick] = useState(0);
  const boltsOn = phase === "cards" && isLast && !flipped && dealt &&
    (TIERS[prizeTier] || TIERS.blue).big;
  useEffect(() => {
    if (!boltsOn) return;
    const iv = setInterval(() => {
      setBoltTick(t => t + 1);
      if (Math.random() < 0.3) sfx.current.spark();
    }, 140);
    return () => clearInterval(iv);
  }, [boltsOn]); // eslint-disable-line

  const onCardDown = (e) => {
    if (phase !== "cards" || flying || !dealt) return;
    e.stopPropagation();
    cardDrag.current = { on: true, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, t: Date.now() };
  };
  const onCardMove = (e) => {
    if (flipped && !flying) { // 滑過或拖曳都感應 3D 傾斜
      const r = e.currentTarget.getBoundingClientRect();
      setTilt({
        x: ((e.clientY - r.top) / r.height - 0.5) * -14,
        y: ((e.clientX - r.left) / r.width - 0.5) * 14,
      });
    }
    const d = cardDrag.current; if (!d.on) return;
    d.dx = e.clientX - d.sx; d.dy = e.clientY - d.sy;
    if (flipped) setCardOffset({ x: d.dx, y: d.dy });
  };
  const dismissCard = (dir) => {
    setTilt({ x: 0, y: 0 });
    setFlying({ dir });
    sfx.current.flick();
    later(() => {
      setFlying(null);
      setCardOffset({ x: 0, y: 0 });
      if (cardIdx >= cards.length - 1) {
        setAuraOn(false);
        if (onFinish) onFinish(); else setPhase("done");
      }
      else {
        const next = cardIdx + 1;
        setCardIdx(next);
        setFlipped(false);
        setSettled(false); // 新頂牌先停在堆疊位（較小較暗）
        requestAnimationFrame(() => requestAnimationFrame(() => setSettled(true))); // 平滑升上頂位
        if (next < cards.length - 1) later(() => flipTop(next), 500); // 最後一張改成「點擊才翻」
      }
    }, 380);
  };
  const onCardUp = () => {
    const d = cardDrag.current; if (!d.on) return;
    d.on = false;
    if (!flipped) { flipTop(cardIdx); return; } // 還沒翻 → 點一下先翻牌
    const dist = Math.hypot(d.dx, d.dy);
    const v = dist / Math.max(1, Date.now() - d.t);
    if (dist > 90 || v > 0.6) dismissCard(d.dx >= 0 ? 1 : -1);
    else if (dist < 8) dismissCard(1);
    else setCardOffset({ x: 0, y: 0 });
  };

  const reset = () => {
    timers.current.forEach(clearTimeout); timers.current = [];
    setPhase("idle"); setProgress(0); setCardIdx(0);
    setDealt(false); setFlipped(false); setAuraOn(false);
    peel.current = { on: false, lastX: 0, sinceSpark: 0 };
  };

  // （原型的 ⚙️ 上傳換圖已移除：線上素材來自商品資料）

  const { w, h } = dims;
  const stripH = h * STRIP_FRAC;
  const p = progress;
  const T = TIERS[prizeTier] || TIERS.blue;
  const glowOn = phase === "tearing" && p > 0.02;
  const BASE_TILT = -6; // 卡堆基本傾斜
  const STACK_Y = -30;  // 未翻開的卡堆整體上移

  /* ---------- 封條 canvas：逐像素欄位彎曲的連續曲面（不會一條一條） ---------- */
  const stripCanvasRef = useRef(null);
  const stripSrcRef = useRef(null);
  const drawStrip = () => {
    const cv = stripCanvasRef.current, src = stripSrcRef.current;
    if (!cv || !src || !w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.round((w + STRIP_PAD_X + STRIP_PAD_RIGHT) * dpr);
    const ch = Math.round((stripH + STRIP_PAD_TOP + 8) * dpr);
    if (cv.width !== cw) { cv.width = cw; cv.height = ch; }
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w + STRIP_PAD_X + STRIP_PAD_RIGHT, stripH + STRIP_PAD_TOP + 8);
    const front = Math.min(1, p * 1.12);   // 剝離支點
    const fx = front * w;
    const sx = src.width / w;
    // 1) 支點右邊：還貼著的封條，原樣平貼
    if (fx < w - 0.5) {
      g.drawImage(src, fx * sx, 0, (w - fx) * sx, src.height,
        STRIP_PAD_X + fx, STRIP_PAD_TOP, w - fx, stripH);
    }
    // 2) 支點左邊：整塊「裁切」下來，沿支點摺起（鏡像 + 上旋 = 捲起翹片）
    if (fx > 0.5) {
      const px = STRIP_PAD_X + fx, py = STRIP_PAD_TOP + stripH; // 支點（摺線）
      const beta = 1.45 + p * 0.5;   // 接近垂直、撕越多越往後倒（參考站中段畫面）
      const flapW = fx * 0.62;       // 翹片透視縮短，不會拖太長
      g.save();
      g.translate(px, py); g.rotate(-beta); g.scale(-1, 1); g.translate(-px, -py);
      const COLS = 14;                                          // 翹片微彎：分欄畫、中段拱起
      for (let i = 0; i < COLS; i++) {
        const cw2 = flapW / COLS;
        const bendY = -Math.sin((i / (COLS - 1)) * Math.PI) * stripH * 0.2;
        const cx2 = px - flapW + i * cw2;
        g.drawImage(src, (i / COLS) * fx * sx, 0, (fx * sx) / COLS, src.height,
          cx2, STRIP_PAD_TOP + stripH * 0.05 + bendY, cw2 + 0.7, stripH * 0.9);
        g.fillStyle = "rgba(255,255,255,.3)";                   // 反面偏亮
        g.fillRect(cx2, STRIP_PAD_TOP + stripH * 0.05 + bendY, cw2 + 0.7, stripH * 0.9);
        g.fillStyle = "rgba(255,236,150,.75)";                  // 撕口亮邊
        g.fillRect(cx2, STRIP_PAD_TOP + stripH * 0.05 + bendY + stripH * 0.9 - 1.5, cw2 + 0.7, 1.5);
      }
      g.restore();
    }
    // 膠囊釦：水平置中在支點上、垂直坐在撕裂線高度
    const capW = 34, capH = 13, capR = 6.5;
    const capX = STRIP_PAD_X + Math.min(w - capW - 6, Math.max(6, front * w - capW / 2));
    const capY = STRIP_PAD_TOP + stripH - capH * 0.55;
    g.beginPath();
    g.moveTo(capX + capR, capY);
    g.lineTo(capX + capW - capR, capY);
    g.arc(capX + capW - capR, capY + capR, capR, -1.5708, 1.5708);
    g.lineTo(capX + capR, capY + capH);
    g.arc(capX + capR, capY + capR, capR, 1.5708, 4.7124);
    g.closePath();
    g.fillStyle = "#f2f5fb"; g.fill();
    g.strokeStyle = "#aab3c6"; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = "#8a93a8";
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(capX + capW / 2 + (i - 1) * 7, capY + capH / 2, 1.8, 0, 7);
      g.fill();
    }
  };
  useEffect(() => { // 合成封條底圖（卡包上緣 + 銀色壓紋）
    if (!w) return;
    let alive = true;
    const load = (u2) => new Promise((res, rej) => {
      const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = u2;
    });
    Promise.all([load(packImg), load(SEAL_URL)]).then(([pk, seal]) => {
      if (!alive) return;
      const c = document.createElement("canvas");
      c.width = Math.round(w * 2); c.height = Math.round(stripH * 2);
      const g = c.getContext("2d");
      const r = 20; // 圓角上緣
      g.beginPath();
      g.moveTo(0, c.height); g.lineTo(0, r); g.quadraticCurveTo(0, 0, r, 0);
      g.lineTo(c.width - r, 0); g.quadraticCurveTo(c.width, 0, c.width, r);
      g.lineTo(c.width, c.height); g.closePath(); g.clip();
      g.drawImage(pk, 0, 0, pk.width, pk.height * STRIP_FRAC, 0, 0, c.width, c.height);
      g.globalAlpha = 0.9; g.drawImage(seal, 0, 0, c.width, c.height); g.globalAlpha = 1;
      stripSrcRef.current = c;
      drawStrip();
    }).catch(() => {});
    return () => { alive = false; };
  }, [packImg, dims]); // eslint-disable-line
  useEffect(() => { drawStrip(); }); // progress 變動時重繪

  return (
    <div id="ggb-stage" style={S.stage}
      onPointerDown={onStageDown} onPointerMove={onStageMove}
      onPointerUp={onStageUp} onPointerCancel={onStageUp}>
      <style>{CSS_KEYFRAMES}</style>

      {STARS.map((s, i) => (
        <div key={i} style={{
          position: "absolute", left: s.x, top: s.y, fontSize: s.s, color: "#ffe14a",
          textShadow: "0 0 10px #ffd54a", animation: `ggbTwinkle ${s.d}s ease-in-out ${s.dl}s infinite`,
          pointerEvents: "none", zIndex: 1,
        }}>✦</div>
      ))}

      <canvas ref={canvasRef} width={typeof window !== "undefined" ? window.innerWidth : 400}
        height={typeof window !== "undefined" ? window.innerHeight : 800} style={S.canvas} />
      {flash && <div style={{ ...S.flash, background: phase === "cards" ? T.glow : "#ffedb0" }} />}

      {/* 頂欄 */}
      {/* 標題與關閉鈕移除（老闆指定）：全畫面演出不需要品名，關閉走演出自己的收尾流程。
          靜音改用站上共用的 SoundToggle，跟盒玩商品頁同一顆 */}
      <div data-ui>
        <SoundToggle className="absolute top-3 right-3 z-[60]" />
      </div>

      {/* ---------- 卡包（弧形掀封條） ---------- */}
      {(phase === "idle" || phase === "tearing" || phase === "ripped") && (
        <div style={{
          ...S.packWrap,
          animation: phase === "idle" && p === 0
            ? "ggbBob 3s ease-in-out infinite"
            : phase === "tearing" && p < 1 ? "ggbJitter .22s linear infinite" : "none",
        }}>
          <div ref={packRef} style={{
            position: "relative", width: w, height: h,
            touchAction: "none",
            // 被撕的力道帶歪：3D 傾斜 + 微轉
            transform: `perspective(1100px) rotateY(${(p * 9).toFixed(1)}deg) rotate(${(-p * 8).toFixed(1)}deg)`,
            transition: peel.current.on ? "none" : "transform .3s ease",
            filter: "drop-shadow(0 26px 34px rgba(0,0,0,.5))",
          }}>
            <div style={{
              position: "absolute", inset: 0, zIndex: 2,
              backgroundImage: `url("${packImg}")`, backgroundSize: `${w}px ${h}px`,
              clipPath: `inset(${stripH}px 0 0 0)`,
              borderRadius: 10,
              transform: phase === "ripped" ? "translateY(70%) scale(.9)" : "none",
              opacity: phase === "ripped" ? 0 : 1,
              transition: "transform .55s ease-in .25s, opacity .5s ease-in .3s",
            }} />
            {/* 封條：canvas 連續曲面 */}
            <div style={{
              position: "absolute", left: 0, top: 0, width: w, height: stripH, zIndex: 3,
              pointerEvents: "none",
              filter: "drop-shadow(0 3px 5px rgba(0,0,0,.22))",
              transform: phase === "ripped" ? "translate(260px,-420px) rotate(22deg)" : "none",
              opacity: phase === "ripped" ? 0 : 1,
              transition: phase === "ripped" ? "transform .6s cubic-bezier(.3,.7,.4,1), opacity .5s ease .08s" : "none",
            }}>
              <canvas ref={stripCanvasRef} style={{
                position: "absolute",
                left: -STRIP_PAD_X, top: -STRIP_PAD_TOP,
                width: w + STRIP_PAD_X + STRIP_PAD_RIGHT, height: stripH + STRIP_PAD_TOP + 8,
              }} />
            </div>

            {/* 剝離線漏光：只亮在已撕開的範圍；爆閃光源＝支點，跟著進度滾動 */}
            <div style={{
              position: "absolute", left: 0, top: stripH - 5, height: 10,
              width: Math.min(1, p * 1.12) * w,
              zIndex: 4, pointerEvents: "none",
              background: "linear-gradient(90deg,#ffd54a22,#fff9,#ffffff)",
              filter: "blur(3px)",
              opacity: glowOn ? Math.min(1, p * 2.2) : 0,
              transition: "opacity .15s",
            }} />
            <div style={{
              position: "absolute", top: stripH - 46, width: 110, height: 90,
              left: Math.min(0.95, Math.max(0.04, p * 1.12)) * w - 55,
              zIndex: 4, pointerEvents: "none", borderRadius: "50%",
              background: "radial-gradient(circle,#ffffff,#ffd54a88 40%,#ffd54a00 70%)",
              filter: "blur(4px)",
              transform: `scale(${0.7 + p * 0.5})`,
              opacity: glowOn ? Math.min(1, 0.35 + p * 1.6) : 0,
              transition: "opacity .15s",
            }} />
          </div>

          {phase !== "ripped" && (
            <div style={S.hint}>
              {p === 0
                ? <>🖐 在畫面上 <b>左右滑動</b> 撕開封條</>
                : `${Math.round(p * 100)}%`}
            </div>
          )}
        </div>
      )}

      {/* ---------- 卡牌堆：背面發牌 → 翻牌 ---------- */}
      {phase === "cards" && (
        <div style={S.cardArea}>
          {auraOn && isLast && flipped && (
            <>
              <div style={{
                ...S.aura,
                background: prizeTier === "blue"
                  ? "radial-gradient(circle,#9fd0ff88 0%,#6ea8ff33 45%,#6ea8ff00 70%)"
                  : raysBG(T.rim),
                animation: prizeTier === "blue" ? "ggbPulse 2s ease-in-out infinite" : "ggbSpin 6s linear infinite",
                /* conic-gradient 的色階是硬邊，直接畫出來會看到一根根放射狀的輪廓線（老闆回報）。
                   模糊 + 由中心往外淡出的遮罩，讓它散成光暈而不是「圖形」 */
                filter: "blur(14px)",
                WebkitMaskImage: "radial-gradient(circle, #000 25%, transparent 72%)",
                maskImage: "radial-gradient(circle, #000 25%, transparent 72%)",
              }} />
              <div style={{ ...S.auraGlow, boxShadow: `0 0 90px 30px ${T.glow}66` }} />
            </>
          )}

          {/* 底下的牌（卡背，往下露出、扇形微轉） */}
          {cards.slice(cardIdx + 1, cardIdx + 4).map((_, j) => {
            const k = j + 1;
            return (
              <div key={cardIdx + k} style={{
                ...S.card, backgroundImage: `url("${cardBack}")`,
                zIndex: 10 - j,
                transform: dealt
                  ? `rotate(${BASE_TILT + k * 2.5}deg) translateY(${STACK_Y + k * 26}px) scale(${1 - k * 0.05})`
                  : `translateY(120vh) rotate(${BASE_TILT}deg)`,
                transition: dealing
                  ? `transform ${DEAL_DUR}ms cubic-bezier(.2,.9,.3,1) ${(k) * DEAL_STAGGER}ms`
                  : "transform .35s ease",
                filter: "brightness(.82)",
                boxShadow: "0 10px 30px #0008",
              }} />
            );
          })}

          {/* 閃電電弧（紫/金等級待翻時） */}
          {boltsOn && settled && (
            <svg key={boltTick} viewBox="0 0 120 168" style={{
              position: "absolute", inset: "-10%", zIndex: 26,
              pointerEvents: "none", overflow: "visible",
            }}>
              {Array.from({ length: 4 }, (_, b) => {
                const side = (Math.random() * 4) | 0;
                let x = side === 0 ? 10 + Math.random() * 100 : side === 1 ? 110 : side === 2 ? 10 + Math.random() * 100 : 10;
                let y = side === 0 ? 14 : side === 1 ? 14 + Math.random() * 140 : side === 2 ? 154 : 14 + Math.random() * 140;
                const nx = side === 1 ? 1 : side === 3 ? -1 : 0;
                const ny = side === 0 ? -1 : side === 2 ? 1 : 0;
                let d = `M${x.toFixed(1)},${y.toFixed(1)}`;
                for (let s2 = 0; s2 < 5; s2++) {
                  x += nx * (2 + Math.random() * 4) + (Math.random() - 0.5) * 9;
                  y += ny * (2 + Math.random() * 4) + (Math.random() - 0.5) * 9;
                  d += ` L${x.toFixed(1)},${y.toFixed(1)}`;
                }
                return (
                  <path key={b} d={d} fill="none" stroke={T.rim} strokeWidth={0.9}
                    strokeLinecap="round" opacity={0.5 + Math.random() * 0.5}
                    style={{ filter: `drop-shadow(0 0 3px ${T.glow})` }} />
                );
              })}
            </svg>
          )}

          {/* 最上張：3D 翻牌（背 → 正）— key 讓撥掉的牌不會飛回來 */}
          <div key={cardIdx} style={{
            position: "absolute", inset: 0, zIndex: 20,
            perspective: 1100, touchAction: "none",
            cursor: dealt ? "grab" : "default",
            transform: flying
              ? `translate(${flying.dir * 130}vw, ${cardOffset.y - 80}px) rotate(${flying.dir * 35}deg)`
              : !dealt
                ? `translateY(120vh) rotate(${BASE_TILT}deg)`
                : !settled
                  ? `translateY(${STACK_Y + 26}px) rotate(${BASE_TILT + 2.5}deg) scale(.95)` // 從堆疊位起步
                  : flipped
                    ? isLast
                      ? `translate(${cardOffset.x}px, ${cardOffset.y + 12}px) rotate(${(cardOffset.x * 0.05).toFixed(2)}deg) scale(1.05)` // 最後一張：畫面正中間
                      : `translate(${cardOffset.x - 34}px, ${cardOffset.y}px) rotate(${BASE_TILT - 3 + cardOffset.x * 0.06}deg)`
                    : `translate(${cardOffset.x}px, ${cardOffset.y + STACK_Y}px) rotate(${BASE_TILT + cardOffset.x * 0.06}deg)`,
            filter: dealt && !settled ? "brightness(.82)" : "none",
            transition: flying
              ? "transform .38s ease-in"
              : cardDrag.current.on
                ? "none"
                : !dealt
                  ? `transform ${DEAL_DUR}ms cubic-bezier(.2,.9,.3,1) 0ms`
                  : !settled
                    ? "none"
                    : "transform .35s ease, filter .35s ease",
          }}
            onPointerDown={onCardDown} onPointerMove={onCardMove}
            onPointerUp={onCardUp} onPointerCancel={onCardUp}
            onPointerLeave={() => setTilt({ x: 0, y: 0 })}>
            {/* 飄動層：最後一張待翻時緩緩浮動 */}
            <div style={{
              position: "absolute", inset: 0, transformStyle: "preserve-3d",
              animation: isLast && !flipped && dealt && settled ? "ggbFloatCard 3.2s ease-in-out infinite" : "none",
            }}>
            {/* 3D 傾斜層：滑鼠 / 拖曳感應 */}
            <div style={{
              position: "absolute", inset: 0, transformStyle: "preserve-3d",
              transform: flipped ? `rotateX(${tilt.x.toFixed(1)}deg) rotateY(${tilt.y.toFixed(1)}deg)` : "none",
              transition: "transform .15s ease",
            }}>
            <div style={{
              position: "absolute", inset: 0,
              transformStyle: "preserve-3d",
              transform: `rotateY(${flipped ? -180 : 0}deg)`, // 從左水平旋轉 180°
              transition: "transform .6s cubic-bezier(.35,.1,.25,1)",
            }}>
              {/* 背面 */}
              <div style={{
                ...S.face, backgroundImage: `url("${cardBack}")`,
                boxShadow: isLast
                  ? `0 0 0 3px ${T.rim}, 0 0 ${T.big ? 34 : 24}px ${T.glow}, 0 0 ${T.big ? 100 : 70}px ${T.glow}${T.big ? "88" : "66"}, 0 18px 50px #000a`
                  : "0 18px 50px #000a",
                animation: isLast && !flipped ? "ggbRimPulse 1.6s ease-in-out infinite" : "none",
              }} />
              {/* 正面 */}
              <div style={{
                ...S.face, backgroundImage: `url("${cards[cardIdx]}")`,
                transform: "rotateY(180deg)",
                boxShadow: auraOn && isLast
                  ? `0 0 40px ${T.rim}, 0 18px 50px #0009`
                  : "0 18px 50px #000a",
              }} />
            </div>
            </div>
            </div>
          </div>

          <div style={S.counter} data-ui>
            <span style={S.counterChip}>{cardIdx + 1} / {cards.length}</span>
            <div style={{ marginTop: 6, fontSize: 12, opacity: .65 }}>
              {flipped ? "滑動或點擊看下一張" : (isLast && dealt && settled ? "✨ 點擊卡片翻開最後一張！" : "翻牌中…")}
            </div>
          </div>
        </div>
      )}

      {/* SKIP：右下角，樣式與一番賞過場影片那顆一致 */}
      {phase === "cards" && (
        <button data-ui onClick={skipToLast} style={S.skipBtn}>SKIP</button>
      )}

      {/* ---------- 完成 ---------- */}
      {/* 「開封完成」總覽頁移除（老闆指定）：最後一張看完直接回商品頁，
          由商品頁的「恭喜獲得」彈窗收尾，不要兩層結算畫面 */}
    </div>
  );
}

const STARS = [
  { x: "10%", y: "18%", s: 26, d: 2.4, dl: 0 },
  { x: "84%", y: "14%", s: 34, d: 3.1, dl: .5 },
  { x: "88%", y: "42%", s: 24, d: 2.7, dl: 1.1 },
  { x: "6%", y: "55%", s: 30, d: 3.4, dl: .8 },
  { x: "78%", y: "74%", s: 18, d: 2.2, dl: .3 },
  { x: "16%", y: "80%", s: 20, d: 2.9, dl: 1.4 },
];

const S = {
  stage: {
    position: "fixed", inset: 0, overflow: "hidden", userSelect: "none", touchAction: "none",
    background: "radial-gradient(130% 100% at 50% 18%, #5a3fc9 0%, #43289e 40%, #2a1668 72%, #190b42 100%)",
    fontFamily: "'PingFang TC','Noto Sans TC',sans-serif", color: "#f0edfc",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  canvas: { position: "absolute", inset: 0, pointerEvents: "none", zIndex: 50 },
  flash: { position: "absolute", inset: 0, zIndex: 40, animation: "ggbFlash .45s ease-out forwards", pointerEvents: "none" },
  topbar: {
    position: "absolute", top: 0, left: 0, right: 0, zIndex: 60,
    display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px",
  },
  brand: { fontWeight: 800, fontSize: 15, letterSpacing: 1, color: "#fff" },
  skipBtn: {
    position: "absolute", right: 16, bottom: 16, zIndex: 60,
    height: 40, padding: "0 20px", borderRadius: 8,
    background: "rgba(0,0,0,.6)", border: "1px solid rgba(255,255,255,.3)",
    color: "#fff", fontSize: 14, fontWeight: 900, letterSpacing: "0.25em",
    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
  },
  iconBtn: {
    background: "#ffffff1e", border: "1px solid #ffffff30", borderRadius: 10,
    width: 38, height: 38, fontSize: 17, cursor: "pointer", color: "#fff",
  },
  panel: {
    position: "absolute", top: 62, right: 14, zIndex: 61, background: "#241558f2",
    border: "1px solid #ffffff26", borderRadius: 14, padding: 14,
    display: "flex", flexDirection: "column", gap: 10, backdropFilter: "blur(8px)",
  },
  uplBtn: {
    background: "#3a2790", border: "1px solid #6a55d6", color: "#e4ddff", fontSize: 13,
    borderRadius: 9, padding: "9px 12px", cursor: "pointer", textAlign: "center",
  },
  tierBtn: {
    background: "#ffffff12", border: "1px solid #ffffff26", color: "#b9aee8",
    borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer",
  },
  tierOn: { background: "#4a3a10", borderColor: "#ffd54a", color: "#ffd54a" },
  tierOnB: { background: "#16344a", borderColor: "#6ea8ff", color: "#bfe3ff" },
  tierOnP: { background: "#2d1650", borderColor: "#b76bff", color: "#e3c8ff" },
  packWrap: { position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 26, zIndex: 10 },
  hint: { fontSize: 16, color: "#fff", letterSpacing: 1, fontWeight: 700, minHeight: 24, textShadow: "0 2px 8px #0008" },
  cardArea: {
    position: "relative", width: "min(70vw,270px)", aspectRatio: "5/7",
    display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10,
    marginTop: "-6vh",
  },
  card: {
    position: "absolute", inset: 0, borderRadius: 16,
    backgroundSize: "cover", backgroundPosition: "center", backgroundColor: "#1c2230",
  },
  face: {
    position: "absolute", inset: 0, borderRadius: 16,
    backgroundSize: "cover", backgroundPosition: "center", backgroundColor: "#1c2230",
    backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
  },
  aura: {
    position: "absolute", left: "50%", top: "50%", width: "180vmin", height: "180vmin",
    marginLeft: "-90vmin", marginTop: "-90vmin", borderRadius: "50%",
    pointerEvents: "none", zIndex: 5,
  },
  auraGlow: { position: "absolute", inset: "8%", borderRadius: 20, zIndex: 6, pointerEvents: "none" },
  prizeTag: {
    position: "absolute", top: -54, left: 0, right: 0, textAlign: "center", zIndex: 30,
    fontSize: 26, fontWeight: 900, letterSpacing: 3, animation: "ggbCardIn .5s cubic-bezier(.2,1.6,.4,1)",
  },
  counter: {
    position: "absolute", bottom: -84, left: 0, right: 0, textAlign: "center",
    color: "#cfc6f2", zIndex: 30,
  },
  counterChip: {
    display: "inline-block", padding: "6px 22px", borderRadius: 999,
    background: "#ffffff22", border: "1px solid #ffffff2e", fontSize: 15, fontWeight: 700, color: "#fff",
    backdropFilter: "blur(6px)",
  },
  doneWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 20, zIndex: 20 },
  doneTitle: { fontSize: 24, fontWeight: 900, letterSpacing: 2 },
  againBtn: {
    background: "linear-gradient(135deg,#1c9457,#67d99a)", color: "#04140b", fontWeight: 900,
    fontSize: 16, border: "none", borderRadius: 999, padding: "13px 38px", cursor: "pointer",
    boxShadow: "0 8px 26px #1c945766", letterSpacing: 2,
  },
};

const CSS_KEYFRAMES = `
@keyframes ggbBob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
@keyframes ggbSpin { from{transform:rotate(0)} to{transform:rotate(360deg)} }
@keyframes ggbPulse { 0%,100%{opacity:.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.06)} }
@keyframes ggbFlash { from{opacity:.9} to{opacity:0} }
@keyframes ggbCardIn { from{transform:scale(.85);opacity:.4} to{transform:scale(1);opacity:1} }
@keyframes ggbJitter { 0%,100%{transform:translate(0,0)} 25%{transform:translate(.8px,-.5px)} 50%{transform:translate(-.7px,.6px)} 75%{transform:translate(.5px,.5px)} }
@keyframes ggbFloatCard { 0%,100%{transform:translateY(0) rotate(-1.2deg)} 50%{transform:translateY(-10px) rotate(1.2deg)} }
@keyframes ggbRimPulse { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.3)} }
@keyframes ggbTwinkle { 0%,100%{opacity:.25;transform:scale(.8) rotate(0)} 50%{opacity:1;transform:scale(1.15) rotate(15deg)} }
@media (prefers-reduced-motion: reduce){ *{animation:none !important} }
`;
