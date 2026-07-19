import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSsrClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { drawLimiter } from '@/lib/ratelimit'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSsrClient()

    // Parallel auth calls — saves one round trip vs sequential
    const [{ data: { user } }, { data: { session } }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getSession(),
    ])
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

    // 用 anon key + user JWT 呼叫 RPC，讓 auth.uid() 正確
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

    // Fire-and-forget: 追蹤任務/成就不阻塞 response
    // 商品單價從 RPC 結果推算，避免多一次 DB query
    Promise.allSettled([
      userSupabase.rpc('track_mission_event', { p_event_type: 'draw_count', p_data: { count } }),
      userSupabase.rpc('track_mission_event', {
        p_event_type: usePoints ? 'spend_points' : 'spend_amount',
        p_data: { amount: count },  // 精確金額由 DB 端自行計算
      }),
      userSupabase.rpc('check_achievements', { p_user_id: user.id }),
    ]).catch(() => {})

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
