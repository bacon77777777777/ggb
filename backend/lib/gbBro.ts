import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from './supabaseAdmin'
import { formatTaiwanDate, getRevenueSummaryForPeriod } from './financeMetrics'

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
    case 'yesterday':
      return new Date(todayStartUTC.getTime() - 86400_000).toISOString()
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

async function runSql(query: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.rpc('execute_readonly_sql', { query })
  if (error) return { error: error.message }
  const rows = Array.isArray(data) ? data : (data ? [data] : [])
  return { rows, rowCount: rows.length }
}

async function logCapabilityGap(question: string, context?: string) {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('capability_gaps')
    .insert({ question, context: context ?? null })
    .select('id')
    .single()
  return { logged: true, id: data?.id }
}

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
  const summary = await getRevenueSummaryForPeriod(supabase, period as any)
  return {
    period,
    totalRechargeTwd: summary.totalRechargeTwd,
    drawSpendG: summary.drawSpendG,
    drawCount: summary.drawCount,
    uniquePlayers: summary.uniquePlayers,
    rechargeOrders: summary.rechargeOrderCount,
    periodStart: summary.periodStart,
    periodEnd: summary.periodEnd,
    terms: {
      totalRechargeTwd: '儲值金額，單位 NT$，只含真實付款成功訂單，不含 test/promotion/compensation',
      drawSpendG: '抽獎消費，單位 G。G幣抽獎（points_used=0）使用 products.price，積分抽獎使用 points_used',
    },
  }
}

function detectRevenuePeriod(question: string): 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_7_days' | 'last_30_days' | null {
  const q = question.toLowerCase()
  const isRevenueQuestion = /營收|收入|儲值|消費|抽獎|業績|銷售|成績/.test(question)
  if (!isRevenueQuestion) return null
  if (/昨日|昨天|前一天|昨營收/.test(question)) return 'yesterday'
  if (/今日|今天/.test(question)) return 'today'
  if (/本週|這週|這禮拜|本周/.test(question)) return 'this_week'
  if (/本月|這個月|這月/.test(question)) return 'this_month'
  if (/近\s*30\s*天|最近\s*30\s*天|last\s*30/.test(q)) return 'last_30_days'
  if (/近\s*7\s*天|最近\s*7\s*天|last\s*7/.test(q)) return 'last_7_days'
  if (/最近|近期|這幾天|近況/.test(question)) return 'last_7_days'  // 無具體時間 → 預設近7天
  return null
}

