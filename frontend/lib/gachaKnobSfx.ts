/**
 * 旋鈕轉蛋機音效引擎（mode2 / mode3 / mode5 共用）
 *
 * 全套 WebAudio 即時合成，沒有音檔。為什麼不繼續用 lib/sfx 播 mp3
 *（老闆 2026-08-30：「聲音都對不上、慢很多半拍，有時候沒放出來，也不自然」）：
 *
 *   1. **慢半拍** —— `<audio>.play()` 在手機（尤其 iOS WKWebView）有 50~300ms
 *      延遲，第一次播還要等解碼；WebAudio 的 source.start() 是下一個 buffer
 *      就出聲。轉蛋是「看到動作的同一瞬間要聽到聲音」，這個差距致命。
 *   2. **有時候沒放出來** —— lib/sfx 為了防疊音，同一個檔還在播就整個略過，
 *      而落蛋音檔長 1.12 秒，連抽時第二、三顆的聲音會被自己吃掉。
 *      這裡改成可重疊 + 每個音色各自的最小間隔節流。
 *   3. **不自然** —— 原本整台機器只有三個通用素材音，旋鈕轉動的 1.2 秒、
 *      蛋在艙裡滾動、掉進取物口全都是無聲的，只有頭尾各一聲。合成的好處是
 *      **參數可以吃物理狀態**：撞得越重越低沉越大聲，那是取樣做不到的。
 *
 * 音色風格（老闆定案）：真實機構 + 硬塑膠玩具。乾、短、少殘響；
 * 份量放在 150~400Hz（手機喇叭沒有超低頻），2~5kHz 收斂免得棘輪連發刺耳；
 * 除了中獎號角每個音都短於 400ms；重複的音色一律隨機微調音高，避免機關槍感。
 *
 * ── 常駐 loop
 *   待機嗡鳴（機台「活著」的底噪）／背景音樂（演出時 duck 到 42%）
 * ── 即時觸發
 *   投幣、旋鈕棘輪、旋鈕到底、出蛋閘門、蛋碰撞（吃力道）、蛋滾落、
 *   落地叩、取物口蓋板、取物提示 ding、UI blip、售罄 buzz
 *
 * 中獎號角沿用 lib/machineSfx 的 sfxFanfare —— 那是「恭喜獲得」彈窗共用的，
 * 全站同一顆，不在這裡另做一份。
 */

import { initMachineAudio, getMachineAudio } from './machineSfx';

type Nodes = {
  ctx: AudioContext;
  master: GainNode;
  noise: AudioBuffer;
  /** 待機嗡鳴 */
  ambG: GainNode;
  /** 背景音樂 */
  musicG: GainNode;
};

let K: Nodes | null = null;
let ducking = false;

const MUS = { timer: null as ReturnType<typeof setInterval> | null, next: 0, step: 0, volume: 0 };

/* ── 基礎工具 ─────────────────────────────────────────────────────────── */

/** 起音 6ms、之後指數衰減。所有一次性音色都掛在這個包絡上 */
function env(dur: number, peak: number, t0?: number): GainNode | null {
  if (!K) return null;
  const c = K.ctx, t = t0 ?? c.currentTime;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(K.master);
  return g;
}

/** 濾波過的噪音撞擊：機構聲的骨架（喀噠、撞擊、嘶聲都是它） */
function noiseHit(dur: number, peak: number, f0: number, f1: number, q: number, t0?: number) {
  if (!K) return;
  const c = K.ctx, t = t0 ?? c.currentTime;
  const s = c.createBufferSource(); s.buffer = K.noise;
  s.playbackRate.value = 0.75 + Math.random() * 0.5;
  const f = c.createBiquadFilter();
  f.type = q ? 'bandpass' : 'lowpass';
  if (q) f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(f1, 40), t + dur);
  const e = env(dur, peak, t);
  if (!e) return;
  s.connect(f); f.connect(e);
  s.start(t); s.stop(t + dur + 0.05);
}

