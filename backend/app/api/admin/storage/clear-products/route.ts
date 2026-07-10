import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { r2DeletePrefix } from '@/lib/r2'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'

async function requireSuperAdmin(adminId: string) {
  const supabase = getSupabaseAdmin()
  const { data: admin, error } = await supabase
    .from('admins')
    .select('id, role:roles(name)')
    .eq('id', adminId)
    .single()
  if (error || !admin) return false
  return ((admin as any).role?.name || '') === 'super_admin'
}

// bucket 名稱對應 R2 prefix
const BUCKET_PREFIX_MAP: Record<string, string> = {
  products: 'products/',
  banners:  'banners/',
  avatars:  'avatars/',
  marketplace: 'marketplace/',
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const isSuper = await requireSuperAdmin(String(session.adminId))
    if (!isSuper) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const bucket = String(body?.bucket || 'products')

    // exchange-receipts 永不清除
    if (bucket === 'exchange-receipts') {
      return NextResponse.json({ error: '儲值截圖不可清除' }, { status: 403 })
    }

    const prefix = BUCKET_PREFIX_MAP[bucket]
    if (!prefix) return NextResponse.json({ error: `未知 bucket: ${bucket}` }, { status: 400 })

    const deleted = await r2DeletePrefix(prefix)

    await logAdminAction({ adminId: session.adminId, action: '清除儲存空間', targetType: 'storage', detail: { bucket, deleted }, ip: getClientIp(request) })
    return NextResponse.json({ deleted, failedCount: 0, failed: [] })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '清除失敗' }, { status: 500 })
  }
}
