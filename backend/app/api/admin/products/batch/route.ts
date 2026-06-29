import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

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
      if (autoGenerateTxid && status === 'active') {
        const { data: products } = await supabaseAdmin
          .from('products')
          .select('id, seed, txid_hash')
          .in('id', ids)

        const needs = (products || []).filter((p: any) => !p.txid_hash || !p.seed)
        for (const p of needs) {
          const seed = generateSeedHex()
          const txidHash = sha256Hex(seed)
          await supabaseAdmin.from('products').update({ seed, txid_hash: txidHash }).eq('id', p.id)
        }
      }

      const { data: updated } = await supabaseAdmin
        .from('products')
        .select('id, status, seed, txid_hash')
        .in('id', ids)

      return NextResponse.json({ products: updated || [] })
    }

    if (action === 'delete') {
      const { error: deleteError } = await supabaseAdmin.from('products').delete().in('id', ids)
      if (deleteError) throw deleteError
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '操作失敗' }, { status: 500 })
  }
}

