/**
 * 一番賞沉浸撕紙：音效引擎（紙的質感 + 空間感）
 *
 * 全部 WebAudio 合成，不載任何音檔。紙的聲音本來就是濾波噪音，合成比取樣更好用 ——
 * 強度可以吃「手指拖多快」，取樣做不到。
 *
 * ── 為什麼不是播一顆 mp3
 * 撕紙的聲音要跟著手指走：拖曳中每 8px 觸發一次 crackle（虛線孔一格格裂開），
 * 撕開瞬間才放 bigRip。先前站上的版本是在翻頁動畫**完成之後**才播一顆 0.5 秒的
 * 撕紙 mp3，玩家整段拖曳都是安靜的，聲音永遠慢半拍。
 *
 * ── 2026-08-30 這次補的東西（老闆：要沉浸感）
 * 原本只有「拖曳碎裂」與「撕開」兩個點，前面沒鋪陳、後面沒收尾，撕完就突然安靜。
 * 一番賞的爽點是**揭曉前那兩秒的懸念**，所以補上整條張力曲線：
 *
 *   捏住（小）→ 拉緊（悶）→ 碎裂（碎而密）→ 撕開（爆）→ **靜半拍** → 揭曉（亮）
 *
 * 揭曉依賞別分兩種：A賞／最後賞是長號角＋亮片尾音，其餘統一用清脆的 ding。
 * 連抽時每張之間有短間奏。背景音樂走懸念感（低音撥奏 + 稀疏鐵琴，80 BPM），
 * 撕開瞬間壓到很低，揭曉完再回來。
 *
 * ── 跟轉蛋機的差別（刻意拉開）
 * 轉蛋機是「機構感」：金屬、塑膠、棘輪，全乾、沒有殘響。
 * 這裡是「紙 + 房間」：噪音為主、幾乎沒有音高（有音高的只有揭曉那幾聲），
 * 而且過一層短殘響 —— 有空間感才像「在一個地方拆東西」。
 *
 * ── AudioContext 跟轉蛋機／盒玩共用（machineSfx.getMachineAudio）
 * 原本這支自己開一個，全站就有三個 context。手機上多個 context 常常有一個
 * 發不出聲，而且各自接 destination 的話沒辦法做 ducking（撕開時壓低音樂）。
 */

import { initMachineAudio, getMachineAudio } from './machineSfx';

type Nodes = {
  ctx: AudioContext;
  /** 所有音效先進這裡，再分乾聲與殘響兩路 */
  bus: GainNode;
  music: GainNode;
};

let T: Nodes | null = null;
let ducking = false;

/** 房間殘響用的脈衝：0.35 秒指數衰減噪音。短、暗，只是要一點空間感 */
function buildImpulse(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.35);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
  }
  return buf;
}

/**
 * 建立節點。可重複呼叫。
 *
 * 盒玩販賣機離開頁面時會 close 掉共用的 context，所以每次都要比對
 * 「現在這顆 ctx 是不是我們手上這顆」，不同就整組重建。
 */
function ensure(): Nodes | null {
  if (typeof window === 'undefined') return null;
  initMachineAudio();
  const base = getMachineAudio();
  if (!base) return null;
  if (T && T.ctx === base.ctx) {
    if (base.ctx.state === 'suspended') void base.ctx.resume();
    return T;
  }

  const { ctx, master } = base;
  const bus = ctx.createGain(); bus.gain.value = 1; bus.connect(master);
  const conv = ctx.createConvolver(); conv.buffer = buildImpulse(ctx);
  const wet = ctx.createGain(); wet.gain.value = 0.22;    // 只要一點點，多了就變浴室
  bus.connect(conv); conv.connect(wet); wet.connect(master);
  const music = ctx.createGain(); music.gain.value = 0.0001; music.connect(master);

  T = { ctx, bus, music };
  if (ctx.state === 'suspended') void ctx.resume();
  return T;
}

/** iOS 要在使用者手勢裡先解鎖，否則第一次撕會沒聲音 */
export function unlockTearAudio() {
  ensure();
}

