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
    description: '修改商品每抽價格（NT$）。',
    input_schema: {
      type: 'object' as const,
      properties: {
        product_id: { type: 'number', description: '商品 ID' },
        price:      { type: 'number', description: '新價格（NT$，正整數）' },
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
]

// ─── Stock write tool ──────────────────────────────────────────────

async function updateProductStock(productIds: number[], delta: number, reason?: string) {
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

  return {
    updated: results,
    errors,
    summary: results
      .map(r => `《${r.name}》${r.old} → ${r.new}（${delta > 0 ? '+' : ''}${delta}）`)
      .join('、'),
    reason: reason ?? null,
  }
}

// ─── Product write tools ──────────────────────────────────────────

async function updateProductStatus(productIds: number[], status: string) {
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

  return { updated: results, errors, summary: results.map(r => `《${r.name}》→ ${r.status}`).join('、') }
}

async function updateProductPrice(productId: number, price: number) {
  const supabase = getSupabaseAdmin()
  const { data: p } = await supabase.from('products').select('id, name, price').eq('id', productId).maybeSingle()
  if (!p) return { error: '找不到商品' }
  const { error } = await supabase.from('products').update({ price, updated_at: new Date().toISOString() }).eq('id', productId)
  if (error) return { error: error.message }
  return { ok: true, name: p.name, old_price: p.price, new_price: price }
}

// ─── User write tools ──────────────────────────────────────────────

async function adjustUserTokens(userId: string, delta: number, reason: string, actorId?: string) {
  const supabase = getSupabaseAdmin()
  const { data: user } = await supabase.from('users').select('id, name, email, tokens').eq('id', userId).maybeSingle()
  if (!user) return { error: '找不到用戶' }

  const newTokens = Math.max(0, (user.tokens ?? 0) + delta)
  const { data: updated, error } = await supabase
    .from('users').update({ tokens: newTokens }).eq('id', userId).select('id')
  if (error) return { error: error.message }
  if (!updated?.length) return { error: '更新失敗（0 rows affected），請確認 user_id 正確' }

  // 寫入 token_adjustments（會 UNION 進 token_ledger view，供流水帳查閱）
  // 不寫 recharge_records，避免污染綠界對帳數字
  await supabase.from('token_adjustments').insert({
    user_id:    userId,
    delta:      delta,
    reason:     reason,
    created_by: actorId ? `admin#${actorId}` : 'GB哥',
  })

  await supabase.from('user_event_logs').insert({
    user_id:    userId,
    event_type: 'token_adjustment',
    detail:     { delta, reason, before: user.tokens, after: newTokens, by: actorId ?? 'GB哥' },
  })

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

async function updateOrderTracking(identifier: string, trackingNumber: string, status?: string) {
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

  return { ok: true, order_number: order.order_number, reason }
}

// ─── Coupon write tools ────────────────────────────────────────────

async function createCoupon(code: string, title: string, discountType: string, discountValue: number, minSpend = 0) {
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
  return { ok: true, id: data.id, code: data.code, title, discount_type: discountType, discount_value: discountValue, min_spend: minSpend }
}

async function toggleCoupon(code: string, isActive: boolean) {
  const supabase = getSupabaseAdmin()
  const { data: coupon } = await supabase.from('coupons').select('id, title').eq('code', code.toUpperCase()).maybeSingle()
  if (!coupon) return { error: '找不到折扣碼' }
  const { error } = await supabase.from('coupons').update({ is_active: isActive }).eq('code', code.toUpperCase())
  if (error) return { error: error.message }
  return { ok: true, code: code.toUpperCase(), title: coupon.title, is_active: isActive }
}

// ─── Content draft write tools ─────────────────────────────────────

async function updateContentDraft(ids: string[], status: string) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('content_drafts')
    .update({ status, updated_at: new Date().toISOString() })
    .in('id', ids)
    .select('id, product_name, style, status')
  if (error) return { error: error.message }
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
        return JSON.stringify(await updateProductStock(input.product_ids, input.delta, input.reason))
      case 'update_product_status':
        return JSON.stringify(await updateProductStatus(input.product_ids, input.status))
      case 'update_product_price':
        return JSON.stringify(await updateProductPrice(input.product_id, input.price))
      case 'adjust_user_tokens':
        return JSON.stringify(await adjustUserTokens(input.user_id, input.delta, input.reason, actorId))
      case 'update_order_tracking':
        return JSON.stringify(await updateOrderTracking(input.identifier, input.tracking_number, input.status))
      case 'cancel_order':
        return JSON.stringify(await cancelOrder(input.identifier, input.reason, actorId))
      case 'create_coupon':
        return JSON.stringify(await createCoupon(input.code, input.title, input.discount_type, input.discount_value, input.min_spend))
      case 'toggle_coupon':
        return JSON.stringify(await toggleCoupon(input.code, input.is_active))
      case 'update_content_draft':
        return JSON.stringify(await updateContentDraft(input.ids, input.status))
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
台灣的收藏品轉蛋/盒玩/一番賞/抽卡線上平台。多廠商供貨，玩家用代幣（G幣）抽獎，中獎商品實體寄送到家。

## 回覆原則
- 直接回答被問的問題，不主動補充建議或分析
- 老闆問建議或分析才給，沒問不加
- 繁體中文，語氣像懂業務的夥伴
- 金額加千分位（NT$ 12,345）
- 數字問題一律用工具查，不猜測
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

## LINE 推播時間表
每天固定推播（只有發現異常/待處理事項才推，無事靜默）：
- 00:30 財務長 — 收入趨勢、代幣對帳、待付款月結
- 01:00 風控長（第一次）— 大量抽獎、大額儲值、測卡行為
- 01:00 行銷長 — 用戶成長、轉換漏斗、熱門商品
- 01:00 AI 文案 — 今日草稿已生成提醒（去後台審核）
- 02:00 AI 技術長（第一次）— capability gap 自動修復
- 02:30 供應鏈協調員（第一次）— 超時出貨、庫存緊張
- 13:00 風控長（第二次）
- 14:00 AI 技術長（第二次）
- 14:30 供應鏈協調員（第二次）

每週固定：
- 週一 03:00 市場情報官 — 自動爬 8 家競品，生成趨勢分析
- 週一 行銷長 — 加推競品動態 + 行銷週報

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

// ─── Conversation history (multi-turn context per LINE user) ──────

const HISTORY_TTL_MS  = 30 * 60_000  // 30 分鐘無互動視為新對話
const HISTORY_MAX_MSG = 20            // 每人最多保留幾則（user+assistant 各算一則）
const HISTORY_LOAD    = 12            // 每次最多載入幾則（6 輪）

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
    // 保留最新 HISTORY_MAX_MSG 則，刪除更舊的
    const { data: all } = await supabase
      .from('line_conversations')
      .select('id')
      .eq('line_user_id', lineUserId)
      .order('created_at', { ascending: false })
    if (all && all.length > HISTORY_MAX_MSG) {
      const toDelete = all.slice(HISTORY_MAX_MSG).map((r: any) => r.id)
      await supabase.from('line_conversations').delete().in('id', toDelete)
    }
  } catch { /* ignore, don't break the main flow */ }
}

// ─── Main entry point ──────────────────────────────────────────────

export async function askGbBro(question: string, lineUserId?: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return '⚠️ GB哥目前離線（ANTHROPIC_API_KEY 未設定）'

  const client = new Anthropic({ apiKey })

  // 載入對話歷史（30 分鐘內的上下文）
  const history = lineUserId ? await loadHistory(lineUserId) : []

  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: 'user', content: question },
  ]

  let finalAnswer: string | null = null

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
      finalAnswer = textBlock?.text ?? '（GB哥沒有回應，請再試一次）'
      break
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

  const answer = finalAnswer ?? '（GB哥思考超時，請再試一次）'

  // 儲存這輪對話（只存純文字，不存 tool 中間步驟）
  if (lineUserId) {
    await saveHistory(lineUserId, question, answer)
  }

  return answer
}
