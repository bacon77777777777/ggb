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

/**
 * 查不到 cron.job 時的退路（STG 根本沒裝 pg_cron，`cron.job` 不存在）。
 * 值抄自 PROD 現行排程、已換算台灣時間；查得到的環境一律以現查為準，
 * 所以這份只是「看不到真的時候至少講得出來」，不會蓋掉真實排程。
 */
const FALLBACK_SCHEDULE: Record<string, string[]> = {
  line_push_daily: ['每天 08:00'],
  line_push_cfo: ['每天 08:30'],
  line_push_cmo: ['每天 09:00'],
  line_push_supply: ['每天 10:30／22:30'],
  line_push_health: ['每 10 分鐘'],
  line_push_market: ['每週日 11:30', '每週一 10:00', '每月 1 日 10:00'],
  line_push_risk: ['每天 09:00／21:00', '每小時 00 分', '每小時 30 分'],
  line_push_monitor: ['每天 02:00／08:00／14:00／20:00'],
  line_push_finance: ['每 3 小時', '每月 1 日 10:00'],
  line_push_deliver: ['每天 11:00'],
  line_push_dormant: ['每週一 10:00'],
  line_push_recharge: ['每 15 分鐘'],
  line_push_content: [],
  line_push_cto: ['每天 10:00／22:00'],
  line_push_warehouse_dismantle: ['每天 05:00'],
  line_push_weekly: ['每週一 09:00'],
}

/**
 * 每條推播「長什麼樣」的骨架（照各 cron route 實際組字的順序抄下來，數字換成範例值）。
 *
 * 為什麼要有：老闆打開彈窗時，那條多半還沒推過，`last_preview` 是空的 ——
 * 只給一個 {{content}} 等於什麼都沒說。有真的推過就顯示真的，沒有就顯示這個。
 */
