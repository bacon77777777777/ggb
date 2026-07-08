import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const maxDuration = 60

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'

async function fetchPage(url: string, timeout = 8000): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'ja,zh-TW;q=0.9', 'Accept': 'text/html' },
      signal: AbortSignal.timeout(timeout),
    })
    if (!r.ok) return null
    return await r.text()
  } catch { return null }
}

function cleanName(name: string) {
  return name.replace(/[《》【】〔〕「」『』〈〉★☆♪～~]/g, ' ').replace(/\s+/g, ' ').trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: Supabase Storage 檔名比對
// raw_image_name 已在 Storage（用戶先上傳 zip）→ 直接用 Storage URL
// ─────────────────────────────────────────────────────────────────────────────
async function resolveStorageImage(raw_image_name: string | null): Promise<string | null> {
  if (!raw_image_name) return null
  const supabase = getSupabaseAdmin()
  const { data: { publicUrl } } = supabase.storage.from('products').getPublicUrl(raw_image_name)
  try {
    const res = await fetch(publicUrl, { method: 'HEAD', signal: AbortSignal.timeout(4000) })
    return res.ok ? publicUrl : null
  } catch { return null }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2: DB 條碼比對（已匯入過的同款商品直接復用）
// ─────────────────────────────────────────────────────────────────────────────
async function fetchFromDB(barcode: string | null): Promise<{
  image_url: string | null
  distributor: string | null
  jp_price_yen: number | null
  prizes: { name: string; image_url: string | null }[]
} | null> {
  if (!barcode) return null
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('products')
    .select('image_url, distributor, jp_price_yen, product_prizes(name, image_url)')
    .eq('barcode', barcode)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return {
    image_url:    data.image_url ?? null,
    distributor:  data.distributor ?? null,
    jp_price_yen: data.jp_price_yen ?? null,
    prizes: (data.product_prizes ?? []).map((p: any) => ({ name: p.name ?? '', image_url: p.image_url ?? null })),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3: 萬代目錄（文字：jp_price_yen + distributor + 品項數）
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeBandaiText(barcode: string): Promise<{
  jp_price_yen: number | null
  variant_count: number | null
} | null> {
  const html = await fetchPage(`https://www.bandai.co.jp/catalog/item.php?jan_cd=${barcode}000`)
  if (!html) return null
  const nameEl = html.match(/<h1[^>]*>([^<]+)<\/h1>/)?.[1]?.trim()
  if (!nameEl) return null
  const jp_price_yen = html.match(/<span>(\d+)<\/span>円/)?.[1]
    ? parseInt(html.match(/<span>(\d+)<\/span>円/)![1]) : null
  const thumbCount = (html.match(/bandai-a\.akamaihd\.net\/bc\/img\/model\//g) ?? []).length
  return {
    jp_price_yen,
    variant_count: thumbCount > 1 ? thumbCount - 1 : null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4: Yahoo Japan 文字搜尋（jp_price_yen fallback）
// ─────────────────────────────────────────────────────────────────────────────
async function scrapePriceFromYahoo(name: string, barcode?: string | null): Promise<number | null> {
  const q = encodeURIComponent(barcode ?? cleanName(name))
  const html = await fetchPage(`https://shopping.yahoo.co.jp/search?p=${q}&tab_ex=commerce`)
  if (!html) return null
  const m = html.match(/(\d{3,6})\s*円/)
  return m ? parseInt(m[1]) : null
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5: Claude 生成品項名稱（純文字）
// ─────────────────────────────────────────────────────────────────────────────
const TYPE_ZH: Record<string, string> = {
  ichiban: '一番賞', blindbox: '盒玩', gacha: '轉蛋', card: '集換式卡牌', custom: '自製賞',
}

async function generateVariantNames(
  productName: string,
  count: number,
  type: string,
  existingNames?: string[],
): Promise<string[]> {
  if (count <= 0) return []
  const zhType = TYPE_ZH[type] ?? '扭蛋'
  if (existingNames?.length === count && existingNames.every(n => n?.trim())) {
    return existingNames
  }
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `這是${zhType}商品「${productName}」，共有 ${count} 款品項。

${existingNames?.filter(Boolean).length ? `已知品項名稱（可能不完整）：\n${existingNames.map((n, i) => `${i + 1}. ${n || '（待填）'}`).join('\n')}\n\n` : ''}請用繁體中文補全或生成所有 ${count} 款品項名稱。
- 一番賞通常是 A賞、B賞、C賞... 搭配角色/物品描述
- 盒玩/轉蛋按角色、配色或型態命名
- 每款名稱 3-12 字，能識別款式即可

直接輸出 ${count} 行，每行一個名稱，不加編號或標點。`,
      }],
    })
    const lines = ((msg.content[0] as any).text as string).trim().split('\n')
      .map((l: string) => l.replace(/^[\d.\-*、。\s]+/, '').trim())
      .filter((l: string) => l.length > 0 && l.length <= 30)
    return lines.slice(0, count)
  } catch { return existingNames?.slice(0, count) ?? [] }
}

// ─────────────────────────────────────────────────────────────────────────────
// 主 Handler
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    barcode,
    product_name,
    variants_count,
    product_type,
    raw_image_name,
    existing_variant_names,
  } = await req.json()

  if (!product_name) return NextResponse.json({ error: 'product_name required' }, { status: 400 })

  const pType     = product_type ?? 'gacha'
  const hintCount = Math.max(Number(variants_count) || 0, 0)

  try {
    // ══════════════════════════════════════════════════════════════════════════
    // Step 1: Storage 檔名比對（毫秒級，最優先）
    // ══════════════════════════════════════════════════════════════════════════
    const storageImageUrl = await resolveStorageImage(raw_image_name ?? null)

    // ══════════════════════════════════════════════════════════════════════════
    // Step 2: DB 條碼比對（曾匯入過同款 → 復用）
    // ══════════════════════════════════════════════════════════════════════════
    const dbResult = await fetchFromDB(barcode ?? null)
    if (dbResult && (dbResult.image_url || dbResult.prizes.length || dbResult.distributor)) {
      const variantCount = hintCount || dbResult.prizes.length
      const names = await generateVariantNames(
        product_name, variantCount, pType,
        dbResult.prizes.map(p => p.name),
      )
      const variants = Array.from({ length: variantCount }, (_, i) => ({
        name:      names[i] ?? dbResult.prizes[i]?.name ?? '',
        image_url: dbResult.prizes[i]?.image_url ?? null,
      }))
      return NextResponse.json({
        ok: true, source: 'db_existing',
        data: {
          image_url:     storageImageUrl ?? dbResult.image_url,
          variants,
          variant_count: variants.length,
          jp_price_yen:  dbResult.jp_price_yen,
          distributor:   dbResult.distributor,
        },
        aiStatus: 'done',
      })
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Step 3: 萬代目錄（文字）+ Yahoo 價格（並行，不抓圖）
    // ══════════════════════════════════════════════════════════════════════════
    const [bandai, yahooPrice] = await Promise.all([
      barcode ? scrapeBandaiText(barcode) : Promise.resolve(null),
      scrapePriceFromYahoo(product_name, barcode),
    ])

    const jp_price_yen = bandai?.jp_price_yen ?? yahooPrice ?? null
    const distributor  = bandai ? '萬代股份有限公司（BANDAI）' : null
    const variantCount = (bandai?.variant_count && bandai.variant_count > 0)
      ? bandai.variant_count
      : hintCount

    // ══════════════════════════════════════════════════════════════════════════
    // Step 4: Claude 生成品項名稱
    // ══════════════════════════════════════════════════════════════════════════
    const names = await generateVariantNames(
      product_name, variantCount, pType,
      existing_variant_names ?? [],
    )
    const variants = Array.from({ length: variantCount }, (_, i) => ({
      name:      names[i] ?? '',
      image_url: null as string | null,
    }))

    const hasInfo = !!(jp_price_yen || distributor || variantCount > 0)

    return NextResponse.json({
      ok: true,
      source: bandai ? 'bandai_catalog_text' : 'yahoo_text',
      data: {
        image_url:     storageImageUrl,   // 只從 Storage，不從外部抓
        variants,
        variant_count: variants.length,
        jp_price_yen,
        distributor,
      },
      aiStatus: hasInfo ? 'done' : 'partial',
    })

  } catch (err: any) {
    console.error('[ai-enrich]', err)
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 })
  }
}