async function answerRevenueSummaryDirectly(period: ReturnType<typeof detectRevenuePeriod>) {
  if (!period) return null
  const summary = await getRevenueSummary(period)
  const start = formatTaiwanDate(new Date(summary.periodStart), { year: 'numeric', month: '2-digit', day: '2-digit' })
  const endDate = new Date(new Date(summary.periodEnd).getTime() - 1)
  const end = formatTaiwanDate(endDate, { year: 'numeric', month: '2-digit', day: '2-digit' })
  const title = period === 'yesterday'
    ? `昨日營收統計（${start}）`
    : start === end
      ? `營收統計（${start}）`
      : `營收統計（${start}～${end}）`

  return [
    title,
    `- 儲值金額：NT$ ${summary.totalRechargeTwd.toLocaleString()}`,
    `- 抽獎消費：${summary.drawSpendG.toLocaleString()} G`,
    `- 抽獎次數：${summary.drawCount.toLocaleString()} 次`,
    `- 參與玩家：${summary.uniquePlayers.toLocaleString()} 人`,
    `- 儲值訂單：${summary.rechargeOrders.toLocaleString()} 筆`,
  ].join('\n')
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

async function fetchWebpage(url: string): Promise<{ content?: string; error?: string }> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`
    const res = await fetch(jinaUrl, {
      headers: { 'Accept': 'text/plain', 'X-No-Cache': 'true' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const text = await res.text()
    // 截斷避免 context 爆炸（保留前 8000 字）
    return { content: text.slice(0, 8000) }
  } catch (e: any) {
    return { error: e?.message ?? '無法擷取網頁' }
  }
}

// ─── Tool definitions ──────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  // ── Query tools ──
  {
    name: 'get_revenue_summary',
    description: '查詢指定時段的營收統計：儲值金額（NT$）、抽獎消費（G）、抽獎次數、參與玩家、儲值訂單。',
    input_schema: {
      type: 'object' as const,
      properties: {
        period: {
          type: 'string',
          enum: ['today', 'yesterday', 'this_week', 'this_month', 'last_7_days', 'last_30_days'],
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
          enum: ['today', 'yesterday', 'this_week', 'this_month', 'last_7_days', 'last_30_days'],
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
  {
    name: 'log_capability_gap',
    description: '當 run_sql 確認平台沒有追蹤某個指標（資料根本不存在，非時間範圍問題），呼叫此工具記錄缺口讓 AI 技術長自動修復，最快 6 小時內完成。',
    input_schema: {
      type: 'object' as const,
      properties: {
        question: { type: 'string', description: '老闆問的問題（原文）' },
        context:  { type: 'string', description: 'GB哥嘗試了什麼查詢、為何查不到' },
      },
      required: ['question'],
    },
  },
  {
    name: 'run_sql',
    description: '執行任意唯讀 SQL（SELECT / WITH）查詢平台資料庫。用於需要彈性分析的問題，例如排名、交叉統計、趨勢分析等。只允許 SELECT，不可 INSERT/UPDATE/DELETE。',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: '要執行的 SQL 查詢（僅 SELECT / WITH）' },
        description: { type: 'string', description: '這個查詢在做什麼（方便除錯）' },
      },
      required: ['query'],
    },
  },
  // ── Risk action tools ──
  {
    name: 'freeze_user',
    description: '凍結指定用戶帳號，阻止其登入與消費。先用 lookup_user 確認身份後執行。',
    input_schema: {
      type: 'object' as const,
      properties: {
        user_id: { type: 'string', description: '用戶 UUID（從 lookup_user 取得）' },
        reason:  { type: 'string', description: '凍結原因' },
      },
      required: ['user_id'],
    },
  },
  {
    name: 'unfreeze_user',
    description: '解除用戶帳號凍結，恢復正常使用。',
    input_schema: {
      type: 'object' as const,
      properties: {
        user_id: { type: 'string', description: '用戶 UUID' },
      },
      required: ['user_id'],
    },
  },
  {
    name: 'flag_user',
    description: '將用戶標記為可疑（is_suspicious=true），不影響其正常使用，僅供內部追蹤。',
    input_schema: {
      type: 'object' as const,
      properties: {
        user_id: { type: 'string', description: '用戶 UUID（從 lookup_user 取得）' },
        reason:  { type: 'string', description: '標記原因' },
      },
      required: ['user_id'],
    },
  },
  {
    name: 'unflag_user',
    description: '解除用戶的可疑標記。',
    input_schema: {
      type: 'object' as const,
      properties: {
        user_id: { type: 'string', description: '用戶 UUID' },
      },
      required: ['user_id'],
    },
  },
  {
    name: 'update_product_stock',
    description: '直接調整商品庫存數量（products.remaining）。delta 為正數表示增加，負數表示減少。可同時傳多個商品 ID。老闆下指令後立即執行，不需再次確認。',
    input_schema: {
      type: 'object' as const,
      properties: {
        product_ids: {
          type: 'array',
          items: { type: 'number' },
          description: '要調整的商品 ID 陣列（從 get_inventory_status 或 run_sql 取得）',
        },
        delta: {
          type: 'number',
          description: '每個商品庫存的增減量，正數=增加，負數=減少',
        },
        reason: {
          type: 'string',
          description: '調整原因（選填，記錄用）',
        },
      },
      required: ['product_ids', 'delta'],
    },
  },
  {
    name: 'update_product_status',
    description: '批次修改商品上下架狀態。active=上架、archived=下架（不可見）、sold_out=售完（仍可見）。',
    input_schema: {
      type: 'object' as const,
      properties: {
        product_ids: { type: 'array', items: { type: 'number' }, description: '商品 ID 陣列' },
        status: { type: 'string', enum: ['active', 'archived', 'sold_out'], description: '目標狀態' },
      },
      required: ['product_ids', 'status'],
    },
  },
  {
    name: 'update_product_price',
    description: '修改商品每抽價格（G）。',
    input_schema: {
      type: 'object' as const,
      properties: {
        product_id: { type: 'number', description: '商品 ID' },
        price:      { type: 'number', description: '新價格（G，正整數）' },
      },
      required: ['product_id', 'price'],
    },
  },
  {
    name: 'adjust_user_tokens',
    description: '手動調整用戶 G幣（tokens）。delta 正數=增加、負數=扣除。操作前應先 lookup_user 確認對象。',
    input_schema: {
      type: 'object' as const,
      properties: {
        user_id: { type: 'string', description: '用戶 UUID' },
        delta:   { type: 'number', description: '代幣增減量（正=增加、負=扣除）' },
        reason:  { type: 'string', description: '調整原因（必填，會記錄在 user_event_logs）' },
      },
      required: ['user_id', 'delta', 'reason'],
    },
  },
  {
    name: 'update_order_tracking',
    description: '填寫或更新訂單物流追蹤號碼，並可同步更新物流狀態。',
    input_schema: {
      type: 'object' as const,
      properties: {
        identifier:      { type: 'string', description: '訂單編號（order_number）或 UUID' },
        tracking_number: { type: 'string', description: '物流追蹤號碼' },
        status:          { type: 'string', enum: ['processing','picked_up','shipping','delivered'], description: '選填：同步更新訂單狀態' },
      },
      required: ['identifier', 'tracking_number'],
    },
  },
  {
    name: 'cancel_order',
    description: '將訂單標記為已取消（status = cancelled）。用於用戶要求取消或下錯單的情況。',
    input_schema: {
      type: 'object' as const,
      properties: {
        identifier: { type: 'string', description: '訂單編號（order_number）或 UUID' },
        reason:     { type: 'string', description: '取消原因' },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'create_coupon',
    description: '建立折扣碼。discount_type: fixed=固定金額折扣、percentage=百分比折扣。',
    input_schema: {
      type: 'object' as const,
      properties: {
        code:           { type: 'string', description: '折扣碼（英數大寫，如 SAVE100）' },
        title:          { type: 'string', description: '折扣碼名稱（顯示用）' },
        discount_type:  { type: 'string', enum: ['fixed','percentage'], description: 'fixed=固定金額、percentage=折數' },
        discount_value: { type: 'number', description: '折扣金額（fixed: NT$、percentage: 0-100%）' },
        min_spend:      { type: 'number', description: '最低消費門檻（選填，預設 0）' },
      },
      required: ['code', 'title', 'discount_type', 'discount_value'],
    },
  },
  {
    name: 'toggle_coupon',
    description: '啟用或停用折扣碼。',
    input_schema: {
      type: 'object' as const,
      properties: {
        code:      { type: 'string', description: '折扣碼' },
        is_active: { type: 'boolean', description: 'true=啟用、false=停用' },
      },
      required: ['code', 'is_active'],
    },
  },
  {
    name: 'update_content_draft',
    description: '更新文案草稿狀態（approved=核准、published=已發布、archived=棄用）。',
    input_schema: {
      type: 'object' as const,
      properties: {
        ids:    { type: 'array', items: { type: 'string' }, description: '草稿 UUID 陣列' },
        status: { type: 'string', enum: ['approved','published','archived','pending'], description: '目標狀態' },
      },
      required: ['ids', 'status'],
    },
  },
  {
    name: 'fetch_webpage',
    description: '擷取任意網頁內容並轉為純文字（用於調研競品、查詢外部資訊）。傳入完整 URL（含 https://）。',
    input_schema: {
      type: 'object' as const,
      properties: {
        url: { type: 'string', description: '要擷取的網頁完整 URL' },
      },
      required: ['url'],
    },
  },
]

// ─── Stock write tool ──────────────────────────────────────────────

async function updateProductStock(productIds: number[], delta: number, reason?: string, actorId?: string) {
  const supabase = getSupabaseAdmin()
  const results: Array<{ id: number; name: string; old: number; new: number }> = []
  const errors: Array<{ id: number; error: string }> = []

  for (const id of productIds) {
    const { data: product } = await supabase
      .from('products')
      .select('id, name, remaining, total_count')
      .eq('id', id)
      .maybeSingle()

    if (!product) { errors.push({ id, error: '找不到商品' }); continue }

    const newRemaining = Math.max(0, product.remaining + delta)
    const { data: updated, error: updateErr } = await supabase
      .from('products')
      .update({ remaining: newRemaining, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id')

    if (updateErr) { errors.push({ id, error: updateErr.message }); continue }
    if (!updated?.length) { errors.push({ id, error: '更新失敗（0 rows affected）' }); continue }

    // 同步更新 product_prizes.remaining，依各獎品 total 比例分配 delta
    const { data: prizes } = await supabase
      .from('product_prizes')
      .select('id, remaining, total')
      .eq('product_id', id)

    if (prizes?.length && product.total_count > 0) {
      let remaining = delta
      const sorted = [...prizes].sort((a, b) => b.total - a.total)
      for (let i = 0; i < sorted.length; i++) {
        const prize = sorted[i]
        const isLast = i === sorted.length - 1
        const share = isLast ? remaining : Math.round(delta * prize.total / product.total_count)
        const newPrizeRemaining = Math.max(0, prize.remaining + share)
        await supabase.from('product_prizes').update({ remaining: newPrizeRemaining }).eq('id', prize.id)
        remaining -= share
      }
    }

    results.push({ id, name: product.name, old: product.remaining, new: newRemaining })
  }

  const summary = results.map(r => `《${r.name}》${r.old} → ${r.new}（${delta > 0 ? '+' : ''}${delta}）`).join('、')
  try { await supabase.from('admin_action_logs').insert({ admin_id: actorId ?? 'GB哥-LINE', action: '調整商品庫存', target_type: 'product', target_id: productIds.join(','), detail: { delta, reason, summary, via: 'GB哥' } }) } catch (_) { /* ignore */ }

  return { updated: results, errors, summary, reason: reason ?? null }
}

// ─── Product write tools ──────────────────────────────────────────

async function updateProductStatus(productIds: number[], status: string, actorId?: string) {
  const supabase = getSupabaseAdmin()
  const results: Array<{ id: number; name: string; status: string }> = []
  const errors: Array<{ id: number; error: string }> = []

  for (const id of productIds) {
    const { data: p } = await supabase.from('products').select('id, name').eq('id', id).maybeSingle()
    if (!p) { errors.push({ id, error: '找不到商品' }); continue }
    const { error } = await supabase.from('products').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) { errors.push({ id, error: error.message }); continue }
    results.push({ id, name: p.name, status })
  }

  const summary = results.map(r => `《${r.name}》→ ${r.status}`).join('、')
  try { await supabase.from('admin_action_logs').insert({ admin_id: actorId ?? 'GB哥-LINE', action: '修改商品狀態', target_type: 'product', target_id: productIds.join(','), detail: { status, summary, via: 'GB哥' } }) } catch (_) { /* ignore */ }

  return { updated: results, errors, summary }
}

async function updateProductPrice(productId: number, price: number, actorId?: string) {
  if (price <= 0 || price > 100_000) return { error: '價格必須在 1～100,000 之間' }
  const supabase = getSupabaseAdmin()
  const { data: p } = await supabase.from('products').select('id, name, price').eq('id', productId).maybeSingle()
  if (!p) return { error: '找不到商品' }
  const { error } = await supabase.from('products').update({ price, updated_at: new Date().toISOString() }).eq('id', productId)
  if (error) return { error: error.message }
  try { await supabase.from('admin_action_logs').insert({ admin_id: actorId ?? 'GB哥-LINE', action: '修改商品價格', target_type: 'product', target_id: String(productId), detail: { old_price: p.price, new_price: price, via: 'GB哥' } }) } catch (_) { /* ignore */ }
  return { ok: true, name: p.name, old_price: p.price, new_price: price }
}

// ─── User write tools ──────────────────────────────────────────────

async function adjustUserTokens(userId: string, delta: number, reason: string, actorId?: string) {
  if (Math.abs(delta) > 999_999) return { error: '單次調整上限 999,999 G幣，請分次操作' }
  const supabase = getSupabaseAdmin()
  const { data: user } = await supabase.from('users').select('id, name, email, tokens').eq('id', userId).maybeSingle()
  if (!user) return { error: '找不到用戶' }

  const newTokens = Math.max(0, (user.tokens ?? 0) + delta)
  const { data: updated, error } = await supabase
    .from('users').update({ tokens: newTokens }).eq('id', userId).select('id')
  if (error) return { error: error.message }
  if (!updated?.length) return { error: '更新失敗（0 rows affected），請確認 user_id 正確' }

  // 寫入 token_adjustments（UNION 進 token_ledger view，不可失敗）
  // 不寫 recharge_records，避免污染綠界對帳數字
  const { error: ledgerErr } = await supabase.from('token_adjustments').insert({
    user_id:    userId,
    delta:      delta,
    reason:     reason,
    created_by: actorId ? `admin#${actorId}` : 'GB哥',
  })
  if (ledgerErr) {
    // Rollback: revert users.tokens since the ledger write failed
    await supabase.from('users').update({ tokens: user.tokens ?? 0 }).eq('id', userId)
    return { error: `代幣已調整但帳本寫入失敗，已回滾：${ledgerErr.message}` }
  }

  await supabase.from('user_event_logs').insert({
    user_id:    userId,
    event_type: 'token_adjustment',
    detail:     { delta, reason, before: user.tokens, after: newTokens, by: actorId ?? 'GB哥' },
  })

  try { await supabase.from('admin_action_logs').insert({ admin_id: actorId ?? 'GB哥-LINE', action: '調整用戶代幣', target_type: 'user', target_id: userId, detail: { delta, reason, old_tokens: user.tokens, new_tokens: newTokens, via: 'GB哥' } }) } catch (_) { /* ignore */ }

  return {
    ok: true,
    name:       user.name ?? user.email,
    old_tokens: user.tokens ?? 0,
    new_tokens: newTokens,
    delta,
    reason,
  }
}

