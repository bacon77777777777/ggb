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
// 使用 RPC 做 GROUP BY 聚合，避免 raw rows 受 1000 筆上限截斷導致計數不準
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('ids') ?? ''
  const ids = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (ids.length === 0) return NextResponse.json({ likes: {}, comments: {} })

  const admin = getAdmin()
  const { data, error } = await admin.rpc('get_news_engagement_counts', { news_ids: ids })

  if (error || !data) {
    return NextResponse.json({ likes: {}, comments: {} })
  }

  return NextResponse.json(data as { likes: Record<string, number>; comments: Record<string, number> })
}
