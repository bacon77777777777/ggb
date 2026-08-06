import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { findImages, type FindImageInput } from '@/lib/imageFinder'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * 批量匯入的補圖
 *
 * 廠商的 list 常常只有商品名，沒有圖，或只給了還沒上傳的檔名。
 * 原本智能上架就把圖片留空丟回來 —— 但「智能」的意義就是我丟什麼格式都要補齊。
 *
 * 找圖走的是免費路徑（站內同名復用 + DuckDuckGo 圖搜 + 存回 R2），
 * 不用 Claude：批量匯入的品項名稱廠商已經給了，不需要 AI 去猜，缺的只有圖。
 *
 * 前端分批呼叫並顯示進度，不是一次把整份檔案丟過來 ——
 * 一份 50 個商品配 8 個品項就是 450 次搜尋，塞在同一個請求裡一定逾時。
 */

/** 一次最多處理幾筆。抓 40 是讓最壞情況（全部都要搜）也能在 60 秒內跑完 */
const MAX_PER_CALL = 40

export async function POST(request: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const raw = Array.isArray(body?.items) ? body.items : []
    if (!raw.length) return NextResponse.json({ results: [] })
    if (raw.length > MAX_PER_CALL) {
      return NextResponse.json({ error: `一次最多 ${MAX_PER_CALL} 筆` }, { status: 400 })
    }

    const items: FindImageInput[] = raw
      .map((r: Record<string, unknown>) => ({
        key: String(r.key ?? ''),
        query: String(r.query ?? '').slice(0, 120),
        barcode: r.barcode ? String(r.barcode) : null,
        reuse: r.reuse === true,
      }))
      .filter((r: FindImageInput) => r.key && r.query)

    const results = await findImages(items)
    return NextResponse.json({
      results,
      found: results.filter(r => r.url).length,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '補圖失敗' }, { status: 500 })
  }
}
