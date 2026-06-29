import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

const BATCH_SIZE = 200

async function requireSuperAdmin(adminId: string) {
  const supabaseAdmin = getSupabaseAdmin()
  const { data: admin, error } = await supabaseAdmin
    .from('admins')
    .select('id, role:roles(name)')
    .eq('id', adminId)
    .single()
  if (error || !admin) return false
  const roleName = (admin as any).role?.name || ''
  return roleName === 'super_admin'
}

export async function POST(request: Request) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const isSuper = await requireSuperAdmin(String(session.adminId))
    if (!isSuper) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const bucket = String(body?.bucket || 'products')
    const prefixes = Array.isArray(body?.prefixes) ? body.prefixes.map((s: any) => String(s)).filter(Boolean) : []

    const supabaseAdmin = getSupabaseAdmin()

    let deleted = 0
    const failed: Array<{ name: string; error: string }> = []

    const deleteNames = async (names: string[]) => {
      if (names.length === 0) return
      const { data, error } = await supabaseAdmin.storage.from(bucket).remove(names)
      if (error) {
        for (const n of names) failed.push({ name: n, error: error.message })
        return
      }
      deleted += Array.isArray(data) ? data.length : names.length
    }

    const fetchBatch = async (offset: number, prefix?: string) => {
      let q = supabaseAdmin.from('storage.objects').select('name').eq('bucket_id', bucket)
      if (prefix) q = q.like('name', `${prefix}%`)
      const { data, error } = await q.order('name', { ascending: true }).range(offset, offset + BATCH_SIZE - 1)
      if (error) throw error
      return (data || []).map((r: any) => String(r.name))
    }

    const runClear = async (prefix?: string) => {
      let offset = 0
      while (true) {
        const names = await fetchBatch(offset, prefix)
        if (names.length === 0) break
        await deleteNames(names)
        if (names.length < BATCH_SIZE) break
        offset += BATCH_SIZE
      }
    }

    if (prefixes.length > 0) {
      for (const p of prefixes) {
        await runClear(p)
      }
    } else {
      await runClear(undefined)
    }

    return NextResponse.json({ deleted, failedCount: failed.length, failed })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || '清除失敗' }, { status: 500 })
  }
}