// ─── Order write tools ─────────────────────────────────────────────

async function updateOrderTracking(identifier: string, trackingNumber: string, status?: string, actorId?: string) {
  const supabase = getSupabaseAdmin()
  const isUuid = /^[0-9a-f-]{36}$/i.test(identifier)
  const query = supabase.from('orders').select('id, order_number, tracking_number, status')
  const { data: order } = await (isUuid ? query.eq('id', identifier) : query.eq('order_number', identifier)).maybeSingle()
  if (!order) return { error: '找不到訂單' }

  const update: Record<string, any> = { tracking_number: trackingNumber }
  if (status) {
    update.status = status
    if (status === 'shipping' || status === 'picked_up') update.shipped_at = new Date().toISOString()
  }

  const { error } = await supabase.from('orders').update(update).eq('id', order.id)
  if (error) return { error: error.message }

  try { await supabase.from('admin_action_logs').insert({ admin_id: actorId ?? 'GB哥-LINE', action: '更新物流單號', target_type: 'order', target_id: String(order.id), detail: { order_number: order.order_number, tracking_number: trackingNumber, status, via: 'GB哥' } }) } catch (_) { /* ignore */ }

  return { ok: true, order_number: order.order_number, tracking_number: trackingNumber, status: status ?? order.status }
}

async function cancelOrder(identifier: string, reason?: string, actorId?: string) {
  const supabase = getSupabaseAdmin()
  const isUuid = /^[0-9a-f-]{36}$/i.test(identifier)
  const query = supabase.from('orders').select('id, order_number, status, user_id')
  const { data: order } = await (isUuid ? query.eq('id', identifier) : query.eq('order_number', identifier)).maybeSingle()
  if (!order) return { error: '找不到訂單' }
  if (order.status === 'delivered') return { error: '訂單已送達，無法取消' }

  const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id)
  if (error) return { error: error.message }

  await supabase.from('user_event_logs').insert({
    user_id:    order.user_id,
    event_type: 'order_cancelled',
    detail:     { order_number: order.order_number, reason, by: actorId ?? 'GB哥' },
  })

  try { await supabase.from('admin_action_logs').insert({ admin_id: actorId ?? 'GB哥-LINE', action: '取消訂單', target_type: 'order', target_id: String(order.id), detail: { order_number: order.order_number, reason, via: 'GB哥' } }) } catch (_) { /* ignore */ }

  return { ok: true, order_number: order.order_number, reason }
}

// ─── Coupon write tools ────────────────────────────────────────────

async function createCoupon(code: string, title: string, discountType: string, discountValue: number, minSpend = 0, actorId?: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('coupons').insert({
    code:           code.toUpperCase(),
    title,
    discount_type:  discountType,
    discount_value: discountValue,
    min_spend:      minSpend,
    is_active:      true,
  }).select('id, code').single()
  if (error) return { error: error.message }
  try { await supabase.from('admin_action_logs').insert({ admin_id: actorId ?? 'GB哥-LINE', action: '建立折扣碼', target_type: 'coupon', target_id: data.code, detail: { title, discount_type: discountType, discount_value: discountValue, min_spend: minSpend, via: 'GB哥' } }) } catch (_) { /* ignore */ }
  return { ok: true, id: data.id, code: data.code, title, discount_type: discountType, discount_value: discountValue, min_spend: minSpend }
}

async function toggleCoupon(code: string, isActive: boolean, actorId?: string) {
  const supabase = getSupabaseAdmin()
  const { data: coupon } = await supabase.from('coupons').select('id, title').eq('code', code.toUpperCase()).maybeSingle()
  if (!coupon) return { error: '找不到折扣碼' }
  const { error } = await supabase.from('coupons').update({ is_active: isActive }).eq('code', code.toUpperCase())
  if (error) return { error: error.message }
  try { await supabase.from('admin_action_logs').insert({ admin_id: actorId ?? 'GB哥-LINE', action: isActive ? '啟用折扣碼' : '停用折扣碼', target_type: 'coupon', target_id: code.toUpperCase(), detail: { title: coupon.title, is_active: isActive, via: 'GB哥' } }) } catch (_) { /* ignore */ }
  return { ok: true, code: code.toUpperCase(), title: coupon.title, is_active: isActive }
}

