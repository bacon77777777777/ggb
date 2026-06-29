import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function GET() {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin.from('small_items').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const payload = {
      name: String(body?.name || ''),
      category: String(body?.category || ''),
      description: body?.description ? String(body.description) : null,
      image_url: String(body?.image_url || ''),
      level: String(body?.level || 'E'),
    }

    if (!payload.name || !payload.category || !payload.image_url) {
      return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin.from('small_items').insert(payload).select('*').single()
    if (error) throw error

    return NextResponse.json({ item: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '新增失敗' }, { status: 500 })
  }
}
