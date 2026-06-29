import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type WinningRecord = {
  id: number
  user_name: string
  product_name: string
  prize_level: string
  prize_name: string
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return NextResponse.json({ records: [] }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  }

  const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data, error } = await supabase.rpc('get_winning_records', { p_limit: 30 })

  if (error) {
    return NextResponse.json(
      { records: [], error: error.message || 'failed_to_fetch' },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const formatted = (data as unknown as WinningRecord[]).slice(0, 10)

  return NextResponse.json({ records: formatted }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
}
