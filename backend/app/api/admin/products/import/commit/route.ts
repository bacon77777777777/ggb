import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession, requireAdminScope, forceSupplierField } from '@/lib/requireAdmin'
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
    const session = await requireAdminScope()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const items: CommitItem[] = Array.isArray(body?.products) ? body.products : []
    if (!items.length) return NextResponse.json({ error: '沒有要上架的商品' }, { status: 400 })

    const supabase = getSupabaseAdmin()
    const now = new Date().toISOString()

    // 機台是平台自營的玩法。只擋範本下載是化妝品 ——
    // 廠商在「商品類型」欄位打「機台」照樣能匯入，所以這裡也要擋。
    let canUseSlot = session.supplierScope === undefined
    if (!canUseSlot && session.supplierScope != null) {
      const { data } = await supabase
        .from('suppliers').select('is_platform').eq('id', session.supplierScope).maybeSingle()
      canUseSlot = data?.is_platform === true
    }

    const results: { row?: number; name: string; ok: boolean; id?: number; error?: string; noPrize?: boolean }[] = []

    for (const item of items) {
      const name = String(item.product?.name ?? '').trim()
      try {
        if (!name) throw new Error('缺少商品名稱')
        if (!item.product?.supplier_id) throw new Error('缺少廠商')
        if (item.product?.type === 'slot' && !canUseSlot) {
          throw new Error('機台商品僅限平台上架')
        }

        const prizes = (item.prizes ?? []).filter(p => Number(p.total) >= 1)

        // 廠商的 list 常常只有商品名稱，一個品項都沒有。
        // 擋下來的話那批商品全部進不了系統，使用者還得回頭一個一個手建 ——
        // 那正是這個功能要消滅的事。所以照樣建立，只是強制「待上架」：
        // 待上架不會開賣，也就不會觸發籤號封存，補完品項再上架即可。
        const noPrize = prizes.length === 0

        const seed = generateSeedHex()
        // 廠商帳號批量匯入時，supplier_id 一律蓋成自己的
        const clean = forceSupplierField(pick(item.product, ALLOWED_PRODUCT_KEYS), session)

        // 殺率不接受廠商指定。解析端已經不回這個欄位給廠商了，
        // 但這裡是最後一道 —— 直接改 request body 一樣送得進來。
        // 拿掉之後走資料表預設值 1.0（等於不設限，最保守）
        if (session.supplierScope !== undefined) delete clean.profit_rate

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
          // 機率不開放手動設定（老闆定案）：檔案給什麼都忽略，
          // 一律依數量佔比計算（40/200 = 20%），跟單筆編輯器同一條規則。
          // 最後賞不佔機率（觸發式，不進輪盤）。
          const isLastOne = (p: Record<string, unknown>) =>
            p.is_last_one === true || ['Last One', 'LAST ONE', 'last one', '最後賞'].includes(String(p.level))
          const totalSum = prizes.reduce((s, p) => s + (isLastOne(p) ? 0 : (Number(p.total) || 0)), 0)
          const normalized = prizes.map(p => ({
            ...p,
            probability: isLastOne(p) || totalSum <= 0 ? 0 : (Number(p.total) || 0) * 100 / totalSum,
          }))
          const { error: prizeErr } = await supabase.from('product_prizes').insert(
            normalized.map(p => ({ ...pick(p, ALLOWED_PRIZE_KEYS), product_id: id }))
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
