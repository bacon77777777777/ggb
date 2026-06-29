import { supabase } from '@/lib/supabaseClient'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (error) throw error

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error fetching categories:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
