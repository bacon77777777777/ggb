/**
 * 通知列表的「這一趟瀏覽」記憶（老闆 2026-08-26 要求「點返回回到列表且記憶瀏覽位置」）
 *
 * 列表在點進詳情前把分頁籤與捲動位置寫進 sessionStorage，返回時接回去。
 * Navbar 的返回鍵也讀同一筆，用來判斷玩家是不是真的從列表點進來的
 * —— 不能靠 document.referrer：從 LINE、推播或重新整理進到內頁時它是空的，
 * 會被當成外站來源而把人彈回首頁。
 *
 * 放 sessionStorage 而不是 state：進詳情頁是換路由，元件會整個卸載；
 * 關掉分頁就失效，剛好符合「這一趟瀏覽」的語意。
 */

export const ANNOUNCEMENTS_VIEW_KEY = 'ggb:announcements:view';

/** 超過這個時間就不算同一趟瀏覽了：不還原位置，也不用 router.back() */
const TTL = 30 * 60 * 1000;

export interface AnnouncementsView {
  /** 當時停在哪個分頁籤 */
  tab: string;
  /** 當時的捲動位置 */
  y: number;
  /** 接下來要去的詳情頁路徑，返回時拿來跟當下路徑比對 */
  from: string;
  ts: number;
}

export function rememberAnnouncementsView(view: Omit<AnnouncementsView, 'ts'>) {
  try {
    sessionStorage.setItem(ANNOUNCEMENTS_VIEW_KEY, JSON.stringify({ ...view, ts: Date.now() }));
  } catch { /* 無痕模式寫不進去就算了，不要炸掉 */ }
}

/**
 * 讀回這一趟瀏覽；`consume` 為 true 時讀完就清掉。
 * 列表要 consume —— 否則玩家等一下從鈴鐺重新點進通知，會莫名被丟到上次看到的一半。
 */
export function readAnnouncementsView(consume = false): AnnouncementsView | null {
  try {
    const raw = sessionStorage.getItem(ANNOUNCEMENTS_VIEW_KEY);
    if (!raw) return null;
    if (consume) sessionStorage.removeItem(ANNOUNCEMENTS_VIEW_KEY);
    const v = JSON.parse(raw) as Partial<AnnouncementsView>;
    if (typeof v.ts !== 'number' || Date.now() - v.ts > TTL) return null;
    return {
      tab: typeof v.tab === 'string' ? v.tab : 'all',
      y: typeof v.y === 'number' ? v.y : 0,
      from: typeof v.from === 'string' ? v.from : '',
      ts: v.ts,
    };
  } catch {
    return null;
  }
}

/** 目前這個詳情頁是不是從通知列表點進來的（決定返回要用 back() 還是 push 列表） */
export function cameFromAnnouncementsList(pathname: string): boolean {
  const view = readAnnouncementsView();
  return !!view && view.from === pathname;
}