// ─── Content draft write tools ─────────────────────────────────────

async function updateContentDraft(ids: string[], status: string, actorId?: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('content_drafts')
    .update({ status, updated_at: new Date().toISOString() })
    .in('id', ids)
    .select('id, product_name, style, status')
  if (error) return { error: error.message }
  try { await supabase.from('admin_action_logs').insert({ admin_id: actorId ?? 'GB哥-LINE', action: '更新文案草稿狀態', target_type: 'content_draft', target_id: ids.join(','), detail: { status, count: data?.length, via: 'GB哥' } }) } catch (_) { /* ignore */ }
  return { ok: true, updated: data?.length ?? 0, items: data }
}

// ─── Risk action tools ─────────────────────────────────────────────

async function riskAction(
  userId: string,
  action: 'freeze' | 'unfreeze' | 'flag' | 'unflag',
  reason?: string,
  actorId?: string
) {
  const supabase = getSupabaseAdmin()

  const { data: user, error: findErr } = await supabase
    .from('users')
    .select('id, name, email, status, is_suspicious')
    .eq('id', userId)
    .single()

  if (findErr || !user) return { error: '找不到用戶' }

  let update: Record<string, any> = {}
  let label = ''

  switch (action) {
    case 'freeze':
      update = { status: 'frozen', frozen_at: new Date().toISOString(), frozen_by: 'GB哥', frozen_reason: reason ?? '老闆指令' }
      label = '凍結'
      break
    case 'unfreeze':
      update = { status: 'active', frozen_at: null, frozen_by: null, frozen_reason: null }
      label = '解除凍結'
      break
    case 'flag':
      update = { is_suspicious: true, suspicious_reason: reason ?? '老闆標記' }
      label = '標記可疑'
      break
    case 'unflag':
      update = { is_suspicious: false, suspicious_reason: null }
      label = '解除可疑標記'
      break
  }

  const { error } = await supabase.from('users').update(update).eq('id', userId)
  if (error) return { error: error.message }

  await supabase.from('user_event_logs').insert({
    user_id:    userId,
    event_type: action,
    detail:     { action, reason, by: actorId ?? 'GB哥' },
  })

  try { await supabase.from('admin_action_logs').insert({ admin_id: actorId ?? 'GB哥-LINE', action: label, target_type: 'user', target_id: userId, detail: { reason, user_name: user.name, user_email: user.email, via: 'GB哥' } }) } catch (_) { /* ignore */ }

  return { ok: true, action: label, user: { name: user.name, email: user.email } }
}

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
      case 'log_capability_gap':
        return JSON.stringify(await logCapabilityGap(input.question, input.context))
      case 'run_sql':
        return JSON.stringify(await runSql(input.query))
      case 'freeze_user':
        return JSON.stringify(await riskAction(input.user_id, 'freeze', input.reason, actorId))
      case 'unfreeze_user':
        return JSON.stringify(await riskAction(input.user_id, 'unfreeze', undefined, actorId))
      case 'flag_user':
        return JSON.stringify(await riskAction(input.user_id, 'flag', input.reason, actorId))
      case 'unflag_user':
        return JSON.stringify(await riskAction(input.user_id, 'unflag', undefined, actorId))
      case 'update_product_stock':
        return JSON.stringify(await updateProductStock(input.product_ids, input.delta, input.reason, actorId))
      case 'update_product_status':
        return JSON.stringify(await updateProductStatus(input.product_ids, input.status, actorId))
      case 'update_product_price':
        return JSON.stringify(await updateProductPrice(input.product_id, input.price, actorId))
      case 'adjust_user_tokens':
        return JSON.stringify(await adjustUserTokens(input.user_id, input.delta, input.reason, actorId))
      case 'update_order_tracking':
        return JSON.stringify(await updateOrderTracking(input.identifier, input.tracking_number, input.status, actorId))
      case 'cancel_order':
        return JSON.stringify(await cancelOrder(input.identifier, input.reason, actorId))
      case 'create_coupon':
        return JSON.stringify(await createCoupon(input.code, input.title, input.discount_type, input.discount_value, input.min_spend, actorId))
      case 'toggle_coupon':
        return JSON.stringify(await toggleCoupon(input.code, input.is_active, actorId))
      case 'update_content_draft':
        return JSON.stringify(await updateContentDraft(input.ids, input.status, actorId))
      case 'fetch_webpage':
        return JSON.stringify(await fetchWebpage(input.url))
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
  } catch (e: any) {
    return JSON.stringify({ error: e?.message ?? 'tool error' })
  }
}

// ─── Intent routing ────────────────────────────────────────────────

type IntentType =
  | 'A_revenue'
  | 'B_pending'
  | 'C_inventory'
  | 'D_orders'
  | 'E_user'
  | 'F_settlement'
  | 'G_refund'
  | 'H_userTokens'
  | 'I_tokenReconcile'
  | 'J_execute'
  | 'confirm'
  | 'cancel'
  | null

// ── Regex fallback (used when Claude API unavailable) ───────────────
function matchIntentRegex(t: string): IntentType {
  if (/代幣對帳|對帳結果|帳本差異|帳本對帳|token.*對帳/.test(t)) return 'I_tokenReconcile'
  if (/下架|上架|補.*代幣|給.*代幣|扣.*代幣|調整.*代幣|更新.*庫存|調整.*庫存|凍結.*用戶|解凍.*用戶|標記.*可疑|解除.*可疑|取消.*訂單|物流單號|追蹤號|建立.*折扣碼|折扣碼.*(啟用|停用)|核准.*退款|拒絕.*退款|退款.*(核准|拒絕)/.test(t)) return 'J_execute'
  if (/今[日天]|昨[日天]|本週|上週|本月|上月|今天|昨天|這週|近7天|近30天|這個月|上個月|這月/.test(t) && /營收|收入|儲值|消費|抽獎次數|數字|多少/.test(t)) return 'A_revenue'
  if (/營收|儲值.*金額|收入/.test(t)) return 'A_revenue'
  if (/訂單|出貨狀態|最近.*訂單|未出貨|幾筆.*訂單/.test(t)) return 'D_orders'
  if (/待處理|待出貨|待退款|待月結|需要處理|要做什麼|未處理|積壓|今天要/.test(t)) return 'B_pending'
  if (/庫存|剩幾個|還有幾|缺貨|快沒了|補貨|庫存量|低庫存/.test(t)) return 'C_inventory'
  if (/月結|廠商.*結算|結算狀態|廠商.*款項|廠商.*帳款/.test(t)) return 'F_settlement'
  if (/退款|退費|申請退款|退款申請/.test(t)) return 'G_refund'
  if (/代幣|G幣/.test(t) && /用戶|會員|他|她|查|@/.test(t)) return 'H_userTokens'
  if (/找.*用戶|查.*用戶|用戶.*資料|查.*會員|找.*會員|查一下.*@|這個人.*是誰|會員.*資訊|帳號.*資料/.test(t)) return 'E_user'
  return null
}

