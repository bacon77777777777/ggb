import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'
import { randomBytes } from 'crypto'
import { getClientIp, logAdminAction } from '@/lib/logAdminAction'
import { pushSensitiveAlert } from '@/lib/sensitiveAlert'

export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const supabaseAdmin = getSupabaseAdmin()

    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', id)
      .single()
    if (userError) throw userError

    let orders: any[] = []
    {
      const { data, error } = await supabaseAdmin
        .from('orders')
        /*
         * 品項讀 `draw_records`，不是 `order_items`。
         *
         * `order_items` 那張表**全站是空的**（沒有任何程式在寫它），所以會員詳情的
         * 配送紀錄每一單都顯示「0 件商品」。真正的關聯是 draw_records.order_id ——
         * 配送管理那頁讀的就是這個（老闆 2026-08-31 回報）。
         */
        .select(
          `
            *,
            items:draw_records (
              id,
              prize_name,
              prize_level,
              ticket_number,
              product:products ( name, image_url, type ),
              prize:product_prizes ( name, level, image_url )
            )
          `
        )
        .eq('user_id', id)
        .order('created_at', { ascending: false })
      if (error) {
        const message = String(error.message || '')
        const isMissingTable =
          message.includes("Could not find the table 'public.orders'") ||
          message.includes('relation "public.orders" does not exist')
        if (!isMissingTable) throw error
      } else {
        orders = data ?? []
        /*
         * 已取消的單：取消時把 draw_records.order_id 解開（品項退回倉庫），
         * 所以 items 撈不到東西。改讀取消當下拍的快照（migration 659）。
         * 跟配送管理列表同一套處理。
         */
        for (const o of orders) {
          if (o.status === 'cancelled' && (!o.items || o.items.length === 0) && Array.isArray(o.cancelled_items)) {
            o.items = o.cancelled_items.map((it: any) => ({
              id: it.id,
              prize_name: it.prize_name,
              prize_level: it.prize_level,
              ticket_number: it.ticket_number,
              product: { name: it.product_name, image_url: it.image_url, type: it.product_type },
              prize: { name: it.prize_name, level: it.prize_level, image_url: it.image_url },
            }))
          }
        }
      }
    }

    let draws: any[] = []
    {
      const { data, error } = await supabaseAdmin
        .from('draw_records')
        .select(
          `
            *,
            product:products (name, price, product_code)
          `
        )
        .eq('user_id', id)
        .order('created_at', { ascending: false })
      if (error) {
        const message = String(error.message || '')
        const isMissingTable =
          message.includes("Could not find the table 'public.draw_records'") ||
          message.includes('relation "public.draw_records" does not exist')
        if (!isMissingTable) throw error
      } else {
        draws = data ?? []
      }
    }

    let recharges: any[] = []
    {
      const { data, error } = await supabaseAdmin
        .from('recharge_records')
        .select('*')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
      if (error) {
        const message = String(error.message || '')
        const isMissingTable =
          message.includes("Could not find the table 'public.recharge_records'") ||
          message.includes('relation "public.recharge_records" does not exist')
        if (!isMissingTable) throw error
      } else {
        recharges = data ?? []
      }
    }

    // 邀請人：誰邀他來的（referrals 一人一列，referee 唯一）
    let referrer: { id: string; name: string; invite_code: string | null } | null = null
    {
      const { data: ref } = await supabaseAdmin
        .from('referrals')
        .select('referrer_id, qualified_at')
        .eq('referee_id', id)
        .maybeSingle()
      if (ref?.referrer_id) {
        const { data: r } = await supabaseAdmin
          .from('users')
          .select('id, name, invite_code')
          .eq('id', ref.referrer_id)
          .maybeSingle()
        if (r) referrer = { id: r.id, name: r.name, invite_code: r.invite_code }
      }
    }

    return NextResponse.json({ user, orders, draws, recharges, referrer })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '載入失敗' }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await request.json()

    const supabaseAdmin = getSupabaseAdmin()
    const hasStatus = body.status !== undefined
    const shouldGeneratePassword = body.generatePassword === true
    const hasPassword = body.password !== undefined || shouldGeneratePassword
    /*
     * `points` 刻意**不在**這份白名單裡。
     *
     * 積分自 migration 646~650 起有帳本（point_ledger），對帳的不變式是
     * `users.points = SUM(point_ledger.delta)`。直接 UPDATE 這個欄位會當場破壞它，
     * 而且事後查不出是誰改的、改了什麼 —— 積分能折抵代幣、代幣是真錢買的，
     * 等於帳上憑空多出一筆準現金。改積分一律走下面的 apply_points_delta。
     *
     * （代幣是另一套：它直改之後補一筆 token_adjustments，見下方。歷史包袱，
     *   不在這次的範圍內；新東西不要再照抄那個做法。）
     */
    const PROFILE_FIELDS = ['name', 'email', 'avatar_url', 'gender', 'birthday', 'phone_number', 'phone',
      'recipient_name', 'recipient_phone', 'address', 'tokens']
    const profileUpdates: Record<string, any> = {}
    for (const f of PROFILE_FIELDS) {
      if (body[f] !== undefined) profileUpdates[f] = body[f] === '' ? null : body[f]
    }
    const hasProfile = Object.keys(profileUpdates).length > 0
    // points 走帳本、不進 profileUpdates，所以要單獨算進「有沒有東西要改」，
    // 不然只調積分會被下面這行擋成「缺少更新欄位」
    const hasPoints = body.points !== undefined && body.points !== ''

    if (!hasStatus && !hasPassword && !hasProfile && !hasPoints) {
      return NextResponse.json({ error: '缺少更新欄位' }, { status: 400 })
    }

    let updatedUser: any = null
    let tempPassword: string | null = null

    /*
     * 改代幣要先記下原本的餘額 —— 下面要用 (新 − 舊) 補一筆 token_adjustments。
     * 只 update `users.tokens` 而不進分類帳的話，帳面會憑空多出一筆錢，
     * 財務對帳（expected = recharge + manual − draw − refund）永遠對不平。
     * 實際踩過：一個帳號在建立時被塞了 100 萬，對帳就短少 100 萬（2026-08-13 查出）。
     */
    let tokensBefore: number | null = null
    if (profileUpdates.tokens !== undefined) {
      const { data: prev } = await supabaseAdmin.from('users').select('tokens').eq('id', id).single()
      tokensBefore = Number(prev?.tokens ?? 0)
    }

    /*
     * 積分：走帳本的原子調整，不進 profileUpdates。
     * 前端送的是「調整後的餘額」（跟代幣同一個輸入框的語意），這裡換算成差額。
     * 差額 0 不寫，免得留一堆 delta=0 的雜訊。
     */
    let pointsBefore: number | null = null
    let pointsDelta = 0
    if (hasPoints) {
      const { data: prev } = await supabaseAdmin.from('users').select('points').eq('id', id).single()
      pointsBefore = Number(prev?.points ?? 0)
      pointsDelta = Number(body.points) - pointsBefore
      if (!Number.isFinite(pointsDelta)) {
        return NextResponse.json({ error: '積分必須是數字' }, { status: 400 })
      }
      if (pointsDelta !== 0) {
        const { error: pErr } = await supabaseAdmin.rpc('apply_points_delta', {
          p_user_id: id,
          p_delta: pointsDelta,
          // 直接改數字本質上是修帳，不是行銷贈點
          p_type: 'correction',
          p_reason: String(body.points_reason ?? '').trim() || '後台編輯會員直接調整積分',
          p_ref_table: 'users',
          p_ref_id: id,
          p_idem: null,
          p_admin: String(session.adminId ?? 'admin'),
        })
        // 扣到負的會被 DB 擋下（'積分不足'），要讓管理員看到而不是靜默失敗
        if (pErr) return NextResponse.json({ error: `積分調整失敗：${pErr.message}` }, { status: 400 })
      }
    }

    if (hasProfile || hasStatus) {
      const fieldsToUpdate: Record<string, any> = { ...profileUpdates }
      if (hasStatus) fieldsToUpdate.status = body.status
      const { data, error } = await supabaseAdmin
        .from('users').update(fieldsToUpdate).eq('id', id).select('*').single()
      if (error) throw error
      updatedUser = data
    }

    /*
     * 積分是 RPC 改的，上面那個 update 不會帶到它。
     * 只調積分時 updatedUser 還是 null，補讀一次；有 update 過的則把新餘額補上，
     * 否則畫面會顯示舊的積分（管理員以為沒改成功，再按一次就變兩倍）。
     */
    if (pointsDelta !== 0) {
      const { data: after } = await supabaseAdmin.from('users').select('*').eq('id', id).single()
      if (after) updatedUser = after
    }

    // 代幣有變動就補分類帳。差額為 0（送了同樣的數字）不寫，免得留下一堆 delta=0 的雜訊
    if (tokensBefore !== null) {
      const delta = Number(profileUpdates.tokens ?? 0) - tokensBefore
      if (delta !== 0) {
        await supabaseAdmin.from('token_adjustments').insert({
          user_id: id,
          delta,
          reason: '後台編輯會員直接調整代幣',
          created_by: 'admin',
          category: 'correction',   // 直接改數字本質上是修帳（migration 582）
        })
      }
    }

    if (hasProfile) {
      await logAdminAction({
        adminId: session.adminId,
        action: '編輯會員資料',
        targetType: 'user',
        targetId: id,
        detail: profileUpdates,
        ip: getClientIp(request),
      })

      // 即時通知：手動調整代幣
      if (profileUpdates.tokens !== undefined) {
        // 原本只推「新餘額」，看不出改了多少 —— 補上原餘額與差額
        pushSensitiveAlert(
          `🔧 管理員敏感操作\n操作：手動調整代幣\n管理員ID：${session.adminId}\n用戶ID：${id}\n`
          + `原餘額：${tokensBefore ?? '?'} G → 新餘額：${profileUpdates.tokens} G`
          + `（${Number(profileUpdates.tokens ?? 0) - Number(tokensBefore ?? 0) >= 0 ? '+' : ''}`
          + `${Number(profileUpdates.tokens ?? 0) - Number(tokensBefore ?? 0)} G）`
        )
      }
    }

    // 積分也是敏感操作：它能折抵代幣，等於準現金
    if (pointsDelta !== 0) {
      await logAdminAction({
        adminId: session.adminId,
        action: '手動調整積分',
        targetType: 'user',
        targetId: id,
        detail: { before: pointsBefore, after: body.points, delta: pointsDelta },
        ip: getClientIp(request),
      })
      pushSensitiveAlert(
        `🔧 管理員敏感操作\n操作：手動調整積分\n管理員ID：${session.adminId}\n用戶ID：${id}\n`
        + `原餘額：${pointsBefore} P → 新餘額：${body.points} P（${pointsDelta >= 0 ? '+' : ''}${pointsDelta} P）`
      )
    }


    if (hasPassword) {
      const nextPassword = shouldGeneratePassword
        ? randomBytes(9).toString('base64url')
        : String(body.password ?? '').trim()
      if (!nextPassword) return NextResponse.json({ error: '新密碼不可為空' }, { status: 400 })
      if (shouldGeneratePassword) tempPassword = nextPassword

      const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
        password: nextPassword,
      })
      if (error) throw error

      await supabaseAdmin.from('notifications').insert({
        user_id: id,
        type: 'security',
        title: '密碼已重置',
        body: '管理員已為您的帳號重置密碼。如非本人操作，請立即聯繫客服。',
        link: '/profile?tab=settings',
        meta: { action: 'reset_password' },
      })
    }

    if (body.status) {
      const text = body.status === 'active' ? '啟用' : '停用'
      await supabaseAdmin.from('notifications').insert({
        user_id: id,
        type: 'security',
        title: '帳號狀態變更通知',
        body: `您的帳號狀態已被管理員設為：${text}`,
        link: '/profile?tab=settings',
        meta: { status: body.status },
      })
    }

    if (hasStatus) {
      await logAdminAction({
        adminId: session.adminId,
        action: body.status === 'active' ? '啟用用戶' : '停用用戶',
        targetType: 'user',
        targetId: id,
        detail: { status: body.status },
        ip: getClientIp(request),
      })
    }
    if (hasPassword) {
      await logAdminAction({
        adminId: session.adminId,
        action: '重設用戶密碼',
        targetType: 'user',
        targetId: id,
        detail: { generated: shouldGeneratePassword },
        ip: getClientIp(request),
      })
    }

    return NextResponse.json({ success: true, user: updatedUser, tempPassword: tempPassword ?? undefined })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '更新失敗' }, { status: 500 })
  }
}
