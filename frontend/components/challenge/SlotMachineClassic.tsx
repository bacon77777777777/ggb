'use client';

import { useRef, useEffect, useCallback, useState } from 'react';

type SpinState = 'idle' | 'spinning' | 'stopping' | 'video' | 'result';

// 滾輪演出組合：由返還種類決定（jackpot 另由 jackpot prop 控制）
// triple = 三個一樣(非7) / pair7 = 雙7聽牌 / pair = 兩個一樣(非7) / mixed = 三個都不同
export type ReelOutcome = 'triple' | 'pair7' | 'pair' | 'mixed';

// 主題版位覆蓋（單位：stage 百分比）
interface LayoutBox { l?: number; t?: number; w?: number; h?: number }
export interface MachineLayout {
  marquee?: LayoutBox;
  scoreboard?: LayoutBox;                                  // RUSH 燈牌與 LED 計分板共用
  reels?: { t?: number; h?: number; cols?: { l?: number; w?: number }[] };
  autoBtn?: LayoutBox;
  spinBtn?: LayoutBox;
  rushBtn?: LayoutBox;
  wallet?: LayoutBox;
}

export interface SlotMachineClassicProps {
  spinState: SpinState;
  isRushActive: boolean;
  rushHitsRemaining: number;
  isAuto: boolean;
  reelOutcome?: ReelOutcome | null;
  /** 主題組圖路徑（2048×1400 固定模板），未傳用預設主題 */
  spriteUrl?: string;
  /** 主題版位覆蓋（百分比），未設定區域用預設座標 */
  machineLayout?: MachineLayout | null;
  spinsThisTier: number;
  floorSpinCount: number;
  jackpot: boolean;
  rushStreak: number;
  winCount: number;
  totalSpins: number;
  betCoins: number;
  directCost: number;
  /** 玩家總餘額（G），顯示於機台下方總餘額板 */
  balance?: number;
  onSpin: () => void;
  onDirect: () => void;
  onAutoToggle: () => void;
  onAnimDone?: () => void;
}

// ── Audio (module-level singleton) ──────────────────────────────────────────

let _ac: AudioContext | null = null;
let _muted = false;
export function setSfxMuted(m: boolean) { _muted = m; }
function getAC(): AudioContext {
  if (!_ac) {
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    _ac = new ((W.AudioContext || W.webkitAudioContext)!)();
  }
  return _ac;
}

function sBeep(f: number, dur = 0.09, type: OscillatorType = 'square', vol = 0.12, when = 0) {
  if (_muted) return;
  try {
    const ac = getAC();
    if (ac.state === 'suspended') ac.resume();
    const t = ac.currentTime + when;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
  } catch { /* ignore AudioContext errors */ }
}

function sClack() { sBeep(180, 0.06, 'triangle', 0.25); }
function sClunk() { sBeep(90, 0.12, 'triangle', 0.3); sBeep(60, 0.16, 'sine', 0.25, 0.03); }
function sWinJingle(mult = 1) {
  [660, 880, 990, 1320, 990, 1320, 1760].forEach((f, i) => {
    sBeep(f * mult, 0.14, 'square', 0.14, i * 0.12);
    sBeep((f * mult) / 2, 0.14, 'triangle', 0.1, i * 0.12);
  });
}
function sThud(lvl: number) {
  if (_muted) return;
  try {
    const ac = getAC();
    if (ac.state === 'suspended') ac.resume();
    const t = ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(150 + lvl * 35, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.22);
    g.gain.setValueAtTime(0.45 + 0.12 * lvl, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.34);
  } catch { /* ignore */ }
}

// ── Constants ────────────────────────────────────────────────────────────────

// 滾輪符號：sprite 組圖 D 區 6 格（256×256），index 0 = 7（RUSH 專屬）
const N = 6, REP = 5, SEVEN = 0;
const DEFAULT_SPRITE = '/images/slot/machine/sprite.png';
const MARQUEE_DEFAULT = '★ GGB RUSH ★ 押忍!! ★ 拉下拉桿試試手氣 ★ GOOD LUCK ★';
const CNNUM = '一二三四五六七八九十';
const cn = (n: number) => n <= 10 ? CNNUM[n - 1] : n.toString();

// ── CSS ──────────────────────────────────────────────────────────────────────


// 跑馬燈泡座標（% of 750×932 模板；前 13 顆=頂弧 light1、後 28 顆=大当り看板環 light2）
const MARQUEE_BULBS: { x: number; y: number; ph: number }[] = [
  { x: 26.267, y: 1.022, ph: 0 },
  { x: 29.0, y: 1.022, ph: 1 },
  { x: 31.733, y: 1.022, ph: 2 },
  { x: 34.467, y: 1.022, ph: 0 },
  { x: 37.067, y: 1.022, ph: 1 },
  { x: 39.933, y: 1.022, ph: 2 },
  { x: 42.667, y: 1.022, ph: 0 },
  { x: 59.067, y: 1.022, ph: 1 },
  { x: 62.067, y: 1.022, ph: 2 },
  { x: 65.067, y: 1.022, ph: 0 },
  { x: 68.4, y: 1.022, ph: 1 },
  { x: 71.067, y: 1.022, ph: 2 },
  { x: 73.733, y: 1.022, ph: 0 },
  { x: 72.0, y: 11.0, ph: 0 },
  { x: 75.467, y: 11.0, ph: 1 },
  { x: 78.267, y: 12.65, ph: 2 },
  { x: 78.533, y: 15.27, ph: 0 },
  { x: 78.533, y: 17.89, ph: 1 },
  { x: 78.533, y: 20.607, ph: 2 },
  { x: 77.067, y: 22.645, ph: 0 },
  { x: 74.0, y: 23.227, ph: 1 },
  { x: 70.4, y: 23.227, ph: 2 },
  { x: 66.8, y: 23.227, ph: 0 },
  { x: 63.333, y: 23.227, ph: 1 },
  { x: 59.733, y: 23.227, ph: 2 },
  { x: 56.133, y: 23.227, ph: 0 },
  { x: 52.4, y: 23.227, ph: 1 },
  { x: 48.667, y: 23.227, ph: 2 },
  { x: 45.067, y: 23.227, ph: 0 },
  { x: 41.2, y: 23.227, ph: 1 },
  { x: 37.467, y: 23.227, ph: 2 },
  { x: 33.733, y: 23.227, ph: 0 },
  { x: 29.867, y: 23.227, ph: 1 },
  { x: 26.267, y: 23.227, ph: 2 },
  { x: 22.933, y: 22.645, ph: 0 },
  { x: 21.467, y: 20.607, ph: 1 },
  { x: 21.467, y: 17.89, ph: 2 },
  { x: 21.467, y: 15.27, ph: 0 },
  { x: 21.733, y: 12.65, ph: 1 },
  { x: 24.533, y: 11.097, ph: 2 },
  { x: 28.0, y: 11.0, ph: 0 },
];

