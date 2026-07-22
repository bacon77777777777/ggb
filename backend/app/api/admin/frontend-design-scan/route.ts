import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseAdmin()

  const { data: latestRun } = await supabase
    .from('frontend_design_scan_runs')
    .select('*')
    .order('ran_at', { ascending: false })
    .limit(1)
    .single()

  if (!latestRun) {
    return NextResponse.json({ run: null, violations: [], byType: {}, byFile: {} })
  }

  const { data: violations } = await supabase
    .from('frontend_design_scan_results')
    .select('file_path, line_number, violation_type, violation_class, line_content, fix_hint')
    .eq('run_id', latestRun.id)
    .order('file_path')
    .order('line_number')

  const byType: Record<string, number> = {}
  const byFile: Record<string, Array<{ line_number: number; violation_type: string; violation_class: string; line_content: string; fix_hint: string }>> = {}

  for (const v of violations || []) {
    byType[v.violation_type] = (byType[v.violation_type] || 0) + 1
    if (!byFile[v.file_path]) byFile[v.file_path] = []
    byFile[v.file_path].push({
      line_number: v.line_number,
      violation_type: v.violation_type,
      violation_class: v.violation_class,
      line_content: v.line_content,
      fix_hint: v.fix_hint,
    })
  }

  return NextResponse.json({ run: latestRun, byType, byFile })
}
