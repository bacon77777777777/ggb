import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from './supabaseAdmin'

// ─── Taiwan timezone helpers ───────────────────────────────────────
const TW_MS = 8 * 3600_000

function twNow() {
  return new Date(Date.now() + TW_MS)
}

function getPeriodStart(period: string): string {
  const tw = twNow()
  // Start of today in UTC (TW midnight = UTC 16:00 previous day)
  const todayStartUTC = new Date(
    Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), tw.getUTCDate()) - TW_MS
  )

  switch (period) {
    case 'today':
      return todayStartUTC.toISOString()
    case 'this_week': {
      const dow = tw.getUTCDay() // 0=Sun
      return new Date(todayStartUTC.getTime() - dow * 86400_000).toISOString()
    }
    case 'this_month':
      return new Date(
        Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), 1) - TW_MS
      ).toISOString()
    case 'last_7_days':
      return new Date(Date.now() - 7 * 86400_000).toISOString()
    case 'last_30_days':
      return new Date(Date.now() - 30 * 86400_000).toISOString()
    default:
      return todayStartUTC.toISOString()
  }
}

// ─── Tool implementations ──────────────────────────────────────────

async function getRevenueSummary(period: string) {
  const supabase = getSupabaseAdmin()
  const gte = getPeriodStart(period)

  const [rechargeRes, drawRes] = await Promise.all([
    supabase
      .from('recharge_records')
      .select('amount')
      .eq('status', 'success')
      .gte('created_at', gte),
    supabase
      .from('draw_records')
      .select('user_id')
      .gte('created_at', gte),
  ])

  const recharges = rechargeRes.data ?? []
  const draws = drawRes.data ?? []
  const totalRecharge = recharges.reduce((s, r) => s + Number(r.amount), 0)
  const uniqueDrawers = new Set(draws.map(d => d.user_id)).size

  return {
    period,
    totalRecharge,
    drawCount: draws.length,
    uniqueDrawers,
    rechargeOrders: recharges.length,
  }
}

async function getPendingActions() {
  const supabase = getSupabaseAdmin()

  const [
    { count: pendingShipments },
    { count: lowInventory },
    { count: pendingRefunds },
    { count: pendingSettlements },
    { count: pendingRechargeReview },
  ] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
    supabase.from('products').select('id', { count: 'exact', head: true }).gt('total_count', 0).lte('remaining', 3).neq('status', 'archived'),
    supabase.from('refund_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('settlement_snapshots').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
    supabase.from('recharge_records').select('id', { count: 'exact', head: true }).eq('needs_review', true).eq('status', 'pending'),
  ])

  return {
    pendingShipments:     pendingShipments     ?? 0,
    lowInventory:         lowInventory         ?? 0,
    pendingRefunds:       pendingRefunds        ?? 0,
    pendingSettlements:   pendingSettlements    ?? 0,
    pendingRechargeReview: pendingRechargeReview ?? 0,
  }
}

async function getInventoryStatus(productName?: string, maxRemaining?: number) {
  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('products')
    .select('name, remaining, total_count, status, product_code')
    .neq('status', 'archived')
    .order('remaining', { ascending: true })
    .limit(20)

  if (productName) query = query.ilike('name', `%${productName}%`)
  if (maxRemaining !== undefined) query = query.lte('remaining', maxRemaining)

  const { data } = await query
  return data ?? []
}

async function getRecentOrders(status?: string, limit = 10) {
  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('orders')
    .select('id, order_id, status, total_amount, created_at, user:users(name, email)')
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 20))

  if (status && status !== 'all') query = query.eq('status', status)

  const { data } = await query
  return data ?? []
}

