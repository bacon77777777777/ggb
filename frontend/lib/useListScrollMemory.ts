'use client'

import { useCallback, useLayoutEffect, useRef } from 'react'
import { makeListViewMemory } from './listViewMemory'
import { restoreScrollTo } from './restoreScroll'

/**
 * 列表頁的「返回記得位置」通用掛法（老闆 2026-08-30：每一頁都要有）
 *
 * 情報／公告是各自寫的（它們還要還原分頁籤與清單快取），其餘列表統一用這支：
 *   const rememberScroll = useListScrollMemory('ggb:messages:view')
 *   <div onClickCapture={rememberScroll}> …列表… </div>
 *
 * 掛在容器的 onClickCapture 而不是逐個連結補 onClick —— 那樣一定會漏掉整列
 * 透明連結、動態產生的項目、以及用 router.push 而不是 <a> 的那些。
 */

const memos = new Map<string, ReturnType<typeof makeListViewMemory>>()
const memoFor = (key: string) => {
  let m = memos.get(key)
  if (!m) { m = makeListViewMemory(key); memos.set(key, m) }
  return m
}

export interface ListScrollMemoryOptions {
  /** 目前的分頁籤，返回時一起接回去 */
  tab?: string
  onRestoreTab?: (tab: string) => void
  /** 目前展開到第幾筆。有「載入更多」的列表一定要給 —— 只還原位置的話，
   *  返回時頁面只剩第一頁那麼高，捲動位置會被夾在那個高度的底部 */
  count?: number
  onRestoreCount?: (count: number) => void
}

export function useListScrollMemory(key: string, options: ListScrollMemoryOptions = {}) {
  const optsRef = useRef(options)
  optsRef.current = options

  useLayoutEffect(() => {
    // 讀完就清：從底部導航重新進來時沒有存值，照常從頂端開始
    const view = memoFor(key).read(true)
    if (!view) return
    const o = optsRef.current
    if (view.tab && o.onRestoreTab) o.onRestoreTab(view.tab)
    if (view.count && o.onRestoreCount) o.onRestoreCount(view.count)
    return restoreScrollTo(view.y)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  /** 點進內頁前把位置記起來（可直接當 onClickCapture 的 handler） */
  return useCallback((e?: { target?: unknown }) => {
    const target = e?.target
    const from = target instanceof Element ? (target.closest('a')?.getAttribute('href') ?? '') : ''
    const o = optsRef.current
    memoFor(key).remember({ tab: o.tab ?? '', y: window.scrollY, count: o.count ?? 0, from })
  }, [key])
}
