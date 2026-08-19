import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { signHandoff } from '@/lib/paymentHandoff'

/**
 * 把綠界表單欄位換成一次性簽章網址，給 App 用 in-app browser 開啟。
 * 見 lib/paymentHandoff.ts 的說明。
 */

/** 只允許交接到綠界，避免這支變成任意網站的自動送出跳板 */
const ALLOWED_HOSTS = new Set([
  'payment.ecpay.com.tw',
  'payment-stage.ecpay.com.tw',
])

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let action = ''
  let fields: Record<string, string> = {}
  try {
    const body = await request.json()
    action = String(body?.action ?? '')
    fields = body?.fields ?? {}
  } catch {
    /* 交給下面擋 */
  }

  let host = ''
  try {
    host = new URL(action).host
  } catch {
    return NextResponse.json({ error: 'Bad action' }, { status: 400 })
  }
  if (!ALLOWED_HOSTS.has(host)) {
    return NextResponse.json({ error: 'Bad action' }, { status: 400 })
  }
  if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'Bad fields' }, { status: 400 })
  }

  const clean: Record<string, string> = {}
  for (const [k, v] of Object.entries(fields)) clean[String(k)] = String(v)

  return NextResponse.json({ token: signHandoff(action, clean) })
}
