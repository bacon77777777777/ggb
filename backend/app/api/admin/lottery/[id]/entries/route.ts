import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

/**
 * 檔期的登記名單（後台看得到真實暱稱與 user_id；前台走 get_lottery_winners，
 * 那支只回遮罩過的暱稱與名次，不吐 user_id）。
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getSupabaseAdmin()

  const [{ data: ev }, { data: rows }] = await Promise.all([
    supabase.from('lottery_events').select('*').eq('id', id).single(),
    supabase
      .from('lottery_entries')
      .select('*, user:users(id, name, email, avatar_url)')
      .eq('event_id', id)
      // 未開獎時 rank 是 NULL，PostgREST 預設 NULL 排最後，改用登記序號當第二鍵
      .order('rank', { ascending: true, nullsFirst: false })
      .order('entry_no', { ascending: true }),
  ])

  if (!ev) return NextResponse.json({ error: '找不到檔期' }, { status: 404 })
  return NextResponse.json({ event: ev, entries: rows ?? [] })
}