const INTENT_CLASSIFIER_SYSTEM = `你是吉吉比後台 LINE 助理的意圖分類器。
根據訊息內容，回傳以下其中一個代碼。只回一個字母或 "unknown"，不要任何解釋。

A = 營收/收入/儲值/消費/抽獎數字查詢（含「最近業績」「這個月做了多少」等）
B = 待處理事項（待出貨、待退款、待月結、需要關注、有什麼要做的）
C = 庫存狀態（還夠嗎、快賣完了、缺貨、倉庫情況）
D = 訂單查詢（最近訂單、出貨進度、哪些還沒出）
E = 用戶/會員資料查詢（某人的帳號、找誰、這個人是誰）
F = 廠商月結查詢（廠商帳款、結算、月結）
G = 退款申請查詢（有人要退款、退費情況）
H = 特定用戶的代幣/G幣餘額查詢
I = 代幣帳本對帳（帳本、差異、預期vs實際）
J = 執行寫入操作（下架、補幣、凍結、取消訂單、建折扣碼、填追蹤號等）
unknown = 以上都不是`

const INTENT_MAP: Record<string, IntentType> = {
  A: 'A_revenue', B: 'B_pending', C: 'C_inventory', D: 'D_orders',
  E: 'E_user',    F: 'F_settlement', G: 'G_refund', H: 'H_userTokens',
  I: 'I_tokenReconcile', J: 'J_execute',
}

async function classifyIntent(text: string): Promise<IntentType> {
  const t = text.trim()

  // Short confirm/cancel patterns are unambiguous — skip Claude for these
  if (/^(確認|confirm|ok|好的|是的|執行吧|執行)[\s！!。,，]*$/i.test(t)) return 'confirm'
  if (/^(取消|cancel|不要|算了|放棄|不執行)[\s！!。,，]*$/i.test(t)) return 'cancel'

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return matchIntentRegex(t)

  try {
    const client = new Anthropic({ apiKey })
    const resp = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 5,
      system:     INTENT_CLASSIFIER_SYSTEM,
      messages:   [{ role: 'user', content: t }],
    })
    const raw = ((resp.content[0] as Anthropic.TextBlock)?.text ?? '').trim().toUpperCase()
    return INTENT_MAP[raw] ?? null
  } catch {
    return matchIntentRegex(t)
  }
}

function isAdmin(lineUserId?: string): boolean {
  if (!lineUserId) return false
  const ids = (process.env.ADMIN_LINE_IDS ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)
  return ids.includes(lineUserId)
}

const FALLBACK_MESSAGE = `這個問題我還不確定，目前我能回答：

A. 營收查詢 — 今日/昨日/本週/本月 儲值金額、抽獎消費、次數
B. 待處理事項 — 待出貨、待退款、待月結數量
C. 庫存狀態 — 各商品剩餘數量、低庫存警示
D. 最近訂單 — 依狀態查詢訂單列表
E. 用戶查詢 — 查詢會員基本資料
F. 廠商月結 — 月結清單與狀態
G. 退款申請 — 待處理退款列表
H. 用戶代幣餘額 — 查特定會員G幣（授權成員）
I. 代幣對帳 — 帳本預期vs實際差異
J. 執行操作 — 下架/補幣/訂單/折扣碼等（授權成員，需二次確認）`

// ─── Intent handlers ───────────────────────────────────────────────

async function handleRevenue(text: string): Promise<string> {
  const period = detectRevenuePeriod(text) ?? 'today'
  const result = await answerRevenueSummaryDirectly(period)
  return result ?? '查詢失敗，請稍後再試。'
}

async function handlePending(): Promise<string> {
  const d = await getPendingActions()
  const items: string[] = []
  if (d.pendingShipments > 0)      items.push(`📦 待出貨訂單：${d.pendingShipments} 筆`)
  if (d.pendingRefunds > 0)        items.push(`💸 待處理退款：${d.pendingRefunds} 件`)
  if (d.pendingSettlements > 0)    items.push(`🏭 待確認月結：${d.pendingSettlements} 份`)
  if (d.lowInventory > 0)          items.push(`⚠️ 低庫存商品：${d.lowInventory} 個`)
  if (d.pendingRechargeReview > 0) items.push(`🔍 儲值待審核：${d.pendingRechargeReview} 筆`)
  if (items.length === 0) return '✅ 目前沒有待處理事項。'
  return `待處理事項：\n${items.join('\n')}`
}

async function handleInventory(text: string): Promise<string> {
  const nameMatch = text.match(/庫存[^，,。\n]*?([^\s，,。！?？]+商品|[^\s，,。！?？]{2,8})[的]?/)
  const productName = nameMatch ? nameMatch[1].replace(/商品$/, '') : undefined
  const items = await getInventoryStatus(productName, productName ? undefined : 5)
  if (!items.length) return productName ? `找不到「${productName}」的庫存資料。` : '目前無低庫存商品（≤5個）。'
  const lines = items.map((p: any) => {
    const pct = p.total_count > 0 ? Math.round(p.remaining / p.total_count * 100) : 0
    return `• ${p.name}：${p.remaining}/${p.total_count} 個（${pct}%）`
  })
  const title = productName ? `「${productName}」庫存：` : '低庫存商品（≤5個）：'
  return `${title}\n${lines.join('\n')}`
}

async function handleOrders(text: string): Promise<string> {
  let status: string | undefined
  if (/待出貨|未出貨|submitted/.test(text)) status = 'submitted'
  else if (/出貨中|運送中|shipping/.test(text)) status = 'shipping'
  else if (/已送達|delivered/.test(text)) status = 'delivered'
  const orders = await getRecentOrders(status, 10)
  if (!orders.length) return `${status ? `無「${status}」狀態` : '最近'}訂單。`
  const lines = orders.map((o: any) => {
    const user = o.user?.name ?? o.user?.email ?? '未知用戶'
    const tw = new Date(new Date(o.created_at).getTime() + TW_MS)
    const date = `${tw.getUTCMonth() + 1}/${tw.getUTCDate()}`
    return `• #${o.order_id ?? o.id?.slice(0, 8)} ${date} ${user}（${o.status}）NT$${(o.total_amount ?? 0).toLocaleString()}`
  })
  const label = status ? `【${status}】` : ''
  return `最近${label}訂單（${orders.length}筆）：\n${lines.join('\n')}`
}

async function handleUserLookup(text: string): Promise<string> {
  const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)
  const phoneMatch = text.match(/09\d{8}/)
  const query = emailMatch?.[0] ?? phoneMatch?.[0] ?? text
    .replace(/找|查|用戶|會員|資料|是誰|帳號|這個人/g, '')
    .trim()
  if (!query) return '請提供用戶名稱、Email 或手機號碼。'
  const users = await lookupUser(query)
  if (!users.length) return `找不到「${query}」相關的會員。`
  const lines = users.map((u: any) =>
    `• ${u.name ?? '—'} (${u.email}) 代幣：${u.tokens ?? 0}G 狀態：${u.status ?? 'active'}`
  )
  return `找到 ${users.length} 筆結果：\n${lines.join('\n')}`
}

