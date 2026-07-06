import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from './supabaseAdmin'

// ─── Taiwan timezone helpers ───────────────────────────────────────
const TW_MS = 8 * 3600_000

function twNow() {
  return new Date(Date.now() + TW_MS)
}

function getPeriodStart(period: string): string {
  const tw = twNow()
  const todayStartUTC = new Date(
    Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), tw.getUTCDate()) - TW_MS
  )
  switch (period) {
    case 'today':
      return todayStartUTC.toISOString()
    case 'this_week': {
      const dow = tw.getUTCDay()
      return new Date(todayStartUTC.getTime() - dow * 86400_000).toISOString()
    }
    case 'this_month':
      return new Date(Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), 1) - TW_MS).toISOString()
    case 'last_7_days':
      return new Date(Date.now() - 7 * 86400_000).toISOString()
    case 'last_30_days':
      return new Date(Date.now() - 30 * 86400_000).toISOString()
    default:
      return todayStartUTC.toISOString()
  }
}

// ─── Query tools ───────────────────────────────────────────────────

async function getRealUserIds(): Promise<string[]> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('users')
    .select('id')
    .or('is_bot.is.null,is_bot.eq.false')
  return (data ?? []).map((u: any) => u.id)
}

async function getRevenueSummary(period: string) {
  const supabase = getSupabaseAdmin()
  const gte = getPeriodStart(period)
  const realUserIds = await getRealUserIds()
  const [rechargeRes, drawRes] = await Promise.all([
    supabase.from('recharge_records').select('amount').eq('status', 'success').gte('created_at', gte).in('user_id', realUserIds),
    supabase.from('draw_records').select('user_id, product:products(price)').gte('created_at', gte).in('user_id', realUserIds),
  ])
  const recharges = rechargeRes.data ?? []
  const draws = drawRes.data ?? []
  const totalSpent = draws.reduce((s, r) => {
    const price = (r.product as any)?.price
    return s + (price ? Number(price) : 0)
  }, 0)
  return {
    period,
    totalRecharge: recharges.reduce((s, r) => s + Number(r.amount), 0),
    totalSpent,
    drawCount: draws.length,
    uniqueDrawers: new Set(draws.map(d => d.user_id)).size,
    rechargeOrders: recharges.length,
  }
}

async function getPlatformStats(period?: string) {
  const supabase = getSupabaseAdmin()
  const gte = period ? getPeriodStart(period) : null

  const [totalRes, activeRes, productRes] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }).or('is_bot.is.null,is_bot.eq.false'),
    supabase.from('users').select('id', { count: 'exact', head: true }).or('is_bot.is.null,is_bot.eq.false').eq('status', 'active'),
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('status', 'active'),
  ])

  const result: Record<string, any> = {
    totalMembers: totalRes.count ?? 0,
    activeMembers: activeRes.count ?? 0,
    activeProducts: productRes.count ?? 0,
  }

  if (gte) {
    const [newRes, loginRes] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }).or('is_bot.is.null,is_bot.eq.false').gte('created_at', gte),
      supabase.from('users').select('id', { count: 'exact', head: true }).or('is_bot.is.null,is_bot.eq.false').gte('last_login_at', gte),
    ])
    result.newMembersInPeriod = newRes.count ?? 0
    result.loggedInInPeriod = loginRes.count ?? 0
    result.period = period
  }

  return result
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
    pendingShipments: pendingShipments ?? 0,
    lowInventory: lowInventory ?? 0,
    pendingRefunds: pendingRefunds ?? 0,
    pendingSettlements: pendingSettlements ?? 0,
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

// ─── Write tools ───────────────────────────────────────────────────

async function listSettlements(supplierName?: string, period?: string, status?: string) {
  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('settlement_snapshots')
    .select('id, supplier_name, period_start, period_end, supplier_net, total_g, status, confirmed_at, paid_at, note')
    .order('period_start', { ascending: false })
    .limit(20)
  if (supplierName) query = query.ilike('supplier_name', `%${supplierName}%`)
  if (period) query = query.eq('period_start', `${period}-01`)
  if (status) query = query.eq('status', status)
  const { data } = await query
  return data ?? []
}

async function updateSettlement(id: number, status: 'confirmed' | 'paid', note?: string, actorId?: string) {
  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()
  const update: Record<string, any> = { status, updated_at: now }
  if (note) update.note = note
  if (status === 'confirmed') update.confirmed_at = now
  if (status === 'paid') update.paid_at = now

  const { data, error } = await supabase
    .from('settlement_snapshots')
    .update(update)
    .eq('id', id)
    .select('id, supplier_name, period_start, status')
    .single()
  if (error) throw new Error(error.message)

  try { await supabase.from('admin_action_logs').insert({ admin_id: actorId ?? 'GB哥-LINE', action: status === 'paid' ? '廠商月結標記已付款' : '廠商月結標記已確認', target_type: 'settlement', target_id: String(id), detail: { via: 'GB哥', note } }) } catch (_) { /* ignore log failure */ }

  return data
}

