/**
 * 音效播放
 *
 * 之前每個機台元件各自 `new Audio(...)` 再自己記一個 lastPlayRef 擋重複，
 * 有兩個問題：
 *
 * 1. 防抖窗口寫死 500ms，但轉蛋掉落音效實際長 1.12 秒。
 *    兩次觸發間隔落在 500~1123ms 之間就都會通過，第二次 `currentTime = 0`
 *    把還在播的音檔攔腰截斷重來，聽起來就是「同一個音效播了兩次、疊在一起」。
 *
 * 2. 防抖狀態是每個元件實例各存一份。同一個音檔被兩個元件（機台 + 盒玩）
 *    各自建一個 Audio 物件時，兩邊互相看不到對方，真的會疊起來。
 *
 * 改成同一個 src 全站共用一個 Audio 物件：
 *   - 一個物件本質上不可能自己疊自己
 *   - 還在播就直接忽略，不截斷（截斷比不播還難聽）
 *   - 防抖長度改成音檔自己的長度，不再是猜的數字
 */

type Entry = { audio: HTMLAudioElement; playingUntil: number };

const cache = new Map<string, Entry>();

/** 音檔長度還沒讀到時的保底間隔（ms）。多數音效都短於此。 */
const FALLBACK_GAP = 1200;

function getEntry(src: string): Entry | null {
  if (typeof window === 'undefined') return null;

  const hit = cache.get(src);
  if (hit) return hit;

  const audio = new Audio(src);
  audio.preload = 'auto';
  const entry: Entry = { audio, playingUntil: 0 };
  cache.set(src, entry);
  return entry;
}

/**
 * 播一次音效。上一次還沒播完就整個略過。
 *
 * @param src   /audio/... 路徑
 * @param opts.volume 0~1
 * @param opts.interrupt 設 true 代表「這次一定要播」，會從頭重播。
 *              只有那種蓋掉前一個才合理的音效才用（例如結果彈窗）。
 */
export function playSfx(src: string, opts?: { interrupt?: boolean; volume?: number }) {
  const entry = getEntry(src);
  if (!entry) return;

  if (opts?.volume !== undefined) entry.audio.volume = opts.volume;

  const now = Date.now();
  if (!opts?.interrupt && now < entry.playingUntil) return;

  // duration 要等 metadata 載完才有值，還沒有就用保底值
  const lengthMs = Number.isFinite(entry.audio.duration) && entry.audio.duration > 0
    ? entry.audio.duration * 1000
    : FALLBACK_GAP;
  entry.playingUntil = now + lengthMs;

  entry.audio.currentTime = 0;
  void entry.audio.play().catch(() => {});
}

/** 換頁時停掉還在播的音效，避免離開商品頁還聽得到轉蛋聲 */
export function stopAllSfx() {
  for (const entry of cache.values()) {
    entry.audio.pause();
    entry.playingUntil = 0;
  }
}

export const SFX = {
  eggDrop:    '/audio/spinopel-open-a-egg-carton-345737.mp3',
  gachaPush:  '/audio/gachapush.mp3',
  gachaAuto:  '/audio/gacha.mp3',
} as const;


/* ── 中獎音效（WebAudio 合成，無音檔） ──────────────────────────────────
 *
 * 原本是盒玩立體販賣機（mode5）「點擊取物」的音效，老闆指定改由恭喜獲得
 * 彈窗來播 —— 取物當下不再出聲，等彈窗開啟才響，全站（轉蛋／盒玩／
 * 一番賞／抽卡／自製賞）共用同一個。
 *
 * 沿用 mode5 的合成參數：粉紅噪音掃頻（抽取聲）＋ C 大調上行琶音
 * （C5-E5-G5-C6）。合成而非音檔的好處是零載入、不會有第一次播放的延遲。
 */

let chimeCtx: AudioContext | null = null;
let chimeNoise: AudioBuffer | null = null;

/** 粉紅噪音（比白噪音耐聽），機械抽取聲的底 */
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
 * 中獎音效。恭喜獲得彈窗開啟時播。
 *
 * AudioContext 第一次要有使用者互動才啟得動 —— 彈窗都是點擊之後才開的，
 * 所以到得了這裡就一定有互動過；仍留 resume() 應付分頁切回來的 suspended。
 */
export function playWinChime(volume = 0.8) {
  if (typeof window === 'undefined') return;

  if (!chimeCtx) {
    try {
      const Ctx = window.AudioContext
        || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      chimeCtx = new Ctx();
    } catch { return; }
    chimeNoise = buildPinkNoise(chimeCtx);
  }
  const c = chimeCtx;
  if (c.state === 'suspended') void c.resume();
  if (!chimeNoise) return;

  const master = c.createGain();
  master.gain.value = volume;
  master.connect(c.destination);

  /** 起音 8ms、之後指數衰減到無聲 */
  const env = (dur: number, peak: number, t: number) => {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(master);
    return g;
  };

  const t = c.currentTime;

  // 抽取聲：粉紅噪音走 bandpass 由 400Hz 掃到 3200Hz
  const src = c.createBufferSource();
  src.buffer = chimeNoise;
  src.playbackRate.value = 0.7 + Math.random() * 0.6;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(400, t);
  bp.frequency.exponentialRampToValueAtTime(3200, t + 0.26);
  src.connect(bp);
  bp.connect(env(0.26, 0.16, t));
  src.start(t);
  src.stop(t + 0.31);

  // 上行琶音 C5-E5-G5-C6
  [0, 4, 7, 12].forEach((semi, i) => {
    const f = 523.25 * Math.pow(2, semi / 12);
    const at = t + 0.06 + i * 0.065;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, at);
    o.connect(env(0.7, 0.16, at));
    o.start(at);
    o.stop(at + 0.75);
  });
}
