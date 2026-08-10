import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

/**
 * 抽獎模組主題參數（machine_theme_params）
 *
 * 參數掛主題不掛商品 —— 物理手感是機台的性格，同主題的商品該一致。
 * GET  ?theme=xxx  取單一主題（後台彈窗開啟時）
 * PUT  { theme, params }  存檔
 */

export async function GET(request: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const theme = new URL(request.url).searchParams.get('theme')
  const supabase = getSupabaseAdmin()

  if (theme) {
    const { data, error } = await supabase
      .from('machine_theme_params').select('params').eq('theme', theme).maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ params: data?.params ?? {} })
  }

  const { data, error } = await supabase.from('machine_theme_params').select('theme, params')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function PUT(request: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json() as { theme?: string; params?: Record<string, unknown> }
  const theme = String(body?.theme ?? '').trim()
  if (!theme) return NextResponse.json({ error: '缺少主題' }, { status: 400 })
  if (!body.params || typeof body.params !== 'object') {
    return NextResponse.json({ error: '參數格式不正確' }, { status: 400 })
  }

  const { error } = await getSupabaseAdmin()
    .from('machine_theme_params')
    .upsert({ theme, params: body.params, updated_at: new Date().toISOString() }, { onConflict: 'theme' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction({
    adminId: session.adminId, action: '調整機台參數',
    targetType: 'machine_theme_params', targetId: theme,
    detail: body.params, ip: getClientIp(request),
  })
  return NextResponse.json({ ok: true })
}
