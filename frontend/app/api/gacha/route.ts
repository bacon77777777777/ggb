import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { drawLimiter } from '@/lib/ratelimit'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSsrClient()

    // getSession reads from cookie (no server RTT); middleware already refreshed the token
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

    // Rate limit by user_id
    const { success, limit, remaining, reset } = await drawLimiter.limit(user.id)
    if (!success) {
      return NextResponse.json(
        { error: '操作太頻繁，請稍候再試' },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': String(remaining),
            'X-RateLimit-Reset': String(reset),
          },
        }
      )
    }

    const body = await request.json()
    const { productId, count, usePoints, couponId } = body

    if (!productId || !count) {
      return NextResponse.json({ error: '缺少必要參數' }, { status: 400 })
    }
    if (!Number.isInteger(count) || count < 1) {
      return NextResponse.json({ error: '抽獎數量不正確' }, { status: 400 })
    }

    // 用 anon key + user JWT 呼叫 RPC，讓 auth.uid() 正確
    const userSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${session?.access_token}` } } }
    )

    // 依商品類型分派抽獎引擎（DB 端亦有類型防護，此處僅選對通道）：
    //   轉蛋/盒玩   → 機率引擎
    //   抽卡/自製賞 → 賞等票號引擎（票號後端自動配，前台維持選數量購買）
    const { data: productRow } = await userSupabase
      .from('products')
      .select('type, sale_mode')
      .eq('id', productId)
      .single()

    // 抽籤販售自己一條路：0 元、不吃優惠券、有每人次數上限，
    // 硬要塞進 play_ichiban_auto_locked 會變成一堆 if
    const isLottery = productRow?.sale_mode === 'lottery'
    const isTicketBased = productRow?.type === 'card' || productRow?.type === 'custom'
    const rpcName = isLottery
      ? 'play_lottery'
      : isTicketBased ? 'play_ichiban_auto_locked' : 'play_gacha_locked'

    const { data, error } = await userSupabase.rpc(
      rpcName,
      isLottery
        ? { p_product_id: productId, p_count: count }
        : {
            p_product_id: productId,
            p_count: count,
            p_use_points: usePoints ?? false,
            p_coupon_id: couponId ?? null,
          },
    )

    if (error) throw error

    // Fire-and-forget: 追蹤任務/成就不阻塞 response
    // 商品單價從 RPC 結果推算，避免多一次 DB query
    Promise.allSettled([
      userSupabase.rpc('track_mission_event', { p_event_type: 'draw_count', p_data: { count } }),
      userSupabase.rpc('track_mission_event', {
        p_event_type: usePoints ? 'spend_points' : 'spend_amount',
        p_data: { amount: count },  // 精確金額由 DB 端自行計算
      }),
    ]).catch(() => {})

    const rpcData = data as any
    const prizesArray: any[] = Array.isArray(rpcData)
      ? rpcData
      : Array.isArray(rpcData?.prizes) ? rpcData.prizes
      : Array.isArray(rpcData?.results) ? rpcData.results : []

    return NextResponse.json({
      prizes: prizesArray.map((p: any) => ({
        ...p,
        grade: p.grade ?? p.level,
        ticket_number: p.ticket_number ?? p.record_id,
      })),
      new_balance: rpcData?.new_balance,
      discount_amount: rpcData?.discount_amount,
      // 抽籤販售：回傳已抽次數讓前台更新剩餘可抽
      used_by_me: rpcData?.used_by_me,
      per_user_limit: rpcData?.per_user_limit,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '抽獎失敗' }, { status: 500 })
  }
}
