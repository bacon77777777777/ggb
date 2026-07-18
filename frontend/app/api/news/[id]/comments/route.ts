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

// GET: 取留言列表（含使用者資訊 + 留言按讚數 + 是否已按讚）
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: newsId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = getAdmin()

  const { data: comments, error } = await admin
    .from('news_comments')
    .select('id, news_id, user_id, content, created_at')
    .eq('news_id', newsId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!comments || comments.length === 0) return NextResponse.json([])

  // 撈使用者資料
  const userIds = [...new Set(comments.map(c => c.user_id))]
  const { data: usersData } = await admin
    .from('users')
    .select('id, name, avatar_url')
    .in('id', userIds)

  const userMap: Record<string, { name: string; avatar_url: string | null }> = {}
  for (const u of usersData ?? []) {
    userMap[u.id] = { name: u.name || '用戶', avatar_url: u.avatar_url }
  }

  // 撈所有留言的按讚數
  const commentIds = comments.map(c => c.id)
  const { data: likesData } = await admin
    .from('news_comment_likes')
    .select('comment_id, user_id')
    .in('comment_id', commentIds)

  const likeCountMap: Record<string, number> = {}
  const myLikedSet = new Set<string>()
  for (const l of likesData ?? []) {
    likeCountMap[l.comment_id] = (likeCountMap[l.comment_id] ?? 0) + 1
    if (user && l.user_id === user.id) myLikedSet.add(l.comment_id)
  }

  const result = comments.map(c => ({
    ...c,
    user: userMap[c.user_id] ?? { name: '用戶', avatar_url: null },
    likes_count: likeCountMap[c.id] ?? 0,
    is_liked: myLikedSet.has(c.id),
    is_own: user ? c.user_id === user.id : false,
  }))

  return NextResponse.json(result)
}

// POST: 新增留言
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: newsId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

  const { content } = await req.json()
  if (!content?.trim()) return NextResponse.json({ error: '留言不能為空' }, { status: 400 })
  if (content.trim().length > 300) return NextResponse.json({ error: '留言最多 300 字' }, { status: 400 })

  const admin = getAdmin()
  const { data, error } = await admin
    .from('news_comments')
    .insert({ news_id: newsId, user_id: user.id, content: content.trim() })
    .select('id, news_id, user_id, content, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 撈自己的用戶資訊
  const { data: userData } = await admin
    .from('users')
    .select('id, name, avatar_url')
    .eq('id', user.id)
    .single()

  const metaAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture || null
  const metaName = user.user_metadata?.full_name || user.user_metadata?.name || null

  return NextResponse.json({
    ...data,
    user: {
      name: userData?.name || metaName || '用戶',
      avatar_url: userData?.avatar_url || metaAvatar || null,
    },
    likes_count: 0,
    is_liked: false,
    is_own: true,
  })
}
