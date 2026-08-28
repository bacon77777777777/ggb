import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'
import { LINE_PUSH_KEYS, LinePushKey } from '@/lib/linePush'

/**
 * GB哥通知的「推播文字格式」＋「推播時間」（老闆 2026-08-28）
 *
 * 格式：`line_push_templates.template`，`{{content}}` 會被換成 agent 產生的內容。
 * 時間：**從 pg_cron 現查**，不寫死在前端 —— 排程改在資料庫，
 *       寫死的時間遲早會跟實際對不上（CLAUDE.md 也記著同一條教訓）。
 */

/** cron job 名稱 → 推播開關。一支排程可能對應多個推播（如對帳／月結都推 finance） */
const JOB_TO_KEY: Record<string, LinePushKey> = {
  'daily-line-report': 'line_push_daily',
  'cfo-agent-daily': 'line_push_cfo',
  'cmo-agent-daily': 'line_push_cmo',
  'supply-chain-morning': 'line_push_supply',
  'supply-chain-evening': 'line_push_supply',
  'health-check': 'line_push_health',
  'market-intel-weekly': 'line_push_market',
  'market-discovery-monthly': 'line_push_market',
  'competitive-intel': 'line_push_market',
  'risk-scan-morning': 'line_push_risk',
  'risk-scan-evening': 'line_push_risk',
  'risk-check': 'line_push_risk',
  'hourly-risk-check': 'line_push_risk',
  'platform-monitor': 'line_push_monitor',
  'ecpay-reconcile': 'line_push_finance',
  'monthly-settlement-snapshot': 'line_push_finance',
  'auto-deliver': 'line_push_deliver',
  'dormant-wakeup': 'line_push_dormant',
  'flag-pending-recharge': 'line_push_recharge',
  'ai-cto-morning': 'line_push_cto',
  'ai-cto-evening': 'line_push_cto',
  'warehouse-auto-dismantle': 'line_push_warehouse_dismantle',
  'weekly-report': 'line_push_weekly',
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/**
 * cron 運算式（**UTC**）翻成看得懂的台灣時間。
 * pg_cron 存的是 UTC，+8 之後可能跨日，星期也要跟著移。
 */
function describeSchedule(expr: string): string {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return expr
  const [min, hour, dom, mon, dow] = parts

  if (min.startsWith('*/')) return `每 ${min.slice(2)} 分鐘`
  if (hour === '*' && /^\d+$/.test(min)) return `每小時 ${min.padStart(2, '0')} 分`
  if (hour.startsWith('*/') && /^\d+$/.test(min)) {
    const step = Number(hour.slice(2))
    const hours = Array.from({ length: Math.ceil(24 / step) }, (_, i) => (i * step + 8) % 24)
    return `每 ${step} 小時（${hours.sort((a, b) => a - b).map(h => `${String(h).padStart(2, '0')}:${min.padStart(2, '0')}`).join('／')}）`
  }

  const toTw = (h: number) => (h + 8) % 24
  const crossesDay = (h: number) => h + 8 >= 24
  const hhmm = (h: number) => `${String(toTw(h)).padStart(2, '0')}:${min.padStart(2, '0')}`

  if (/^[\d,]+$/.test(hour)) {
    const hs = hour.split(',').map(Number)
    const times = hs.map(hhmm).sort().join('／')
    if (dow !== '*') {
      // 跨日要把星期一起往後移一天
      const days = dow.split(',').map(d => WEEKDAYS[(Number(d) + (crossesDay(hs[0]) ? 1 : 0)) % 7])
      return `每週${days.join('、')} ${times}`
    }
    if (dom !== '*') return `每月 ${dom} 日 ${times}`
    return `每天 ${times}`
  }
  return expr
}

async function loadSchedules(): Promise<Record<string, string[]>> {
  try {
    const { data } = await getSupabaseAdmin().rpc('execute_readonly_sql', {
      query: 'SELECT jobname, schedule, active FROM cron.job ORDER BY jobname',
    })
    const out: Record<string, string[]> = {}
    for (const row of (data as any[]) ?? []) {
      const key = JOB_TO_KEY[String(row.jobname)]
      if (!key || row.active === false) continue
      const label = describeSchedule(String(row.schedule))
      out[key] = [...(out[key] ?? []), label].filter((v, i, a) => a.indexOf(v) === i)
    }
    return out
  } catch {
    return {}
  }
}

export async function GET() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await getSupabaseAdmin()
    .from('line_push_templates')
    .select('key, template, last_preview, last_pushed_at')
    .in('key', LINE_PUSH_KEYS as unknown as string[])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const schedules = await loadSchedules()
  const templates: Record<string, { template: string; lastPreview: string | null; lastPushedAt: string | null; schedule: string[] }> = {}
  for (const k of LINE_PUSH_KEYS) {
    const row = (data as any[])?.find(r => r.key === k)
    templates[k] = {
      template: String(row?.template ?? '{{content}}'),
      lastPreview: row?.last_preview ?? null,
      lastPushedAt: row?.last_pushed_at ?? null,
      schedule: schedules[k] ?? [],
    }
  }
  return NextResponse.json({ templates }, { status: 200 })
}

export async function PUT(req: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as any
  const key = String(body?.key || '') as LinePushKey
  const template = String(body?.template ?? '')

  if (!LINE_PUSH_KEYS.includes(key)) {
    return NextResponse.json({ error: '不認得這個推播' }, { status: 400 })
  }
  // 沒有 {{content}} 的外框會讓那條推播永遠只剩固定字，擋在寫入前
  if (!template.includes('{{content}}')) {
    return NextResponse.json({ error: '格式裡必須保留 {{content}}，那是內容要放的位置' }, { status: 400 })
  }
  if (template.length > 4000) {
    return NextResponse.json({ error: 'LINE 單則訊息上限 5000 字，格式請控制在 4000 字內' }, { status: 400 })
  }

  const { error } = await getSupabaseAdmin()
    .from('line_push_templates')
    .upsert({ key, template, updated_at: new Date().toISOString() } as any, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction({
    adminId: session.adminId,
    action: '修改 GB哥推播格式',
    targetType: 'line_push_templates',
    targetId: key,
    detail: { template },
    ip: getClientIp(req),
  })

  return NextResponse.json({ success: true }, { status: 200 })
}