/** 單一振盪器，可掃頻。塑膠的「叩」與金屬的「叮」都靠它給音高感 */
function tone(type: OscillatorType, f0: number, f1: number, dur: number, peak: number, t0?: number) {
  if (!K) return;
  const c = K.ctx, t = t0 ?? c.currentTime;
  const o = c.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
  const e = env(dur, peak, t);
  if (!e) return;
  o.connect(e); o.start(t); o.stop(t + dur + 0.05);
}

/** ±pct 的隨機音高偏移。同一個音色連放時避免「機關槍」 */
const jitter = (v: number, pct: number) => v * (1 + (Math.random() * 2 - 1) * pct);

/* ── 生命週期 ─────────────────────────────────────────────────────────── */

/**
 * 建立節點。可重複呼叫。
 *
 * context 跟盒玩販賣機共用（見 machineSfx.getMachineAudio 的說明）。
 * 盒玩那台離開頁面時會 close context，所以每次都要比對「現在這顆 ctx
 * 是不是我們手上這顆」，不同就整組重建，不然離開盒玩再進轉蛋會全程沒聲音。
 */
export function initGachaKnobAudio(masterVolume?: number) {
  if (typeof window === 'undefined') return;
  initMachineAudio(masterVolume);
  const base = getMachineAudio();
  if (!base) return;
  if (K && K.ctx === base.ctx) {
    if (base.ctx.state === 'suspended') void base.ctx.resume();
    /*
     * 重掛回來要把音樂排程器接回去 —— dispose 會把 setInterval 停掉，
     * 這條早退路徑以前沒有重啟它，等於「第二次之後進頁面就沒有音樂」。
     * React 開發模式的 StrictMode 每次掛載都是 mount→unmount→remount，
     * 所以連第一次進頁面都聽不到（老闆 2026-08-30 回報）。
     */
    musicStart();
    return;
  }

  const { ctx, master, noise } = base;

  // 待機嗡鳴：低頻噪音 + 50Hz 哼聲。單獨聽幾乎聽不到，但少了它每個音效
  // 都像懸在半空 —— 機台要先「活著」，撞擊才有地方落
  const ambG = ctx.createGain(); ambG.gain.value = 0; ambG.connect(master);
  const an = ctx.createBufferSource(); an.buffer = noise; an.loop = true;
  const alp = ctx.createBiquadFilter(); alp.type = 'lowpass'; alp.frequency.value = 320; alp.Q.value = 0.7;
  an.connect(alp); alp.connect(ambG);
  const ah = ctx.createOscillator(); ah.type = 'sine'; ah.frequency.value = 50;
  const ahg = ctx.createGain(); ahg.gain.value = 0.35; ah.connect(ahg); ahg.connect(ambG);

  const musicG = ctx.createGain(); musicG.gain.value = 0.0001; musicG.connect(master);

  an.start(); ah.start();

  K = { ctx, master, noise, ambG, musicG };
  musicStart();
  if (ctx.state === 'suspended') void ctx.resume();
}

/**
 * 離開機台頁：嗡鳴淡出、音樂排程器停掉。
 *
 * **不 close context** —— 那顆是跟「恭喜獲得」彈窗共用的，關掉的話
 * 玩家轉完蛋看到彈窗就沒有中獎號角。
 */
export function disposeGachaKnobAudio() {
  if (MUS.timer) { clearInterval(MUS.timer); MUS.timer = null; }
  MUS.volume = 0; MUS.next = 0; MUS.step = 0;
  ducking = false;
  if (K) {
    K.ambG.gain.setTargetAtTime(0, K.ctx.currentTime, 0.08);
    K.musicG.gain.setTargetAtTime(0.0001, K.ctx.currentTime, 0.08);
  }
}

/** 待機嗡鳴開關（機台掛載時開） */
export function setKnobAmbience(on: boolean) {
  if (!K) return;
  K.ambG.gain.setTargetAtTime(on ? 0.022 : 0, K.ctx.currentTime, on ? 0.5 : 0.12);
}

/** 背景音樂音量（0 = 不播） */
export function setKnobMusicVolume(v: number) {
  MUS.volume = v;
  applyMusicLevel();
}

/** 演出中（轉動／落蛋／彈窗）把音樂壓低，讓機械聲出得來 */
export function setKnobDucking(busy: boolean) {
  if (ducking === busy) return;
  ducking = busy;
  applyMusicLevel();
}

