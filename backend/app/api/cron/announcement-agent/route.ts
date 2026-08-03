import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * 公告自動發送
 *
 * 只發「規則明確、機器判斷不會出錯」的三種，全部來自資料庫的確定狀態，
 * 不經 AI 判斷 —— 公告是對外的公開頁面，誤發要人工撤，代價比漏發高：
 *   1. 活動開跑：events 上架且已到 start_at
 *   2. 新機台主題上架：slot_themes 上架且旗下有已上架機台
 *   3. 新商品彙總：當日新上架商品達門檻才發一則彙總（不逐一發，避免洗版）
 *
 * 刻意不發系統異常：health-check 偵測到的多為暫時性狀況，
 * 貼上公開頁面只會嚇到玩家、事後還要人工撤除，應繼續走 LINE 推播給管理者。
 *
 * 防重複靠 announcements.source_key 的唯一索引（migration 415），
 * 重複插入會拿到 23505 並被視為「已發過」跳過。
 */

const NEW_PRODUCT_THRESHOLD = 5   // 當日新上架商品達此數才發彙總

type Result = { created: string[]; skipped: number; errors: number }

async function publish(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  r: Result,
  row: { title: string; content: string; category: '消息' | '活動' | '系統'; source_key: string; is_pinned?: boolean },
) {
  const { error } = await supabase.from('announcements').insert({
    title: row.title,
    content: row.content,
    category: row.category,
    source_key: row.source_key,
    is_pinned: row.is_pinned ?? false,
  })
  if (!error) { r.created.push(row.title); return }
  if (error.code === '23505') { r.skipped++; return }   // 已發過
  r.errors++
  console.error('[announcement-agent]', error.message)
}

export async function GET(req: NextRequest) {
  if (req.headers.get('x-cron-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const r: Result = { created: [], skipped: 0, errors: 0 }
  const nowIso = new Date().toISOString()

  // ── 1. 活動開跑 ────────────────────────────────────────────
  const { data: events } = await supabase
    .from('events')
    .select('id, slug, title, start_at, end_at')
    .eq('is_active', true)
    .or(`start_at.is.null,start_at.lte.${nowIso}`)
    .or(`end_at.is.null,end_at.gte.${nowIso}`)

  for (const ev of events ?? []) {
    // 沒設開始時間的（常駐頁）不算「開跑」，不發公告
    if (!ev.start_at) continue
    const endText = ev.end_at
      ? `活動至 ${new Date(ev.end_at).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })} 止。`
      : ''
    await publish(supabase, r, {
      title: `${ev.title} 開跑！`,
      content: `${ev.title} 正式開始，快來看看玩法與獎品。${endText}\n\n前往查看：/events/${ev.slug}`,
      category: '活動',
      source_key: `event:${ev.id}`,
    })
  }

  // ── 2. 新機台主題上架 ──────────────────────────────────────
  const { data: themes } = await supabase
    .from('slot_themes')
    .select('id, name, event_slug, is_active, slot_machines(id, is_active)')
    .eq('is_active', true)

  for (const t of (themes ?? []) as { id: number; name: string; event_slug: string | null; slot_machines: { is_active: boolean }[] }[]) {
    const live = (t.slot_machines ?? []).filter(m => m.is_active).length
    if (live === 0) continue   // 主題上架但機台都還沒開，不算對玩家可用
    const link = t.event_slug ? `\n\n玩法說明：/events/${t.event_slug}` : ''
    await publish(supabase, r, {
      title: `新機台「${t.name}」開放挑戰`,
      content: `${t.name} 已上線，共 ${live} 台同時開放。${link}\n\n前往挑戰：/challenge`,
      category: '活動',
      source_key: `theme:${t.id}`,
    })
  }

  // ── 3. 當日新商品彙總 ──────────────────────────────────────
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)  // 台灣時間日期
  const dayStart = `${today}T00:00:00+08:00`
  const { data: newProducts } = await supabase
    .from('products')
    .select('name, type')
    .eq('status', 'active')
    .gte('created_at', dayStart)
    .limit(100)

  const list = (newProducts ?? []).filter(p => p.type !== 'slot')   // 機台獎池商品不算新品
  if (list.length >= NEW_PRODUCT_THRESHOLD) {
    const names = list.slice(0, 5).map(p => `・${p.name}`).join('\n')
    const more = list.length > 5 ? `\n…等共 ${list.length} 項` : ''
    await publish(supabase, r, {
      title: `今日新品上架 ${list.length} 項`,
      content: `今天有 ${list.length} 項新商品上架：\n\n${names}${more}`,
      category: '消息',
      source_key: `products:${today}`,
    })
  }

  return NextResponse.json({ ok: true, ...r })
}