function noiseBuffer(ac: AudioContext, dur: number) {
  const b = ac.createBuffer(1, Math.max(1, (ac.sampleRate * dur) | 0), ac.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** 濾波噪音：紙的所有聲音都是它變出來的 */
function paperNoise(
  dur: number, peak: number, f0: number, f1: number, q: number,
  type: BiquadFilterType = 'bandpass', t0?: number,
) {
  const N = ensure(); if (!N) return;
  const ac = N.ctx, t = t0 ?? ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, dur + 0.02);
  const f = ac.createBiquadFilter();
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(f1, 40), t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + Math.min(0.012, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(N.bus);
  src.start(t); src.stop(t + dur + 0.05);
}

/** 有音高的音：只用在揭曉、間奏與音樂 */
function toneAt(type: OscillatorType, f0: number, f1: number, dur: number, peak: number, t0?: number) {
  const N = ensure(); if (!N) return;
  const ac = N.ctx, t = t0 ?? ac.currentTime;
  const o = ac.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(N.bus);
  o.start(t); o.stop(t + dur + 0.05);
}

/* ── 撕紙的張力曲線 ─────────────────────────────────────────────────── */

/** 券落定：紙張輕輕放到桌上 */
export function sfxTicketDrop() {
  paperNoise(0.16, 0.10, 1500, 380, 0.9, 'bandpass');
  toneAt('sine', 130, 70, 0.10, 0.05);
}

/** 手指捏住左緣：細微的紙張皺褶。玩家要知道自己抓到了 */
export function sfxGrab() {
  const N = ensure(); if (!N) return;
  const t = N.ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    paperNoise(0.05, 0.05 + Math.random() * 0.03, 2200 + Math.random() * 1800, 900, 2.4, 'bandpass', t + i * 0.035);
  }
}

/** 拉緊但還沒撕開：纖維被扯住的低頻 */
export function sfxTension() {
  paperNoise(0.30, 0.07, 520, 240, 1.1, 'bandpass');
  toneAt('sine', 88, 66, 0.28, 0.035);
}

/**
 * 拖曳中的細碎「啵啵」：虛線孔一格格裂開。
 * intensity 由呼叫端用**拖曳速度**算 —— 慢慢撕是細碎的啵啵，一口氣扯是連續的刷。
 */
export function crackle(intensity: number) {
  const i = Math.max(0, Math.min(1, intensity));
  paperNoise(0.07, 0.10 + 0.30 * i, 1400 + Math.random() * 2600, 900, 1.2 + Math.random() * 2, 'bandpass');
}

/** 撕開瞬間的「唰——」：三層疊加 + 高頻纖維尾音 */
export function bigRip() {
  const N = ensure(); if (!N) return;
  const t = N.ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    paperNoise(0.34, 0.42 - i * 0.09, 3200 - i * 500, 520, 0.9, 'bandpass', t + i * 0.055);
  }
  // 纖維分離的「沙——」尾音。低頻聽起來像東西掉在桌上，高頻才像紙被扯開
  paperNoise(0.26, 0.18, 5200, 3800, 0.7, 'highpass', t + 0.08);
}

/** 撕下來的紙片飄落 */
export function sfxFlutter() {
  const N = ensure(); if (!N) return;
  const t = N.ctx.currentTime;
  for (let i = 0; i < 4; i++) {
    paperNoise(0.09, 0.05, 1800 + Math.random() * 1200, 700, 1.6, 'bandpass', t + 0.05 + i * 0.09 + Math.random() * 0.03);
  }
}

/** 沒撕完、紙彈回去 */
export function sfxBounceBack() {
  paperNoise(0.18, 0.09, 900, 2000, 1.0, 'bandpass');
  paperNoise(0.06, 0.07, 1400, 500, 1.8, 'bandpass');
}

/* ── 揭曉 ───────────────────────────────────────────────────────────── */

/** 撕開到獎項出現之間的上升音（懸念）。dur 給多長就升多久 */
export function sfxRiser(dur = 0.55) {
  const N = ensure(); if (!N) return;
  const t = N.ctx.currentTime;
  paperNoise(dur, 0.10, 400, 5200, 0.8, 'bandpass', t);
  toneAt('triangle', 220, 880, dur, 0.05, t);
}

/** 一般賞：清脆的兩聲 ding */
export function sfxRevealCommon() {
  const N = ensure(); if (!N) return;
  const t = N.ctx.currentTime;
  toneAt('triangle', 1046.5, 1046.5, 0.30, 0.11, t);
  toneAt('triangle', 1568, 1568, 0.42, 0.075, t + 0.09);
}

