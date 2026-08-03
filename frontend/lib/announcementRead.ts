/**
 * 公告已讀狀態（逐則）
 *
 * 公告是公開內容、沒有 per-user 的已讀資料表，故記在 localStorage。
 * 原本只存一個「最後檢視時間」，無法表達「這則看過、那則沒看過」，
 * 因此改存已讀 id 清單。
 *
 * 舊的 ggb:bell:last_seen 保留不動：既有使用者若曾看過公告頁，
 * 早於該時間的公告一律視為已讀，避免改版後整頁突然全變未讀。
 */
const READ_KEY = 'ggb:announcements:read'
const LAST_SEEN_KEY = 'ggb:bell:last_seen'
const MAX_KEEP = 500   // 只留最近的，避免無限成長

export function getReadIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(READ_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function saveReadIds(ids: Set<string>) {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify([...ids].slice(-MAX_KEEP)))
    window.dispatchEvent(new CustomEvent('ggb:announcementsRead'))
  } catch { /* 私密模式等寫不進去時忽略 */ }
}

export function markRead(id: string) {
  const ids = getReadIds()
  if (ids.has(id)) return
  ids.add(id)
  saveReadIds(ids)
}

export function markAllRead(ids: string[]) {
  const set = getReadIds()
  ids.forEach(i => set.add(i))
  saveReadIds(set)
}

/** 改版前就看過公告頁的人，早於該時間的公告視為已讀 */
function lastSeenTime(): number {
  if (typeof window === 'undefined') return 0
  const v = localStorage.getItem(LAST_SEEN_KEY)
  const t = v ? new Date(v).getTime() : 0
  return Number.isNaN(t) ? 0 : t
}

export function isUnread(item: { id: string; published_at: string }, readIds?: Set<string>): boolean {
  const ids = readIds ?? getReadIds()
  if (ids.has(item.id)) return false
  const seen = lastSeenTime()
  if (seen && new Date(item.published_at).getTime() <= seen) return false
  return true
}

export function countUnread(items: { id: string; published_at: string }[]): number {
  const ids = getReadIds()
  return items.filter(i => isUnread(i, ids)).length
}
