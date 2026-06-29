import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin.from('small_items').select('*').eq('id', id).single()
    if (error) throw error
    return NextResponse.json({ item: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await request.json()

    const patch: Record<string, any> = {}
    if (body.name !== undefined) patch.name = body.name
    if (body.category !== undefined) patch.category = body.category
    if (body.description !== undefined) patch.description = body.description
    if (body.image_url !== undefined) patch.image_url = body.image_url
    if (body.level !== undefined) patch.level = body.level

    if (Object.keys(patch).length === 0) return NextResponse.json({ error: '缺少更新欄位' }, { status: 400 })

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin.from('small_items').update(patch).eq('id', id).select('*').single()
    if (error) throw error

    return NextResponse.json({ item: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '更新失敗' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const supabaseAdmin = getSupabaseAdmin()
    const { error } = await supabaseAdmin.from('small_items').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '刪除失敗' }, { status: 500 })
  }
}