const SMVC_CSS = `
.smvc-stage {
  position:relative; width:100%; aspect-ratio:750/932;
  container-type:inline-size;
  animation:smvc-breathe 3.4s ease-in-out infinite;
  user-select:none; -webkit-user-select:none;
  font-family:"PingFang TC","Microsoft JhengHei",system-ui,sans-serif;
  overflow:hidden;
}
@keyframes smvc-breathe {
  0%,100%{filter:drop-shadow(0 0 16px rgba(255,150,40,.16));}
  50%    {filter:drop-shadow(0 0 32px rgba(255,180,60,.38));}
}
.smvc-stage.smvc-rushmode { animation:smvc-breatheFast .4s ease-in-out infinite; }
@keyframes smvc-breatheFast {
  0%,100%{filter:drop-shadow(0 0 24px rgba(255,70,40,.5));}
  50%    {filter:drop-shadow(0 0 54px rgba(255,220,70,.9));}
}

.smvc-layer { position:absolute; pointer-events:none; }
/* ── Sprite 組圖定位（2048×1400 模板，座標見 sprite.png 模板表）── */
.smvc-machine {
  inset:0;
  background-image:var(--smvc-sprite);
  background-repeat:no-repeat;
  background-size:273.0667% 150.2146%;
  background-position:0% 0%;
}
.smvc-mrush {
  inset:0; z-index:1;
  background-image:var(--smvc-sprite);
  background-repeat:no-repeat;
  background-size:273.0667% 150.2146%;
  background-position:58.5516% 0%;
  opacity:0;
}
.smvc-stage.smvc-rushskin .smvc-mrush { opacity:1; }

/* ── 發光層 ── */
.smvc-lit {
  position:absolute; inset:0; pointer-events:none; z-index:4;
  background-image:var(--smvc-sprite);
  background-repeat:no-repeat;
  background-size:273.0667% 150.2146%;
  background-position:0% 0%;
  mix-blend-mode:screen;
  filter:brightness(2.1) saturate(1.75) blur(2.5px);
  opacity:0;
}
.smvc-stage.smvc-rushskin .smvc-lit {
  background-size:273.0667% 150.2146%;
  background-position:58.5516% 0%;
}
@keyframes smvc-litPulse  { 0%,100%{opacity:0;} 50%{opacity:.85;} }
@keyframes smvc-litStrobe { 0%{opacity:1;} 50%{opacity:.05;} }
@keyframes smvc-bulbBlink { 0%{opacity:.9;} 50%{opacity:.12;} }

.smvc-lit-star {
  -webkit-mask-image:radial-gradient(ellipse at center,#000 50%,transparent 80%);
  mask-image:radial-gradient(ellipse at center,#000 50%,transparent 80%);
  -webkit-mask-size:16% 8.5%; mask-size:16% 8.5%;
  -webkit-mask-position:50% 0%; mask-position:50% 0%;
  -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat;
  animation:smvc-litPulse 3.5s ease-in-out infinite; animation-delay:0s;
}
.smvc-lit-ribbon {
  -webkit-mask-image:radial-gradient(ellipse at center,#000 50%,transparent 80%);
  mask-image:radial-gradient(ellipse at center,#000 50%,transparent 80%);
  -webkit-mask-size:60% 16%; mask-size:60% 16%;
  -webkit-mask-position:50% 7.14%; mask-position:50% 7.14%;
  -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat;
  animation:smvc-litPulse 5s ease-in-out infinite; animation-delay:.05s;
}
.smvc-lit-bulbs {
  -webkit-mask-image:radial-gradient(ellipse at center,#000 50%,transparent 80%);
  mask-image:radial-gradient(ellipse at center,#000 50%,transparent 80%);
  -webkit-mask-size:66% 15.8%; mask-size:66% 15.8%;
  -webkit-mask-position:50% 13.66%; mask-position:50% 13.66%;
  -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat;
  animation:smvc-litPulse 3.2s ease-in-out infinite; animation-delay:.1s;
}
.smvc-lit-mframe {
  -webkit-mask-image:radial-gradient(ellipse at center,#000 50%,transparent 80%);
  mask-image:radial-gradient(ellipse at center,#000 50%,transparent 80%);
  -webkit-mask-size:62% 15%; mask-size:62% 15%;
  -webkit-mask-position:50% 28.24%; mask-position:50% 28.24%;
  -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat;
  animation:smvc-litPulse 4s ease-in-out infinite; animation-delay:.15s;
}
.smvc-lit-barL {
  -webkit-mask-image:radial-gradient(ellipse at center,#000 50%,transparent 80%);
  mask-image:radial-gradient(ellipse at center,#000 50%,transparent 80%);
  -webkit-mask-size:10.5% 27%; mask-size:10.5% 27%;
  -webkit-mask-position:5.03% 46.58%; mask-position:5.03% 46.58%;
  -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat;
  animation:smvc-litPulse 1.9s ease-in-out infinite; animation-delay:.2s;
}
.smvc-lit-barR {
  -webkit-mask-image:radial-gradient(ellipse at center,#000 50%,transparent 80%);
  mask-image:radial-gradient(ellipse at center,#000 50%,transparent 80%);
  -webkit-mask-size:10.5% 27%; mask-size:10.5% 27%;
  -webkit-mask-position:94.97% 46.58%; mask-position:94.97% 46.58%;
  -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat;
  animation:smvc-litPulse 1.9s ease-in-out infinite; animation-delay:.95s;
}
.smvc-lit-reelfr {
  -webkit-mask-image:radial-gradient(ellipse at center,#000 50%,transparent 80%);
  mask-image:radial-gradient(ellipse at center,#000 50%,transparent 80%);
  -webkit-mask-size:68% 16%; mask-size:68% 16%;
  -webkit-mask-position:50% 42.26%; mask-position:50% 42.26%;
  -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat;
  animation:none;
}
.smvc-lit-deck {
  -webkit-mask-image:radial-gradient(ellipse at center,#000 50%,transparent 80%);
  mask-image:radial-gradient(ellipse at center,#000 50%,transparent 80%);
  -webkit-mask-size:70.9% 15.7%; mask-size:70.9% 15.7%;
  -webkit-mask-position:51.20% 89.56%; mask-position:51.20% 89.56%;
  -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat;
  animation:smvc-litPulse 4.6s ease-in-out infinite; animation-delay:.35s;
}
.smvc-stage.smvc-spinning .smvc-lit-barL,
.smvc-stage.smvc-spinning .smvc-lit-barR  { animation-duration:.55s; }
.smvc-stage.smvc-spinning .smvc-lit-mframe{ animation-duration:1.2s; }
.smvc-stage.smvc-spinning .smvc-lit-deck  { animation-duration:1.6s; }
.smvc-stage.smvc-rushskin .smvc-lit-star  { animation-duration:1.4s; }
.smvc-stage.smvc-rushskin .smvc-lit-ribbon{ animation-duration:1.5s; }
.smvc-stage.smvc-rushskin .smvc-lit-mframe{ animation-duration:1.1s; }
.smvc-stage.smvc-rushskin .smvc-lit-barL,
.smvc-stage.smvc-rushskin .smvc-lit-barR  { animation-duration:.7s; }
.smvc-stage.smvc-rushskin .smvc-lit-deck  { animation-duration:1.3s; }
.smvc-stage.smvc-rushskin .smvc-lit-bulbs { animation:smvc-bulbBlink .34s steps(2) infinite; }
.smvc-stage.smvc-rushmode .smvc-lit       { animation:smvc-litStrobe .14s steps(2) infinite !important; }

/* ── RUSH sign (hidden in normal mode) ── */
.smvc-rushsign {
  position:absolute;
  left:var(--sb-l,27.07%); top:var(--sb-t,27.15%); width:var(--sb-w,45.87%); height:var(--sb-h,8.8%);
  z-index:5;
  background-image:var(--smvc-sprite);
  background-repeat:no-repeat;
  background-size:595.3488% 1707.3171%;
  background-position:89.2019% 0%;
  opacity:0; transform-origin:center;
}
@keyframes smvc-signPulse {
  0%,100%{opacity:.72; filter:drop-shadow(0 0 .3cqw rgba(255,190,60,.4));}
  50%    {opacity:1;   filter:drop-shadow(0 0 1.6cqw rgba(255,200,70,.95));}
}
@keyframes smvc-signJitter { 25%{transform:translate(.18cqw,-.14cqw);} 75%{transform:translate(-.18cqw,.14cqw);} }
.smvc-stage.smvc-rushskin .smvc-rushsign { opacity:1; animation:smvc-signPulse 1.1s ease-in-out infinite,smvc-signJitter .14s linear infinite; }
.smvc-stage.smvc-rushmode .smvc-rushsign { opacity:1; animation:smvc-signStrobe .15s steps(2) infinite,smvc-signJitter .1s linear infinite; }
@keyframes smvc-signStrobe {
  0%  {opacity:1; transform:scale(1.06); filter:drop-shadow(0 0 2.2cqw #ffd84d) brightness(1.5);}
  50% {opacity:.25; transform:scale(1);}
}

/* ── Scoreboard (behind rush sign, 常駐顯示；RUSH 燈牌亮起時被其覆蓋) ── */
.smvc-scoreboard {
  position:absolute;
  left:var(--sb-l,27.07%); top:var(--sb-t,27.15%); width:var(--sb-w,45.87%); height:var(--sb-h,8.8%);
  z-index:4; display:flex; align-items:center; justify-content:center;
  pointer-events:none;
  font-family:"PingFang TC","Microsoft JhengHei",monospace,sans-serif;
  font-weight:900; font-size:3.4cqw; letter-spacing:.3cqw; white-space:nowrap;
  color:#fff; text-shadow:0 0 .8cqw rgba(255,255,255,.65),0 0 2cqw rgba(255,255,255,.3);
}
.smvc-scoreboard b {
  font-weight:900;
  color:#4dff91; text-shadow:0 0 .8cqw #00cc55,0 0 2.4cqw rgba(0,200,80,.85);
}
.smvc-scoreboard::after {
  content:""; position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(rgba(0,0,0,.5) 28%,transparent 32%);
  background-size:.85cqw .85cqw;
}

/* ── Marquee ── */
.smvc-marquee {
  position:absolute;
  left:var(--mq-l,24.93%); top:var(--mq-t,14.59%); width:var(--mq-w,50%); height:var(--mq-h,7.83%);
  overflow:hidden; border-radius:1cqw; display:flex; align-items:center; z-index:5;
}
.smvc-marquee-txt {
  white-space:nowrap; font-weight:900; letter-spacing:.35cqw;
  font-size:3.6cqw; color:#ffb51e;
  text-shadow:0 0 .8cqw #ff8c00,0 0 2.4cqw rgba(255,120,0,.9);
  animation:smvc-ticker 9s linear infinite;
}
@keyframes smvc-ticker { from{transform:translateX(100%);} to{transform:translateX(-100%);} }
/* 靜態置中（非777揭曉訊息）：不捲動 */
.smvc-marquee.smvc-mq-static .smvc-marquee-txt { animation:none; transform:none; margin:auto; }
.smvc-marquee.smvc-win .smvc-marquee-txt {
  animation:smvc-strobeTxt .22s steps(2) infinite;
  font-size:4.4cqw; margin:auto; transform:none;
  color:#fff35e; text-shadow:0 0 1cqw #ff2a00,0 0 3cqw #ffb300;
}
@keyframes smvc-strobeTxt { 0%{opacity:1;} 50%{opacity:.15;} }
.smvc-marquee::after {
  content:""; position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(rgba(0,0,0,.55) 28%,transparent 32%);
  background-size:.9cqw .9cqw;
}

/* ── Marquee bulbs（跑馬燈追逐；RUSH 加速）── */
.smvc-bulb {
  position:absolute; z-index:3; pointer-events:none;
  width:1.5cqw; aspect-ratio:1/1; border-radius:50%;
  transform:translate(-50%,-50%);
  background:radial-gradient(circle at 35% 35%, #fff6d0 0%, #ffd75e 48%, #ff9d1c 85%);
  box-shadow:0 0 .9cqw .25cqw rgba(255,195,70,.85), 0 0 2.2cqw .7cqw rgba(255,150,30,.4);
  animation:smvc-bulbChase var(--bulb-dur,.9s) steps(1) infinite;
  animation-delay:calc(var(--ph) * var(--bulb-dur,.9s) / -3);
}
@keyframes smvc-bulbChase {
  0%    { opacity:1; }
  33.4% { opacity:.85; box-shadow:inset 0 0 .55cqw .15cqw rgba(0,0,0,.5), 0 0 .9cqw .3cqw rgba(0,0,0,.3); filter:saturate(.5) brightness(.6); }
  100%  { opacity:.85; box-shadow:inset 0 0 .55cqw .15cqw rgba(0,0,0,.5), 0 0 .9cqw .3cqw rgba(0,0,0,.3); filter:saturate(.5) brightness(.6); }
}
.smvc-rushskin .smvc-bulb { --bulb-dur:.45s; }
/* 事件燈效：大当り/連中全閃、返還快掃、7 連落定脈衝 */
.smvc-bulbs-flash .smvc-bulb { animation:smvc-bulbAll .12s steps(2) infinite; }
.smvc-bulbs-pop   .smvc-bulb { animation:smvc-bulbAll .1s  steps(2) 4; }
.smvc-bulbs-sweep .smvc-bulb { --bulb-dur:.3s; }
@keyframes smvc-bulbAll { 0%{opacity:1; filter:none; box-shadow:0 0 1.1cqw .35cqw rgba(255,205,80,.95), 0 0 2.6cqw .9cqw rgba(255,160,40,.5);} 50%{opacity:.3; filter:brightness(.6);} }

/* 頂弧（light1）底圖偏亮金，熄燈遮罩用較淡版本避免死黑 */
.smvc-bulb-arc { animation-name:smvc-bulbChaseArc; }
@keyframes smvc-bulbChaseArc {
  0%    { opacity:1; }
  33.4% { opacity:.5; box-shadow:inset 0 0 .5cqw .12cqw rgba(0,0,0,.32), 0 0 .7cqw .2cqw rgba(0,0,0,.18); filter:saturate(.65) brightness(.8); }
  100%  { opacity:.5; box-shadow:inset 0 0 .5cqw .12cqw rgba(0,0,0,.32), 0 0 .7cqw .2cqw rgba(0,0,0,.18); filter:saturate(.65) brightness(.8); }
}

/* ── 總餘額板 ── */
.smvc-wallet {
  position:absolute; z-index:4; pointer-events:none;
  left:var(--wl-l,24.4%); top:var(--wl-t,92.6%); width:var(--wl-w,51.2%); height:var(--wl-h,6.33%);
  background:url('/images/slot/machine/wallet.png') no-repeat center/100% 100%;
}
.smvc-wallet i {
  position:absolute; right:7%; top:6%; bottom:6%;
  display:flex; align-items:center;
  font-style:normal; font-weight:900; font-size:3.4cqw;
  color:#ffd75e; text-shadow:0 0 .7cqw rgba(255,190,60,.6),0 0 1.6cqw rgba(255,150,30,.3);
}
.smvc-wallet span {
  position:absolute; left:30%; right:7%; top:6%; bottom:6%;
  display:flex; align-items:center; justify-content:center;
  font-family:"PingFang TC","Microsoft JhengHei",monospace,sans-serif;
  font-weight:900; font-size:3.4cqw; letter-spacing:.15cqw; white-space:nowrap;
  color:#ffd75e; text-shadow:0 0 .7cqw rgba(255,190,60,.6),0 0 1.6cqw rgba(255,150,30,.3);
  font-variant-numeric:tabular-nums;
}

/* RUSH 皮膚下計分板先隱藏，回普通機台再顯示 */
.smvc-rushskin .smvc-scoreboard { opacity:0; transition:opacity .3s; }

/* ── Reels ── */
/* 滾輪窗：機台圖的滾筒實際範圍約 38.6%~60.1%，高度取到 59.3% 貼齊滾筒下緣 */
.smvc-reel { position:absolute; overflow:hidden; z-index:3; top:var(--r-t,40.77%); height:var(--r-h,18.5%); }
.smvc-r0 { left:var(--r0-l,22.00%); width:var(--r0-w,17.07%); }
.smvc-r1 { left:var(--r1-l,42.40%); width:var(--r1-w,16.13%); }
.smvc-r2 { left:var(--r2-l,61.73%); width:var(--r2-w,16.27%); }
.smvc-strip { position:absolute; left:0; width:100%; will-change:transform; }
.smvc-cell {
  height:var(--smvc-rowH,80px);
  display:flex; align-items:center; justify-content:center;
}
.smvc-sym {
  display:block; width:92%; aspect-ratio:1/1;
  background-image:var(--smvc-sprite);
  background-repeat:no-repeat;
  background-size:800% 546.875%;
}
.smvc-sym0 { background-position:0%       83.0420%; }
.smvc-sym1 { background-position:14.8438% 83.0420%; }
.smvc-sym2 { background-position:29.6875% 83.0420%; }
.smvc-sym3 { background-position:44.5313% 83.0420%; }
.smvc-sym4 { background-position:59.3750% 83.0420%; }
.smvc-sym5 { background-position:74.2188% 83.0420%; }
.smvc-reel.smvc-blur .smvc-strip { filter:blur(.45cqw); }
.smvc-shade {
  position:absolute; inset:0; pointer-events:none;
  background:linear-gradient(rgba(70,70,70,.3),transparent 26%,transparent 74%,rgba(70,70,70,.3));
}
.smvc-reel.smvc-hit { animation:smvc-reelFlash .3s steps(2) 6; }
@keyframes smvc-reelFlash {
  0%  {box-shadow:inset 0 0 0 .6cqw #ffe14d,0 0 2.6cqw #ffd000;}
  50% {box-shadow:none;}
}

/* ── Reel shake levels ── */
@keyframes smvc-rs1 { 25%{transform:translate(.4cqw,-.3cqw);} 75%{transform:translate(-.4cqw,.3cqw);} }
@keyframes smvc-rs2 { 25%{transform:translate(.9cqw,-.6cqw) rotate(.4deg);} 75%{transform:translate(-.9cqw,.6cqw) rotate(-.4deg);} }
@keyframes smvc-rs3 { 25%{transform:translate(1.5cqw,-1cqw) rotate(.8deg) scale(1.03);} 75%{transform:translate(-1.5cqw,1cqw) rotate(-.8deg) scale(1.03);} }
.smvc-reel.smvc-rs1 { animation:smvc-rs1 .08s linear 7;  box-shadow:0 0 1.6cqw .3cqw rgba(255,200,60,.85); }
.smvc-reel.smvc-rs2 { animation:smvc-rs2 .07s linear 11; box-shadow:0 0 2.6cqw .6cqw rgba(255,120,20,.95); }
.smvc-reel.smvc-rs3 { animation:smvc-rs3 .06s linear 16; box-shadow:0 0 4cqw 1cqw rgba(255,40,20,1),0 0 8cqw 2cqw rgba(255,220,80,.8); }

/* ── Stage jolt / shake ── */
@keyframes smvc-jolt1 { 30%{transform:translateY(.6cqw);} }
@keyframes smvc-jolt2 { 30%{transform:translateY(1.2cqw) rotate(.2deg);} }
@keyframes smvc-jolt3 { 30%{transform:translateY(2cqw) rotate(-.35deg) scale(1.01);} }
@keyframes smvc-shake  { 25%{transform:translate(.6cqw,-.4cqw) rotate(.3deg);} 75%{transform:translate(-.6cqw,.4cqw) rotate(-.3deg);} }
.smvc-stage.smvc-shake  { animation:smvc-shake .09s linear 10; }
.smvc-stage.smvc-jolt1  { animation:smvc-jolt1 .14s ease-out; }
.smvc-stage.smvc-jolt2  { animation:smvc-jolt2 .16s ease-out; }
.smvc-stage.smvc-jolt3  { animation:smvc-jolt3 .18s ease-out; }

/* ── Stamp / ring ── */
.smvc-stamp {
  position:absolute; z-index:6; pointer-events:none;
  display:flex; align-items:center; justify-content:center;
  animation:smvc-stampIn .16s cubic-bezier(.55,0,1,.45) both;
}
.smvc-stamp .smvc-sym {
  width:74%;
  filter:drop-shadow(0 0 2cqw rgba(255,80,30,.9)) drop-shadow(.3cqw .3cqw 0 rgba(122,13,0,.85));
}
@keyframes smvc-stampIn {
  0%  {transform:scale(var(--ss,2.4)); opacity:0;}
  55% {opacity:1;}
  100%{transform:scale(1); opacity:1;}
}
.smvc-ring {
  position:absolute; z-index:6; pointer-events:none; border-radius:50%;
  border:.5cqw solid rgba(255,210,80,.9);
  box-shadow:0 0 2cqw rgba(255,150,30,.8);
  animation:smvc-ringOut .45s ease-out both;
}
@keyframes smvc-ringOut { from{transform:scale(.25); opacity:1;} to{transform:scale(2.4); opacity:0;} }

/* ── Lever ── */
.smvc-lever-hit { position:absolute; left:2%; top:44%; width:16%; height:26%; z-index:7; cursor:pointer; }
.smvc-lever     { position:absolute; left:5.07%; top:50.32%; height:30.47%; z-index:6; pointer-events:none; }
.smvc-lf {
  position:absolute; left:0; top:0; height:100%; opacity:0;
  background-image:var(--smvc-sprite);
  background-repeat:no-repeat;
}
.smvc-lf.smvc-show { opacity:1; }
.smvc-lf1 { width:9.20cqw; background-size:2968.1159% 492.9577%; background-position:76.8064% 37.6344%; }
.smvc-lf2 { width:9.73cqw; background-size:2805.4795% 492.9577%; background-position:81.5190% 37.6344%; }
.smvc-lf3 { width:9.87cqw; background-size:2767.5676% 492.9577%; background-position:86.1196% 37.6344%; }
.smvc-lf4 { width:9.33cqw; background-size:2925.7143% 492.9577%; background-position:90.4954% 37.6344%; }

/* ── Buttons ── */
.smvc-btn {
  position:absolute; z-index:7; cursor:pointer;
  background-image:var(--smvc-sprite);
  background-repeat:no-repeat;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  line-height:1.05; padding-bottom:1.2cqw;
  font-family:Impact,"Arial Black","Microsoft JhengHei",sans-serif;
  font-weight:900; letter-spacing:.06cqw; pointer-events:all;
  text-shadow:0 0 .6cqw rgba(255,140,0,.9),0 1px 2px rgba(0,0,0,.8);
  color:#ffe8a0;
}
.smvc-btn-amt { font-size:68%; opacity:.92; letter-spacing:.04cqw; }
.smvc-btn-auto { left:var(--ba-l,21.87%); top:var(--ba-t,61.48%); width:var(--ba-w,17.33%); height:var(--ba-h,8.58%);
  background-size:1575.3846% 1750%; background-position:79.2492% 7.5758%;
  font-size:3.3cqw; padding-bottom:3.2cqw; }
.smvc-btn-spin { left:var(--bs-l,39.20%); top:var(--bs-t,62.34%); width:var(--bs-w,23.73%); height:var(--bs-h,11.16%);
  background-size:1150.5618% 1346.1538%; background-position:81.2834% 15.4321%;
  font-size:4.5cqw; padding-bottom:3.2cqw;
  animation:smvc-invite 1.8s ease-in-out infinite; }
.smvc-btn-rush { left:var(--br-l,62.93%); top:var(--br-t,61.48%); width:var(--br-w,17.33%); height:var(--br-h,8.58%);
  background-size:1575.3846% 1750%; background-position:79.2492% 24.2424%;
  font-size:3.3cqw; padding-bottom:3.2cqw; }
@keyframes smvc-invite {
  0%,100%{filter:drop-shadow(0 0 .2cqw rgba(255,220,120,.3));}
  50%    {filter:drop-shadow(0 0 1.6cqw rgba(255,220,120,.95)) brightness(1.12);}
}
.smvc-btn:hover  { filter:brightness(1.15) drop-shadow(0 0 1cqw rgba(255,230,150,.8)); }
.smvc-btn:active { transform:translateY(3%) scale(.97); filter:brightness(.92); }
.smvc-btn-off { filter:grayscale(1) brightness(.5) contrast(1.05); pointer-events:none; }
.smvc-stage.smvc-spinning .smvc-btn:not(.smvc-btn-auto),
.smvc-stage.smvc-spinning .smvc-lever-hit { pointer-events:none; }
.smvc-stage.smvc-spinning .smvc-btn:not(.smvc-btn-auto) { filter:saturate(.6) brightness(.85); animation:none; }
.smvc-btn-auto.smvc-on { animation:smvc-autopulse .9s infinite; }
@keyframes smvc-autopulse { 50%{filter:brightness(1.5) drop-shadow(0 0 1.4cqw #ffd84d);} }

/* ── Bigwin ── */
.smvc-bigwin { position:absolute; inset:0; display:none; align-items:center; justify-content:center; pointer-events:none; z-index:9; }
.smvc-bigwin.smvc-show { display:flex; }
.smvc-bigwin span {
  font-family:Impact,"Arial Black","Microsoft JhengHei",sans-serif;
  font-size:15cqw; font-weight:900; letter-spacing:1cqw; white-space:nowrap;
  background:linear-gradient(90deg,#fff3a0 0%,#ffd400 25%,#ff8800 55%,#ff3800 80%,#ffd400 100%);
  -webkit-background-clip:text; background-clip:text; color:transparent;
  filter:drop-shadow(0 0 1.5cqw #ff3c00) drop-shadow(.5cqw .8cqw 0 rgba(80,20,0,.9));
  animation:smvc-winpop .5s cubic-bezier(.2,2.4,.4,1) both,smvc-winstrobe .16s steps(2) .5s infinite;
}
.smvc-bigwin.smvc-lv2 span {
  font-size:16.5cqw;
  background-image:linear-gradient(90deg,#fff0a0 0%,#ff9d00 30%,#ff3d00 65%,#ff9d00 100%);
  filter:drop-shadow(0 0 1.8cqw #ff5500) drop-shadow(.5cqw .8cqw 0 rgba(90,15,0,.9));
  animation:smvc-winpop .45s cubic-bezier(.2,2.4,.4,1) both,smvc-winstrobe .13s steps(2) .45s infinite;
}
.smvc-bigwin.smvc-lv3 span {
  font-size:18cqw;
  background-image:linear-gradient(90deg,#ffd0e8 0%,#ff3d6e 35%,#d4006a 70%,#ff3d6e 100%);
  filter:drop-shadow(0 0 2.2cqw #ff0055) drop-shadow(.5cqw .8cqw 0 rgba(80,0,40,.9));
  animation:smvc-winpop .4s cubic-bezier(.2,2.6,.4,1) both,smvc-winstrobe .11s steps(2) .4s infinite;
}
.smvc-bigwin.smvc-lv4 span {
  font-size:19cqw;
  background-image:linear-gradient(90deg,#f0d0ff 0%,#b44dff 35%,#6a00e8 70%,#b44dff 100%);
  filter:drop-shadow(0 0 2.6cqw #9d2bff) drop-shadow(.5cqw .8cqw 0 rgba(40,0,80,.9));
  animation:smvc-winpop .38s cubic-bezier(.2,2.8,.4,1) both,smvc-winstrobe .1s steps(2) .38s infinite;
}
.smvc-bigwin.smvc-lv5 span {
  font-size:20cqw;
  background-image:linear-gradient(90deg,#ff004c,#ff9900,#ffee00,#33ff66,#00cfff,#b44dff,#ff004c);
  background-size:300% 100%;
  filter:drop-shadow(0 0 3cqw #fff) drop-shadow(.5cqw .8cqw 0 rgba(0,0,0,.85));
  animation:smvc-winpop .35s cubic-bezier(.2,3,.4,1) both,smvc-rainbow 1s linear infinite,smvc-winstrobe .09s steps(2) .35s infinite;
}
@keyframes smvc-rainbow { to{background-position:300% 0;} }
@keyframes smvc-winpop   { from{transform:scale(.1) rotate(-8deg); opacity:0;} to{transform:scale(1) rotate(-4deg); opacity:1;} }
@keyframes smvc-winstrobe { 50%{filter:drop-shadow(0 0 4cqw #fff35e) drop-shadow(.5cqw .8cqw 0 rgba(80,20,0,.9)) brightness(1.6);} }

/* ── Flash ── */
.smvc-flash {
  position:absolute; inset:0; pointer-events:none; z-index:10; opacity:0;
  background:radial-gradient(circle at 50% 42%,rgba(255,250,220,.98),rgba(255,190,60,.6) 45%,transparent 75%);
  border-radius:3cqw;
}
.smvc-flash.smvc-go { animation:smvc-flashout .6s ease-out both; }
@keyframes smvc-flashout { 0%{opacity:1;} 100%{opacity:0;} }


/* ── Coin ── */
.smvc-coin {
  position:absolute; width:4.6cqw; height:4.6cqw; border-radius:50%;
  pointer-events:none; z-index:8;
  background:radial-gradient(circle at 35% 28%,#fff6bd,#ffd93a 42%,#eda800 72%,#b97a00);
  border:.4cqw solid #925f00;
  display:flex; align-items:center; justify-content:center;
  color:#8a5a00; font-weight:900; font-size:2.4cqw;
  font-family:Impact,"Arial Black",sans-serif;
  box-shadow:0 0 1.2cqw rgba(255,190,40,.95),inset 0 -.4cqw .6cqw rgba(140,80,0,.5);
}
`;

