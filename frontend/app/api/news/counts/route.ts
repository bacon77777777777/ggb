import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

function getAdmin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

// GET /api/news/counts?ids=1,2,3
// Returns { likes: {id: count}, comments: {id: count} }
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('ids') ?? ''
  const ids = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (ids.length === 0) return NextResponse.json({ likes: {}, comments: {} })

  const admin = getAdmin()
  const [{ data: likesData }, { data: commentsData }] = await Promise.all([
    admin.from('news_likes').select('news_id').in('news_id', ids),
    admin.from('news_comments').select('news_id').in('news_id', ids),
  ])

  const likes: Record<string, number> = {}
  for (const l of likesData ?? []) likes[l.news_id] = (likes[l.news_id] ?? 0) + 1

  const comments: Record<string, number> = {}
  for (const c of commentsData ?? []) comments[c.news_id] = (comments[c.news_id] ?? 0) + 1

  return NextResponse.json({ likes, comments })
}