function applyMusicLevel() {
  if (!K) return;
  K.musicG.gain.setTargetAtTime(MUS.volume * (ducking ? 0.42 : 1), K.ctx.currentTime, 0.4);
}

/* ── 一次性音色 ───────────────────────────────────────────────────────── */

/** 投幣：硬幣打在投幣口的金屬聲，再掉進錢箱 */
export function sfxCoin() {
  if (!K) return;
  const t = K.ctx.currentTime;
  noiseHit(0.05, 0.10, jitter(4200, 0.1), 1400, 3.2, t);
  tone('triangle', jitter(2400, 0.06), 1500, 0.09, 0.075, t);
  noiseHit(0.06, 0.08, jitter(3200, 0.1), 900, 2.6, t + 0.07);
  tone('sine', 190, 90, 0.16, 0.09, t + 0.10);
}

/**
 * 旋鈕棘輪的一齒。轉動期間由呼叫端照「實際轉到的角度」連續觸發，
 * 不是排一串固定間隔的 setTimeout —— 那樣快慢會跟畫面對不上。
 */
let lastTick = 0;
export function sfxKnobTick(power = 1) {
  if (!K) return;
  const now = performance.now();
  if (now - lastTick < 22) return;          // 太密的話會糊成噪音
  lastTick = now;
  noiseHit(0.028, 0.05 + 0.05 * power, jitter(2300, 0.08), 800, 4.0);
  tone('square', jitter(880, 0.06), 560, 0.022, 0.035 + 0.03 * power);
}

/** 旋鈕轉到底、凸輪放開的那一下（落蛋的引信） */
export function sfxKnobRelease() {
  if (!K) return;
  const t = K.ctx.currentTime;
  noiseHit(0.09, 0.20, 1800, 480, 1.6, t);
  tone('sine', 185, 72, 0.15, 0.16, t);
  tone('triangle', 320, 210, 0.07, 0.06, t);
}

/** 推一下：沒有轉整圈的那種輕推，機構只發出一聲悶響 */
export function sfxKnobNudge() {
  noiseHit(0.06, 0.11, 1400, 420, 1.4);
  tone('sine', 150, 80, 0.10, 0.09);
}

/** 出蛋閘門：短促的伺服嘶聲 */
export function sfxHatch() {
  if (!K) return;
  const t = K.ctx.currentTime;
  noiseHit(0.20, 0.075, 700, 1900, 1.8, t);
  tone('sawtooth', 110, 165, 0.18, 0.03, t);
}

/**
 * 蛋在艙裡的碰撞。力道 0~1：越重越低沉、越大聲。
 * 這是整套裡觸發最頻繁的音色，節流放在這裡而不是呼叫端。
 */
let lastKnock = 0;
export function sfxCapsuleHit(power: number) {
  if (!K) return;
  const p = Math.max(0, Math.min(1, power));
  if (p < 0.12) return;                     // 輕微的接觸不出聲，不然一直在響
  const now = performance.now();
  if (now - lastKnock < 32) return;
  lastKnock = now;
  noiseHit(0.04 + p * 0.03, 0.04 + p * 0.14, jitter(2600 - p * 700, 0.08), 900, 1.8);
  tone('sine', jitter(430 - p * 130, 0.05), 190, 0.07, 0.04 + p * 0.07);
}

/** 蛋滾下滑道：銜接「閘門開」到「落地」中間那段，不然中間是空的 */
export function sfxCapsuleRoll() {
  if (!K) return;
  const t = K.ctx.currentTime;
  noiseHit(0.34, 0.055, 900, 2100, 1.2, t);
  tone('triangle', 260, 380, 0.30, 0.022, t);
}

/** 落到取物口：全套裡最有份量的一聲（帶箱體共鳴） */
export function sfxCapsuleLand() {
  if (!K) return;
  const t = K.ctx.currentTime;
  tone('sine', 150, 62, 0.22, 0.22, t);
  noiseHit(0.16, 0.13, 850, 200, 0, t);
  tone('triangle', jitter(330, 0.04), 300, 0.20, 0.05, t + 0.02);
}

