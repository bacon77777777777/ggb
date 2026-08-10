/**
 * 盒玩立體販賣機音效引擎
 *
 * 整套 WebAudio 即時合成，專案裡沒有對應音檔。合成參數逐項對齊原型
 * `public/images/blindbox/blindbox-vending-physics.html`，共 11 個音源。
 *
 * 為什麼放在共用模組而不是留在機台元件裡：中獎號角要在「恭喜獲得」彈窗
 * （GachaResultModal，全站共用）開啟時響，而彈窗跟機台是兩個元件。
 * 兩邊各開一個 AudioContext 的話，音樂 ducking 會壓不到號角，行動裝置
 * 也可能因為同時開兩個 context 而其中一個發不出聲。整支共用一個 context。
 *
 * ── 常駐 loop（建立一次，靠 gain 淡進淡出）
 *   機台運作嗡鳴   有盒子在推出或後排遞補時
 *   推桿伺服嘶聲   只在推出那段
 *   背景音樂       進頁面就跑，全程循環；演出時 ducking 到 42%
 *
 * ── 即時觸發
 *   木質喀噠 / 紙盒撞擊 / 機台悶響 / 取物提示 ding /
 *   取物 / 中獎號角 / 滑軌推送 / 按鈕 blip
 */

type Nodes = {
  ctx: AudioContext;
  master: GainNode;
  noise: AudioBuffer;
  motorG: GainNode;
  servoG: GainNode;
  musicG: GainNode;
};

let A: Nodes | null = null;

/*
 * 背景音樂排程器狀態。
 *
 * volume 預設 0：中獎號角是全站彈窗共用的，轉蛋／一番賞的彈窗也會呼叫
 * initMachineAudio()，音樂若預設就開，那些頁面會莫名其妙冒出盒玩的 BGM。
 * 只有 mode5 機台掛載時才 setMusicVolume() 打開。
 */
const MUS = { timer: null as ReturnType<typeof setInterval> | null, next: 0, step: 0, volume: 0 };

/** 演出中（機台在動／CTA 亮著／彈窗開著）把音樂壓低，讓機械聲出得來 */
let ducking = false;

const STEP_DUR = 0.30;                      // 八分音符 ≈ 100 BPM，一輪 9.6 秒
const CHORDS = [
  { bass: -24, notes: [0, 4, 7, 12] },      // C
  { bass: -17, notes: [2, 7, 11, 14] },     // G
  { bass: -15, notes: [0, 4, 9, 12] },      // Am
  { bass: -19, notes: [0, 5, 9, 12] },      // F
];
const ARP = [0, -1, 1, 2, -1, 3, 2, -1];    // -1 = 留白，讓琶音稀疏一點

const hz = (semi: number) => 261.63 * Math.pow(2, semi / 12);

/** 粉紅噪音（三階濾波器組）。機台嗡鳴是長時間常駐，白噪音聽久了會刺耳 */
function buildPinkNoise(ctx: AudioContext): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.0990460;
    b1 = 0.96300 * b1 + w * 0.2965164;
    b2 = 0.57000 * b2 + w * 1.0526913;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
  }
  return buf;
}

/**
 * 使用者互動就把 suspended 的 context 叫醒。
 *
 * 只掛一次、掛在 window 上：進商品頁就要開始播背景音樂，但那時多半還沒有
 * 任何互動，AudioContext 一定是 suspended。玩家之後點畫面任何一處
 * （不見得是機台按鈕）音樂就接上，不必等他按「立即開盒」。
 */
let resumeHooked = false;
function hookResume() {
  if (resumeHooked || typeof window === 'undefined') return;
  resumeHooked = true;
  const wake = () => resumeMachineAudio();
  (['pointerdown', 'touchstart', 'keydown', 'wheel'] as const).forEach(ev => {
    window.addEventListener(ev, wake, { capture: true, passive: true });
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) wake();
  });
}