async function handleSettlement(text: string): Promise<string> {
  const supplierMatch = text.match(/([^\s，,。！?？]{2,10})廠商|廠商[^，,。！?？]{0,2}([^\s，,。！?？]{2,10})/)
  const supplierName = supplierMatch?.[1] ?? supplierMatch?.[2]
  const statusMatch = text.match(/待確認|draft|已確認|confirmed|已付款|paid/)
  const statusMap: Record<string, string> = {
    '待確認': 'draft', draft: 'draft',
    '已確認': 'confirmed', confirmed: 'confirmed',
    '已付款': 'paid', paid: 'paid',
  }
  const status = statusMatch ? statusMap[statusMatch[0]] : undefined
  const items = await listSettlements(supplierName, undefined, status)
  if (!items.length) return '沒有符合條件的月結記錄。'
  const lines = items.slice(0, 10).map((s: any) => {
    const start = s.period_start?.slice(0, 7) ?? '—'
    return `• ${s.supplier_name} ${start} NT$${(s.supplier_net ?? 0).toLocaleString()} [${s.status}]`
  })
  return `月結清單（${items.length}筆）：\n${lines.join('\n')}`
}

async function handleRefund(): Promise<string> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('refund_requests')
    .select('id, amount_twd, reason, status, created_at, user:users(name, email)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(10)
  const items = data ?? []
  if (!items.length) return '✅ 目前沒有待處理退款申請。'
  const lines = items.map((r: any) => {
    const tw = new Date(new Date(r.created_at).getTime() + TW_MS)
    const date = `${tw.getUTCMonth() + 1}/${tw.getUTCDate()}`
    return `• ${date} ${r.user?.name ?? r.user?.email ?? '—'} NT$${r.amount_twd} ${r.reason ?? ''}`
  })
  return `待處理退款（${items.length}筆）：\n${lines.join('\n')}`
}

async function handleUserTokens(text: string, lineUserId?: string): Promise<string> {
  if (!isAdmin(lineUserId)) return '此功能僅限特定成員使用。'
  const emailMatch = text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)
  const phoneMatch = text.match(/09\d{8}/)
  const query = emailMatch?.[0] ?? phoneMatch?.[0] ?? text
    .replace(/查|用戶|會員|代幣|G幣|餘額|有幾個|有多少/g, '')
    .trim()
  if (!query) return '請提供用戶名稱、Email 或手機號碼。'
  const users = await lookupUser(query)
  if (!users.length) return `找不到「${query}」相關的會員。`
  const lines = users.map((u: any) =>
    `• ${u.name ?? '—'} (${u.email})：${u.tokens ?? 0} G`
  )
  return `代幣餘額：\n${lines.join('\n')}`
}

async function handleTokenReconcile(): Promise<string> {
  const supabase = getSupabaseAdmin()

  const [actualRes, rechargeRes, drawRes, manualRes] = await Promise.all([
    supabase.from('users').select('tokens').or('is_bot.is.null,is_bot.eq.false'),
    supabase.from('recharge_records')
      .select('amount, bonus')
      .eq('status', 'success')
      .in('type', ['recharge']),
    // G幣 draws have points_used=0; fall back to product.price (same logic as token_ledger VIEW)
    supabase.from('draw_records').select('points_used, product:products(price)'),
    supabase.from('token_adjustments').select('delta'),
  ])

  const actual = (actualRes.data ?? []).reduce((s: number, u: any) => s + (u.tokens ?? 0), 0)

  const rechargeTotal = (rechargeRes.data ?? []).reduce((s: number, r: any) => s + (r.amount ?? 0) + (r.bonus ?? 0), 0)
  const drawTotal     = (drawRes.data    ?? []).reduce((s: number, r: any) => s + (Number(r.points_used) > 0 ? Number(r.points_used) : Number((r.product as any)?.price ?? 0)), 0)
  const manualTotal   = (manualRes.data  ?? []).reduce((s: number, r: any) => s + (r.delta ?? 0), 0)

  const expected = rechargeTotal + manualTotal - drawTotal
  const diff = actual - expected
  const absDiff = Math.abs(diff)
  const status = absDiff <= 10 ? '✅ 正常' : '⚠️ 需確認'

  return [
    `代幣對帳結果：${status}`,
    `- 帳面預期（儲值+手動-抽獎）：${expected.toLocaleString()} G`,
    `- 實際持有（全體真人）：${actual.toLocaleString()} G`,
    `- 差異：${diff >= 0 ? '+' : ''}${diff.toLocaleString()} G`,
    absDiff > 10 ? `⚠️ 差異超過 ±10G，請核查 token_adjustments 或 draw_records。` : '',
  ].filter(Boolean).join('\n')
}

// ─── Pending action helpers (for J two-step confirm) ───────────────

async function getPendingAction(lineUserId: string) {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from('gb_pending_actions')
    .select('*')
    .eq('line_user_id', lineUserId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data as { id: string; tool_name: string; tool_input: any; description: string } | null
}

async function storePendingAction(lineUserId: string, toolName: string, toolInput: any, description: string) {
  const supabase = getSupabaseAdmin()
  await supabase.from('gb_pending_actions').delete().eq('line_user_id', lineUserId)
  await supabase.from('gb_pending_actions').insert({
    line_user_id: lineUserId,
    tool_name:    toolName,
    tool_input:   toolInput,
    description,
    expires_at:   new Date(Date.now() + 5 * 60_000).toISOString(),
  })
}

async function clearPendingAction(lineUserId: string) {
  const supabase = getSupabaseAdmin()
  await supabase.from('gb_pending_actions').delete().eq('line_user_id', lineUserId)
}

function describeToolCall(toolName: string, input: any): string {
  switch (toolName) {
    case 'update_product_status':
      return `${input.status === 'archived' ? '下架' : '上架'}商品 ${input.product_ids?.join('、')}`
    case 'update_product_stock':
      return `調整商品庫存 ${input.delta > 0 ? '+' : ''}${input.delta}（原因：${input.reason ?? '未說明'}）`
    case 'update_product_price':
      return `修改商品 ${input.product_id} 價格為 ${input.price}`
    case 'adjust_user_tokens':
      return `${input.delta > 0 ? '增加' : '扣除'}用戶 ${input.user_id} 代幣 ${Math.abs(input.delta)}G（原因：${input.reason ?? '未說明'}）`
    case 'update_order_tracking':
      return `更新訂單 ${input.identifier} 追蹤號為 ${input.tracking_number}`
    case 'cancel_order':
      return `取消訂單 ${input.identifier}（原因：${input.reason ?? '未說明'}）`
    case 'create_coupon':
      return `建立折扣碼 ${input.code}，面額 ${input.discount_value}${input.discount_type === 'fixed' ? ' 元' : '%'}`
    case 'toggle_coupon':
      return `${input.is_active ? '啟用' : '停用'}折扣碼 ${input.code}`
    case 'freeze_user':
      return `凍結用戶 ${input.user_id}（原因：${input.reason ?? '未說明'}）`
    case 'unfreeze_user':
      return `解凍用戶 ${input.user_id}`
    case 'flag_user':
      return `標記用戶 ${input.user_id} 為可疑`
    case 'unflag_user':
      return `解除用戶 ${input.user_id} 的可疑標記`
    case 'mark_order_delivered':
      return `標記訂單 ${input.identifier} 已送達`
    case 'manage_refund':
      return `${input.action === 'approve' ? '核准' : '拒絕'}退款申請 ${input.id}`
    case 'update_settlement':
      return `更新月結 ${input.id} 狀態為 ${input.status}`
    case 'run_sql':
      return `執行 SQL：${String(input.query).slice(0, 80)}`
    default:
      return `執行 ${toolName}`
  }
}

async function handleExecute(text: string, lineUserId: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return '⚠️ GB哥目前離線（ANTHROPIC_API_KEY 未設定）'

  const client = new Anthropic({ apiKey })

  const systemPrompt = `你是操作解析器。根據使用者的中文指令，判斷要呼叫哪個工具以及哪些參數。
只用 tool_use 回應。若需要先查 ID（如商品名稱→product_id），請先用 run_sql 查詢。
資料庫 schema：
products(id uuid, name, status[active/archived/sold_out], remaining int, total_count int, price numeric)
users(id uuid, name, email, tokens int)
orders(id uuid, order_number text, status)
settlement_snapshots(id int, supplier_name, status[draft/confirmed/paid])
refund_requests(id uuid, status[pending/approved/rejected/processed])
coupons(id uuid, code, discount_type[fixed/percent], discount_value numeric)
排除 bot：is_bot IS NULL OR is_bot = false`

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: text }]

  // Up to 3 rounds to resolve IDs if needed (e.g. product name → UUID)
  for (let i = 0; i < 3; i++) {
    const resp = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system:     systemPrompt,
      tools:      TOOLS,
      messages,
    })

    if (resp.stop_reason === 'end_turn') break

    if (resp.stop_reason === 'tool_use') {
      const toolBlocks = resp.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[]
      messages.push({ role: 'assistant', content: resp.content })

      // If final tool is a write operation (not run_sql), we have our target
      const writeBlock = toolBlocks.find(b => b.name !== 'run_sql')
      if (writeBlock) {
        const desc = describeToolCall(writeBlock.name, writeBlock.input)
        await storePendingAction(lineUserId, writeBlock.name, writeBlock.input, desc)
        return `即將執行：${desc}\n\n請回覆「確認」執行，或「取消」放棄。（5分鐘內有效）`
      }

      // run_sql: execute to get IDs, continue loop
      const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolBlocks.map(async b => ({
          type:        'tool_result' as const,
          tool_use_id: b.id,
          content:     await executeTool(b.name, b.input as Record<string, any>, lineUserId),
        }))
      )
      messages.push({ role: 'user', content: results })
      continue
    }

    break
  }

  return `無法解析操作，請更具體說明。例如：「把龍種下架」、「給用戶 xxx@gmail.com 補 100 代幣，原因補償」`
}

