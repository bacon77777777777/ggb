import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function GET() {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase.from('platform_settings').select('*')
    if (error) throw error

    const settings: Record<string, string> = {}
    for (const row of data ?? []) {
      settings[row.key] = row.value
    }
    return NextResponse.json(settings)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json() as Record<string, string>
    const supabase = getSupabaseAdmin()

    const rows = Object.entries(body).map(([key, value]) => ({
      key,
      value: String(value),
      updated_at: new Date().toISOString(),
    }))

    const { error } = await supabase
      .from('platform_settings')
      .upsert(rows, { onConflict: 'key' })

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '儲存失敗' }, { status: 500 })
  }
}
