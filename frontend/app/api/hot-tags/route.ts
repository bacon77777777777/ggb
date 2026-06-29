import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type HotTagRow = {
  id: string
  name: string
  score: number
  is_pinned: boolean
  pinned_order: number
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limitRaw = searchParams.get('limit')
  const daysRaw = searchParams.get('days')

  const limit = limitRaw ? Number(limitRaw) : 8
  const days = daysRaw ? Number(daysRaw) : 30

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return NextResponse.json({ tags: [] }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  }

  const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data, error } = await supabase.rpc('get_hot_tags', { p_limit: limit, p_days: days })

  if (error) {
    return NextResponse.json(
      { tags: [], error: error.message || 'failed_to_fetch' },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const tags = Array.isArray(data) ? (data as HotTagRow[]) : []

  return NextResponse.json({ tags }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
}
