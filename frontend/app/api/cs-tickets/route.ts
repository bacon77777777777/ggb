import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const CATEGORIES = ['代幣問題', '抽獎問題', '商品問題', '出貨問題', '帳號問題', '其他'] as const

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function POST(request: NextRequest) {
  // Verify session via SSR client
  const cookieStore = await cookies()
  const supabaseSSR = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )
  const { data: { user } } = await supabaseSSR.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 })
  }

  let body: { category?: string; email?: string; phone?: string; content?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 })
  }

  const { category, email, phone, content } = body
  if (!category || !email || !phone || !content) {
    return NextResponse.json({ error: '所有欄位皆為必填' }, { status: 400 })
  }
  if (!CATEGORIES.includes(category as typeof CATEGORIES[number])) {
    return NextResponse.json({ error: '無效的回報類型' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const { error } = await supabase.from('cs_tickets').insert({
    user_id: user.id,
    category,
    email: email.trim(),
    phone: phone.trim(),
    content: content.trim(),
  })

  if (error) {
    console.error('[cs-tickets] insert error:', error)
    return NextResponse.json({ error: '提交失敗，請稍後再試' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
