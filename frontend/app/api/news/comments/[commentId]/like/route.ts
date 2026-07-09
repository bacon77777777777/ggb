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

export async function POST(req: NextRequest, { params }: { params: Promise<{ commentId: string }> }) {
  const { commentId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

  const admin = getAdmin()

  const { data: existing } = await admin
    .from('news_comment_likes')
    .select('user_id')
    .eq('comment_id', commentId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    await admin.from('news_comment_likes').delete().eq('comment_id', commentId).eq('user_id', user.id)
  } else {
    await admin.from('news_comment_likes').insert({ comment_id: commentId, user_id: user.id })
  }

  const { count } = await admin
    .from('news_comment_likes')
    .select('*', { count: 'exact', head: true })
    .eq('comment_id', commentId)

  return NextResponse.json({ liked: !existing, count: count ?? 0 })
}
