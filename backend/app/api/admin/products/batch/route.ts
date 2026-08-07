import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

const generateSeedHex = () => crypto.randomBytes(32).toString('hex')
const sha256Hex = (s: string) => crypto.createHash('sha256').update(s).digest('hex')

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const action = String(body?.action || '')
    const ids = Array.isArray(body?.ids) ? body.ids.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n)) : []

    if (ids.length === 0) return NextResponse.json({ error: '缺少 ids' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()

    if (action === 'update_status') {
      const status = String(body?.status || '')
      if (!status) return NextResponse.json({ error: '缺少 status' }, { status: 400 })

      const { error: updateError } = await supabaseAdmin.from('products').update({ status }).in('id', ids)
      if (updateError) throw updateError

      const autoGenerateTxid = Boolean(body?.autoGenerateTxid)
      if (status === 'active') {
        const { data: products } = await supabaseAdmin
          .from('products')
          .select('id, seed, txid_hash, started_at')
          .in('id', ids)

        const now = new Date().toISOString()
        for (const p of (products || [])) {
          const patch: Record<string, any> = {}
          if (!p.started_at) patch.started_at = now
          if (autoGenerateTxid && (!p.txid_hash || !p.seed)) {
            patch.seed = generateSeedHex()
            patch.txid_hash = sha256Hex(patch.seed)
          }
          if (Object.keys(patch).length > 0) {
            await supabaseAdmin.from('products').update(patch).eq('id', p.id)
          }
        }
      }

      const { data: updated } = await supabaseAdmin
        .from('products')
        .select('id, name, status, seed, txid_hash, started_at')
        .in('id', ids)

      /*
       * 商品列表的「上架／下架」開關打的也是這支（ids 只有一個）。
       * 記成「批次更新商品狀態」而且不帶名字的話，看紀錄的人只知道
       * 有人動過狀態，不知道動了哪一個、變成什麼 —— 老闆的原話是
       * 「有紀錄，但沒詳情，這樣還是不知道做了什麼」。
       * 單筆就記成上架／下架並帶商品名，多筆才叫批次。
       */
      const names = (updated || []).map(p => p.name).filter(Boolean)
      const single = ids.length === 1
      await logAdminAction({
        adminId: session.adminId,
        action: single
          ? (status === 'active' ? '上架商品' : '下架商品')
          : '批次更新商品狀態',
        targetType: 'product',
        targetId: single ? String(ids[0]) : undefined,
        detail: single
          ? { name: names[0] ?? '', status }
          : { count: ids.length, name: names.slice(0, 3).join('、') + (names.length > 3 ? ' 等' : ''), status },
        ip: getClientIp(request),
      })
      return NextResponse.json({ products: updated || [] })
    }

    if (action === 'delete') {
      // 名字要在刪除之前抓，刪完就查不到了
      const { data: doomedRows } = await supabaseAdmin.from('products').select('id, name').in('id', ids)
      const doomed = doomedRows || []
      const { error: deleteError } = await supabaseAdmin.from('products').delete().in('id', ids)
      if (deleteError) throw deleteError
      await logAdminAction({
        adminId: session.adminId,
        action: ids.length === 1 ? '刪除商品' : '批次刪除商品',
        targetType: 'product',
        targetId: ids.length === 1 ? String(ids[0]) : undefined,
        detail: { count: ids.length, name: doomed.map(p => p.name).filter(Boolean).slice(0, 3).join('、') },
        ip: getClientIp(request),
      })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '操作失敗' }, { status: 500 })
  }
}

