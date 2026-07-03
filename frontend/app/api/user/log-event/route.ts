import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createSsrClient } from '@/lib/supabase/server'

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSsrClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const eventType = String(body?.event_type || '').trim()
    if (!eventType) return NextResponse.json({ error: 'Missing event_type' }, { status: 400 })

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    await supabaseAdmin.from('user_event_logs').insert({
      user_id: user.id,
      event_type: eventType,
      detail: body?.detail || null,
      ip: getClientIp(request),
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
