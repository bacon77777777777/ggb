import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl || '', supabaseKey || '')

export async function GET(request: Request) {
  try {
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Supabase env 未設定' }, { status: 500 })
    }
    const { searchParams } = new URL(request.url)
    const startParam = searchParams.get('start')
    const endParam = searchParams.get('end')
    const period = searchParams.get('period') || '7d'

    const parseDateOnly = (value: string) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
      if (!m) return null
      const y = Number(m[1])
      const mo = Number(m[2])
      const d = Number(m[3])
      if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null
      return new Date(y, mo - 1, d)
    }

    const now = new Date()
    let startDate: Date
    let endDateExclusive: Date

    if (startParam && endParam) {
      const s = parseDateOnly(startParam)
      const e = parseDateOnly(endParam)
      if (!s || !e) {
        return NextResponse.json({ error: 'Invalid start/end' }, { status: 400 })
      }
      startDate = s
      endDateExclusive = new Date(e)
      endDateExclusive.setDate(endDateExclusive.getDate() + 1)
    } else {
      startDate = new Date()
      if (period === '7d') startDate.setDate(now.getDate() - 7)
      else if (period === '30d') startDate.setDate(now.getDate() - 30)
      else startDate.setDate(now.getDate() - 7)
      endDateExclusive = new Date(now)
      endDateExclusive.setDate(endDateExclusive.getDate() + 1)
    }

    const granularity = (() => {
      const g = searchParams.get('granularity')
      if (g === 'hour' || g === 'day') return g
      if (startParam && endParam && startParam === endParam) return 'hour'
      return 'day'
    })()

    const { data, error } = await supabase
      .from('visit_logs')
      .select('created_at')
      .gte('created_at', startDate.toISOString())
      .lt('created_at', endDateExclusive.toISOString())
      .order('created_at', { ascending: true })
      .limit(50000)
    
    if (error) {
      if ((error as any).code === 'PGRST205') {
        const chartData =
          granularity === 'hour' ? Array(24).fill(0) : Array(period === '30d' ? 30 : 7).fill(0)
        return NextResponse.json({
          totalVisits: 0,
          totalVisitsPeriod: 0,
          trend: 0,
          chartData,
        })
      }
      throw error
    }

    const counts: number[] = []
    const indexByBucket = new Map<string, number>()
    if (granularity === 'hour') {
      for (let h = 0; h < 24; h += 1) {
        counts.push(0)
        indexByBucket.set(String(h).padStart(2, '0'), h)
      }
    } else {
      const endInclusive = new Date(endDateExclusive)
      endInclusive.setDate(endInclusive.getDate() - 1)
      let idx = 0
      for (let d = new Date(startDate); d <= endInclusive; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().split('T')[0]
        counts.push(0)
        indexByBucket.set(key, idx)
        idx += 1
      }
    }

    let totalVisitsPeriod = 0
    for (const log of data ?? []) {
      const createdAt = new Date((log as any).created_at)
      if (Number.isNaN(createdAt.getTime())) continue
      const bucket =
        granularity === 'hour'
          ? String(createdAt.getHours()).padStart(2, '0')
          : createdAt.toISOString().split('T')[0]
      const idx = indexByBucket.get(bucket)
      if (idx === undefined) continue
      counts[idx] += 1
      totalVisitsPeriod += 1
    }

    const last = counts.length >= 1 ? counts[counts.length - 1] : 0
    const prev = counts.length >= 2 ? counts[counts.length - 2] : 0
    let trend = 0
    if (prev > 0) {
      trend = Math.round(((last - prev) / prev) * 100)
    } else if (last > 0) {
      trend = 100
    }

    return NextResponse.json({
      totalVisits: totalVisitsPeriod,
      totalVisitsPeriod,
      trend,
      chartData: counts
    })
  } catch (error) {
    console.error('Error fetching visit stats:', error)
    return NextResponse.json({
      totalVisits: 0,
      totalVisitsPeriod: 0,
      trend: 0,
      chartData: Array(7).fill(0)
    })
  }
}

export async function POST(request: Request) {
  try {
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Supabase env 未設定' }, { status: 500 })
    }
    const body = await request.json()
    const { page_path, user_id, user_agent, metadata } = body
    
    // Get IP from headers
    const forwarded = request.headers.get('x-forwarded-for')
    const ip_address = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip')

    if (!page_path) {
      return NextResponse.json({ error: 'Page path is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('visit_logs')
      .insert({
        page_path,
        user_id: user_id || null,
        ip_address: ip_address || null,
        user_agent: user_agent || null,
        metadata: metadata || {}
      })

    if (error) {
      if ((error as any).code === 'PGRST205') {
        return NextResponse.json({ success: true })
      }
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error logging visit:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
