/**
 * 情報列表的「這一趟瀏覽」記憶（老闆 2026-08-29：文章內頁返回沒有記憶瀏覽位置）
 *
 * 實作在 lib/listViewMemory.ts，跟通知列表同一套。
 * 文章內頁的返回鍵也讀這一筆，判斷要 router.back()（保留原本的歷史）
 * 還是 push 回列表（直接開網址進來的情況）。
 */
import { makeListViewMemory } from './listViewMemory'

export const NEWS_VIEW_KEY = 'ggb:news:view'

const memory = makeListViewMemory(NEWS_VIEW_KEY)

export const rememberNewsView = memory.remember
export const readNewsView = memory.read
export const cameFromNewsList = memory.cameFromList
