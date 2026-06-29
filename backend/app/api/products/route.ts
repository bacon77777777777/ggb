import { supabase } from '@/lib/supabaseClient'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const is_hot = searchParams.get('is_hot')
  const sort = searchParams.get('sort') || 'created_at'
  const order = searchParams.get('order') || 'desc'
  const limit = parseInt(searchParams.get('limit') || '10')
  const category_id = searchParams.get('category_id')

  try {
    let query = supabase
      .from('products')
      .select('id, name, price, image_url, is_hot, created_at, category_id, categories(id, name)')
      .eq('status', 'active')

    if (is_hot === 'true') {
      query = query.eq('is_hot', true)
    }

    if (category_id) {
      query = query.eq('category_id', category_id)
    }

    // Apply sorting
    query = query.order(sort, { ascending: order === 'asc' })

    // Apply limit
    if (limit > 0) {
      query = query.limit(limit)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ products: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
