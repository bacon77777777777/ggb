import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

/**
 * GET /api/admin/products/[id]/seal
 *
 * 後台看封存對照表。走 service role 是刻意的 —— 前台的 get_ticket_seal()
 * 在檔期結束前不給整張表（那等於公開答案），但管理員必須看得到自己排的檔期。
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const productId = Number((await params).id)
    if (!Number.isFinite(productId)) {
      return NextResponse.json({ error: '商品編號無效' }, { status: 400 })
    }

    const db = getSupabaseAdmin()

    const [{ data: product }, { data: sealRow }, { data: prizes }, { data: closeout }] = await Promise.all([
      db.from('products').select('name, profit_rate').eq('id', productId).single(),
      db.from('product_ticket_seals').select('*').eq('product_id', productId).maybeSingle(),
      db.from('product_prizes').select('id, level, total').eq('product_id', productId),
      db.from('product_closeouts').select('ticket_numbers').eq('product_id', productId).maybeSingle(),
    ])

    if (!product) return NextResponse.json({ error: '找不到商品' }, { status: 404 })
    if (!sealRow) return NextResponse.json({ product, seal: { sealed: false } })

    const assignment: number[] = sealRow.assignment ?? []
    const levelOf = new Map<number, string>((prizes ?? []).map(p => [p.id as number, p.level as string]))

    // 封存原文必須用跟 DB 完全相同的格式重建，否則重算的 hash 對不上
    const sealText = [
      'GGB-FAIR-v1',
      `product:${productId}`,
      `tickets:${assignment.length}`,
      `salt:${sealRow.salt}`,
      ...assignment.map((prizeId, i) => `${i + 1}:${levelOf.get(prizeId) ?? '?'}`),
    ].join('\n')

    const inTable = new Map<string, number>()
    for (const prizeId of assignment) {
      const level = levelOf.get(prizeId) ?? '?'
      inTable.set(level, (inTable.get(level) ?? 0) + 1)
    }
    const announced = new Map<string, number>()
    for (const p of prizes ?? []) {
      announced.set(p.level as string, (announced.get(p.level as string) ?? 0) + (p.total as number))
    }

    const counts = [...inTable.keys()]
      .sort((a, b) => a.localeCompare(b, 'zh-Hant'))
      .map(level => ({ level, inTable: inTable.get(level) ?? 0, announced: announced.get(level) ?? 0 }))

    const { data: draws } = await db
      .from('draw_records')
      .select('ticket_number, prize_level, user_id')
      .eq('product_id', productId)

    // 名稱另外撈：draw_records 沒有到 users 的 FK，join 不了。
    // 欄位是 users.name，不是 nickname —— 選錯欄位 Supabase 會回錯誤，
    // 而 `?? []` 會把它吞掉，畫面上只會看到整欄的「—」，不會有任何徵兆
    const userIds = [...new Set((draws ?? []).map(d => d.user_id).filter(Boolean))]
    const { data: users, error: usersError } = userIds.length
      ? await db.from('users').select('id, name, email').in('id', userIds)
      : { data: [] as any[], error: null }
    if (usersError) throw usersError
    const nameOf = new Map(
      (users ?? []).map(u => [u.id, u.name || (u.email ?? '').split('@')[0] || null]),
    )

    const drawOf = new Map((draws ?? []).map(d => [d.ticket_number, d]))
    const closedSet = new Set<number>(closeout?.ticket_numbers ?? [])

    const tickets = assignment.map((prizeId, i) => {
      const ticket = i + 1
      const draw = drawOf.get(ticket)
      return {
        ticket,
        sealed: levelOf.get(prizeId) ?? '?',
        actual: draw?.prize_level ?? null,
        userName: draw ? (nameOf.get(draw.user_id) ?? null) : null,
        closed: closedSet.has(ticket),
      }
    })

    return NextResponse.json({
      product,
      seal: {
        sealed: true,
        commitment: sealRow.commitment,
        tickets: assignment.length,
        sealed_at: sealRow.sealed_at,
        closed_out: closeout?.ticket_numbers ?? null,
      },
      seal_text: sealText,
      counts,
      tickets,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '讀取失敗' }, { status: 500 })
  }
}
