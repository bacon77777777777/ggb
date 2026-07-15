import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { drawLimiter } from '@/lib/ratelimit'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSsrClient()
    const { data: { user } } = await supabase.auth.getUser()
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

    // 用 service role 呼叫 RPC，並帶入 user JWT 讓 auth.uid() 正確
    const { data: { session } } = await supabase.auth.getSession()
    const userSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${session?.access_token}` } } }
    )

    const { data, error } = await userSupabase.rpc('play_gacha_locked', {
      p_product_id: productId,
      p_count: count,
      p_use_points: usePoints ?? false,
      p_coupon_id: couponId ?? null,
    })

    if (error) throw error

    // 取得商品單價以計算花費金額
    const { data: productData } = await userSupabase
      .from('products')
      .select('price')
      .eq('id', productId)
      .single()

    const tokenCost = (productData?.price ?? 0) * count
    const pointsCost = tokenCost * 4

    // Track draw + spend + achievements（non-blocking）
    await Promise.allSettled([
      userSupabase.rpc('track_mission_event', { p_event_type: 'draw_count', p_data: { count } }),
      usePoints
        ? userSupabase.rpc('track_mission_event', { p_event_type: 'spend_points', p_data: { amount: pointsCost } })
        : userSupabase.rpc('track_mission_event', { p_event_type: 'spend_amount', p_data: { amount: tokenCost } }),
      userSupabase.rpc('check_achievements', { p_user_id: user.id }),
    ])

    const rpcData = data as any
    const prizesArray: any[] = Array.isArray(rpcData)
      ? rpcData
      : Array.isArray(rpcData?.prizes) ? rpcData.prizes : []

    return NextResponse.json({
      prizes: prizesArray.map((p: any) => ({
        ...p,
        grade: p.grade ?? p.level,
        ticket_number: p.ticket_number ?? p.record_id,
      })),
      new_balance: rpcData?.new_balance,
      discount_amount: rpcData?.discount_amount,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '抽獎失敗' }, { status: 500 })
  }
}