/**
 * 建立整套音效節點。可重複呼叫，第二次以後只做 resume。
 *
 * 瀏覽器的 autoplay policy：AudioContext 在使用者互動前只能是 suspended。
 * 節點與排程器照樣先建好（時間軸是凍結的，不會空轉），任何互動 resume
 * 之後音樂就從凍結的地方接著播。
 */
export function initMachineAudio(masterVolume = 0.8) {
  if (typeof window === 'undefined') return;
  hookResume();
  if (A) {
    A.master.gain.value = masterVolume;
    if (A.ctx.state === 'suspended') void A.ctx.resume();
    return;
  }

  let ctx: AudioContext;
  try {
    const Ctx = window.AudioContext
      || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctx();
  } catch { return; }

  const master = ctx.createGain();
  master.gain.value = masterVolume;
  master.connect(ctx.destination);

  const noise = buildPinkNoise(ctx);

  // 機台運作：低頻嗡鳴 + 齒輪噪音 + 轉速抖動
  const motorG = ctx.createGain(); motorG.gain.value = 0; motorG.connect(master);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 460; lp.Q.value = 5;
  lp.connect(motorG);
  const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 57;
  const o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 86;
  const og = ctx.createGain(); og.gain.value = 0.45; o1.connect(og); o2.connect(og); og.connect(lp);
  const gn = ctx.createBufferSource(); gn.buffer = noise; gn.loop = true;
  const gbp = ctx.createBiquadFilter(); gbp.type = 'bandpass'; gbp.frequency.value = 900; gbp.Q.value = 1.1;
  const gng = ctx.createGain(); gng.gain.value = 0.5;
  gn.connect(gbp); gbp.connect(gng); gng.connect(motorG);
  const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 7.2;
  const lg = ctx.createGain(); lg.gain.value = 5.5; lfo.connect(lg); lg.connect(o1.frequency);

  // 推桿伺服：高一階的機械嘶聲，只在推出時開
  const servoG = ctx.createGain(); servoG.gain.value = 0; servoG.connect(master);
  const sbp = ctx.createBiquadFilter(); sbp.type = 'bandpass'; sbp.frequency.value = 1750; sbp.Q.value = 3.4;
  sbp.connect(servoG);
  const so = ctx.createOscillator(); so.type = 'square'; so.frequency.value = 214;
  const sog = ctx.createGain(); sog.gain.value = 0.30; so.connect(sog); sog.connect(sbp);
  const sn = ctx.createBufferSource(); sn.buffer = noise; sn.loop = true;
  const sng = ctx.createGain(); sng.gain.value = 0.75; sn.connect(sng); sng.connect(sbp);
  const slfo = ctx.createOscillator(); slfo.type = 'sawtooth'; slfo.frequency.value = 23;
  const slg = ctx.createGain(); slg.gain.value = 16; slfo.connect(slg); slg.connect(so.frequency);

  const musicG = ctx.createGain(); musicG.gain.value = 0.0001; musicG.connect(master);

  o1.start(); o2.start(); gn.start(); lfo.start(); so.start(); sn.start(); slfo.start();

  A = { ctx, master, noise, motorG, servoG, musicG };
  musicStart();
  if (ctx.state === 'suspended') void ctx.resume();
}

/** 使用者互動後把 suspended 的 context 叫醒 */
export function resumeMachineAudio() {
  if (A && A.ctx.state === 'suspended') void A.ctx.resume();
}

/**
 * 離開機台頁時收掉。常駐 loop 與音樂排程器不關會一直跑，
 * 玩家滑到別頁還聽得到嗡鳴。
 */
export function disposeMachineAudio() {
  if (MUS.timer) { clearInterval(MUS.timer); MUS.timer = null; }
  if (A) { void A.ctx.close(); A = null; }
}

/** 主音量（後台參數） */
export function setMachineVolume(v: number) {
  if (A) A.master.gain.value = v;
}

/** 背景音樂音量（0 = 靜音） */
export function setMusicVolume(v: number) {
  MUS.volume = v;
}

