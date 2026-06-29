import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function GET() {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseAdmin = getSupabaseAdmin()
    const { data, error } = await supabaseAdmin
      .from('roles')
      .select('*')
      .order('id')

    if (error) {
      throw error
    }

    return NextResponse.json(data ?? [])
  } catch (error: any) {
    console.error('Error loading roles:', error)
    return NextResponse.json(
      { error: error.message || '載入角色失敗' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const supabaseAdmin = getSupabaseAdmin()

    if (body.id) {
      const { error } = await supabaseAdmin
        .from('roles')
        .update({
          display_name: body.display_name,
          permissions: body.permissions,
        })
        .eq('id', body.id)

      if (error) {
        throw error
      }
    } else {
      const { error } = await supabaseAdmin
        .from('roles')
        .insert([
          {
            name: body.name,
            display_name: body.display_name,
            permissions: body.permissions,
          },
        ])

      if (error) {
        throw error
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Error saving role:', error)
    return NextResponse.json(
      { error: error.message || '儲存角色失敗' },
      { status: 500 }
    )
  }
}
