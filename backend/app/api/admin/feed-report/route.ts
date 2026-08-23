import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

/**
 * 首頁推薦 feed 報表（老闆 2026-08-22）：
 * A/B 變體（feed_ab_report）、各桶曝光／點擊（feed_bucket_report）、商品排行（feed_top_products）、
 * 目前的話題（get_feed_topics）與 A/B 比例。全部排除機器人（函數裡做）。
 */
export async function GET(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days') ?? 7) || 7, 1), 90)
  const admin = getSupabaseAdmin()
  const [ab, buckets, top, topics, ratio] = await Promise.all([
    admin.rpc('feed_ab_report', { p_days: days }),
    admin.rpc('feed_bucket_report', { p_days: days }),
    admin.rpc('feed_top_products', { p_days: days, p_limit: 50 }),
    admin.rpc('get_feed_topics', { p_days: 7 }),
    admin.from('platform_settings').select('value').eq('key', 'feed_ab_ratio').maybeSingle(),
  ])
  const firstError = [ab, buckets, top, topics].find(r => r.error)?.error
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 })
  return NextResponse.json({
    days,
    abRatio: Number(ratio.data?.value ?? 0) || 0,
    ab: ab.data ?? [],
    buckets: buckets.data ?? [],
    top: top.data ?? [],
    topics: topics.data ?? [],
  })
}

/** 調 A/B 比例（分到舊排序 v1 的百分比） */
export async function PUT(req: NextRequest) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const ratio = Math.min(Math.max(Number(body?.abRatio) || 0, 0), 100)
  const { error } = await getSupabaseAdmin()
    .from('platform_settings')
    .upsert({ key: 'feed_ab_ratio', value: String(ratio), updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, abRatio: ratio })
}
