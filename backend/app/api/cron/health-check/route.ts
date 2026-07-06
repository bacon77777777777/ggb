import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const LINE_TOKEN  = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''
const NOTIFY_ID   = process.env.NOTIFY_TARGET_ID ?? ''

// 同一類警報最少間隔 2 小時才再推（避免洗版）
const ALERT_COOLDOWN_MS = 2 * 3600_000

async function pushLine(text: string) {
  if (!LINE_TOKEN || !NOTIFY_ID) return
  await fetch('https://api.line.me/v2/bot/message/push', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_TOKEN}` },
    body:    JSON.stringify({ to: NOTIFY_ID, messages: [{ type: 'text', text }] }),
  })
}

// 透過 platform_settings 做 alert deduplication
async function shouldAlert(supabase: any, alertKey: string): Promise<boolean> {
  const key = `health_last_alert_${alertKey}`
  const { data } = await supabase.from('platform_settings').select('value').eq('key', key).maybeSingle()
  if (!data?.value) return true
  return Date.now() - new Date(data.value).getTime() > ALERT_COOLDOWN_MS
}

async function markAlerted(supabase: any, alertKey: string) {
  const key = `health_last_alert_${alertKey}`
  await supabase.from('platform_settings').upsert({ key, value: new Date().toISOString(), updated_at: new Date().toISOString() })
}

// 台灣時間（小時）
function twHour(): number {
  return new Date(Date.now() + 8 * 3600_000).getUTCHours()
}

export async function GET(req: NextRequest) { return POST(req) }

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const critical: { key: string; msg: string }[] = []
  const warnings: { key: string; msg: string }[] = []
  const t0 = Date.now()
  const hour = twHour()
  const isPeakHour = hour >= 8 && hour <= 23  // TW 08:00–23:00

  // ── 1. DB 連線 & 速度 ─────────────────────────────────────────────
  let dbMs = 0
  try {
    const start = Date.now()
    const { error } = await supabase.from('platform_settings').select('key').limit(1)
    dbMs = Date.now() - start
    if (error) throw error
    if (dbMs > 3000) warnings.push({ key: 'db_slow', msg: `DB 回應慢（${dbMs}ms）` })
  } catch (e: any) {
    critical.push({ key: 'db_down', msg: `DB 連線異常：${(e?.message ?? '').slice(0, 80)}` })
  }

  // ── 2. Supabase 服務狀態 ──────────────────────────────────────────
  try {
    const res = await fetch('https://status.supabase.com/api/v2/status.json', { signal: AbortSignal.timeout(5000) })
    if (res.ok) {
      const data = await res.json()
      const indicator = data?.status?.indicator ?? 'none'
      if (indicator !== 'none') {
        critical.push({ key: 'supabase_status', msg: `Supabase 服務異常：${data?.status?.description ?? indicator}` })
      }
    }
  } catch { /* 無法連到 Supabase status，不算平台問題 */ }

  // ── 3. ECPay callback 錯誤率（近 1 小時）─────────────────────────
  try {
    const { data: webhookStats } = await supabase.rpc('execute_readonly_sql', {
      query: `
        SELECT
          COUNT(*) FILTER (WHERE result = 'failed')  AS failed,
          COUNT(*) FILTER (WHERE result = 'processed') AS ok,
          COUNT(*) AS total
        FROM webhook_events
        WHERE source = 'ecpay_payment'
          AND created_at >= NOW() - INTERVAL '1 hour'
      `
    })
    const s = webhookStats?.[0] ?? {}
    const failed = Number(s.failed ?? 0)
    const total  = Number(s.total  ?? 0)
    if (total >= 3 && failed / total >= 0.5) {
      critical.push({ key: 'ecpay_callback', msg: `ECPay callback 近 1 小時失敗率 ${Math.round(failed/total*100)}%（${failed}/${total} 筆）` })
    } else if (total >= 2 && failed / total >= 0.3) {
      warnings.push({ key: 'ecpay_callback_warn', msg: `ECPay callback 失敗率偏高 ${Math.round(failed/total*100)}%（${failed}/${total} 筆）` })
    }
  } catch { /* ignore */ }

  // ── 4. 業務流量監控（尖峰時段才判斷）────────────────────────────
  if (isPeakHour) {
    // 近 2 小時零儲值（尖峰時段不可能完全沒有）
    try {
      const { data: rechargeCheck } = await supabase.rpc('execute_readonly_sql', {
        query: `
          SELECT COUNT(*) AS cnt
          FROM recharge_records
          WHERE status = 'success'
            AND created_at >= NOW() - INTERVAL '2 hours'
            AND user_id IN (SELECT id FROM users WHERE (is_bot IS NULL OR is_bot = false))
        `
      })
      const cnt = Number(rechargeCheck?.[0]?.cnt ?? 0)
      if (cnt === 0) {
        critical.push({ key: 'zero_recharge', msg: `尖峰時段 2 小時內 0 筆成功儲值，付款流程可能故障` })
      }
    } catch { /* ignore */ }

    // 近 2 小時零抽獎
    try {
      const { data: drawCheck } = await supabase.rpc('execute_readonly_sql', {
        query: `
          SELECT COUNT(*) AS cnt
          FROM draw_records dr
          JOIN users u ON u.id = dr.user_id
          WHERE dr.created_at >= NOW() - INTERVAL '2 hours'
            AND (u.is_bot IS NULL OR u.is_bot = false)
        `
      })
      const cnt = Number(drawCheck?.[0]?.cnt ?? 0)
      if (cnt === 0) {
        warnings.push({ key: 'zero_draws', msg: `尖峰時段 2 小時內 0 筆抽獎，前台或抽獎功能可能故障` })
      }
    } catch { /* ignore */ }
  }

  // ── 5. Pending 儲值積壓（> 3 小時且 > 5 筆）────────────────────
  try {
    const { data: pendingCheck } = await supabase.rpc('execute_readonly_sql', {
      query: `
        SELECT COUNT(*) AS cnt, SUM(amount) AS total
        FROM recharge_records
        WHERE status = 'pending'
          AND created_at < NOW() - INTERVAL '3 hours'
          AND user_id IN (SELECT id FROM users WHERE (is_bot IS NULL OR is_bot = false))
      `
    })
    const cnt   = Number(pendingCheck?.[0]?.cnt   ?? 0)
    const total = Number(pendingCheck?.[0]?.total ?? 0)
    if (cnt >= 5) {
      warnings.push({ key: 'pending_stuck', msg: `${cnt} 筆儲值卡在 pending 超過 3 小時（NT$ ${total.toLocaleString()}）` })
    }
  } catch { /* ignore */ }

  // ── 6. Sentry 錯誤偵測（若有設定）───────────────────────────────
  const sentryToken   = process.env.SENTRY_AUTH_TOKEN
  const sentryOrg     = process.env.SENTRY_ORG
  const sentryProject = process.env.SENTRY_PROJECT
  if (sentryToken && sentryOrg && sentryProject) {
    try {
      const since = new Date(Date.now() - 3600_000).toISOString()
      const res = await fetch(
        `https://sentry.io/api/0/projects/${sentryOrg}/${sentryProject}/issues/?query=is:unresolved&limit=25&start=${since}`,
        { headers: { Authorization: `Bearer ${sentryToken}` }, signal: AbortSignal.timeout(8000) }
      )
      if (res.ok) {
        const issues = await res.json() as any[]
        const highCount = issues.filter((i: any) => i.level === 'fatal' || i.level === 'error').length
        if (highCount >= 5) {
          critical.push({ key: 'sentry_errors', msg: `Sentry 近 1 小時新增 ${highCount} 個 error/fatal 問題` })
        } else if (highCount >= 2) {
          warnings.push({ key: 'sentry_errors_warn', msg: `Sentry 近 1 小時新增 ${highCount} 個錯誤，請留意` })
        }
      }
    } catch { /* Sentry 不可用，不影響平台健康 */ }
  }

  // ── 推播（deduplication：同 key 2 小時內不重複推）──────────────
  const allAlerts = [
    ...critical.map(a => ({ ...a, level: '🔴' as const })),
    ...warnings.map(a => ({ ...a, level: '🟡' as const })),
  ]

  const toAlert: typeof allAlerts = []
  for (const a of allAlerts) {
    if (await shouldAlert(supabase, a.key)) toAlert.push(a)
  }

  if (toAlert.length > 0) {
    const twNow = new Date(Date.now() + 8 * 3600_000)
    const timeStr = `${twNow.getUTCHours().toString().padStart(2,'0')}:${twNow.getUTCMinutes().toString().padStart(2,'0')}`

    const criticalLines = toAlert.filter(a => a.level === '🔴')
    const warnLines     = toAlert.filter(a => a.level === '🟡')

    const lines = [`🏥 平台健康異常｜${timeStr}`]
    if (criticalLines.length > 0) {
      lines.push('\n🔴 嚴重問題（請立即確認）')
      criticalLines.forEach(a => lines.push(`• ${a.msg}`))
    }
    if (warnLines.length > 0) {
      lines.push('\n🟡 警告')
      warnLines.forEach(a => lines.push(`• ${a.msg}`))
    }
    lines.push('\n可告訴 GB哥「查最近 callback 錯誤」或「查 pending 儲值」取得詳細資訊。')

    await pushLine(lines.join('\n'))

    for (const a of toAlert) await markAlerted(supabase, a.key)
  }

  return NextResponse.json({
    ok:       allAlerts.length === 0,
    critical: critical.length,
    warnings: warnings.length,
    alerted:  toAlert.length,
    dbMs,
    totalMs:  Date.now() - t0,
    issues:   allAlerts.map(a => `${a.level} ${a.msg}`),
  })
}
