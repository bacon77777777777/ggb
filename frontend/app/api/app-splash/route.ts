import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { filterBannersBySchedule } from '@/lib/schedule'

/**
 * App 開屏廣告的資料來源（原生殼專用）
 *
 * 為什麼要有這支，而不是讓前台直接查 Supabase 再抓圖：
 * 圖存在 R2 的公開網域（pub-*.r2.dev），**那個網域沒有回 CORS 標頭**。
 * `<img src>` 顯示不受影響，但開屏廣告需要把圖**存進手機**（存成 data URL，
 * 下次冷啟動才能零網路等待秀出來），而存進手機得先 `fetch()` 讀到 bytes ——
 * 跨網域讀取就是被 CORS 擋的那一種。結果是快取永遠寫不進去、開屏永遠不跳。
 *
 * 所以圖改走這支同源代理：瀏覽器眼中是自己家的網址，沒有跨域問題。
 *
 * 只吃「有沒有 image 這個 query」，不吃任意網址 —— 要代理哪張圖由伺服器
 * 自己查資料庫決定，外面傳不進來，也就沒有 SSRF 的空間。
 */

export const runtime = 'nodejs'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  )
}

/** 現在該顯示的那一張（後台排序最前、且在檔期內的） */
async function currentSplash(): Promise<{ src: string; link: string } | null> {
  const { data } = await db()
    .from('banners')
    .select('id, image_url, link_url, start_at, end_at, events(start_at, end_at)')
    .eq('is_active', true)
    .eq('page', 'app_splash')
    .order('sort_order', { ascending: true })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const live = filterBannersBySchedule((data ?? []) as any[])
  const first = live[0] as { image_url?: string; link_url?: string | null } | undefined
  if (!first?.image_url) return null
  return { src: first.image_url, link: first.link_url || '' }
}

export async function GET(request: Request) {
  const wantsImage = new URL(request.url).searchParams.has('image')

  try {
    const splash = await currentSplash()

    if (!wantsImage) {
      // 沒有在檔期內的開屏 → 回 null，前台會把手機裡的快取清掉
      return NextResponse.json(splash, {
        headers: { 'Cache-Control': 'no-store' },
      })
    }

    if (!splash) return new NextResponse(null, { status: 404 })

    const upstream = await fetch(splash.src, { cache: 'no-store' })
    if (!upstream.ok) return new NextResponse(null, { status: 502 })

    return new NextResponse(upstream.body, {
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'image/webp',
        // 同一張圖不會變（換圖是換檔名），讓 webview 自己也留一份
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return new NextResponse(null, { status: 500 })
  }
}