/** 取物口蓋板翻動 */
export function sfxFlap() {
  if (!K) return;
  const t = K.ctx.currentTime;
  noiseHit(0.05, 0.09, 1600, 600, 2.2, t);
  noiseHit(0.06, 0.06, 1200, 400, 1.8, t + 0.09);
}

/** 蛋等在取物口的提示 ding */
export function sfxKnobDing() {
  if (!K) return;
  const t = K.ctx.currentTime;
  tone('triangle', 1046.5, 1046.5, 0.26, 0.09, t);
  tone('triangle', 1568, 1568, 0.34, 0.065, t + 0.08);
}

/** UI blip：按鈕 */
export function sfxKnobUiClick() {
  noiseHit(0.045, 0.10, 1800, 620, 2.0);
  tone('square', 620, 380, 0.045, 0.045);
}

/** 售罄／不能按 */
export function sfxKnobBuzz() {
  if (!K) return;
  const t = K.ctx.currentTime;
  tone('square', 165, 165, 0.10, 0.06, t);
  tone('square', 140, 140, 0.14, 0.06, t + 0.13);
}

/* ── 背景音樂 ─────────────────────────────────────────────────────────────
 * 玩具店的感覺：大調、木琴般的斷奏 + 撥弦低音，比盒玩那台輕快一點。
 * 一樣用 lookahead 排程器（setInterval 掃描，提前把音符排進時間軸）——
 * 分頁切到背景時 rAF 會停，靠 rAF 排音樂會斷拍。
 */

const STEP_DUR = 0.26;                              // ≈ 115 BPM 的八分音符
const CHORDS = [
  { bass: -24, notes: [0, 4, 7, 12] },              // C
  { bass: -19, notes: [0, 5, 9, 12] },              // F
  { bass: -17, notes: [2, 7, 11, 14] },             // G
  { bass: -15, notes: [0, 4, 9, 12] },              // Am
];
const ARP = [0, 2, 1, 3, -1, 2, 0, -1];             // -1 = 留白
const hz = (semi: number) => 261.63 * Math.pow(2, semi / 12);

function musNote(type: OscillatorType, f: number, t: number, dur: number, peak: number, lpHz = 4200) {
  if (!K) return;
  const c = K.ctx;
  const o = c.createOscillator(); o.type = type; o.frequency.value = f;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.010);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lpHz;
  o.connect(g); g.connect(lp); lp.connect(K.musicG);
  o.start(t); o.stop(t + dur + 0.05);
}

function musicSchedule() {
  if (!K) return;
  /*
   * 時間軸落後太多就跳過積欠的部分（分頁切到背景、context 被 suspend 很久）。
   * 不跳的話這個 while 會一次把幾百個音符排在「過去」，恢復的瞬間全部同時發聲。
   */
  if (MUS.next < K.ctx.currentTime - 0.5) MUS.next = K.ctx.currentTime + 0.05;
  const horizon = K.ctx.currentTime + 0.35;
  while (MUS.next < horizon) {
    const t = MUS.next, s = MUS.step;
    const ch = CHORDS[Math.floor(s / 8) % CHORDS.length], k = s % 8;
    if (MUS.volume > 0.005) {
      if (k === 0) musNote('sine', hz(ch.bass), t, 0.9, 0.085, 380);          // 撥弦低音
      if (k === 4) musNote('sine', hz(ch.bass + 7), t, 0.7, 0.05, 380);
      const a = ARP[k];
      if (a >= 0) {                                                           // 木琴斷奏
        const f = hz(ch.notes[a] + 12);
        musNote('triangle', f, t, 0.34, 0.07, 5600);
        musNote('sine', f * 2, t, 0.18, 0.018, 7500);
      }
    }
    MUS.next += STEP_DUR;
    MUS.step = (MUS.step + 1) % (CHORDS.length * 8);
  }
}

function musicStart() {
  if (!K || MUS.timer) return;
  MUS.next = K.ctx.currentTime + 0.15;
  MUS.step = 0;
  MUS.timer = setInterval(musicSchedule, 40);
  musicSchedule();
}