async function lookupUser(searchQuery: string) {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('users')
    .select('id, name, email, tokens, phone_number, created_at, status')
    .or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,phone_number.ilike.%${searchQuery}%`)
    .limit(5)
  return data ?? []
}

// ─── Tool definitions ──────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_revenue_summary',
    description: '查詢指定時段的儲值總額、抽獎次數、參與人數。',
    input_schema: {
      type: 'object' as const,
      properties: {
        period: {
          type: 'string',
          enum: ['today', 'this_week', 'this_month', 'last_7_days', 'last_30_days'],
          description: '時間區間',
        },
      },
      required: ['period'],
    },
  },
  {
    name: 'get_pending_actions',
    description: '查詢目前所有待處理事項數量：待配送訂單、低庫存商品、待審退款、廠商月結草稿、待複核儲值。',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_inventory_status',
    description: '查詢商品庫存狀態。可依商品名稱搜尋，或設定庫存上限篩選低庫存商品。例如「庫存少於10」就傳 max_remaining: 9。',
    input_schema: {
      type: 'object' as const,
      properties: {
        product_name: { type: 'string', description: '商品名稱關鍵字（選填）' },
        max_remaining: { type: 'number', description: '庫存上限（含），只顯示 remaining ≤ 此值的商品。例如少於10就傳9。' },
      },
    },
  },
  {
    name: 'get_recent_orders',
    description: '查詢最近的配送訂單，可依狀態篩選。',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['submitted', 'processing', 'shipping', 'delivered', 'all'],
          description: '訂單狀態（選填）',
        },
        limit: { type: 'number', description: '筆數（預設 10，最多 20）' },
      },
    },
  },
  {
    name: 'lookup_user',
    description: '依姓名、email 或電話查詢會員資料。',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: '搜尋關鍵字（姓名 / email / 電話）' },
      },
      required: ['query'],
    },
  },
]

// ─── Tool dispatcher ───────────────────────────────────────────────

async function executeTool(name: string, input: Record<string, any>): Promise<string> {
  try {
    switch (name) {
      case 'get_revenue_summary':
        return JSON.stringify(await getRevenueSummary(input.period ?? 'today'))
      case 'get_pending_actions':
        return JSON.stringify(await getPendingActions())
      case 'get_inventory_status':
        return JSON.stringify(await getInventoryStatus(input.product_name, input.max_remaining))
      case 'get_recent_orders':
        return JSON.stringify(await getRecentOrders(input.status, input.limit))
      case 'lookup_user':
        return JSON.stringify(await lookupUser(input.query))
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
  } catch (e: any) {
    return JSON.stringify({ error: e?.message ?? 'tool error' })
  }
}

// ─── System prompt ─────────────────────────────────────────────────

function buildSystemPrompt(): string {
  const twDate = new Date(Date.now() + TW_MS)
  const dateStr = twDate.toLocaleDateString('zh-TW', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })
  return `你是 GB哥，吉吉比轉蛋平台的 AI 管家，服務平台的四位管理員夥伴。

你的職責：
- 回答關於平台營運的問題（營收、庫存、訂單、會員等）
- 主動使用工具查詢最新數據，不依賴猜測
- 用繁體中文回覆，語氣輕鬆但專業，適量加 emoji

格式規則：
- 金額加千分位（例：NT$ 12,345）
- 用換行整理清單，重要數字加粗（**數字**）
- 回覆精簡不超過 300 字，不廢話

今天台灣時間：${dateStr}`
}

// ─── Main entry point ──────────────────────────────────────────────

export async function askGbBro(question: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return '⚠️ GB哥目前離線（ANTHROPIC_API_KEY 未設定）'

  const client = new Anthropic({ apiKey })
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: question },
  ]

  for (let round = 0; round < 4; round++) {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: buildSystemPrompt(),
      tools: TOOLS,
      messages,
    })

    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text') as Anthropic.TextBlock | undefined
      return textBlock?.text ?? '（GB哥沒有回應，請再試一次）'
    }

    if (response.stop_reason === 'tool_use') {
      const toolBlocks = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[]
      messages.push({ role: 'assistant', content: response.content })

      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolBlocks.map(async b => ({
          type: 'tool_result' as const,
          tool_use_id: b.id,
          content: await executeTool(b.name, b.input as Record<string, any>),
        }))
      )
      messages.push({ role: 'user', content: toolResults })
      continue
    }

    break
  }

  return '（GB哥思考超時，請再試一次）'
}