async function listRefunds(status?: string) {
  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('refund_requests')
    .select('id, amount_twd, tokens_to_deduct, reason, status, admin_note, created_at, user:users(name, email)')
    .order('created_at', { ascending: false })
    .limit(15)
  if (status && status !== 'all') query = query.eq('status', status)
  const { data } = await query
  return data ?? []
}

async function manageRefund(id: number, action: 'approve' | 'reject', note?: string, actorId?: string) {
  const supabase = getSupabaseAdmin()
  const now = new Date().toISOString()

  const statusMap = { approve: 'approved', reject: 'rejected' } as const
  const update: Record<string, any> = {
    status: statusMap[action],
    admin_note: note ?? null,
    reviewed_at: now,
  }

  const { data, error } = await supabase
    .from('refund_requests')
    .update(update)
    .eq('id', id)
    .select('id, status, amount_twd, user:users(name)')
    .single()
  if (error) throw new Error(error.message)

  try { await supabase.from('admin_action_logs').insert({ admin_id: actorId ?? 'GB哥-LINE', action: action === 'approve' ? '核准退款申請' : '拒絕退款申請', target_type: 'refund', target_id: String(id), detail: { via: 'GB哥', note } }) } catch (_) { /* ignore log failure */ }

  return data
}

async function markOrderDelivered(identifier: string, actorId?: string) {
  const supabase = getSupabaseAdmin()
  // identifier can be a numeric id or the order_id string
  const isNumeric = /^\d+$/.test(identifier.trim())
  const filter = isNumeric ? { id: Number(identifier) } : { order_id: identifier.trim() }

  const { data: existing } = await supabase
    .from('orders')
    .select('id, order_id, status, user:users(name)')
    .match(filter)
    .single()

  if (!existing) return { error: `找不到訂單 ${identifier}` }
  if (existing.status === 'delivered') return { already: true, order: existing }

  const { error } = await supabase
    .from('orders')
    .update({ status: 'delivered' })
    .eq('id', existing.id)
  if (error) throw new Error(error.message)

  try { await supabase.from('admin_action_logs').insert({ admin_id: actorId ?? 'GB哥-LINE', action: '確認訂單送達', target_type: 'order', target_id: String(existing.id), detail: { via: 'GB哥' } }) } catch (_) { /* ignore log failure */ }

  return { success: true, order: existing }
}

async function dismissRechargeReview(id: number, note?: string, actorId?: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('recharge_records')
    .update({ needs_review: false, review_note: note ?? null })
    .eq('id', id)
    .select('id, order_number, amount')
    .single()
  if (error) throw new Error(error.message)

  try { await supabase.from('admin_action_logs').insert({ admin_id: actorId ?? 'GB哥-LINE', action: '忽略待複核儲值', target_type: 'recharge', target_id: String(id), detail: { via: 'GB哥', note } }) } catch (_) { /* ignore log failure */ }

  return data
}

