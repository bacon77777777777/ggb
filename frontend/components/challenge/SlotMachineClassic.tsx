'use client';

import { useRef, useEffect, useCallback } from 'react';

type SpinState = 'idle' | 'spinning' | 'stopping' | 'video' | 'result';

export interface SlotMachineClassicProps {
  spinState: SpinState;
  isRushActive: boolean;
  rushHitsRemaining: number;
  isAuto: boolean;
  spinsThisTier: number;
  floorSpinCount: number;
  jackpot: boolean;
  rushStreak: number;
  winCount: number;
  totalSpins: number;
  onSpin: () => void;
  onDirect: () => void;
  onAutoToggle: () => void;
  onAnimDone?: () => void;
}

// ── Audio (module-level singleton) ──────────────────────────────────────────

let _ac: AudioContext | null = null;
function getAC(): AudioContext {
  if (!_ac) {
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    _ac = new ((W.AudioContext || W.webkitAudioContext)!)();
  }
  return _ac;
}

function sBeep(f: number, dur = 0.09, type: OscillatorType = 'square', vol = 0.12, when = 0) {
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

const SYMS = [
  { t: '７',  cls: 'smvc-s7'   },
  { t: '虎',  cls: 'smvc-sHu'  },
  { t: '賞',  cls: 'smvc-sSho' },
  { t: 'BAR', cls: 'smvc-sBar' },
  { t: '⚡',  cls: 'smvc-sBolt'},
  { t: '★',  cls: 'smvc-sStar' },
];
const N = SYMS.length, REP = 5, SEVEN = 0;
const MARQUEE_DEFAULT = '★ GGB RUSH ★ 押忍!! ★ 拉下拉桿試試手氣 ★ GOOD LUCK ★';
const CNNUM = '一二三四五六七八九十';
const cn = (n: number) => n <= 10 ? CNNUM[n - 1] : n.toString();

// ── CSS ──────────────────────────────────────────────────────────────────────

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
.smvc-machine {
  inset:0;
  background:url('/images/slot/machine/main.png') center/100% 100% no-repeat;
}
.smvc-mrush {
  inset:0; z-index:1;
  background:url('/images/slot/machine/main_rush.png') center/100% 100% no-repeat;
  opacity:0;
}
.smvc-stage.smvc-rushskin .smvc-mrush { opacity:1; }

/* ── 發光層 ── */
.smvc-lit {
  position:absolute; inset:0; pointer-events:none; z-index:4;
  background:url('/images/slot/machine/main.png') center/100% 100% no-repeat;
  mix-blend-mode:screen;
  filter:brightness(2.1) saturate(1.75) blur(2.5px);
  opacity:0;
}
.smvc-stage.smvc-rushskin .smvc-lit { background-image:url('/images/slot/machine/main_rush.png'); }
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
  position:absolute; left:27.07%; top:27.15%; width:45.87%; height:8.8%; z-index:5;
  background:url('/images/slot/machine/light_rush.png') center/100% 100% no-repeat;
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

/* ── Marquee ── */
.smvc-marquee {
  position:absolute; left:24.93%; top:14.59%; width:50%; height:7.83%;
  overflow:hidden; border-radius:1cqw; display:flex; align-items:center; z-index:5;
}
.smvc-marquee-txt {
  white-space:nowrap; font-weight:900; letter-spacing:.35cqw;
  font-size:3.6cqw; color:#ffb51e;
  text-shadow:0 0 .8cqw #ff8c00,0 0 2.4cqw rgba(255,120,0,.9);
  animation:smvc-ticker 9s linear infinite;
}
@keyframes smvc-ticker { from{transform:translateX(100%);} to{transform:translateX(-100%);} }
.smvc-marquee.smvc-win .smvc-marquee-txt {
  animation:smvc-strobeTxt .22s steps(2) infinite;
  font-size:4.4cqw; margin:auto; transform:none;
  color:#fff35e; text-shadow:0 0 1cqw #ff2a00,0 0 3cqw #ffb300;
}
@keyframes smvc-strobeTxt { 0%{opacity:1;} 50%{opacity:.15;} }
.smvc-marquee.smvc-score .smvc-marquee-txt {
  animation:none; margin:auto; transform:none;
  font-size:3.4cqw; color:#4dff91; letter-spacing:.25cqw;
  text-shadow:0 0 .6cqw #00cc55,0 0 2cqw rgba(0,180,60,.8);
}
.smvc-marquee::after {
  content:""; position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(rgba(0,0,0,.55) 28%,transparent 32%);
  background-size:.9cqw .9cqw;
}

/* ── Reels ── */
.smvc-reel { position:absolute; overflow:hidden; z-index:3; }
.smvc-r0 { left:22.00%; top:40.77%; width:17.07%; height:15.88%; }
.smvc-r1 { left:42.40%; top:40.77%; width:16.13%; height:15.88%; }
.smvc-r2 { left:61.73%; top:40.77%; width:16.27%; height:15.88%; }
.smvc-strip { position:absolute; left:0; width:100%; will-change:transform; }
.smvc-cell {
  height:var(--smvc-rowH,80px);
  display:flex; align-items:center; justify-content:center;
  font-weight:900; font-size:9.5cqw;
  font-family:Impact,"Arial Black","Microsoft JhengHei",sans-serif;
}
.smvc-s7   { color:#e03014; text-shadow:.3cqw .3cqw 0 #7a0d00; }
.smvc-sHu  { color:#ff9500; text-shadow:.3cqw .3cqw 0 #6b3c00; }
.smvc-sSho { color:#d4a017; text-shadow:.3cqw .3cqw 0 #5e4506; }
.smvc-sBar { color:#1c1c1c; font-size:7cqw; letter-spacing:.2cqw; text-shadow:.2cqw .2cqw 0 #999; }
.smvc-sBolt{ color:#f5c400; text-shadow:0 0 1.2cqw #ff9d00; }
.smvc-sStar{ color:#b03df0; text-shadow:.3cqw .3cqw 0 #4d0f73; }
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
.smvc-stx {
  font-family:Impact,"Arial Black","Microsoft JhengHei",sans-serif;
  font-weight:900; font-size:9.5cqw; color:#e03014;
  text-shadow:.3cqw .3cqw 0 #7a0d00,0 0 2cqw rgba(255,80,30,.9);
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
.smvc-lf { position:absolute; left:0; top:0; height:100%; background:center/100% 100% no-repeat; opacity:0; }
.smvc-lf.smvc-show { opacity:1; }
.smvc-lf1 { width:9.20cqw; background-image:url('/images/slot/machine/1.png'); }
.smvc-lf2 { width:9.73cqw; background-image:url('/images/slot/machine/2.png'); }
.smvc-lf3 { width:9.87cqw; background-image:url('/images/slot/machine/3.png'); }
.smvc-lf4 { width:9.33cqw; background-image:url('/images/slot/machine/4.png'); }

/* ── Buttons ── */
.smvc-btn { position:absolute; z-index:7; cursor:pointer; background:center/100% 100% no-repeat; }
.smvc-btn-auto { left:21.87%; top:61.48%; width:17.33%; height:8.58%;  background-image:url('/images/slot/machine/auto.png'); }
.smvc-btn-spin { left:39.20%; top:62.34%; width:23.73%; height:11.16%; background-image:url('/images/slot/machine/spin.png');
  animation:smvc-invite 1.8s ease-in-out infinite; }
.smvc-btn-rush { left:62.93%; top:61.48%; width:17.33%; height:8.58%;  background-image:url('/images/slot/machine/rush.png'); }
@keyframes smvc-invite {
  0%,100%{filter:drop-shadow(0 0 .2cqw rgba(255,220,120,.3));}
  50%    {filter:drop-shadow(0 0 1.6cqw rgba(255,220,120,.95)) brightness(1.12);}
}
.smvc-btn:hover  { filter:brightness(1.15) drop-shadow(0 0 1cqw rgba(255,230,150,.8)); }
.smvc-btn:active { transform:translateY(3%) scale(.97); filter:brightness(.92); }
.smvc-stage.smvc-spinning .smvc-btn,
.smvc-stage.smvc-spinning .smvc-lever-hit { pointer-events:none; }
.smvc-stage.smvc-spinning .smvc-btn { filter:saturate(.6) brightness(.85); animation:none; }
.smvc-btn-auto.smvc-on { animation:smvc-autopulse .9s infinite; }
@keyframes smvc-autopulse { 50%{filter:brightness(1.5) drop-shadow(0 0 1.4cqw #ffd84d);} }

/* ── Bigwin ── */
.smvc-bigwin { position:absolute; inset:0; display:none; align-items:center; justify-content:center; pointer-events:none; z-index:9; }
.smvc-bigwin.smvc-show { display:flex; }
.smvc-bigwin span {
  font-family:Impact,"Arial Black","Microsoft JhengHei",sans-serif;
  font-size:15cqw; font-weight:900; letter-spacing:1cqw; white-space:nowrap;
  background:linear-gradient(#fff8c2,#ffd400 40%,#ff7a00 70%,#ffd400);
  -webkit-background-clip:text; background-clip:text; color:transparent;
  -webkit-text-stroke:.55cqw rgba(200,80,0,.75); paint-order:stroke fill;
  filter:drop-shadow(0 0 1.5cqw #ff3c00) drop-shadow(.5cqw .8cqw 0 rgba(80,20,0,.9));
  animation:smvc-winpop .5s cubic-bezier(.2,2.4,.4,1) both,smvc-winstrobe .16s steps(2) .5s infinite;
}
.smvc-bigwin.smvc-lv2 span {
  font-size:16.5cqw;
  background-image:linear-gradient(#ffe9a8,#ff9d00 35%,#ff3d00 75%,#ff9d00);
  filter:drop-shadow(0 0 1.8cqw #ff5500) drop-shadow(.5cqw .8cqw 0 rgba(90,15,0,.9));
  animation:smvc-winpop .45s cubic-bezier(.2,2.4,.4,1) both,smvc-winstrobe .13s steps(2) .45s infinite;
}
.smvc-bigwin.smvc-lv3 span {
  font-size:18cqw;
  background-image:linear-gradient(#ffd0d8,#ff3d6e 40%,#d4006a 75%,#ff3d6e);
  filter:drop-shadow(0 0 2.2cqw #ff0055) drop-shadow(.5cqw .8cqw 0 rgba(80,0,40,.9));
  animation:smvc-winpop .4s cubic-bezier(.2,2.6,.4,1) both,smvc-winstrobe .11s steps(2) .4s infinite;
}
.smvc-bigwin.smvc-lv4 span {
  font-size:19cqw;
  background-image:linear-gradient(#e9c8ff,#b44dff 40%,#6a00e8 75%,#b44dff);
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
  spinState, isRushActive, rushHitsRemaining, isAuto,
  spinsThisTier, floorSpinCount, jackpot, rushStreak,
  winCount, totalSpins,
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

  const offsets       = useRef([0, 0, 0]);
  const rowH          = useRef(80);
  const rafId         = useRef(0);
  const prevSpin      = useRef<SpinState>('idle');
  const jackpotRef    = useRef(false);
  const rushStreakRef  = useRef(0);
  const animGen       = useRef(0);     // generation counter: 每次新動畫遞增，讓舊 stopReels RAF 自動停止

  // Keep refs in sync — declared before spinState effect so ordering is guaranteed
  useEffect(() => { jackpotRef.current = jackpot; }, [jackpot]);
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
        for (const s of SYMS)
          html += `<div class="smvc-cell ${s.cls}">${s.t}</div>`;
      strip.innerHTML = html;
    });
    sync();
    // Randomize initial reel positions (avoid 777 on load)
    {
      const h = rowH.current || 80;
      let t: number[];
      do { t = [0, 1, 2].map(() => Math.floor(Math.random() * N)); }
      while (t[0] === SEVEN && t[1] === SEVEN && t[2] === SEVEN);
      offsets.current = t.map(s => s * h);
      stripEls.current.forEach((el, i) => {
        if (el) el.style.transform = `translateY(${-(offsets.current[i] % (N * h))}px)`;
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

  // Keep rush skin in sync — but NOT during spinning/stopping (finish() handles that timing)
  useEffect(() => {
    if (!stageRef.current) return;
    if (isRushActive && spinState !== 'spinning' && spinState !== 'stopping') {
      stageRef.current.classList.add('smvc-rushskin');
    }
  }, [isRushActive, spinState]);

  const sync = useCallback(() => {
    const h = reelEls.current[0]?.clientHeight ?? 80;
    rowH.current = h;
    stageRef.current?.style.setProperty('--smvc-rowH', h + 'px');
    stripEls.current.forEach((s, i) => {
      if (s) s.style.transform = `translateY(${-(offsets.current[i] % (N * h))}px)`;
    });
  }, []);

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
    st.innerHTML = '<span class="smvc-stx">７</span>';
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
      let vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp - 32, x = 0, y = 0, life = 0;
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
      const txt = marqueeTxt.current;
      if (txt) txt.textContent = '★ 押忍！再挑戰一次 ★ GGB RUSH ★';
    } else {
      const streak = rushStreakRef.current;
      stage.classList.add('smvc-rushmode', 'smvc-shake', 'smvc-rushskin');

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

  const stopReels = useCallback((isJackpot: boolean, onDone: () => void) => {
    cancelAnimationFrame(rafId.current);
    const myGen = ++animGen.current; // 讓舊的 stopReels RAF 在下一 frame 自動停止
    const rh = rowH.current;
    const nrh = N * rh;
    const cycle = REP * nrh;

    // Compute targets: jackpot=777, else random avoiding all-7s
    const targets: number[] = isJackpot
      ? [SEVEN, SEVEN, SEVEN]
      : (() => {
          let t: number[];
          do { t = [0, 1, 2].map(() => Math.floor(Math.random() * N)); }
          while (t[0] === SEVEN && t[1] === SEVEN && t[2] === SEVEN);
          return t;
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
        if (strip) strip.style.transform = `translateY(${-(pos % nrh)}px)`;
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
  }, [stampFx]);

  // Main spinState effect — 照 v16：spinning 只做 UI 準備，stopping 才跑 stopReels
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    if (spinState === 'spinning') {
      // UI 準備：lever pull + blur。不做 JS reel 動畫，等 API 返回後 stopping 才開始
      stage.classList.add('smvc-spinning');
      stage.classList.remove('smvc-rushmode');
      // 非 RUSH 轉時移除 rush skin，避免 RUSH 結束後 skin 殘留到下一轉
      if (!isRushActive) stage.classList.remove('smvc-rushskin');
      if (bigwinEl.current) bigwinEl.current.className = 'smvc-bigwin';
      if (marqueeEl.current) marqueeEl.current.classList.remove('smvc-win', 'smvc-score');
      if (marqueeTxt.current) marqueeTxt.current.textContent = '★ GOOD LUCK !! ★ RUSH CHANCE ★';
      reelEls.current.forEach(r => r?.classList.add('smvc-blur'));
      leverPull();
    } else if (spinState === 'stopping') {
      // API 返回，開始 ease-out 動畫（同 v16 的 spin()）
      // animGen++ in stopReels cancels any previous RAF loop automatically
      stopReels(jackpotRef.current, () => {
        finish(jackpotRef.current);
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

  // LED scoreboard in idle non-rush state
  useEffect(() => {
    const marquee = marqueeEl.current;
    const txt = marqueeTxt.current;
    if (!marquee || !txt) return;
    if (spinState === 'idle' && !isRushActive) {
      marquee.classList.add('smvc-score');
      txt.textContent = `累計 ${totalSpins}次  ★  RUSH ${winCount}次`;
    } else {
      marquee.classList.remove('smvc-score');
    }
  }, [spinState, isRushActive, winCount, totalSpins]);

  const floorPct = Math.min((spinsThisTier / Math.max(floorSpinCount, 1)) * 100, 100);

  return (
    <div style={{ background: '#000' }}>
      <div ref={stageRef} className="smvc-stage">
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

        {/* RUSH sign */}
        <div className="smvc-rushsign smvc-layer" />

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
        <div className="smvc-btn smvc-btn-auto" onClick={onAutoToggle} />
        <div className="smvc-btn smvc-btn-spin" onClick={onSpin} />
        <div className="smvc-btn smvc-btn-rush" onClick={onDirect} />

        {/* Bigwin text */}
        <div ref={bigwinEl} className="smvc-bigwin"><span>大当り!!</span></div>

        {/* RUSH remaining overlay — only show when reels have settled */}
        {isRushActive && spinState !== 'spinning' && spinState !== 'stopping' && (
          <div style={{
            position: 'absolute', bottom: '22%', left: '50%', transform: 'translateX(-50%)',
            zIndex: 8, pointerEvents: 'none', whiteSpace: 'nowrap',
            color: '#ffd84d', fontWeight: 900, fontSize: '3.2cqw',
            textShadow: '0 0 1cqw rgba(255,100,0,.9)',
          }}>
            ⚡ RUSH 剩餘 ×{rushHitsRemaining}
          </div>
        )}

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
