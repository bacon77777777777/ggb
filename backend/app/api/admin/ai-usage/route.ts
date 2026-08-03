import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { estimateCostUsd } from '@/lib/aiUsage'

/**
 * AI 用量報表
 *
 * 依 agent 彙總 token 與費用；金額於此換算而非存進 DB，
 * 模型改價時只需改 lib/aiUsage 的費率表，歷史資料不必回頭修。
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const start = searchParams.get('start')   // YYYY-MM-DD（台灣時間）
  const end = searchParams.get('end')
  const agent = searchParams.get('agent')   // 指定 agent 時回傳每日明細

  const supabase = getSupabaseAdmin()
  let q = supabase.from('ai_usage_logs').select('agent, model, input_tokens, output_tokens, created_at')
  // 以台灣時間的日界線篩選
  if (start) q = q.gte('created_at', `${start}T00:00:00+08:00`)
  if (end) q = q.lte('created_at', `${end}T23:59:59+08:00`)
  if (agent) q = q.eq('agent', agent)

  const { data, error } = await q.limit(100_000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []

  type Acc = { calls: number; input: number; output: number; cost: number; models: Set<string> }
  const byAgent = new Map<string, Acc>()
  const byDay = new Map<string, Acc>()

  const add = (m: Map<string, Acc>, key: string, r: typeof rows[number]) => {
    const a = m.get(key) ?? { calls: 0, input: 0, output: 0, cost: 0, models: new Set<string>() }
    a.calls += 1
    a.input += r.input_tokens ?? 0
    a.output += r.output_tokens ?? 0
    a.cost += estimateCostUsd(r.model, r.input_tokens ?? 0, r.output_tokens ?? 0)
    if (r.model) a.models.add(r.model)
    m.set(key, a)
  }

  for (const r of rows) {
    add(byAgent, r.agent, r)
    const day = new Date(new Date(r.created_at).getTime() + 8 * 3600_000).toISOString().slice(0, 10)
    add(byDay, day, r)
  }

  const shape = (m: Map<string, Acc>, keyName: string) =>
    [...m.entries()].map(([k, v]) => ({
      [keyName]: k,
      calls: v.calls,
      input_tokens: v.input,
      output_tokens: v.output,
      cost_usd: Number(v.cost.toFixed(6)),
      models: [...v.models],
    }))

  return NextResponse.json({
    agents: shape(byAgent, 'agent').sort((a, b) => b.cost_usd - a.cost_usd),
    daily: shape(byDay, 'day').sort((a, b) => String(b.day).localeCompare(String(a.day))),
  })
}
