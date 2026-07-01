import type { SupabaseClient } from '@supabase/supabase-js'

export async function detectSeriesFromName(
  name: string,
  supabase: SupabaseClient
): Promise<string | null> {
  if (!name) return null
  const { data } = await supabase.from('series_keywords').select('keyword, series_name')
  if (!data || data.length === 0) return null
  const lower = name.toLowerCase()
  const sorted = [...data].sort((a, b) => b.keyword.length - a.keyword.length)
  for (const { keyword, series_name } of sorted) {
    if (lower.includes(keyword.toLowerCase())) return series_name as string
  }
  return null
}