const SAMPLES: Record<string, string> = {
  line_push_daily: [
    '吉吉比 早報｜08/27', '', '昨日數據',
    '• 儲值：NT$ 12,300', '• 抽獎消費：45,000 G', '• 抽獎次數：320 次',
    '• 參與玩家：58 人', '• 新增會員：12 人', '',
    '待處理', '• 待出貨訂單：3 筆', '• 待審退款：1 筆', '• 卡住的儲值：2 筆',
  ].join('\n'),
  line_push_cfo: [
    '財務日報｜08/27', '', '近7天儲值：NT$ 86,400', '日均：NT$ 12,343',
    '注意：最近一日較日均下滑 18%', '', '代幣對帳：帳面 1,204,300 G，實際 1,204,300 G（相符）',
  ].join('\n'),
  line_push_cmo: [
    '行銷日報｜08/27', '', '本週新用戶：42 人', '較上週 +9 人',
    '近7天轉換率：18.2%', '', '建議：週末檔期前一天推一次沉睡客喚回',
  ].join('\n'),
  line_push_supply: [
    '供應鏈｜10:30', '', '需立即處理', '• 訂單 GGB20260827001 已超過 3 天未出貨',
    '', '零庫存（上架中）', '• 一番賞 航海王 GIANT BASH（原 70 件）',
  ].join('\n'),
  line_push_health: [
    '⚠️ 平台健康異常｜10:20', '', '嚴重（請立即確認）', '• 資料權限 RLS 有 2 張表是關的',
    '', '警告', '• 綠界錯誤率 6.2%（門檻 5%）',
  ].join('\n'),
  line_push_market: ['即時異常｜潮玩家', '對手今日新上架 12 件一番賞，其中 5 件與我方重疊'].join('\n'),
  line_push_risk: [
    '風控｜09:00', '', '高風險（請盡快確認）',
    '• 用戶 #100042：24h 抽獎 156 次（異常高頻）',
    '• 連續付款失敗：#100051 24h 內失敗 7 次（潛在測卡）',
    '• 大額儲值：#100078 NT$ 6,000　訂單 GGB20260827009',
    '',
    '—— 風險通知 ——',
    '風險類型：同一網段（IP 前三段相同）同時在線超過 10 人',
    '時間：2026-08-28 13:50:00',
    '認定範圍：最近 30 分鐘內有動作的帳號',
    '',
    '網段 57.181.201.x｜11 個帳號、2 個 IP',
    '',
    'IP：57.181.201.29',
    '帳號：[#100042, #100051, #100078, #100091, #100102]',
    '',
    'IP：57.181.201.9',
    '帳號：[#100110, #100118, #100120, #100133, #100141, #100155]',
    '',
    '以上僅供參考，處置權在老闆。',
  ].join('\n'),
  line_push_monitor: ['平台監測｜08:00', '', 'Vercel：READY', 'GitHub CI：success', '資料庫：412 MB'].join('\n'),
  line_push_finance: [
    '🔍 ECPay 對帳完成', '', '📋 稽核範圍：8 筆 pending > 2h',
    '✅ 補確認：3 筆（GGB20260827003、GGB20260827007、GGB20260827011）', '❌ 標記失敗：1 筆',
  ].join('\n'),
  line_push_deliver: [
    '📦 自動確認送達', '共 4 筆訂單已超過出貨天數，自動標記為已送達',
    'GGB20260820001、GGB20260820004、GGB20260821002、GGB20260821009',
  ].join('\n'),
  line_push_dormant: [
    '🛌 沉睡客喚回排程', '', '沉睡門檻：30 天未登入', '掃描用戶：120 人',
    '本次發送：38 人', '略過（已持有）：12 人', '', '優惠內容：滿 NT$500 折 NT$50',
  ].join('\n'),
  line_push_recharge: [
    '⚠️ 待複核儲值提醒', '', '新增 2 筆 pending > 30 分鐘', '目前共 5 筆待複核',
    '', '請至後台「待複核儲值」確認',
  ].join('\n'),
  line_push_content: [
    '文案草稿｜2026-08-28', '商品：一番賞 航海王 GIANT BASH（350 G／抽），共 5 則',
    '請至後台「文案草稿」確認後標記發布。', '', '偵測到節慶/活動關鍵字', '• 「中秋」→ 建議標籤「節慶檔期」',
  ].join('\n'),
  line_push_cto: [
    'AI 技術長報告', '', '自動修復 2 個資料缺口', '• 商品缺主圖 3 件',
    '• 慢查詢：draw_records 全表掃描', '可以重新詢問 GB哥了。',
  ].join('\n'),
  line_push_warehouse_dismantle: ['🗑️ 倉庫自動回收完成', '共回收 12 件逾期品項', '退還代幣：3,600 G'].join('\n'),
  line_push_weekly: [
    'GB哥 週報｜08/21 - 08/27', '',
    '（這條的內容整篇由 Claude 當場寫，沒有固定骨架 ——',
    '　數字、比較與它自己看出來的問題每週都不一樣）',
  ].join('\n'),
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
  // cron.job 查不到（STG 沒裝 pg_cron）就退回 PROD 的排程表，並標記來源讓畫面說清楚
  const liveCron = Object.keys(schedules).length > 0
  const templates: Record<string, {
    template: string; lastPreview: string | null; lastPushedAt: string | null
    schedule: string[]; scheduleSource: 'cron' | 'default'; sample: string
  }> = {}
  for (const k of LINE_PUSH_KEYS) {
    const row = (data as any[])?.find(r => r.key === k)
    templates[k] = {
      template: String(row?.template ?? '{{content}}'),
      lastPreview: row?.last_preview ?? null,
      lastPushedAt: row?.last_pushed_at ?? null,
      schedule: liveCron ? (schedules[k] ?? []) : (FALLBACK_SCHEDULE[k] ?? []),
      scheduleSource: liveCron ? 'cron' : 'default',
      sample: SAMPLES[k] ?? '',
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
