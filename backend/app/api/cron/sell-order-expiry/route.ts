import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * 玩家商城的訂單逾期處理。每小時跑一次。
 *
 * 實際邏輯全在 DB 函式 `sell_run_order_expiry()`（migration 553），
 * 這支只是把 pg_cron 的 HTTP 呼叫轉成 RPC —— 邏輯放 DB 是因為要在同一筆交易裡
 * 「回補庫存 + 取消訂單 + 寫系統訊息」，拆到這裡做會有中途失敗的半套狀態。
 *
 * 三段處理（期限值都讀後台「商城設定」）：
 *   step 1 待付款 → 逾時自動取消、庫存放回架上
 *   step 3 待出貨 → 只通知雙方並提示可檢舉。**不自動取消** ——
 *                   平台不碰錢，買家的錢早就匯進賣家帳戶，取消訂單也拿不回來
 *   step 4 待收貨 → 逾時自動完成
 *
 * ⚠️ 這裡處理的是玩家商城 sell_orders，不是交易所 marketplace_orders、
 *    也不是卡牌交換 exchange_orders。
 */

const CRON_SECRET = process.env.CRON_SECRET ?? ''

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.rpc('sell_run_order_expiry')

  if (error) {
    console.error('sell_run_order_expiry failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, ...(data as Record<string, unknown> ?? {}) })
}
