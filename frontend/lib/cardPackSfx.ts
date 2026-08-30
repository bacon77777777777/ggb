/**
 * 抽卡「蓄力開包」音效引擎（單抽）
 *
 * 全套 WebAudio 合成，不載任何音檔。老闆 2026-08-30 指定：
 * 單抽不鋪醞釀 loop（只有 700ms，loop 來不及成形，還要多載 451KB 的 mp3）、
 * 三級稀有度自己合成成同一個音色家族、撕開要「更脆亮、專屬單抽的版本」。
 *
 * ── 這台原本一個音效都沒有，只有觸覺
 * 蓄力那段程式碼已經有一份現成的節奏骨架：
 *   HAPTIC_STOPS = [0.2, 0.38, 0.52, 0.64, 0.74, 0.82, 0.89, 0.95]
 * 間距刻意由疏到密。聲音掛在**同一組節點**上，手感與聽感就完全同步 ——
 * 這是這個模組最容易做出質感的地方，也不用另外對時間軸。
 *
 * ── 音色語法：電子蓄力 → 物理撕裂 → 電子揭曉
 * 抽卡演出的標準三段對比。撕開用的是**塑膠膜／鋁箔**的質感：比一番賞那張紙
 * 更高頻、更脆、帶靜電感 —— 兩個模組要聽得出材質不同（一番賞見 lib/tearSfx）。
 *
 * ── AudioContext 跟轉蛋機／盒玩／一番賞共用（machineSfx.getMachineAudio）
 * 手機上同時開多個 context 常常有一個發不出聲。
 */

import { initMachineAudio, getMachineAudio } from './machineSfx';

type Nodes = {
  ctx: AudioContext;
  bus: GainNode;
  /** 背景音樂 */
  musicG: GainNode;
  /** 連抽才鋪的醞釀底 */
  hypeG: GainNode;
};

let C: Nodes | null = null;
/** 蓄力中的持續音源。放開或蓄滿就收掉 */
let charge: { osc: OscillatorNode; sub: OscillatorNode; noise: AudioBufferSourceNode; lp: BiquadFilterNode; g: GainNode } | null = null;
let hypeTimer: ReturnType<typeof setInterval> | null = null;

function noiseBuffer(ctx: AudioContext, dur: number) {
  const b = ctx.createBuffer(1, Math.max(1, (ctx.sampleRate * dur) | 0), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** 建立節點。可重複呼叫；共用的 context 被別台關掉時整組重建 */
export function initCardPackAudio() {
  if (typeof window === 'undefined') return;
  initMachineAudio();
  const base = getMachineAudio();
  if (!base) return;
  if (C && C.ctx === base.ctx) {
    if (base.ctx.state === 'suspended') void base.ctx.resume();
    return;
  }
  const { ctx, master } = base;
  const bus = ctx.createGain(); bus.gain.value = 1; bus.connect(master);
  // 屏息底噪已移除（老闆 2026-08-30 指定），改成有背景音樂
  const musicG = ctx.createGain(); musicG.gain.value = 0.0001; musicG.connect(bus);
  const hypeG = ctx.createGain(); hypeG.gain.value = 0; hypeG.connect(bus);

  C = { ctx, bus, musicG, hypeG };
  musicStart();
  if (ctx.state === 'suspended') void ctx.resume();
}

export function disposeCardPackAudio() {
  stopCharge();
  setPackHype(false);
  stopPackMusic();
}

/* ── 基礎工具 ─────────────────────────────────────────────────────────── */

function env(dur: number, peak: number, t0?: number): GainNode | null {
  if (!C) return null;
  const c = C.ctx, t = t0 ?? c.currentTime;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(C.bus);
  return g;
}

function noiseHit(dur: number, peak: number, f0: number, f1: number, q: number, type: BiquadFilterType = 'bandpass', t0?: number) {
  if (!C) return;
  const c = C.ctx, t = t0 ?? c.currentTime;
  const s = c.createBufferSource(); s.buffer = noiseBuffer(c, dur + 0.02);
  const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(f1, 40), t + dur);
  const e = env(dur, peak, t); if (!e) return;
  s.connect(f); f.connect(e);
  s.start(t); s.stop(t + dur + 0.05);
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, peak: number, t0?: number) {
  if (!C) return;
  const c = C.ctx, t = t0 ?? c.currentTime;
  const o = c.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
  const e = env(dur, peak, t); if (!e) return;
  o.connect(e); o.start(t); o.stop(t + dur + 0.05);
}

/* ── 蓄力 ─────────────────────────────────────────────────────────────── */

/** 捏住卡包：塑膠膜的細碎聲（比紙脆、更高頻） */
export function sfxPackGrab() {
  if (!C) return;
  const t = C.ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    noiseHit(0.04, 0.05, 4200 + Math.random() * 2600, 1800, 3.0, 'bandpass', t + i * 0.03);
  }
}

