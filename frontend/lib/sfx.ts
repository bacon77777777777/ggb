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

