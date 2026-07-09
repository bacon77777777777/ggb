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

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ commentId: string }> }) {
  const { commentId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 })

  const admin = getAdmin()
  const { data: comment } = await admin
    .from('news_comments')
    .select('user_id')
    .eq('id', commentId)
    .single()

  if (!comment) return NextResponse.json({ error: '找不到留言' }, { status: 404 })
  if (comment.user_id !== user.id) return NextResponse.json({ error: '無權限' }, { status: 403 })

  await admin.from('news_comments').delete().eq('id', commentId)

  return NextResponse.json({ ok: true })
}
