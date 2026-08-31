import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * 抽籤販售的定時工作（老闆 2026-08-31）
 *
 * 一支處理兩件事，因為它們的節奏一樣（每小時），而且順序有意義：
 *
 *   ① 到時間就開獎 —— draw_at 已過、已發布、還沒開過的檔期
 *   ② 逾期未付就遞補 —— 正取超過付款期限，讓位給名次最前面的備取
 *
 * 先開獎再遞補：同一輪裡剛開完獎的檔期不會有人逾期（付款期限才剛起算），
 * 所以順序其實不影響結果 —— 但反過來寫會讓人以為遞補處理的是這一輪的開獎。
 *
 * ## 為什麼開獎不是在 DB 裡排程
 *
 * 抽選邏輯本來就在 DB（draw_lottery）。這支只負責「什麼時候呼叫」，
 * 這樣才能吃後台的開關（lottery_auto_draw／lottery_auto_promote）——
 * 那兩個值在 platform_settings，pg_cron 讀不到也不該讀。
 *
 * ## 開關關掉時
 *
 * 不會補跑。關掉自動開獎就是要人工在後台按「立即開獎」，
 * 如果之後打開就把積欠的全部開掉，等於在無人預期的時間點公布一堆名單。
 */

const CRON_SECRET = process.env.CRON_SECRET ?? ''

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  // 設定沒寫過就是預設開著（跟設定頁的預設值一致）
  const { data: settingRows } = await supabase
    .from('platform_settings')
    .select('key, value')
    .in('key', ['lottery_auto_draw', 'lottery_auto_promote'])
  const setting = Object.fromEntries((settingRows ?? []).map(r => [r.key, r.value]))
  const autoDraw = (setting.lottery_auto_draw ?? 'on') === 'on'
  const autoPromote = (setting.lottery_auto_promote ?? 'on') === 'on'

  const drawn: { id: number; entries: number; winners: number; backups: number }[] = []
  const failed: { id: number; error: string }[] = []

  if (autoDraw) {
    /*
     * 條件跟 draw_lottery 內部的檢查重複是刻意的：這裡是為了少發一堆註定失敗的
     * RPC（每一檔一次來回），DB 那邊才是真正的把關（併發下兩支 cron 同時跑也不會開兩次）。
     */
    const { data: due } = await supabase
      .from('lottery_events')
      .select('id')
      .eq('status', 'published')
      .is('drawn_at', null)
      .lte('draw_at', new Date().toISOString())

    for (const ev of due ?? []) {
      const { data, error } = await supabase.rpc('draw_lottery', { p_event_id: ev.id })
      if (error) { failed.push({ id: ev.id, error: error.message }); continue }
      if (data?.success === false) { failed.push({ id: ev.id, error: data.message }); continue }
      drawn.push({ id: ev.id, entries: data.entries, winners: data.winners, backups: data.backups })
    }
  }

  let promote: { expired: number; promoted: number } | null = null
  if (autoPromote) {
    const { data, error } = await supabase.rpc('expire_lottery_winners')
    if (error) failed.push({ id: 0, error: `遞補失敗：${error.message}` })
    else promote = data
  }

  return NextResponse.json({
    ok: true,
    auto_draw: autoDraw,
    auto_promote: autoPromote,
    drawn,
    promote,
    failed,
  })
}
