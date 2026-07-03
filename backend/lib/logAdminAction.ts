import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function logAdminAction({
  adminId,
  action,
  targetType,
  targetId,
  detail,
  ip,
  status = 'success',
}: {
  adminId: string | number
  action: string
  targetType?: string
  targetId?: string
  detail?: Record<string, any>
  ip?: string
  status?: 'success' | 'fail'
}) {
  try {
    const supabaseAdmin = getSupabaseAdmin()

    const { data: admin } = await supabaseAdmin
      .from('admins')
      .select('username, role:roles(name)')
      .eq('id', adminId)
      .single()

    await supabaseAdmin.from('action_logs').insert({
      admin_id: Number(adminId),
      action,
      target_type: targetType,
      target_id: targetId ? String(targetId) : undefined,
      detail,
      username: admin?.username,
      role: (admin as any)?.role?.name,
      ip,
      status,
    })
  } catch {
    // 審計 log 失敗不影響主流程
  }
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}