// ── Component ────────────────────────────────────────────────────────────────

export default function SlotMachineClassic({
  spinState, isRushActive, isAuto, reelOutcome, spriteUrl, machineLayout, balance,
  spinsThisTier, floorSpinCount, jackpot, rushStreak,
  winCount, totalSpins, betCoins, directCost,
  onSpin, onDirect, onAutoToggle, onAnimDone,
}: SlotMachineClassicProps) {
  const stageRef   = useRef<HTMLDivElement>(null);
  const reelEls    = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const stripEls   = useRef<(HTMLDivElement | null)[]>([null, null, null]);
  const leverEls   = useRef<(HTMLDivElement | null)[]>([null, null, null, null]);
  const bigwinEl   = useRef<HTMLDivElement>(null);
  const marqueeEl  = useRef<HTMLDivElement>(null);
  const marqueeTxt = useRef<HTMLDivElement>(null);
  const flashEl    = useRef<HTMLDivElement>(null);

  const scoreboardEl  = useRef<HTMLDivElement>(null);

  // 音效開關（localStorage 記憶）
  const mqTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offsets       = useRef([0, 0, 0]);
  const rowH          = useRef(80);   // 格高（= 視窗高 × CELL_F，上下露出相鄰符號邊）
  const padY          = useRef(0);    // 置中偏移 = (視窗高 − 格高) / 2
  const rafId         = useRef(0);
  const prevSpin      = useRef<SpinState>('idle');
  const jackpotRef    = useRef(false);
  const outcomeRef    = useRef<ReelOutcome | null>(null);
  const rushStreakRef  = useRef(0);
  const animGen       = useRef(0);     // generation counter: 每次新動畫遞增，讓舊 stopReels RAF 自動停止

  // Keep refs in sync — declared before spinState effect so ordering is guaranteed
  useEffect(() => { jackpotRef.current = jackpot; }, [jackpot]);
  useEffect(() => { outcomeRef.current = reelOutcome ?? null; }, [reelOutcome]);
  useEffect(() => { rushStreakRef.current = rushStreak; }, [rushStreak]);

  // Inject CSS once
  useEffect(() => {
    if (document.getElementById('smvc-css')) return;
    const el = document.createElement('style');
    el.id = 'smvc-css';
    el.textContent = SMVC_CSS;
    document.head.appendChild(el);
  }, []);

  // Build reel strips + init layout
  useEffect(() => {
    stripEls.current.forEach(strip => {
      if (!strip) return;
      let html = '';
      for (let k = 0; k < REP; k++)
        for (let i = 0; i < N; i++)
          html += `<div class="smvc-cell"><i class="smvc-sym smvc-sym${i}"></i></div>`;
      strip.innerHTML = html;
    });
    sync();
    // Init reel positions: RUSH 中顯示 777（刷新頁面也要維持），否則隨機（避開 777）
    {
      const h = rowH.current || 80;
      let t: number[];
      if (isRushActive) {
        t = [SEVEN, SEVEN, SEVEN];
      } else {
        do { t = [0, 1, 2].map(() => Math.floor(Math.random() * N)); }
        while (t[0] === SEVEN && t[1] === SEVEN && t[2] === SEVEN);
      }
      offsets.current = t.map(s => s * h);
      stripEls.current.forEach((el, i) => {
        if (el) el.style.transform = `translateY(${stripY(offsets.current[i], h)}px)`;
      });
    }
    window.addEventListener('resize', sync);
    // Init rush skin if already in RUSH on mount
    if (isRushActive) stageRef.current?.classList.add('smvc-rushskin');
    return () => {
      window.removeEventListener('resize', sync);
      cancelAnimationFrame(rafId.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep rush skin in sync — 只負責「加上」皮膚（進 RUSH / 直撃）。
  // 「移除」只交給 finish()（滾輪三個停定時）：RUSH 已結束時皮膚仍保留，
  // 由下一轉的滾輪結果揭曉——非 777 停定 → 才換回普通機台
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (spinState === 'spinning' || spinState === 'stopping') return;
    if (isRushActive) stage.classList.add('smvc-rushskin');
  }, [isRushActive, spinState]);

  // 條帶定位：目標格置中，上下各露出相鄰符號一小段（往上多移一圈確保上方有格可露）
  const stripY = useCallback((pos: number, h: number) =>
    -(pos % (N * h)) - N * h + padY.current, []);

  const sync = useCallback(() => {
    const vh = reelEls.current[0]?.clientHeight ?? 80;
    // 格高固定為滾輪窗高的 63.5%：滾輪窗由 15.88% 加高到 18.5% 後，
    // 若沿用原本的 0.74 會讓格子跟著變高，但符號大小由寬度決定（92% + 1:1），
    // 結果就是符號沒變大、上下間距被拉開。此係數讓格高維持加高前的絕對值，
    // 多出來的窗高只用來多露出上下相鄰的符號。
    const h = vh * 0.635;
    rowH.current = h;
    padY.current = (vh - h) / 2;
    stageRef.current?.style.setProperty('--smvc-rowH', h + 'px');
    stripEls.current.forEach((s, i) => {
      if (s) s.style.transform = `translateY(${stripY(offsets.current[i], h)}px)`;
    });
  }, [stripY]);

  const showFrame = useCallback((i: number) => {
    leverEls.current.forEach((f, k) => f?.classList.toggle('smvc-show', k === i));
  }, []);

  const leverPull = useCallback(() => {
    sClunk();
    [1, 2, 3, 0].forEach((f, i) => setTimeout(() => showFrame(f), i * 80));
  }, [showFrame]);

  const stampFx = useCallback((reelIdx: number, lvl: number) => {
    const stage = stageRef.current;
    const reel = reelEls.current[reelIdx];
    if (!stage || !reel) return;

    const st = document.createElement('div');
    st.className = 'smvc-stamp';
    st.style.cssText = `left:${reel.offsetLeft}px;top:${reel.offsetTop}px;width:${reel.clientWidth}px;height:${reel.clientHeight}px;--ss:${2 + lvl * 0.5}`;
    st.innerHTML = '<i class="smvc-sym smvc-sym0"></i>';
    stage.appendChild(st);
    setTimeout(() => st.remove(), 550);

    setTimeout(() => {
      const ring = document.createElement('div');
      ring.className = 'smvc-ring';
      const s = reel.clientWidth;
      ring.style.cssText = `left:${reel.offsetLeft + reel.clientWidth / 2 - s / 2}px;top:${reel.offsetTop + reel.clientHeight / 2 - s / 2}px;width:${s}px;height:${s}px;`;
      stage.appendChild(ring);
      setTimeout(() => ring.remove(), 500);

      reel.classList.remove('smvc-rs1', 'smvc-rs2', 'smvc-rs3');
      void reel.offsetWidth;
      reel.classList.add(`smvc-rs${lvl}`);
      setTimeout(() => reel.classList.remove(`smvc-rs${lvl}`), 700 + lvl * 200);

      stage.classList.remove('smvc-jolt1', 'smvc-jolt2', 'smvc-jolt3');
      void stage.offsetWidth;
      stage.classList.add(`smvc-jolt${lvl}`);
      setTimeout(() => stage.classList.remove(`smvc-jolt${lvl}`), 260);

      sThud(lvl);
      sBeep(520 + lvl * 340, 0.1, 'square', 0.12, 0.02);

      if (lvl >= 2) {
        stage.classList.remove('smvc-bulbs-pop');
        void stage.offsetWidth;
        stage.classList.add('smvc-bulbs-pop');
        setTimeout(() => stage.classList.remove('smvc-bulbs-pop'), 500);
      }
    }, 150);
  }, []);

  const coinBurst = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    for (let i = 0; i < 32; i++) {
      const c = document.createElement('div');
      c.className = 'smvc-coin'; c.textContent = 'G';
      c.style.left = '50%'; c.style.top = '50%';
      stage.appendChild(c);
      const ang = Math.random() * Math.PI * 2, sp = 18 + Math.random() * 36;
      const vx = Math.cos(ang) * sp;
      let vy = Math.sin(ang) * sp - 32, x = 0, y = 0, life = 0;
      const flip = 6 + Math.random() * 10;
      (function fly() {
        life++; vy += 3.2 * 0.14; x += vx * 0.14; y += vy * 0.14;
        c.style.transform = `translate(${x}cqw,${y}cqw) rotateY(${life * flip}deg) rotate(${life * 4}deg)`;
        c.style.opacity = String(Math.max(0, 1 - life / 75));
        if (life < 75) requestAnimationFrame(fly); else c.remove();
      })();
    }
  }, []);

  const finish = useCallback((isJackpot: boolean) => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.classList.remove('smvc-spinning');

    if (!isJackpot) {
      stage.classList.remove('smvc-rushskin');
      const mq = marqueeEl.current;
      const txt = marqueeTxt.current;
      if (mq && txt) {
        mq.classList.add('smvc-mq-static');
        txt.textContent = 'GGB的命！再挑戰一次！';
        if (mqTimerRef.current) clearTimeout(mqTimerRef.current);
        mqTimerRef.current = setTimeout(() => {
          mq.classList.remove('smvc-mq-static');
          txt.textContent = MARQUEE_DEFAULT;
        }, 4000);
      }

      // 返還揭曉：跑馬燈快掃一輪
      stage.classList.add('smvc-bulbs-sweep');
      setTimeout(() => stage.classList.remove('smvc-bulbs-sweep'), 1200);
    } else {
      const streak = rushStreakRef.current;
      stage.classList.add('smvc-rushmode', 'smvc-shake', 'smvc-rushskin');

      // 大当り/連中：全燈同步爆閃，連中越多閃越久
      stage.classList.remove('smvc-bulbs-flash');
      void stage.offsetWidth;
      stage.classList.add('smvc-bulbs-flash');
      setTimeout(() => stage.classList.remove('smvc-bulbs-flash'), 1800 + Math.min(streak, 4) * 400);

      const fl = flashEl.current;
      if (fl) { fl.classList.remove('smvc-go'); void fl.offsetWidth; fl.classList.add('smvc-go'); }

      reelEls.current.forEach(r => r?.classList.add('smvc-hit'));

      const marquee = marqueeEl.current;
      const txt = marqueeTxt.current;
      if (marquee) marquee.classList.add('smvc-win');

      // streak=0 → RUSH 突入（顯示 "RUSH!!"），streak>=1 → 大当り!!/ 二連中！etc.
      const isEntry = streak === 0;
      const label = isEntry ? 'RUSH!!' : (streak <= 1 ? '大当り!!' : cn(streak) + '連中！');
      const marqueeLabel = isEntry ? '★ RUSH 突入 ★ GGB ★' : (streak <= 1 ? '大当り RUSH !!' : label.replace('！', ' RUSH !!'));
      if (txt) txt.textContent = marqueeLabel;

      const bw = bigwinEl.current;
      if (bw) {
        const span = bw.querySelector('span') as HTMLElement;
        if (span) span.textContent = label;
        bw.className = 'smvc-bigwin smvc-show' + (!isEntry && streak > 1 ? ` smvc-lv${Math.min(streak, 5)}` : '');
      }

      const mult = isEntry ? 1.05 : Math.min(1 + (streak - 1) * 0.12, 1.6);
      sWinJingle(mult);
      setTimeout(() => sWinJingle(mult), 900);
      if (!isEntry && streak >= 3) setTimeout(() => sWinJingle(mult * 1.1), 1800);

      const bursts = isEntry ? 2 : Math.min(3 + (streak - 1), 6);
      for (let k = 0; k < bursts; k++) setTimeout(coinBurst, k * 700);

      setTimeout(() => {
        stage.classList.remove('smvc-shake');
        reelEls.current.forEach(r => r?.classList.remove('smvc-hit'));
      }, 1200);

      setTimeout(() => {
        stage.classList.remove('smvc-rushmode');
        if (bw) bw.className = 'smvc-bigwin';
        const marquee2 = marqueeEl.current;
        if (marquee2) marquee2.classList.remove('smvc-win');
        const txt2 = marqueeTxt.current;
        if (txt2) txt2.textContent = MARQUEE_DEFAULT;
      }, 3400);
    }
  }, [coinBurst]);

  const stopReels = useCallback((isJackpot: boolean, outcome: ReelOutcome | null, onDone: () => void) => {
    cancelAnimationFrame(rafId.current);
    const myGen = ++animGen.current; // 讓舊的 stopReels RAF 在下一 frame 自動停止
    const rh = rowH.current;
    const nrh = N * rh;
    const cycle = REP * nrh;

    // Compute targets: jackpot=777；退幣依返還種類演出對應組合
    const targets: number[] = (() => {
      if (isJackpot) return [SEVEN, SEVEN, SEVEN];
      const pickNon7 = () => 1 + Math.floor(Math.random() * (N - 1));
      switch (outcome) {
        case 'triple': {          // 神域共鳴：三個一樣（非7）
          const s = pickNon7();
          return [s, s, s];
        }
        case 'pair7': {           // 命運之瞳：雙7聽牌，第三個非7
          return [SEVEN, SEVEN, pickNon7()];
        }
        case 'pair': {            // 緋色幸運：兩個一樣（非7），位置隨機
          const s = pickNon7();
          let x; do { x = pickNon7(); } while (x === s);
          const arr = [[s, s, x], [s, x, s], [x, s, s]];
          return arr[Math.floor(Math.random() * 3)];
        }
        default: {                // 黃金序章／fallback：三個都不同
          const t: number[] = [];
          while (t.length < 3) {
            const v = Math.floor(Math.random() * N);
            if (!t.includes(v)) t.push(v);
          }
          return t;
        }
      }
    })();

    // Listening mode: both first reels show 7 (near-miss or jackpot)
    const reach = targets[0] === SEVEN && targets[1] === SEVEN;
    const DURS = targets.map((_, i) => 1400 + i * 650 + (reach && i === 2 ? 1500 : 0));
    const ease = (t: number) => 1 - Math.pow(1 - t, 4);
    const starts = [...offsets.current];
    const t0 = performance.now();
    const settled = [false, false, false];
    let lastTick = 0;

    function frame(now: number) {
      if (animGen.current !== myGen) return; // 被新動畫取代，立即停止
      const el = now - t0;
      // 轉動音效（同 v16）
      if (el - lastTick > 90) { lastTick = el; sBeep(90 + Math.random() * 40, 0.03, 'sawtooth', 0.05); }
      let allDone = true;

      for (let i = 0; i < 3; i++) {
        const p = Math.min(el / DURS[i], 1);
        const strip = stripEls.current[i];
        const reel = reelEls.current[i];
        const endAt = ((targets[i] * rh) % nrh + nrh) % nrh;
        const loops = 3 + i + (reach && i === 2 ? 2 : 0);
        const dist = loops * cycle + ((endAt - (starts[i] % cycle)) + cycle) % cycle;
        const pos = starts[i] + dist * ease(p);
        offsets.current[i] = pos % cycle;
        if (strip) strip.style.transform = `translateY(${stripY(pos, rh)}px)`;
        if (p > 0.65) reel?.classList.remove('smvc-blur');
        if (p < 1) { allDone = false; }
        else if (!settled[i]) {
          settled[i] = true;
          sClack();
          // Stamp: left-consecutive 7s only
          const chain = targets[i] === SEVEN && targets.slice(0, i).every(t => t === SEVEN);
          if (chain) {
            const lvl = i + 1;
            stampFx(i, lvl);
            if (lvl === 2 && reach) {
              // Heartbeat during 3rd reel suspense
              for (let k = 0; k < 6; k++) {
                sBeep(58, 0.09, 'sine', 0.32, 0.4 + k * 0.42);
                sBeep(52, 0.07, 'sine', 0.22, 0.54 + k * 0.42);
              }
            }
          }
        }
      }

      if (!allDone) {
        rafId.current = requestAnimationFrame(frame);
      } else {
        reelEls.current.forEach(r => r?.classList.remove('smvc-blur'));
        onDone();
      }
    }
    rafId.current = requestAnimationFrame(frame);
  }, [stampFx, stripY]);

  // Main spinState effect — 照 v16：spinning 只做 UI 準備，stopping 才跑 stopReels
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    if (spinState === 'spinning') {
      // UI 準備：lever pull + blur + 等速滾動。等 API 返回後 stopping 才做 ease-out 定位
      stage.classList.add('smvc-spinning');
      stage.classList.remove('smvc-rushmode');
      if (bigwinEl.current) bigwinEl.current.className = 'smvc-bigwin';
      if (mqTimerRef.current) clearTimeout(mqTimerRef.current);
      if (marqueeEl.current) marqueeEl.current.classList.remove('smvc-win', 'smvc-mq-static');
      if (marqueeTxt.current) marqueeTxt.current.textContent = '★ GOOD LUCK !! ★ RUSH CHANCE ★';
      reelEls.current.forEach(r => r?.classList.add('smvc-blur'));
      leverPull();
      // 等速滾動：拉桿一拉滾輪立即轉起來，stopping 的 stopReels 會接手（++animGen 停掉此迴圈）
      {
        const myGen = ++animGen.current;
        const spinFrame = () => {
          if (animGen.current !== myGen) return;
          const rh = rowH.current || 80, nrh = N * rh, cycle = REP * nrh;
          for (let i = 0; i < 3; i++) {
            offsets.current[i] = (offsets.current[i] + rh * 0.38) % cycle;
            const strip = stripEls.current[i];
            if (strip) strip.style.transform = `translateY(${stripY(offsets.current[i], rh)}px)`;
          }
          rafId.current = requestAnimationFrame(spinFrame);
        };
        rafId.current = requestAnimationFrame(spinFrame);
      }
    } else if (spinState === 'stopping') {
      // API 返回，開始 ease-out 動畫（同 v16 的 spin()）
      // 捕捉 jackpot / outcome 值，避免 ref 在動畫期間被覆蓋
      const jp = jackpotRef.current;
      const oc = outcomeRef.current;
      stopReels(jp, oc, () => {
        finish(jp);
        onAnimDone?.();
      });
    } else if (spinState === 'idle' && prevSpin.current === 'spinning') {
      // 錯誤路徑：API 失敗，直接清理不跑動畫
      animGen.current++;
      cancelAnimationFrame(rafId.current);
      reelEls.current.forEach(r => r?.classList.remove('smvc-blur'));
      stage.classList.remove('smvc-spinning');
    }

    prevSpin.current = spinState;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinState]);

  // Auto button highlight
  useEffect(() => {
    const btn = stageRef.current?.querySelector('.smvc-btn-auto');
    btn?.classList.toggle('smvc-on', isAuto);
  }, [isAuto]);

  // LED scoreboard — 常駐顯示（RUSH 燈牌亮起時被其覆蓋）；數字綠色、文字白色
  useEffect(() => {
    const sb = scoreboardEl.current;
    if (!sb) return;
    sb.innerHTML = `累計 <b>${totalSpins}</b>次 ★ RUSH <b>${winCount}</b>次`;
  }, [winCount, totalSpins]);

  const floorPct = Math.min((spinsThisTier / Math.max(floorSpinCount, 1)) * 100, 100);

  return (
    <div style={{ background: '#000' }}>
      <div
        ref={stageRef}
        className="smvc-stage"
        style={{
          '--smvc-sprite': `url(${spriteUrl ?? DEFAULT_SPRITE})`,
          ...(() => {
            // 主題版位覆蓋 → CSS 變數（未設定的用 CSS 預設值）
            const v: Record<string, string> = {};
            const L = machineLayout ?? {};
            const box = (b: LayoutBox | undefined, p: string) => {
              if (!b) return;
              if (b.l != null) v[`--${p}-l`] = b.l + '%';
              if (b.t != null) v[`--${p}-t`] = b.t + '%';
              if (b.w != null) v[`--${p}-w`] = b.w + '%';
              if (b.h != null) v[`--${p}-h`] = b.h + '%';
            };
            box(L.marquee, 'mq'); box(L.scoreboard, 'sb');
            box(L.autoBtn, 'ba'); box(L.spinBtn, 'bs'); box(L.rushBtn, 'br');
            box(L.wallet, 'wl');
            if (L.reels) {
              if (L.reels.t != null) v['--r-t'] = L.reels.t + '%';
              if (L.reels.h != null) v['--r-h'] = L.reels.h + '%';
              (L.reels.cols ?? []).forEach((c, i) => {
                if (i > 2) return;
                if (c.l != null) v[`--r${i}-l`] = c.l + '%';
                if (c.w != null) v[`--r${i}-w`] = c.w + '%';
              });
            }
            return v;
          })(),
        } as React.CSSProperties}
      >
        {/* Machine layers */}
        <div className="smvc-machine smvc-layer" />
        <div className="smvc-mrush smvc-layer" />

        {/* Lit zones */}
        <div className="smvc-lit smvc-lit-star  smvc-layer" />
        <div className="smvc-lit smvc-lit-ribbon smvc-layer" />
        <div className="smvc-lit smvc-lit-bulbs  smvc-layer" />
        <div className="smvc-lit smvc-lit-mframe smvc-layer" />
        <div className="smvc-lit smvc-lit-barL   smvc-layer" />
        <div className="smvc-lit smvc-lit-barR   smvc-layer" />
        <div className="smvc-lit smvc-lit-reelfr smvc-layer" />
        <div className="smvc-lit smvc-lit-deck   smvc-layer" />

        {/* Scoreboard (behind rush sign) */}
        <div ref={scoreboardEl} className="smvc-scoreboard" />

        {/* RUSH sign */}
        <div className="smvc-rushsign smvc-layer" />

        {/* 跑馬燈泡（頂弧 + 大当り看板環） */}
        {MARQUEE_BULBS.map((b, i) => (
          <i key={i} className={`smvc-bulb${i < 13 ? ' smvc-bulb-arc' : ''}`}
            style={{ left: `${b.x}%`, top: `${b.y}%`, '--ph': b.ph } as React.CSSProperties} />
        ))}

        {/* 總餘額板 */}
        <div className="smvc-wallet">
          <span>{(balance ?? 0).toLocaleString()}</span>
          <i>G</i>
        </div>

        {/* Marquee */}
        <div className="smvc-marquee" ref={marqueeEl}>
          <div className="smvc-marquee-txt" ref={marqueeTxt}>{MARQUEE_DEFAULT}</div>
        </div>

        {/* Reels */}
        {([0, 1, 2] as const).map(i => (
          <div key={i} className={`smvc-reel smvc-r${i}`} ref={el => { reelEls.current[i] = el; }}>
            <div className="smvc-strip" ref={el => { stripEls.current[i] = el; }} />
            <div className="smvc-shade" />
          </div>
        ))}

        {/* Flash */}
        <div ref={flashEl} className="smvc-flash" />

        {/* Lever */}
        <div className="smvc-lever-hit" onClick={onSpin} />
        <div className="smvc-lever">
          {([0, 1, 2, 3] as const).map(i => (
            <div key={i} className={`smvc-lf smvc-lf${i + 1}${i === 0 ? ' smvc-show' : ''}`}
              ref={el => { leverEls.current[i] = el; }} />
          ))}
        </div>

        {/* Buttons */}
        <div className="smvc-btn smvc-btn-auto" onClick={onAutoToggle}>自動</div>
        <div className="smvc-btn smvc-btn-spin" onClick={onSpin}>
          <span className="smvc-btn-amt">{betCoins.toLocaleString()}G</span>
          SPIN
        </div>
        <div className={`smvc-btn smvc-btn-rush${isRushActive ? ' smvc-btn-off' : ''}`} onClick={onDirect}>
          <span className="smvc-btn-amt">{directCost.toLocaleString()}G</span>
          直擊
        </div>

        {/* 音效開關 */}

        {/* Bigwin text */}
        <div ref={bigwinEl} className="smvc-bigwin"><span>大当り!!</span></div>

        {/* RUSH remaining: removed — shown in LED scoreboard / marquee area */}

        {/* Floor progress bar */}
        {!isRushActive && (
          <div style={{
            position: 'absolute', bottom: '21.5%', left: '20%', width: '60%',
            zIndex: 8, pointerEvents: 'none',
          }}>
            <div style={{ height: '1.2cqw', background: 'rgba(255,255,255,.12)', borderRadius: '1cqw', overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${floorPct}%`, borderRadius: '1cqw',
                background: 'linear-gradient(90deg,#ff5500,#ffd84d)',
                transition: 'width .3s',
              }} />
            </div>
            <div style={{ textAlign: 'center', fontSize: '2cqw', color: 'rgba(255,255,255,.35)', marginTop: '.4cqw' }}>
              {spinsThisTier}/{floorSpinCount}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
