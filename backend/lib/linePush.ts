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
  'line_push_weekly',
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
  line_push_warehouse_dismantle: '倉庫自動回收',
  line_push_weekly:              'GB哥週報',
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

async function send(text: string): Promise<{ ok: boolean; status?: number; body?: string }> {
  if (!LINE_TOKEN || !NOTIFY_ID) {
    console.error('[linePush] missing LINE_CHANNEL_ACCESS_TOKEN or NOTIFY_TARGET_ID')
    return { ok: false, body: 'missing env vars' }
  }
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_TOKEN}` },
    body: JSON.stringify({ to: NOTIFY_ID, messages: [{ type: 'text', text }] }),
  })
  if (!res.ok) {
    const body = await res.text()
    console.error(`[linePush] LINE API error ${res.status}: ${body}`)
    return { ok: false, status: res.status, body }
  }
  return { ok: true, status: res.status }
}

/**
 * 套上老闆在後台設定的推播外框（migration 637）。
 *
 * 外框裡的 `{{content}}` 換成 agent 當下產生的內容 —— 這樣 20 幾支 cron route
 * 一行都不用改，格式權完全在後台。查不到設定或外框裡沒有 {{content}} 時
 * 一律回傳原文（fail open）：格式設定壞掉不該讓推播整條消失。
 */
async function applyTemplate(key: LinePushKey, text: string): Promise<string> {
  try {
    const { data } = await getSupabaseAdmin()
      .from('line_push_templates')
      .select('template')
      .eq('key', key)
      .single()
    const tpl = String(data?.template ?? '').trim()
    if (!tpl || !tpl.includes('{{content}}')) return text
    return tpl.replace(/\{\{content\}\}/g, text)
  } catch {
    return text
  }
}

/**
 * 記下最近一次組出來的全文，後台「編輯格式」的彈窗直接拿它當預覽。
 * 連被開關擋掉、沒真的送出的也記 —— 老闆常常是先看「它會長怎樣」才決定開不開。
 */
async function recordPreview(key: LinePushKey, text: string, sent: boolean) {
  try {
    await getSupabaseAdmin()
      .from('line_push_templates')
      .update({
        last_preview: text.slice(0, 4000),
        ...(sent ? { last_pushed_at: new Date().toISOString() } : {}),
      })
      .eq('key', key)
  } catch { /* 預覽記錄失敗不影響推播 */ }
}

/**
 * 建立一個與特定推播開關綁定的 pushLine 函數。
 * 在 cron route 最上方：const pushLine = createLinePusher('line_push_xxx')
 */
export function createLinePusher(key: LinePushKey) {
  return async function pushLine(text: string): Promise<{ ok: boolean; status?: number; body?: string }> {
    const enabled = await isFlagEnabled(key)
    const finalText = await applyTemplate(key, text)
    if (!enabled) {
      void recordPreview(key, finalText, false)
      return { ok: false, body: 'flag disabled' }
    }
    const res = await send(finalText)
    void recordPreview(key, finalText, res.ok)
    return res
  }
}
