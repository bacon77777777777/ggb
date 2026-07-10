import { getSupabaseAdmin } from './supabaseAdmin'

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''
const NOTIFY_ID  = process.env.NOTIFY_TARGET_ID ?? ''

export const LINE_PUSH_KEYS = [
  'line_push_daily',
  'line_push_cfo',
  'line_push_cmo',
  'line_push_supply',
  'line_push_health',
  'line_push_market',
  'line_push_risk',
  'line_push_monitor',
  'line_push_finance',
  'line_push_deliver',
  'line_push_dormant',
  'line_push_recharge',
  'line_push_content',
  'line_push_cto',
  'line_push_warehouse_dismantle',
] as const

export type LinePushKey = (typeof LINE_PUSH_KEYS)[number]

export const LINE_PUSH_LABELS: Record<LinePushKey, string> = {
  line_push_daily:               '每日早報',
  line_push_cfo:                 'CFO 財務對帳',
  line_push_cmo:                 'CMO 行銷日報',
  line_push_supply:              '供應鏈警示',
  line_push_health:              '健康監測',
  line_push_market:              '市場 / 競品情報',
  line_push_risk:                '風控掃描',
  line_push_monitor:             '平台監測',
  line_push_finance:             '對帳 / 月結',
  line_push_deliver:             '自動出貨通知',
  line_push_dormant:             '沉睡客喚回',
  line_push_recharge:            '待審核儲值',
  line_push_content:             'AI 文案生成',
  line_push_cto:                 'AI CTO 報告',
  line_push_warehouse_dismantle: '倉庫自動分解',
}

async function isFlagEnabled(key: LinePushKey): Promise<boolean> {
  try {
    const { data } = await getSupabaseAdmin()
      .from('feature_flags')
      .select('enabled')
      .eq('key', key)
      .single()
    if (!data) return true  // 未設定 → 預設開啟
    return Boolean(data.enabled)
  } catch {
    return true             // 查詢失敗 → fail open
  }
}

async function send(text: string) {
  if (!LINE_TOKEN || !NOTIFY_ID) return
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_TOKEN}` },
    body: JSON.stringify({ to: NOTIFY_ID, messages: [{ type: 'text', text }] }),
  })
}

/**
 * 建立一個與特定推播開關綁定的 pushLine 函數。
 * 在 cron route 最上方：const pushLine = createLinePusher('line_push_xxx')
 */
export function createLinePusher(key: LinePushKey) {
  return async function pushLine(text: string) {
    const enabled = await isFlagEnabled(key)
    if (!enabled) return
    await send(text)
  }
}
