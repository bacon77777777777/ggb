import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const LINE_TOKEN  = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''
const NOTIFY_ID   = process.env.NOTIFY_TARGET_ID ?? ''

async function pushLine(text: string) {
  if (!LINE_TOKEN || !NOTIFY_ID) return
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_TOKEN}` },
    body: JSON.stringify({ to: NOTIFY_ID, messages: [{ type: 'text', text }] }),
  })
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const issues: string[] = []
  const t0 = Date.now()

  // ── 1. DB 連線 & 回應速度 ───────────────────────────────────────
  let dbOk = false
  let dbMs = 0
  try {
    const supabase = getSupabaseAdmin()
    const start = Date.now()
    const { error } = await supabase.from('risk_alert_settings').select('key').limit(1)
    dbMs = Date.now() - start
    if (error) throw error
    dbOk = true
    if (dbMs > 3000) issues.push(`⚠️ DB 回應慢（${dbMs}ms）`)
  } catch (e: any) {
    issues.push(`🔴 DB 連線異常：${e?.message}`)
  }

  // ── 2. Supabase API 狀態（status.supabase.com）──────────────────
  try {
    const res = await fetch('https://status.supabase.com/api/v2/status.json', {
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const data = await res.json()
      const indicator = data?.status?.indicator ?? 'none'
      if (indicator !== 'none') {
        issues.push(`🔴 Supabase 服務異常：${data?.status?.description ?? indicator}`)
      }
    }
  } catch {
    // Supabase status API 本身無法存取，不算平台異常
  }

  // ── 3. 推播（只在有問題時通知）────────────────────────────────
  if (issues.length > 0) {
    const ts = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
    await pushLine(`🏥 吉吉比 系統健康異常\n${ts}\n\n${issues.join('\n')}`)
  }

  return NextResponse.json({
    ok: issues.length === 0,
    dbOk,
    dbMs,
    issues,
    totalMs: Date.now() - t0,
  })
}