/**
 * 蓄力主體：一條**持續**的音源，音高與濾波跟著 charge% 走。
 * 用持續音而不是一串 one-shot —— 這樣才真的是「能量在累積」，
 * 而且放開的瞬間可以往下滑掉（洩氣），one-shot 做不到。
 */
export function startCharge() {
  if (!C) return;
  stopCharge();
  const c = C.ctx, t = c.currentTime;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.02, t + 0.06);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(320, t); lp.Q.value = 6;
  lp.connect(g); g.connect(C.bus);
  const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.setValueAtTime(90, t);
  const og = c.createGain(); og.gain.value = 0.5; osc.connect(og); og.connect(lp);
  const sub = c.createOscillator(); sub.type = 'sine'; sub.frequency.setValueAtTime(45, t);
  const sg = c.createGain(); sg.gain.value = 0.7; sub.connect(sg); sg.connect(lp);
  const noise = c.createBufferSource(); noise.buffer = noiseBuffer(c, 2); noise.loop = true;
  const ng = c.createGain(); ng.gain.value = 0.25; noise.connect(ng); ng.connect(lp);
  osc.start(t); sub.start(t); noise.start(t);
  charge = { osc, sub, noise, lp, g };
}

/** 每幀呼叫，p = 0~1。臨界之後加一點顫抖，快滿的感覺才出得來 */
export function updateCharge(p: number) {
  if (!C || !charge) return;
  const t = C.ctx.currentTime, k = Math.max(0, Math.min(1, p));
  const wobble = k > 0.9 ? 1 + Math.sin(t * 90) * 0.03 : 1;
  charge.osc.frequency.setTargetAtTime((90 + 430 * k * k) * wobble, t, 0.03);
  charge.sub.frequency.setTargetAtTime(45 + 40 * k, t, 0.05);
  charge.lp.frequency.setTargetAtTime(320 + 3800 * k * k, t, 0.04);
  charge.g.gain.setTargetAtTime(0.02 + 0.07 * k, t, 0.05);
}

function stopCharge() {
  if (!C || !charge) return;
  const { osc, sub, noise, g } = charge;
  const t = C.ctx.currentTime;
  g.gain.cancelScheduledValues(t);
  g.gain.setTargetAtTime(0.0001, t, 0.03);
  osc.stop(t + 0.25); sub.stop(t + 0.25); noise.stop(t + 0.25);
  charge = null;
}

/** 蓄滿：直接收掉，讓撕開接手（不留尾巴，尾巴會糊掉撕裂的瞬間） */
export function endChargeComplete() { stopCharge(); }

/** 沒蓄滿就放開：能量往下滑掉 */
export function endChargeCancel() {
  if (!C || !charge) { stopCharge(); return; }
  const t = C.ctx.currentTime;
  charge.osc.frequency.cancelScheduledValues(t);
  charge.osc.frequency.setTargetAtTime(60, t, 0.12);
  charge.lp.frequency.setTargetAtTime(200, t, 0.12);
  stopCharge();
  noiseHit(0.22, 0.05, 900, 260, 1.0);
}

/** 蓄力節點：對齊 HAPTIC_STOPS，音高一階一階往上 */
export function sfxChargeTick(index: number, total: number) {
  const k = total > 1 ? index / (total - 1) : 1;
  const f = 620 * Math.pow(2, k * 1.2);          // 一路升約一個八度
  tone('square', f, f * 1.06, 0.035, 0.045 + 0.03 * k);
  noiseHit(0.03, 0.035 + 0.03 * k, 3000 + 2000 * k, 1200, 3.2);
}

/* ── 撕開 ─────────────────────────────────────────────────────────────── */

/**
 * 撕開卡包：塑膠膜／鋁箔。
 * 比一番賞的紙聲更亮：主體用 highpass 的噪音掃頻，再疊一層「靜電」細碎，
 * 最後補一記中頻頓感當作膜被扯斷的實體感。
 */
