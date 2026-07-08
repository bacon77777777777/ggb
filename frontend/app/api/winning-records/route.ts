import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type WinningRecord = {
  id: number
  user_id?: string | null
  user_name: string
  product_name: string
  prize_level: string
  prize_name: string
}


export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  let realRecords: WinningRecord[] = []

  if (url && anonKey) {
    const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data } = await supabase.rpc('get_winning_records', { p_limit: 30 })
    if (Array.isArray(data)) {
      realRecords = (data as WinningRecord[]).slice(0, 10)
    }
  }

  const records = realRecords

  return NextResponse.json(
    { records },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  )
}
