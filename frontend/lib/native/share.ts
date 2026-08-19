'use client'

import { native } from './bridge'

/**
 * 分享（曬單、分享商品）
 *
 * 三層退路：原生 Share 外掛 → 瀏覽器 Web Share API → 複製連結。
 * 最後一層很重要：桌機 Chrome 沒有 Web Share，沒有它按下去就毫無反應。
 */
export async function shareLink(opts: {
  title?: string
  text?: string
  url: string
  dialogTitle?: string
}): Promise<'shared' | 'copied' | 'failed'> {
  if (native.isNativePlatform()) {
    const r = await native.call('Share', 'share', {
      title: opts.title,
      text: opts.text,
      url: opts.url,
      dialogTitle: opts.dialogTitle ?? '分享到',
    })
    if (r !== null) return 'shared'
  }

  if (typeof navigator !== 'undefined' && 'share' in navigator) {
    try {
      await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({
        title: opts.title,
        text: opts.text,
        url: opts.url,
      })
      return 'shared'
    } catch (err) {
      // 使用者自己按取消不算失敗，不要再往下跳到「已複製連結」
      if ((err as Error)?.name === 'AbortError') return 'shared'
    }
  }

  try {
    await navigator.clipboard.writeText(opts.url)
    return 'copied'
  } catch {
    return 'failed'
  }
}