export function sfxPackTear() {
  if (!C) return;
  const t = C.ctx.currentTime;
  noiseHit(0.26, 0.34, 8000, 2600, 0.8, 'highpass', t);
  noiseHit(0.20, 0.22, 5200, 1800, 1.1, 'bandpass', t + 0.02);
  // 靜電：十幾顆極短的隨機碎裂，塑膠膜特有的「嘶啦」
  for (let i = 0; i < 14; i++) {
    noiseHit(0.02, 0.05 + Math.random() * 0.05, 6000 + Math.random() * 5000, 3000, 4.0, 'bandpass', t + Math.random() * 0.24);
  }
  tone('triangle', 300, 150, 0.12, 0.09, t + 0.05);
}

/** 撕開瞬間的爆發：低頻衝擊 + 高頻亮片 */
export function sfxBurst() {
  if (!C) return;
  const t = C.ctx.currentTime;
  tone('sine', 130, 42, 0.34, 0.24, t);
  noiseHit(0.55, 0.14, 9000, 2200, 0.9, 'highpass', t + 0.02);
  for (let i = 0; i < 5; i++) {
    const f = 1800 + Math.random() * 2600;
    tone('triangle', f, f * 1.4, 0.28, 0.03, t + 0.04 + Math.random() * 0.2);
  }
}

/* ── 抽卡與揭曉 ───────────────────────────────────────────────────────── */

/** 卡片被滑走 */
export function sfxCardSlide() {
  noiseHit(0.18, 0.10, 1200, 4200, 1.0, 'bandpass');
}

/** 下一張落定 */
export function sfxCardLand() {
  noiseHit(0.05, 0.07, 2600, 900, 2.0);
  tone('sine', 220, 140, 0.08, 0.05);
}

export type CardTier = 'n' | 'r' | 'sr' | 'ssr';

/**
 * 稀有度揭曉。四段共用同一個音色家族（方波＋三角波的電子感，跟蓄力同源），
 * 差別在**長度、音數與亮片**：
 *   n   兩音輕 ding          r   三音上行
 *   sr  四音上行 + 低頻衝擊   ssr 六音號角 + 長亮片尾 + 次低頻
 */
export function sfxRevealTier(tier: CardTier) {
  if (!C) return;
  const t = C.ctx.currentTime;
  const seq = tier === 'ssr' ? [0, 4, 7, 12, 16, 19]
            : tier === 'sr'  ? [0, 4, 7, 12]
            : tier === 'r'   ? [0, 5, 9]
            : [0, 7];
  const base = tier === 'n' ? 784 : 523.25;
  const step = tier === 'n' ? 0.075 : 0.085;
  seq.forEach((semi, i) => {
    const f = base * Math.pow(2, semi / 12);
    tone('triangle', f, f, tier === 'n' ? 0.26 : 0.45, tier === 'n' ? 0.09 : 0.11, t + i * step);
    if (tier !== 'n') tone('square', f, f, 0.3, 0.035, t + i * step);
  });
  if (tier === 'sr' || tier === 'ssr') tone('sine', 120, 48, 0.4, 0.16, t);
  if (tier === 'ssr') {
    noiseHit(1.1, 0.09, 9000, 1600, 0.9, 'highpass', t + seq.length * step);
    tone('sine', 1568, 3136, 0.9, 0.045, t + seq.length * step + 0.05);
  } else if (tier === 'sr') {
    noiseHit(0.6, 0.07, 7000, 2000, 1.0, 'highpass', t + seq.length * step);
  }
}

/** 全部看完的收尾 */
export function sfxPackFinale() {
  if (!C) return;
  const t = C.ctx.currentTime;
  [12, 7, 0].forEach((semi, i) => {
    const f = 523.25 * Math.pow(2, semi / 12);
    tone('triangle', f, f, 0.4, 0.08, t + i * 0.1);
  });
}

/* ── 連抽才鋪的醞釀底 ─────────────────────────────────────────────────── */

/**
 * 多張時的醞釀底：低頻脈衝 + 微弱亮片，沒有旋律。
 * 單抽刻意不鋪（老闆 2026-08-30）—— 700ms 的演出鋪什麼都來不及成形。
 */
export function setPackHype(on: boolean) {
  if (!C) return;
  C.hypeG.gain.setTargetAtTime(on ? 0.5 : 0, C.ctx.currentTime, on ? 0.4 : 0.2);
  if (on && !hypeTimer) {
    const pulse = () => {
      if (!C) return;
      const t = C.ctx.currentTime;
      const o = C.ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(72, t);
      const g = C.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      o.connect(g); g.connect(C.hypeG);
      o.start(t); o.stop(t + 0.5);
    };
    pulse();
    hypeTimer = setInterval(pulse, 620);
  }
  if (!on && hypeTimer) { clearInterval(hypeTimer); hypeTimer = null; }
}