// ─── Conversation history ──────────────────────────────────────────

const HISTORY_TTL_MS  = 30 * 60_000
const HISTORY_MAX_MSG = 20
const HISTORY_LOAD    = 12

async function loadHistory(lineUserId: string): Promise<Anthropic.MessageParam[]> {
  try {
    const supabase = getSupabaseAdmin()
    const cutoff = new Date(Date.now() - HISTORY_TTL_MS).toISOString()
    const { data } = await supabase
      .from('line_conversations')
      .select('role, content')
      .eq('line_user_id', lineUserId)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LOAD)
    if (!data || data.length === 0) return []
    return data.reverse().map(r => ({
      role:    r.role as 'user' | 'assistant',
      content: r.content,
    }))
  } catch {
    return []
  }
}

async function saveHistory(lineUserId: string, userMsg: string, assistantMsg: string) {
  try {
    const supabase = getSupabaseAdmin()
    await supabase.from('line_conversations').insert([
      { line_user_id: lineUserId, role: 'user',      content: userMsg },
      { line_user_id: lineUserId, role: 'assistant', content: assistantMsg },
    ])
    const { data: all } = await supabase
      .from('line_conversations')
      .select('id')
      .eq('line_user_id', lineUserId)
      .order('created_at', { ascending: false })
    if (all && all.length > HISTORY_MAX_MSG) {
      const toDelete = all.slice(HISTORY_MAX_MSG).map((r: any) => r.id)
      await supabase.from('line_conversations').delete().in('id', toDelete)
    }
  } catch { /* don't break main flow */ }
}

// ─── Open-question fallback: full Claude tool loop ────────────────

async function handleOpenQuestion(text: string, lineUserId?: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return '目前 AI 服務暫時不可用，請稍後再試。'

  const client  = new Anthropic({ apiKey })
  const history = lineUserId ? await loadHistory(lineUserId) : []
  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: 'user', content: text },
  ]

  for (let i = 0; i < 5; i++) {
    const resp = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      system:     buildSystemPrompt(),
      tools:      TOOLS,
      messages,
    })

    if (resp.stop_reason === 'end_turn') {
      const block = resp.content.find(b => b.type === 'text') as Anthropic.TextBlock | undefined
      return block?.text ?? '目前找不到相關資料，請換個方式描述。'
    }

    if (resp.stop_reason === 'tool_use') {
      const toolBlocks = resp.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[]
      messages.push({ role: 'assistant', content: resp.content })
      const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolBlocks.map(async b => ({
          type:        'tool_result' as const,
          tool_use_id: b.id,
          content:     await executeTool(b.name, b.input as Record<string, any>, lineUserId),
        }))
      )
      messages.push({ role: 'user', content: results })
      continue
    }

    break
  }

  return '目前找不到相關資料，請換個方式描述。'
}

// ─── System prompt ────────────────────────────────────────────────

