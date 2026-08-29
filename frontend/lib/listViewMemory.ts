/**
 * 列表頁的「這一趟瀏覽」記憶（通知列表、情報列表共用）
 *
 * 列表在點進內頁前把分頁籤與捲動位置寫進 sessionStorage，返回時接回去；
 * 內頁的返回鍵也讀同一筆，用來判斷玩家是不是真的從列表點進來的。
 *
 * 為什麼不是模組變數：模組變數只在「單頁應用的前後導航」之間有效，
 * 從 LINE、推播、或重新整理進到內頁再返回，整份 JS 都是重新載入的，
 * 記憶就沒了。sessionStorage 撐得過那種情況，關掉分頁才失效 ——
 * 剛好就是「這一趟瀏覽」的語意。
 */

/** 超過這個時間就不算同一趟瀏覽：不還原位置，也不用 router.back() */
const TTL = 30 * 60 * 1000

export interface ListView {
  /** 當時停在哪個分頁籤 */
  tab: string
  /** 當時的捲動位置 */
  y: number
  /**
   * 當時列表展開到第幾篇（有分頁的列表才有意義）。
   * 不還原它，返回時頁面只剩第一頁那麼高，捲動位置會被瀏覽器夾在那個高度的底部。
   */
  count?: number
  /** 接下來要去的內頁路徑，返回時拿來跟當下路徑比對 */
  from: string
  ts: number
}

export function makeListViewMemory(storageKey: string) {
  function remember(view: Omit<ListView, 'ts'>) {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ ...view, ts: Date.now() }))
    } catch { /* 無痕模式寫不進去就算了，不要炸掉 */ }
  }

  /**
   * 讀回這一趟瀏覽；`consume` 為 true 時讀完就清掉。
   * 列表要 consume —— 否則玩家等一下重新點進來，會莫名被丟到上次看到的一半。
   */
  function read(consume = false): ListView | null {
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (!raw) return null
      if (consume) sessionStorage.removeItem(storageKey)
      const v = JSON.parse(raw) as Partial<ListView>
      if (typeof v.ts !== 'number' || Date.now() - v.ts > TTL) return null
      return {
        tab: typeof v.tab === 'string' ? v.tab : 'all',
        y: typeof v.y === 'number' ? v.y : 0,
        count: typeof v.count === 'number' ? v.count : 0,
        from: typeof v.from === 'string' ? v.from : '',
        ts: v.ts,
      }
    } catch {
      return null
    }
  }

  /** 目前這個內頁是不是從列表點進來的（決定返回要用 back() 還是 push 列表） */
  function cameFromList(pathname: string): boolean {
    const view = read()
    return !!view && view.from === pathname
  }

  return { remember, read, cameFromList }
}
