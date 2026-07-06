import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { generateProductImage } from '@/lib/contentImageTemplate'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

const STYLES = ['promotional', 'story', 'urgency'] as const
type Style = typeof STYLES[number]

const STYLE_PROMPTS: Record<Style, string> = {
  promotional: '促銷型：強調限時優惠、低門檻、抽到賺到。語氣輕鬆活潑，附上 emoji，適合 IG/Threads 貼文。',
  story:       '故事型：描述商品的設計理念或IP背景，帶入玩轉蛋的期待感與收藏樂趣。語氣溫暖有情感。',
  urgency:     '緊迫感型：強調數量有限、先搶先得、錯過等很久。語氣帶緊張感，推動立即下單。',
}

async function generateTextContent(productName: string, style: Style): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return `[ANTHROPIC_API_KEY 未設定] ${productName} - ${style} 草稿`

  const client = new Anthropic({ apiKey })
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `你是吉吉比轉蛋平台的行銷文案撰寫員。請為以下商品撰寫一則社群貼文草稿（IG/Threads）。

商品名稱：${productName}
文案風格：${STYLE_PROMPTS[style]}

要求：
- 字數約 80-150 字
- 附上相關 hashtag（3-5 個）
- 不要加「草稿」或「文案範例」等說明文字
- 直接輸出貼文內容`,
      },
    ],
  })
  return (msg.content[0] as any)?.text ?? ''
}

async function uploadImage(supabase: ReturnType<typeof getSupabaseAdmin>, imgBuf: Buffer, path: string): Promise<string> {
  await supabase.storage.from('content-drafts').upload(path, imgBuf, {
    contentType: 'image/jpeg',
    upsert: true,
  })
  const { data } = supabase.storage.from('content-drafts').getPublicUrl(path)
  return data.publicUrl
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabaseAdmin()

    // 取得昨日台灣時間
    const now = new Date()
    const twNow = new Date(now.getTime() + 8 * 60 * 60 * 1000)
    const twYesterday = new Date(twNow)
    twYesterday.setUTCDate(twYesterday.getUTCDate() - 1)
    const draftDate = twYesterday.toISOString().slice(0, 10)

    const dayStart = new Date(Date.UTC(
      twYesterday.getUTCFullYear(), twYesterday.getUTCMonth(), twYesterday.getUTCDate(), 0, 0, 0
    ) - 8 * 3600_000)
    const dayEnd = new Date(dayStart.getTime() + 86400_000)

    // 找昨日抽獎次數最多的商品
    const { data: topDraws } = await supabase
      .from('draw_records')
      .select('product_id')
      .gte('created_at', dayStart.toISOString())
      .lt('created_at',  dayEnd.toISOString())

    const countMap: Record<string, number> = {}
    for (const d of topDraws ?? []) {
      if (d.product_id) countMap[d.product_id] = (countMap[d.product_id] ?? 0) + 1
    }

    let productId: number | null = null
    let productName = '熱門商品'
    let productImageUrl: string | null = null
    let priceLabel = ''

    if (Object.keys(countMap).length > 0) {
      const topId = Object.entries(countMap).sort((a, b) => b[1] - a[1])[0][0]
      const { data: product } = await supabase
        .from('products')
        .select('id, name, price, images')
        .eq('id', topId)
        .maybeSingle()
      if (product) {
        productId = Number(product.id)
        productName = String(product.name)
        priceLabel = `每抽 NT$${Number(product.price)}`
        const imgs = product.images as string[] | null
        productImageUrl = imgs?.[0] ?? null
      }
    } else {
      // 若昨日無抽獎，取一個上架中的商品
      const { data: product } = await supabase
        .from('products')
        .select('id, name, price, images')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (product) {
        productId = Number(product.id)
        productName = String(product.name)
        priceLabel = `每抽 NT$${Number(product.price)}`
        const imgs = product.images as string[] | null
        productImageUrl = imgs?.[0] ?? null
      }
    }

    // 為三種風格各生成一則文案 + 一張圖
    const results: Array<{ style: Style; textContent: string; imagePath: string }> = []

    for (const style of STYLES) {
      const textContent = await generateTextContent(productName, style)
      const imgBuf = await generateProductImage({
        productImageUrl,
        productName,
        priceLabel,
        style,
      })
      const imagePath = `${draftDate}/${productId ?? 'no-product'}_${style}.jpg`
      await uploadImage(supabase, imgBuf, imagePath)
      results.push({ style, textContent, imagePath })
    }

    // 寫入 content_drafts
    const inserts = results.map(r => ({
      draft_date:   draftDate,
      product_id:   productId,
      product_name: productName,
      style:        r.style,
      text_content: r.textContent,
      image_path:   r.imagePath,
      status:       'pending',
    }))

    const { error } = await supabase.from('content_drafts').insert(inserts)
    if (error) throw error

    // 通知 LINE 有新草稿待審
    const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN
    const notifyId  = process.env.NOTIFY_TARGET_ID
    if (lineToken && notifyId) {
      const msg = `📝 文案草稿已生成｜${draftDate}\n商品：${productName}\n共 ${inserts.length} 則（促銷、故事、緊迫感）\n請至後台「文案草稿」確認並標記發布。`
      await fetch('https://api.line.me/v2/bot/message/push', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lineToken}` },
        body:    JSON.stringify({ to: notifyId, messages: [{ type: 'text', text: msg }] }),
      }).catch(() => {/* ignore */})
    }

    return NextResponse.json({ ok: true, date: draftDate, productName, count: inserts.length })
  } catch (e: any) {
    console.error('[generate-content] error:', e)
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
