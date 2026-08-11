/**
 * 全站靜音偏好 —— 單一事實來源
 *
 * 商品頁的聲音散在四個地方：`lib/sfx`（mp3 音效）、`lib/machineSfx`
 * （盒玩 mode5 的 WebAudio 引擎與背景音樂）、機台元件裡零星的 `new Audio`、
 * 以及盒玩頁的背景影片。玩家按下一顆開關時，這四個都得一起閉嘴，
 * 所以偏好值不能各存各的，要有一個地方管。
 *
 * 值存在 localStorage，換頁、重開 App 都記得。挑戰機台有自己的
 * `smvc-muted`（只管拉霸機那套音效），刻意不共用 —— 那顆開關是機台專屬的，
 * 玩家在拉霸機關掉聲音不代表他不想聽轉蛋機的聲音。
 */

const KEY = 'ggb-muted';

let muted: boolean | null = null;              // null = 還沒從 localStorage 讀過
const listeners = new Set<(m: boolean) => void>();

/** 目前是否靜音。SSR 期間一律回 false，避免 hydration 不一致。 */
export function isSoundMuted(): boolean {
  if (typeof window === 'undefined') return false;
  if (muted === null) {
    try { muted = localStorage.getItem(KEY) === '1'; } catch { muted = false; }
  }
  return muted;
}

/** 設定靜音並通知所有訂閱者（音效引擎、影片元素…） */
export function setSoundMuted(next: boolean) {
  if (typeof window === 'undefined') return;
  muted = next;
  try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* 無痕模式會丟例外，忽略 */ }
  listeners.forEach(fn => { try { fn(next); } catch { /* 單一訂閱者出錯不影響其他 */ } });
}

/** 訂閱靜音變化，回傳取消訂閱函數 */
export function subscribeSoundMuted(fn: (m: boolean) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