/** A賞／最後賞：長號角 + 亮片尾音 */
export function sfxRevealGrand() {
  const N = ensure(); if (!N) return;
  const t = N.ctx.currentTime;
  [0, 4, 7, 12, 16, 19].forEach((semi, i) => {
    const f = 392 * Math.pow(2, semi / 12);
    toneAt('square', f, f, 0.36, 0.05, t + i * 0.09);
    toneAt('triangle', f, f, 0.6, 0.12, t + i * 0.09);
  });
  // 亮片：高頻噪音慢慢散開
  paperNoise(1.0, 0.09, 6000, 1200, 1.0, 'bandpass', t + 0.55);
  toneAt('sine', 1568, 3136, 0.9, 0.05, t + 0.6);
}

/** 連抽時每張之間的短間奏：三音過門，把注意力接到下一張 */
export function sfxInterlude() {
  const N = ensure(); if (!N) return;
  const t = N.ctx.currentTime;
  [0, 3, 7].forEach((semi, i) => {
    const f = 523.25 * Math.pow(2, semi / 12);
    toneAt('triangle', f, f, 0.32, 0.06, t + i * 0.11);
  });
}

/** 按鈕 */
export function sfxTearUiClick() {
  paperNoise(0.05, 0.09, 1800, 620, 2.0, 'bandpass');
  toneAt('square', 620, 380, 0.045, 0.04);
}

/* ── 背景音樂：懸念感（低音撥奏 + 稀疏鐵琴，80 BPM）─────────────────────
 * 一樣用 lookahead 排程器（setInterval 掃描，提前把音符排進時間軸）——
 * 分頁切到背景時 rAF 會停，靠 rAF 排音樂會斷拍。
 */

const MUS = { timer: null as ReturnType<typeof setInterval> | null, next: 0, step: 0, volume: 0 };
const STEP_DUR = 0.375;                                   // 80 BPM 的八分音符
/** Am → F → C → E：小調起、停在 E 有懸而未決的感覺，剛好是「還沒撕開」的心情 */
const CHORDS = [
  { bass: -3,  notes: [9, 12, 16] },                      // Am
  { bass: -7,  notes: [5, 9, 12] },                       // F
  { bass: -12, notes: [0, 4, 7] },                        // C
  { bass: -8,  notes: [4, 8, 11] },                       // E
];
/** 稀疏到留白多於發聲 —— 懸念不是靠音符多，是靠空 */
const SPARSE = [0, -1, -1, 2, -1, -1, 1, -1];
const hz = (semi: number) => 261.63 * Math.pow(2, semi / 12);

function musNote(type: OscillatorType, f: number, t: number, dur: number, peak: number, lpHz: number) {
  if (!T) return;
  const c = T.ctx;
  const o = c.createOscillator(); o.type = type; o.frequency.value = f;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lpHz;
  o.connect(g); g.connect(lp); lp.connect(T.music);
  o.start(t); o.stop(t + dur + 0.05);
}

function musicSchedule() {
  if (!T) return;
  // 落後太多就跳過積欠的部分，不然恢復瞬間會把幾百個音符同時放出來
  if (MUS.next < T.ctx.currentTime - 0.5) MUS.next = T.ctx.currentTime + 0.05;
  const horizon = T.ctx.currentTime + 0.35;
  while (MUS.next < horizon) {
    const t = MUS.next, s = MUS.step;
    const ch = CHORDS[Math.floor(s / 8) % CHORDS.length], k = s % 8;
    if (MUS.volume > 0.005) {
      if (k === 0) musNote('sine', hz(ch.bass), t, 1.4, 0.10, 300);          // 低音撥奏
      if (k === 4) musNote('sine', hz(ch.bass), t, 0.9, 0.05, 300);
      const a = SPARSE[k];
      if (a >= 0) {                                                          // 鐵琴單音
        const f = hz(ch.notes[a] + 12);
        musNote('triangle', f, t, 1.1, 0.055, 6000);
        musNote('sine', f * 2, t, 0.5, 0.014, 8000);
      }
    }
    MUS.next += STEP_DUR;
    MUS.step = (MUS.step + 1) % (CHORDS.length * 8);
  }
}

function applyMusicLevel() {
  if (!T) return;
  T.music.gain.setTargetAtTime(MUS.volume * (ducking ? 0.12 : 1), T.ctx.currentTime, 0.35);
}