/* ── 背景音樂：電子驅動感（跟蓄力／揭曉同一個音色家族）────────────────────
 * Am → F → G → Em，100 BPM。低頻脈衝 + 方波琶音 + 一層軟墊，**沒有主旋律** ——
 * 這段演出很短，旋律只會跟蓄力聲搶。
 * 一樣用 lookahead 排程器（setInterval 掃描，提前把音符排進時間軸）：
 * 分頁切到背景時 rAF 會停，靠 rAF 排音樂會斷拍。
 */

const MUS = { timer: null as ReturnType<typeof setInterval> | null, next: 0, step: 0, volume: 0 };
const STEP_DUR = 0.30;                                  // 100 BPM 的八分音符
const CHORDS = [
  { bass: -12, notes: [9, 12, 16] },                    // Am
  { bass: -19, notes: [5, 9, 12] },                     // F
  { bass: -17, notes: [7, 11, 14] },                    // G
  { bass: -20, notes: [4, 7, 11] },                     // Em
];
const ARP = [0, 1, 2, 1, 0, 2, 1, 2];
const hzOf = (semi: number) => 261.63 * Math.pow(2, semi / 12);
let ducking = false;

function musNote(type: OscillatorType, f: number, t: number, dur: number, peak: number, lpHz: number) {
  if (!C) return;
  const c = C.ctx;
  const o = c.createOscillator(); o.type = type; o.frequency.value = f;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lpHz;
  o.connect(g); g.connect(lp); lp.connect(C.musicG);
  o.start(t); o.stop(t + dur + 0.05);
}

function musicSchedule() {
  if (!C) return;
  // 落後太多就跳過積欠，不然恢復瞬間會把幾百個音符同時放出來
  if (MUS.next < C.ctx.currentTime - 0.5) MUS.next = C.ctx.currentTime + 0.05;
  const horizon = C.ctx.currentTime + 0.35;
  while (MUS.next < horizon) {
    const t = MUS.next, st = MUS.step;
    const ch = CHORDS[Math.floor(st / 8) % CHORDS.length], k = st % 8;
    if (MUS.volume > 0.005) {
      if (k === 0 || k === 4) musNote('sine', hzOf(ch.bass), t, 0.5, 0.10, 260);          // 低頻脈衝
      if (k === 0) ch.notes.forEach(nn => musNote('triangle', hzOf(nn), t, STEP_DUR * 8, 0.020, 900));
      const f = hzOf(ch.notes[ARP[k]] + 12);                                              // 方波琶音
      musNote('square', f, t, 0.22, 0.028, 3600);
      musNote('triangle', f, t, 0.26, 0.032, 5200);
    }
    MUS.next += STEP_DUR;
    MUS.step = (MUS.step + 1) % (CHORDS.length * 8);
  }
}

function applyMusicLevel() {
  if (!C) return;
  C.musicG.gain.setTargetAtTime(MUS.volume * (ducking ? 0.25 : 1), C.ctx.currentTime, 0.3);
}

function musicStart() {
  if (!C || MUS.timer) return;
  MUS.next = C.ctx.currentTime + 0.15;
  MUS.step = 0;
  MUS.timer = setInterval(musicSchedule, 40);
  musicSchedule();
}

/**
 * 進開包畫面時開。init 是在使用者手勢裡才呼叫，所以這裡自己補一次。
 * 預設音量 0.4：原本 0.5，老闆 2026-08-30 說再小聲 20%。
 */
export function startPackMusic(volume = 0.4) {
  initCardPackAudio();
  if (!C) return;
  MUS.volume = volume;
  applyMusicLevel();
  musicStart();
}

export function stopPackMusic() {
  if (MUS.timer) { clearInterval(MUS.timer); MUS.timer = null; }
  MUS.volume = 0; MUS.next = 0; MUS.step = 0;
  ducking = false;
  if (C) C.musicG.gain.setTargetAtTime(0.0001, C.ctx.currentTime, 0.08);
}

/** 撕開與高稀有揭曉時把音樂壓低，讓演出出得來 */
export function setPackDucking(busy: boolean) {
  if (ducking === busy) return;
  ducking = busy;
  applyMusicLevel();
}
