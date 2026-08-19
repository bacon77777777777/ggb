'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * 等一組圖片全部載完。
 *
 * 為什麼不用 Next/Image 的 onLoadingComplete 逐一串：那要改動每一支機台元件，
 * 而且 Next/Image 預設 lazy —— 元件在 visibility:hidden 的容器裡時瀏覽器
 * 不會下載，圖不下載就永遠不回報，變成死結（轉蛋那支就是靠 `priority` 才解掉的）。
 * 直接用 `new Image()` 沒有這個問題：它不管可視範圍，一律開始下載。
 *
 * timeoutMs 是保險：任何一張圖 404 或 CDN 慢，都不該讓玩家卡在載入畫面。
 */
export function useMachineAssets(urls: string[], timeoutMs = 6000): boolean {
  const [ready, setReady] = useState(urls.length === 0)
  // 用字串當依賴，避免呼叫端每次 render 產生新陣列造成無限重跑
  const key = urls.join('|')
  const doneRef = useRef(false)

  useEffect(() => {
    if (!key) { setReady(true); return }
    doneRef.current = false
    setReady(false)

    let pending = urls.length
    const finish = () => {
      if (doneRef.current) return
      doneRef.current = true
      setReady(true)
    }
    const settle = () => { if (--pending <= 0) finish() }

    const imgs = urls.map((src) => {
      const img = new window.Image()
      img.onload = settle
      img.onerror = settle   // 破圖不該卡住玩家
      img.src = src
      return img
    })

    const t = setTimeout(finish, timeoutMs)
    return () => {
      clearTimeout(t)
      imgs.forEach((i) => { i.onload = null; i.onerror = null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, timeoutMs])

  return ready
}
