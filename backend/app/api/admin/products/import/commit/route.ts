import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { detectSeriesFromName } from '@/lib/detectSeries'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'
import { PRODUCT_IMPORT_FIELDS, type ProductType } from '@/lib/productSchema'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * 批量上架
 *
 * 前端把 parse 的結果原樣送回來，這裡一筆一筆寫進資料表。
 * 刻意不做「全有全無」的交易：一百筆裡有三筆壞掉，
 * 應該是那三筆留下來給人修，而不是九十七筆一起退回去重跑。
 *
 * 只允許 productSchema 定義過的欄位落地 —— 前端送什麼就寫什麼的話，
 * 廠商檔案裡多出來的欄位會直接讓 insert 失敗，而且錯誤訊息看不出是哪一欄。
 */

const ALLOWED_PRODUCT_KEYS = new Set([
  ...PRODUCT_IMPORT_FIELDS.map(f => f.key).filter(k => !k.startsWith('_')),
  'supplier_id', 'remaining', 'sales', 'sale_mode', 'is_active',
])
const ALLOWED_PRIZE_KEYS = new Set([
  'level', 'name', 'image_url', 'total', 'remaining',
  'probability', 'recycle_value', 'sale_price', 'is_last_one',
  'decompose_type', 'decompose_value',
])

const generateSeedHex = () => crypto.randomBytes(32).toString('hex')
const sha256Hex = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

const pick = (obj: Record<string, unknown>, allowed: Set<string>) =>
  Object.fromEntries(Object.entries(obj).filter(([k, v]) => allowed.has(k) && v !== undefined))

interface CommitItem {
  row?: number
  product: Record<string, unknown>
  prizes?: Record<string, unknown>[]
  tagIds?: string[]
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const items: CommitItem[] = Array.isArray(body?.products) ? body.products : []
    if (!items.length) return NextResponse.json({ error: '沒有要上架的商品' }, { status: 400 })

    const supabase = getSupabaseAdmin()
    const now = new Date().toISOString()

    const results: { row?: number; name: string; ok: boolean; id?: number; error?: string; noPrize?: boolean }[] = []

    for (const item of items) {
      const name = String(item.product?.name ?? '').trim()
      try {
        if (!name) throw new Error('缺少商品名稱')
        if (!item.product?.supplier_id) throw new Error('缺少廠商')

        const prizes = (item.prizes ?? []).filter(p => Number(p.total) >= 1)

        // 廠商的 list 常常只有商品名稱，一個品項都沒有。
        // 擋下來的話那批商品全部進不了系統，使用者還得回頭一個一個手建 ——
        // 那正是這個功能要消滅的事。所以照樣建立，只是強制「待上架」：
        // 待上架不會開賣，也就不會觸發籤號封存，補完品項再上架即可。
        const noPrize = prizes.length === 0

        const seed = generateSeedHex()
        const clean = pick(item.product, ALLOWED_PRODUCT_KEYS)

        // 系列留空時從商品名推斷，跟單筆新增的行為一致
        const series = clean.series || (await detectSeriesFromName(name, supabase)) || null

        const insertProduct = {
          ...clean,
          name,
          series,
          category: clean.category && String(clean.category).trim() !== '' ? clean.category : '未分類',
          seed,
          txid_hash: sha256Hex(seed),
          product_code: `TEMP-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
          sales: 0,
          status: noPrize ? 'pending' : clean.status,
          started_at: !noPrize && clean.status === 'active' && !clean.started_at ? now : (clean.started_at ?? null),
        }

        const { data: created, error: insErr } = await supabase
          .from('products').insert(insertProduct).select('id').single()

        if (insErr || !created) {
          throw new Error([insErr?.message, insErr?.details, insErr?.hint].filter(Boolean).join(' | ') || '寫入失敗')
        }

        const id = created.id as number
        await supabase.from('products').update({ product_code: String(10000000 + id) }).eq('id', id)

        if (prizes.length) {
          const { error: prizeErr } = await supabase.from('product_prizes').insert(
            prizes.map(p => ({ ...pick(p, ALLOWED_PRIZE_KEYS), product_id: id }))
          )
          if (prizeErr) {
            // 品項寫失敗跟「廠商本來就沒給品項」是兩回事：
            // 前者代表資料有問題，留一個半殘的商品只會讓人困惑，收回去
            await supabase.from('products').delete().eq('id', id)
            throw new Error(`品項寫入失敗：${prizeErr.message}`)
          }
        }

        if (Array.isArray(item.tagIds) && item.tagIds.length) {
          await supabase.from('product_tag_links')
            .insert(item.tagIds.map(tagId => ({ product_id: id, tag_id: tagId })))
        }

        results.push({ row: item.row, name, ok: true, id, noPrize })
      } catch (e: unknown) {
        results.push({ row: item.row, name: name || '(未命名)', ok: false, error: e instanceof Error ? e.message : '未知錯誤' })
      }
    }

    const ok = results.filter(r => r.ok).length
    const fail = results.length - ok
    const pendingPrize = results.filter(r => r.ok && r.noPrize).length

    await logAdminAction({
      adminId: session.adminId,
      action: '批量上架商品',
      targetType: 'product',
      targetId: String(ok),
      detail: {
        成功: ok,
        失敗: fail,
        待補品項: pendingPrize,
        失敗清單: results.filter(r => !r.ok).slice(0, 20).map(r => `${r.name}: ${r.error}`),
      },
      ip: getClientIp(request),
    })

    return NextResponse.json({ ok, fail, pendingPrize, results })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '上架失敗'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
