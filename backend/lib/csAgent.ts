import Anthropic from '@anthropic-ai/sdk'
import { getSupabaseAdmin } from './supabaseAdmin'
import { queryEcpayTrade } from './ecpay'

const LINE_TOKEN    = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''
const ADMIN_PUSH_ID = process.env.NOTIFY_TARGET_ID ?? ''

async function pushLine(to: string, text: string) {
  if (!LINE_TOKEN || !to) return
  await fetch('https://api.line.me/v2/bot/message/push', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_TOKEN}` },
    body:    JSON.stringify({ to, messages: [{ type: 'text', text }] }),
  })
}

// ─── CS Tools ──────────────────────────────────────────────────────

async function findRecharge(orderNumber?: string, email?: string, phone?: string) {
  const supabase = getSupabaseAdmin()

  if (orderNumber) {
    const { data } = await supabase
      .from('recharge_records')
      .select('id, order_number, amount, bonus, status, created_at, user:users(name, email, tokens, phone_number)')
      .ilike('order_number', orderNumber.trim())
      .single()
    return data ? [data] : []
  }

  if (email || phone) {
    let q = supabase.from('users').select('id, name, email, tokens, phone_number')
    if (email) q = q.ilike('email', email.trim())
    else if (phone) q = q.eq('phone_number', phone.trim())
    const { data: users } = await q.limit(1)
    if (!users?.length) return []

    const { data: records } = await supabase
      .from('recharge_records')
      .select('id, order_number, amount, bonus, status, created_at')
      .eq('user_id', users[0].id)
      .order('created_at', { ascending: false })
      .limit(5)

    return (records ?? []).map(r => ({ ...r, user: users[0] }))
  }

  return []
}

async function checkUserAccount(email?: string, phone?: string) {
  const supabase = getSupabaseAdmin()
  let q = supabase.from('users').select('id, name, email, tokens, status, created_at')
  if (email) q = q.ilike('email', email.trim())
  else if (phone) q = q.eq('phone_number', phone.trim())
  else return null
  const { data } = await q.limit(1)
  if (!data?.length) return null

  // Recent draws
  const { count: drawCount } = await supabase
    .from('draw_records')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', data[0].id)
    .gte('created_at', new Date(Date.now() - 30 * 86400_000).toISOString())

  return { ...data[0], drawsLast30Days: drawCount ?? 0 }
}

async function checkOrderStatus(email?: string, phone?: string, orderIdentifier?: string) {
  const supabase = getSupabaseAdmin()

  if (orderIdentifier) {
    const { data } = await supabase
      .from('orders')
      .select('id, order_id, status, created_at, tracking_number, user:users(name, email)')
      .or(`order_id.ilike.%${orderIdentifier}%,id.eq.${parseInt(orderIdentifier) || 0}`)
      .limit(3)
    return data ?? []
  }

  if (email || phone) {
    let q = supabase.from('users').select('id')
    if (email) q = q.ilike('email', email.trim())
    else if (phone) q = q.eq('phone_number', phone.trim())
    const { data: users } = await q.limit(1)
    if (!users?.length) return []

    const { data } = await supabase
      .from('orders')
      .select('id, order_id, status, created_at, tracking_number')
      .eq('user_id', users[0].id)
      .order('created_at', { ascending: false })
      .limit(5)
    return data ?? []
  }

  return []
}

async function verifyAndGrantTokens(rechargeId: number) {
  const supabase = getSupabaseAdmin()

  const { data: record } = await supabase
    .from('recharge_records')
    .select('id, user_id, amount, bonus, status, order_number')
    .eq('id', rechargeId)
    .single()

  if (!record)              return { success: false, reason: '找不到此筆儲值記錄' }
  if (record.status === 'success') return { success: false, reason: '此筆訂單代幣已發放，請確認帳戶餘額', alreadyGranted: true }
  if (!record.order_number) return { success: false, reason: '無訂單號，需要人工處理，請稍候' }

  const ecpay = await queryEcpayTrade(record.order_number)
  if (!ecpay)                      return { success: false, reason: 'ECPay 查詢異常，請稍後再試' }
  if (ecpay.tradeStatus !== '1')   return { success: false, reason: 'ECPay 顯示此訂單尚未完成付款，若您確認已扣款請提供銀行截圖，客服會人工審核' }

  const { data: updated } = await supabase
    .from('recharge_records')
    .update({ status: 'success', needs_review: false, review_note: 'AI客服自動補發（ECPay驗證通過）' })
    .eq('id', rechargeId)
    .neq('status', 'success')
    .select()
    .single()

  if (!updated) return { success: false, reason: '代幣已由其他程序發放，請確認帳戶餘額' }

  const tokensToAdd = Number(record.amount) + Number(record.bonus ?? 0)
  const { error: tokenErr } = await supabase.rpc('increment_user_tokens', {
    p_user_id: record.user_id,
    p_amount:  tokensToAdd,
  })

  if (tokenErr) {
    await supabase.from('recharge_records').update({ status: 'pending', needs_review: true }).eq('id', rechargeId)
    return { success: false, reason: '代幣發放時發生錯誤，已轉交人工處理' }
  }

  try {
    await supabase.from('admin_action_logs').insert({
      admin_id:    'ai-cs-agent',
      action:      'AI客服自動補發代幣',
      target_type: 'recharge',
      target_id:   String(rechargeId),
      detail:      { amount: record.amount, bonus: record.bonus, source: 'cs_agent_auto' },
    })
  } catch (_) { /* ignore */ }

  return { success: true, tokensGranted: tokensToAdd }
}

async function escalateToAdmin(issue: string, userLineId: string) {
  if (ADMIN_PUSH_ID) {
    await pushLine(ADMIN_PUSH_ID,
      `🆘 AI客服轉人工\n\n玩家 LINE：${userLineId}\n問題：${issue}\n\n請至後台跟進。`
    )
  }
  return { escalated: true }
}

// ─── Tool definitions ──────────────────────────────────────────────

const CS_TOOLS: Anthropic.Tool[] = [
  {
    name: 'find_recharge',
    description: '依訂單號、email 或手機號查詢儲值紀錄。',
    input_schema: {
      type: 'object' as const,
      properties: {
        order_number: { type: 'string', description: '訂單號（TP開頭）' },
        email:        { type: 'string', description: '註冊 email' },
        phone:        { type: 'string', description: '手機號碼' },
      },
    },
  },
  {
    name: 'check_user_account',
    description: '查詢會員帳戶狀態：代幣餘額、近期抽獎次數。',
    input_schema: {
      type: 'object' as const,
      properties: {
        email: { type: 'string' },
        phone: { type: 'string' },
      },
    },
  },
  {
    name: 'check_order_status',
    description: '查詢配送訂單狀態與物流單號。',
    input_schema: {
      type: 'object' as const,
      properties: {
        email:            { type: 'string' },
        phone:            { type: 'string' },
        order_identifier: { type: 'string', description: '訂單號或訂單 ID' },
      },
    },
  },
  {
    name: 'verify_and_grant_tokens',
    description: '向 ECPay 驗證此筆訂單已付款，確認後自動補發代幣。只在玩家明確反映付款但未收到代幣時使用。',
    input_schema: {
      type: 'object' as const,
      properties: {
        recharge_id: { type: 'number', description: '儲值記錄的 id（從 find_recharge 取得）' },
      },
      required: ['recharge_id'],
    },
  },
  {
    name: 'escalate_to_admin',
    description: '問題無法自動解決時，通知人工客服介入，並告知玩家。',
    input_schema: {
      type: 'object' as const,
      properties: {
        issue: { type: 'string', description: '問題摘要（給管理員看）' },
      },
      required: ['issue'],
    },
  },
]

// ─── Tool dispatcher ───────────────────────────────────────────────

async function executeCsTool(name: string, input: Record<string, any>, lineUserId: string): Promise<string> {
  try {
    switch (name) {
      case 'find_recharge':
        return JSON.stringify(await findRecharge(input.order_number, input.email, input.phone))
      case 'check_user_account':
        return JSON.stringify(await checkUserAccount(input.email, input.phone))
      case 'check_order_status':
        return JSON.stringify(await checkOrderStatus(input.email, input.phone, input.order_identifier))
      case 'verify_and_grant_tokens':
        return JSON.stringify(await verifyAndGrantTokens(input.recharge_id))
      case 'escalate_to_admin':
        return JSON.stringify(await escalateToAdmin(input.issue, lineUserId))
      default:
        return JSON.stringify({ error: `unknown tool: ${name}` })
    }
  } catch (e: any) {
    return JSON.stringify({ error: e?.message ?? 'tool error' })
  }
}

// ─── Main export ───────────────────────────────────────────────────

export async function askCsAgent(message: string, lineUserId: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return '客服系統暫時無法使用，請稍後再試。'

  const client = new Anthropic({ apiKey })

  const systemPrompt = `你是吉吉比轉蛋平台的 AI 客服，負責幫助玩家解決問題。

## 吉吉比是什麼
台灣線上轉蛋/盒玩抽獎平台。玩家儲值取得 G 幣（代幣），用 G 幣抽獎，中獎商品實體寄送到家。

## 你能處理的問題
- 儲值後未收到代幣（付款但餘額沒增加）
- 查詢代幣餘額
- 配送進度查詢
- 訂單狀態確認

## 處理流程
1. 先了解玩家問題
2. 請玩家提供訂單號（TP開頭）或帳號 email / 手機號
3. 用工具查詢確認
4. 儲值未到帳：用工具向 ECPay 驗證，確認付款即自動補發
5. 問題超出能力範圍：用 escalate_to_admin 轉人工，並告知玩家 24 小時內有人跟進

## 重要規則
- 補發代幣前必定先呼叫 verify_and_grant_tokens，不可自行聲稱已補發
- 不主動透露系統內部欄位名稱或技術細節
- 回覆簡短、親切，用繁體中文
- 每次回覆不超過 200 字

## 限制
無法處理：退款申請（請至 APP 提交）、帳號申訴、商品瑕疵（請拍照 email 客服）`

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: message },
  ]

  let rounds = 0
  while (rounds < 5) {
    rounds++
    const res = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system:     systemPrompt,
      tools:      CS_TOOLS,
      messages,
    })

    if (res.stop_reason === 'end_turn') {
      const text = res.content.find(b => b.type === 'text')
      return (text as any)?.text ?? '感謝您的耐心，有其他問題請隨時告知。'
    }

    if (res.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: res.content })
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const block of res.content) {
        if (block.type === 'tool_use') {
          const result = await executeCsTool(block.name, block.input as Record<string, any>, lineUserId)
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
        }
      }
      messages.push({ role: 'user', content: toolResults })
      continue
    }

    break
  }

  return '客服系統忙碌中，請稍後再試或輸入「人工客服」轉接。'
}