/** 演出中壓低音樂。busy = 機台在動／CTA 亮著／彈窗開著 */
export function setDucking(busy: boolean) {
  ducking = busy;
}

function level(node: GainNode | null, v: number, tau: number) {
  if (node && A) node.gain.setTargetAtTime(v, A.ctx.currentTime, tau);
}

/** 機台狀態 → 兩層常駐 loop 的音量。每幀呼叫 */
export function setMachineMotion(moving: boolean, pushing: boolean) {
  if (!A) return;
  level(A.motorG, moving ? 0.15 : 0, moving ? 0.05 : 0.10);
  level(A.servoG, pushing ? 0.075 : 0, pushing ? 0.04 : 0.07);
  level(A.musicG, MUS.volume * 0.17 * (ducking ? 0.42 : 1), 0.45);
}

/** 起音 8ms、之後指數衰減 */
function env(dur: number, peak: number, t0?: number): GainNode | null {
  if (!A) return null;
  const c = A.ctx, t = t0 ?? c.currentTime;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(A.master);
  return g;
}

function noiseHit(dur: number, peak: number, f0: number, f1: number, q: number, t0?: number) {
  if (!A) return;
  const c = A.ctx, t = t0 ?? c.currentTime;
  const s = c.createBufferSource(); s.buffer = A.noise;
  s.playbackRate.value = 0.7 + Math.random() * 0.6;
  const f = c.createBiquadFilter();
  f.type = q ? 'bandpass' : 'lowpass';
  if (q) f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const e = env(dur, peak, t);
  if (!e) return;
  s.connect(f); f.connect(e);
  s.start(t); s.stop(t + dur + 0.05);
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, peak: number, t0?: number) {
  if (!A) return;
  const c = A.ctx, t = t0 ?? c.currentTime;
  const o = c.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const e = env(dur, peak, t);
  if (!e) return;
  o.connect(e); o.start(t); o.stop(t + dur + 0.05);
}

/** 紙盒撞擊（力道越大越低沉）。45ms 冷卻在呼叫端做 */
export function sfxThunk(power: number) {
  noiseHit(0.10 + power * 0.09, 0.06 + power * 0.30, 500 + power * 1900, 260, 0);
  tone('sine', 120 - power * 35, 52, 0.13, 0.11 * power + 0.01);
}

/**
 * 機台被砸到的悶響。240ms 冷卻 —— 十顆盒子同時落地時只挑最重的那幾下，
 * 不然會糊成一片轟隆隆
 */
let lastRumble = 0;
export function sfxRumble(power: number) {
  if (!A) return;
  const now = performance.now();
  if (now - lastRumble < 240) return;
  lastRumble = now;
  tone('sine', 76, 36, 0.45, 0.26 * power + 0.03);
  noiseHit(0.40, 0.20 * power, 320, 80, 0);
}

/** 盒子脫離層板的木質喀噠 */
export function sfxClack() {
  noiseHit(0.055, 0.16, 2600, 700, 2.2);
  tone('triangle', 320, 190, 0.06, 0.07);
}

/** 滑軌推送：換一批與自動補貨 */
export function sfxWhirr() {
  if (!A) return;
  noiseHit(0.42, 0.13, 700, 2200, 1.6);
  tone('sawtooth', 90, 150, 0.40, 0.045);
  noiseHit(0.10, 0.14, 900, 300, 0, A.ctx.currentTime + 0.44);
}

/** 「點擊取物」浮現 */
export function sfxDing() {
  if (!A) return;
  tone('triangle', 880, 880, 0.28, 0.10);
  tone('triangle', 1318.5, 1318.5, 0.36, 0.075, A.ctx.currentTime + 0.09);
}

/** 取物：抽取 whoosh + C 大調上行琶音 */
export function sfxCollect() {
  if (!A) return;
  const t = A.ctx.currentTime;
  noiseHit(0.26, 0.16, 400, 3200, 1.1, t);
  [0, 4, 7, 12].forEach((semi, i) => {
    const f = 523.25 * Math.pow(2, semi / 12);
    tone('triangle', f, f, 0.7, 0.16, t + 0.06 + i * 0.065);
  });
}

