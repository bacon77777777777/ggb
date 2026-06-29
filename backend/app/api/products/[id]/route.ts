import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data: product, error } = await supabase
      .from('products')
      .select(`
        *,
        category_info:categories(id, name),
        prizes:product_prizes(*)
      `)
      .eq('id', id)
      .eq('status', 'active') // Only show active products
      .single()

    if (error) throw error
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // Sort prizes by level or probability if needed
    // Usually prizes are ordered by probability or some order field.
    // Let's sort by probability ascending (rare first) or level.
    // Javascript sort might be better here if no order column.
    if (product.prizes) {
      product.prizes.sort((a: any, b: any) => {
        // Custom sort logic: A, B, C... Last One
        const levelOrder: { [key: string]: number } = { 'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5, 'F': 6, 'G': 7, 'H': 8, 'Last One': 99 }
        return (levelOrder[a.level] || 99) - (levelOrder[b.level] || 99)
      })
    }

    return NextResponse.json(product)
  } catch (error: any) {
    console.error('Error fetching product detail:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