// ─── Tool definitions ──────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  // ── Query tools ──
  {
    name: 'get_revenue_summary',
    description: '查詢指定時段的儲值總額、抽獎次數、參與人數。',
    input_schema: {
      type: 'object' as const,
      properties: {
        period: {
          type: 'string',
          enum: ['today', 'this_week', 'this_month', 'last_7_days', 'last_30_days'],
        },
      },
      required: ['period'],
    },
  },
  {
    name: 'get_pending_actions',
    description: '查詢所有待處理事項數量：待配送訂單、低庫存商品、待審退款、廠商月結草稿、待複核儲值。',
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_inventory_status',
    description: '查詢商品庫存。可依名稱搜尋，或用 max_remaining 篩選低庫存（例如少於10就傳9）。',
    input_schema: {
      type: 'object' as const,
      properties: {
        product_name: { type: 'string', description: '商品名稱關鍵字' },
        max_remaining: { type: 'number', description: '只顯示 remaining ≤ 此值的商品' },
      },
    },
  },
  {
    name: 'get_recent_orders',
    description: '查詢最近的配送訂單，可依狀態篩選。',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['submitted', 'processing', 'shipping', 'delivered', 'all'] },
        limit: { type: 'number', description: '筆數（預設10，最多20）' },
      },
    },
  },
  {
    name: 'lookup_user',
    description: '依姓名、email 或電話查詢會員資料。',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: '搜尋關鍵字' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_platform_stats',
    description: '查詢平台整體統計：總會員數、活躍會員數、商品數。可傳入 period 查詢特定時段新增/登入會員。',
    input_schema: {
      type: 'object' as const,
      properties: {
        period: {
          type: 'string',
          enum: ['today', 'this_week', 'this_month', 'last_7_days', 'last_30_days'],
          description: '若傳入時段則額外回傳該期間新增會員數、登入會員數',
        },
      },
    },
  },
  // ── Write tools ──
  {
    name: 'list_settlements',
    description: '搜尋廠商月結快照。可依廠商名稱、結算月份（YYYY-MM）、狀態篩選。執行 update_settlement 前請先呼叫此工具確認 ID。',
    input_schema: {
      type: 'object' as const,
      properties: {
        supplier_name: { type: 'string', description: '廠商名稱關鍵字（選填）' },
        period:        { type: 'string', description: '結算月份 YYYY-MM（選填）' },
        status:        { type: 'string', enum: ['draft', 'confirmed', 'paid'], description: '狀態（選填）' },
      },
    },
  },
  {
    name: 'update_settlement',
    description: '更新廠商月結狀態為「已確認」或「已付款」。必須先用 list_settlements 取得正確的 ID。',
    input_schema: {
      type: 'object' as const,
      properties: {
        id:     { type: 'number', description: '結算快照的 id' },
        status: { type: 'string', enum: ['confirmed', 'paid'], description: '新狀態' },
        note:   { type: 'string', description: '備註（選填）' },
      },
      required: ['id', 'status'],
    },
  },
  {
    name: 'list_refunds',
    description: '列出退款申請，可依狀態篩選。執行操作前請先呼叫以確認 ID。',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'processed', 'all'] },
      },
    },
  },
  {
    name: 'manage_refund',
    description: '核准或拒絕退款申請。實際退款（執行代幣扣除）需至後台操作。',
    input_schema: {
      type: 'object' as const,
      properties: {
        id:     { type: 'number', description: '退款申請的 id' },
        action: { type: 'string', enum: ['approve', 'reject'], description: '操作' },
        note:   { type: 'string', description: '備註（選填）' },
      },
      required: ['id', 'action'],
    },
  },
  {
    name: 'mark_order_delivered',
    description: '將指定訂單標記為已送達。可傳入訂單的 order_id 字串或 id 數字。',
    input_schema: {
      type: 'object' as const,
      properties: {
        identifier: { type: 'string', description: '訂單的 order_id 字串或數字 id' },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'dismiss_recharge_review',
    description: '忽略（解除旗標）一筆待複核儲值，讓它不再出現在複核清單。',
    input_schema: {
      type: 'object' as const,
      properties: {
        id:   { type: 'number', description: '儲值記錄的 id' },
        note: { type: 'string', description: '忽略原因（選填）' },
      },
      required: ['id'],
    },
  },
]

// ─── Tool dispatcher ───────────────────────────────────────────────

async function executeTool(name: string, input: Record<string, any>, actorId?: string): Promise<string> {
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
      case 'get_platform_stats':
        return JSON.stringify(await getPlatformStats(input.period))
      case 'list_settlements':
        return JSON.stringify(await listSettlements(input.supplier_name, input.period, input.status))
      case 'update_settlement':
        return JSON.stringify(await updateSettlement(input.id, input.status, input.note, actorId))
      case 'list_refunds':
        return JSON.stringify(await listRefunds(input.status))
      case 'manage_refund':
        return JSON.stringify(await manageRefund(input.id, input.action, input.note, actorId))
      case 'mark_order_delivered':
        return JSON.stringify(await markOrderDelivered(input.identifier, actorId))
      case 'dismiss_recharge_review':
        return JSON.stringify(await dismissRechargeReview(input.id, input.note, actorId))
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
  return `你是 GB哥，吉吉比的 AI 夥伴兼總管，服務平台的四位合夥人老闆。

## 關於吉吉比
台灣的收藏品轉蛋/盒玩/一番賞/抽卡線上平台。多廠商供貨，玩家在平台上用代幣（G幣）抽獎，中獎實體商品寄送到家。四位合夥人共同經營，你是他們的 AI 夥伴。

## 你能做什麼
**你可以回答任何問題**，不限於平台數據：
- 平台營運與商業決策（訂價、行銷策略、廠商談判、客服處理方式）
- 最新平台數據：需要時主動用工具查詢，不要猜測數字
- 執行後台操作：廠商月結更新、退款審核、訂單送達確認等
- 一般知識問答、文案撰寫、分析建議、閒聊

## 你有哪些工具
查詢：營收統計（自動排除測試 bot）、平台統計（總會員數、活躍人數、商品數）、待處理事項、商品庫存、配送訂單、會員資料、廠商月結清單、退款申請
執行：更新廠商月結狀態、核准/拒絕退款、標記訂單送達、解除待複核儲值旗標

執行原則：
- 執行寫入前先查詢確認對象正確
- 執行後回報結果
- 對象不明確時先問清楚

## 回覆風格
- 繁體中文，語氣像懂業務的夥伴，不是客服機器人
- 可以給意見、分析、吐槽，不只回報數字
- 金額加千分位（NT$ 12,345）
- 適量 emoji，不廢話

今天台灣時間：${dateStr}`
}

// ─── Main entry point ──────────────────────────────────────────────

export async function askGbBro(question: string, lineUserId?: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return '⚠️ GB哥目前離線（ANTHROPIC_API_KEY 未設定）'

  const client = new Anthropic({ apiKey })
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: question },
  ]

  for (let round = 0; round < 5; round++) {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
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
          content: await executeTool(b.name, b.input as Record<string, any>, lineUserId),
        }))
      )
      messages.push({ role: 'user', content: toolResults })
      continue
    }

    break
  }

  return '（GB哥思考超時，請再試一次）'
}
