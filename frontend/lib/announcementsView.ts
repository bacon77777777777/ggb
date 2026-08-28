/**
 * 通知列表的「這一趟瀏覽」記憶（老闆 2026-08-26 要求「點返回回到列表且記憶瀏覽位置」）
 *
 * 實作在 lib/listViewMemory.ts，情報列表用同一套（老闆 2026-08-29 回報那邊也沒記憶）。
 * Navbar 的返回鍵也讀這一筆，見 components/Navbar.tsx 的 handleBack。
 */
import { makeListViewMemory } from './listViewMemory'

export const ANNOUNCEMENTS_VIEW_KEY = 'ggb:announcements:view'

const memory = makeListViewMemory(ANNOUNCEMENTS_VIEW_KEY)

export const rememberAnnouncementsView = memory.remember
export const readAnnouncementsView = memory.read
export const cameFromAnnouncementsList = memory.cameFromList
export type { ListView as AnnouncementsView } from './listViewMemory'