function buildSystemPrompt(): string {
  const twDate = new Date(Date.now() + TW_MS)
  const dateStr = twDate.toLocaleDateString('zh-TW', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })
  return `你是 GB哥，吉吉比的 AI 夥伴兼總管，服務平台的四位合夥人老闆。

## 關於吉吉比
台灣的收藏品轉蛋/盒玩/一番賞/抽卡線上平台。多廠商供貨，玩家用代幣（G幣）抽獎，中獎商品實體寄送到家。

## 回覆原則
- 直接回答被問的問題，不主動補充建議或分析
- 問「昨日/昨天」只查昨天台灣時間 00:00～24:00，不要改查今天，也不要主動追加近7天比較
- 老闆問建議或分析才給，沒問不加
- 繁體中文，語氣像懂業務的夥伴
- 金額加千分位（NT$ 12,345）
- 數字問題一律用工具查，不猜測
- 詞彙與單位固定：
  - 「儲值金額」= 真實付款成功金額，單位 NT$
  - 「抽獎消費」或「消費金額」= 玩家抽獎消耗的 G，單位 G，不可寫 NT$
  - 「抽獎次數」= draw_records 筆數，單位次
  - 「參與玩家」= 有抽獎紀錄的不重複真人玩家數，單位人
  - 「儲值訂單」= 真實付款成功訂單數，單位筆
- 回答營收統計時優先使用 get_revenue_summary；若自己寫 SQL，抽獎消費必須 SUM(CASE WHEN points_used > 0 THEN points_used ELSE COALESCE(p.price,0) END)，LEFT JOIN products p — G幣抽獎 points_used=0，要用 products.price
- 回答營收統計固定格式與詞彙：儲值金額、抽獎消費、抽獎次數、參與玩家、儲值訂單
- **問題不夠明確時，自己用最合理的方式詮釋後直接查給答案，不回問老闆**
  例如問「VIP 是誰」→ 自行定義多個維度（儲值最多、消費最多、抽獎最多、G幣最多）一起查，全部列出來
  例如問「最近表現好的商品」→ 自己定義「抽獎次數最多」或「庫存消耗率最高」直接查
- 永遠不說「需要更多資訊」或「你想查的是哪種？」，有模糊就多角度全查
- **資料真的不存在時**：先呼叫 log_capability_gap 記錄，再告訴老闆：「這個數據目前還沒追蹤，已通知 AI 技術長，最快 6 小時內修復，修復後可重新詢問。」

## 資料庫 Schema（run_sql 使用）
重要規則：
- 排除測試機器人：查 users 相關時加 WHERE (u.is_bot IS NULL OR u.is_bot = false)
- 時間存 UTC，台灣時間 = UTC+8（+8小時）
- LIMIT 最多 50 筆，除非有特殊需求

主要資料表：
users(id uuid, name, email, phone_number, tokens int, status, is_bot bool, created_at, last_login_at)
recharge_records(id, user_id, order_number, amount numeric, bonus numeric, status[success/pending/failed], created_at, trade_no, payment_method)
draw_records(id, user_id, product_id, product_prize_id, prize_name, prize_level, status, created_at, points_used int)
products(id, name, price numeric, remaining int, total_count int, status[active/archived/sold_out], product_code)
product_prizes(id, product_id, name, level, remaining int, total int, probability numeric)
orders(id, order_number text, user_id, supplier_id, recipient_name, recipient_phone, address, status[submitted/processing/shipping/delivered], total_amount, tracking_number, submitted_at, shipped_at, created_at, logistics_type)
order_items(id, order_id, product_name, prize_name, prize_level, product_id, product_prize_id, quantity, price, created_at)
suppliers(id, name, contact_name, contact_phone, contact_email, address, is_active bool, tax_id, created_at)
settlement_snapshots(id, supplier_name, period_start, period_end, supplier_net numeric, total_g numeric, status[draft/confirmed/paid])
refund_requests(id, user_id, recharge_id, amount_twd numeric, tokens_to_deduct int, status[pending/approved/rejected/processed], reason, created_at, processed_at)
token_ledger(type[recharge], user_id, delta bigint, recharge_amount bigint, recharge_bonus bigint, description, status, created_at)
coupons(id, code, discount_amount, min_spend, status)
user_coupons(id, user_id, coupon_id, used_at, expiry_date)
competitor_posts(id, competitor, platform, content, url, created_at)

## 工具能力總覽
查詢：營收統計、平台統計、待處理事項、庫存、訂單、會員資料、廠商月結、退款、任意 SQL

寫入（直接執行，無需確認）：
- 商品：調整庫存數量、修改上下架狀態、修改價格
- 用戶：調整 G幣、凍結/解凍、標記可疑/解除
- 訂單：填寫追蹤號碼、更新物流狀態、取消訂單
- 月結：更新月結狀態
- 退款：核准/拒絕退款申請
- 折扣碼：建立新折扣碼、啟用/停用折扣碼
- 文案草稿：核准/標記已發布/棄用

執行原則：
**收到老闆指令 → 立即執行 → 回報結果。絕不把問題丟回給老闆，絕不問確認。**
- 「把龍種下架」→ run_sql 查 ID → update_product_status(archived) → 回報
- 「給用戶A補100代幣」→ lookup_user 確認 → adjust_user_tokens → 回報前後數值
- 「訂單123的追蹤號是ABC」→ update_order_tracking → 回報
- 「發個100元折扣碼 SAVE100」→ create_coupon → 回報
- 「把今天的草稿全部核准」→ run_sql 查 pending 草稿 ID → update_content_draft(approved) → 回報
- 多個商品符合條件時，全部一次執行，不分批問確認
- 用戶相關操作前先用 lookup_user 確認對象
- 執行後回報：操作 + 對象名稱 + 執行前後數值

## LINE 推播時間表（台灣時間）
每天固定推播（只有發現異常/待處理事項才推，無事靜默）：
- 08:00 每日早報 — 昨日儲值金額、抽獎消費、新增會員
- 08:30 財務長 — 儲值金額趨勢、代幣對帳、待付款月結
- 09:00 風控長（第一次）— 大量抽獎、大額儲值、測卡行為
- 09:00 行銷長 — 用戶成長、轉換漏斗、熱門商品
- 09:00 AI 文案 — 今日草稿已生成提醒（去後台審核）
- 10:00 AI 技術長（第一次）— capability gap 自動修復
- 10:30 供應鏈協調員（第一次）— 超時出貨、庫存緊張
- 21:00 風控長（第二次）
- 22:00 AI 技術長（第二次）
- 22:30 供應鏈協調員（第二次）

每週固定：
- 週一 11:00 市場情報官 — 自動爬 8 家競品，生成趨勢分析
- 週一 09:00 行銷長 — 加推競品動態 + 行銷週報

即時觸發（任何時間，有事才推）：
- 玩家 1 小時內儲值 ≥ 3 次 → 風控警報
- 管理員執行凍結/標記可疑 → 操作通知
- 文案草稿生成完成 → 提醒審核

平台健康監控（每 10 分鐘，有異常才推，同一問題 2 小時內不重複）：
- DB 連線異常或超慢
- ECPay callback 失敗率 > 50%
- 尖峰時段 2 小時零儲值（付款流程可能故障）
- 尖峰時段 2 小時零抽獎（前台可能故障）
- pending 儲值積壓 > 5 筆超過 3 小時

今天台灣時間：${dateStr}`
}

// ─── Main entry point ──────────────────────────────────────────────

export async function askGbBro(question: string, lineUserId?: string): Promise<string> {
  const text   = question.trim()
  const intent = await classifyIntent(text)

  // ── J two-step: handle confirmation / cancellation ──────────────
  if (lineUserId && (intent === 'confirm' || intent === 'cancel')) {
    const pending = await getPendingAction(lineUserId)
    if (pending) {
      await clearPendingAction(lineUserId)
      if (intent === 'cancel') {
        const answer = '操作已取消。'
        await saveHistory(lineUserId, question, answer)
        return answer
      }
      try {
        const raw    = await executeTool(pending.tool_name, pending.tool_input, lineUserId)
        const parsed = JSON.parse(raw)
        const answer = parsed.error
          ? `❌ 執行失敗：${parsed.error}`
          : `✅ 已完成：${pending.description}`
        await saveHistory(lineUserId, question, answer)
        return answer
      } catch (e: any) {
        const answer = `❌ 執行失敗：${e?.message ?? '未知錯誤'}`
        await saveHistory(lineUserId, question, answer)
        return answer
      }
    }
    // No pending action — fall through to normal intent routing
  }

  let answer: string

  switch (intent) {
    case 'A_revenue':
      answer = await handleRevenue(text)
      break
    case 'B_pending':
      answer = await handlePending()
      break
    case 'C_inventory':
      answer = await handleInventory(text)
      break
    case 'D_orders':
      answer = await handleOrders(text)
      break
    case 'E_user':
      answer = await handleUserLookup(text)
      break
    case 'F_settlement':
      answer = await handleSettlement(text)
      break
    case 'G_refund':
      answer = await handleRefund()
      break
    case 'H_userTokens':
      answer = await handleUserTokens(text, lineUserId)
      break
    case 'I_tokenReconcile':
      answer = await handleTokenReconcile()
      break
    case 'J_execute':
      if (!lineUserId || !isAdmin(lineUserId)) {
        answer = '此功能僅限特定成員使用。'
      } else {
        answer = await handleExecute(text, lineUserId)
      }
      break
    default:
      answer = await handleOpenQuestion(text, lineUserId)
  }

  if (lineUserId) await saveHistory(lineUserId, question, answer)
  return answer
}
