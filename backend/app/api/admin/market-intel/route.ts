import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const err = await requireAdminSession(req)
  if (err) return err

  const supabase = getSupabaseAdmin()
  const { searchParams } = req.nextUrl
  const type = searchParams.get('type') ?? 'analysis'

  if (type === 'watchlist') {
    const { data } = await supabase
      .from('competitor_watchlist')
      .select('id, name, url, status, discovered_by, notes, added_at')
      .order('added_at')
    return NextResponse.json(data ?? [])
  }

  // Latest analysis reports
  const { data } = await supabase
    .from('market_intel_analysis')
    .select('id, run_date, run_type, competitors_scraped, report, facts_layer, insight_layer, suggest_layer, anomalies, created_at')
    .order('created_at', { ascending: false })
    .limit(5)

  return NextResponse.json(data ?? [])
}

// 手動觸發 market-intel
export async function POST(req: NextRequest) {
  const err = await requireAdminSession(req)
  if (err) return err

  const CRON_SECRET = process.env.CRON_SECRET ?? ''
  const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? ''

  const res = await fetch(`${BASE}/api/cron/market-intel`, {
    method:  'POST',
    headers: { 'x-cron-secret': CRON_SECRET, 'Content-Type': 'application/json' },
    body:    '{}',
  })

  const data = await res.json()
  return NextResponse.json({ ok: res.ok, ...data })
}