/** 按鈕 blip：立即開盒／試試看／確定 */
export function sfxUiClick() {
  noiseHit(0.05, 0.12, 1800, 600, 2.0);
  tone('square', 620, 380, 0.05, 0.05);
}

/**
 * 中獎號角。「恭喜獲得」彈窗開啟時播，賞別越高號角越長：
 * rank 0（A賞）6 音 + 亮片尾音、rank 1（B賞）4 音、rank ≥2 兩音。
 */
export function sfxFanfare(rankIndex: number) {
  if (!A) return;
  const t = A.ctx.currentTime;
  const seq = rankIndex <= 0 ? [0, 4, 7, 12, 16, 19]
            : rankIndex <= 1 ? [0, 4, 7, 12]
            : [0, 7];
  seq.forEach((semi, i) => {
    const f = 392 * Math.pow(2, semi / 12);
    tone('square', f, f, 0.34, 0.055, t + i * 0.085);
    tone('triangle', f, f, 0.55, 0.12, t + i * 0.085);
  });
  if (rankIndex <= 1) noiseHit(0.9, 0.10, 5000, 900, 1.0, t + seq.length * 0.085);
}

/* ── 背景音樂：C - G - Am - F，八分音符網格 ──────────────────────────
 * 用 lookahead 排程器（setInterval 掃描，提前 0.35s 把音符排進 AudioContext
 * 時間軸），不是靠 rAF —— 分頁切到背景時 rAF 會停，音樂就會斷拍。
 */

function musNote(type: OscillatorType, f: number, t: number, dur: number, peak: number, lpHz = 3000) {
  if (!A) return;
  const c = A.ctx;
  const o = c.createOscillator(); o.type = type; o.frequency.value = f;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lpHz;
  o.connect(g); g.connect(lp); lp.connect(A.musicG);
  o.start(t); o.stop(t + dur + 0.05);
}

/** 三支微失諧振盪器鋪成軟墊 */
function musPad(f: number, t: number, dur: number, peak: number) {
  if (!A) return;
  const c = A.ctx;
  [0, -5, 6].forEach((cents, i) => {
    const o = c.createOscillator(); o.type = i ? 'sine' : 'triangle';
    o.frequency.value = f; o.detune.value = cents;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.9);        // 慢起
    g.gain.setValueAtTime(peak, t + dur - 1.0);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 760;
    o.connect(g); g.connect(lp); lp.connect(A!.musicG);
    o.start(t); o.stop(t + dur + 0.05);
  });
}

function musicSchedule() {
  if (!A) return;
  const horizon = A.ctx.currentTime + 0.35;
  while (MUS.next < horizon) {
    const t = MUS.next, s = MUS.step;
    const ci = Math.floor(s / 8) % CHORDS.length, k = s % 8;
    if (MUS.volume > 0.01) {
      const ch = CHORDS[ci];
      if (k === 0) {                                      // 每小節換和弦：軟墊 + 低音
        ch.notes.forEach(nn => musPad(hz(nn), t, STEP_DUR * 8, 0.055));
        musNote('sine', hz(ch.bass), t, 1.1, 0.10, 420);
      }
      if (k === 4) musNote('sine', hz(ch.bass + 7), t, 0.8, 0.055, 420);
      const a = ARP[k];
      if (a >= 0) {                                       // 音樂盒琶音
        const f = hz(ch.notes[a] + 12);
        musNote('triangle', f, t, 0.85, 0.075, 5200);
        musNote('sine', f * 2, t, 0.45, 0.022, 7000);
      }
    }
    MUS.next += STEP_DUR;
    MUS.step = (MUS.step + 1) % (CHORDS.length * 8);
  }
}

function musicStart() {
  if (!A || MUS.timer) return;
  MUS.next = A.ctx.currentTime + 0.15;
  MUS.step = 0;
  MUS.timer = setInterval(musicSchedule, 40);
  musicSchedule();
}