/**
 * 進撕紙畫面時開，離開時關。
 * 預設音量 0.4：原本 0.5，老闆 2026-08-30 說再小聲 20%（跟抽卡開包同步調整）。
 */
export function startTearMusic(volume = 0.4) {
  const N = ensure(); if (!N) return;
  MUS.volume = volume;
  applyMusicLevel();
  if (MUS.timer) return;
  MUS.next = N.ctx.currentTime + 0.15;
  MUS.step = 0;
  MUS.timer = setInterval(musicSchedule, 40);
  musicSchedule();
}

export function stopTearMusic() {
  if (MUS.timer) { clearInterval(MUS.timer); MUS.timer = null; }
  MUS.volume = 0; MUS.next = 0; MUS.step = 0;
  ducking = false;
  if (T) T.music.gain.setTargetAtTime(0.0001, T.ctx.currentTime, 0.08);
}

/** 撕開到揭曉這段把音樂壓到很低，讓紙聲與號角出得來 */
export function setTearDucking(busy: boolean) {
  if (ducking === busy) return;
  ducking = busy;
  applyMusicLevel();
}

/** 紙屑顏色：紙白 ×2（比例高）＋ 券面紅＋米色，同原型 */
const BIT_COLORS = ['#f6efe2', '#f6efe2', '#b8262b', '#e8dcc4'];

/**
 * 撕開後從撕線噴出的紙屑（同老闆原型 ichiban-tear_1 的 spawnBits）。
 *
 * 不是彩色彩帶而是紙屑 —— 顏色取自券本身，噴發角度集中在撕線附近再往下掉，
 * 看起來才像「這張紙被撕開」而不是「有人在慶祝」。
 * 動畫結束自己移除，不留 DOM。
 */
export function spawnConfetti(host: HTMLElement, count = 16) {
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const rect = host.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:60';
  host.appendChild(layer);

  const w = rect.width || 375;
  const h = rect.height || 400;
  let alive = count;

  for (let i = 0; i < count; i++) {
    const b = document.createElement('i');
    const size = 3 + Math.random() * 5;
    b.style.cssText = [
      'position:absolute',
      'border-radius:1px',
      `width:${size}px`,
      `height:${size * (0.6 + Math.random())}px`,
      `background:${BIT_COLORS[i % BIT_COLORS.length]}`,
      // 從撕線附近散出（券大約在畫面中段）
      `left:${w * 0.5}px`,
      `top:${h * 0.42 + Math.random() * h * 0.16}px`,
      'will-change:transform,opacity',
    ].join(';');
    layer.appendChild(b);

    const ang = -0.6 + Math.random() * 1.2;
    const dist = 60 + Math.random() * 130;
    const anim = b.animate(
      [
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        {
          transform: `translate(${Math.cos(ang) * dist}px,${Math.sin(ang) * dist + 90}px) rotate(${Math.random() * 400 - 200}deg)`,
          opacity: 0,
        },
      ],
      { duration: 700 + Math.random() * 500, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' }
    );
    anim.onfinish = () => {
      if (--alive <= 0) layer.remove();
    };
  }

  // 保險：動畫被中斷（分頁切走）時也要清掉
  window.setTimeout(() => layer.remove(), 2200);
}

/**
 * 撕開瞬間的黃光一閃（同老闆原型 ichiban-tear_1 的 #flash.pop）。
 *
 * 徑向漸層由畫面 50%/46% 往外淡出，0.55 秒內快速亮起再收掉 ——
 * 18% 處到最亮是刻意的：亮得比撕開動作稍慢一點點，才像被「撕」出來的光。
 * 蓋在紙屑之下（z-index 29 對 60），光是背景、紙屑要看得見。
 */
export function flashPop(host: HTMLElement) {
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const el = document.createElement('div');
  el.style.cssText = [
    'position:absolute',
    'inset:0',
    'background:radial-gradient(circle at 50% 46%,rgba(255,238,200,.95),rgba(255,238,200,0) 55%)',
    'opacity:0',
    'z-index:29',
    'pointer-events:none',
  ].join(';');
  host.appendChild(el);

  const anim = el.animate(
    [{ opacity: 0 }, { opacity: 1, offset: 0.18 }, { opacity: 0 }],
    { duration: 550, easing: 'ease-out', fill: 'forwards' }
  );
  anim.onfinish = () => el.remove();
  window.setTimeout(() => el.remove(), 1200);
}
