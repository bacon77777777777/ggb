import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

function getAdmin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: newsId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

  const admin = getAdmin()

  // 切換按讚狀態
  const { data: existing } = await admin
    .from('news_likes')
    .select('user_id')
    .eq('news_id', newsId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    await admin.from('news_likes').delete().eq('news_id', newsId).eq('user_id', user.id)
  } else {
    await admin.from('news_likes').insert({ news_id: newsId, user_id: user.id })
  }

  const { count } = await admin
    .from('news_likes')
    .select('*', { count: 'exact', head: true })
    .eq('news_id', newsId)

  return NextResponse.json({ liked: !existing, count: count ?? 0 })
}

// GET: 取得按讚狀態（支援未登入）
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: newsId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = getAdmin()
  const { count } = await admin
    .from('news_likes')
    .select('*', { count: 'exact', head: true })
    .eq('news_id', newsId)

  let liked = false
  if (user) {
    const { data } = await admin
      .from('news_likes')
      .select('user_id')
      .eq('news_id', newsId)
      .eq('user_id', user.id)
      .maybeSingle()
    liked = !!data
  }

  return NextResponse.json({ liked, count: count ?? 0 })
}
