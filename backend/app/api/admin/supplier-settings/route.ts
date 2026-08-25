import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { logAdminAction, getClientIp } from '@/lib/logAdminAction'
import { SETTLEMENT_KEYS, getSettlementDefaults } from '@/lib/settlementRates'

/**
 * 廠商結算設定（全站預設）
 *
 * 這支只管全站預設。廠商層級的覆蓋走 /api/admin/suppliers（新增／編輯視窗）——
 * 留兩個入口改同一批欄位遲早會不一致。
 *
 * 變更明細寫進 action_logs，在「系統設定 → 操作記錄」看得到
 * 「誰、何時、把哪一項從多少改成多少」。只記真的變了的欄位。
 */

const VALUE_LABEL: Record<string, string> = {
  // 回收價收不收（DB 值沿用舊的 charge／margin）
  charge: '跟廠商收',
  margin: '平台吸收',
  A: '廠商吸收 50%',
  B: '平台全吸收',
}

const FIELD_LABEL: Record<string, string> = {
  settlement_supplier_share: '廠商分潤比',
  settlement_withholding_rate: '代扣稅率',
  settlement_points_mode: '積分扣除模式',
  settlement_ecpay_rate: '綠界手續費估算',
  recycle_settlement_mode: '回收價',
  recycle_margin_supplier_share: '差額分潤',
}

function describe(key: string, value: string | null): string {
  if (value === null || value === '') return '—'
  if (key === 'settlement_points_mode' || key === 'recycle_settlement_mode') {
    return VALUE_LABEL[value] ?? value
  }
  return `${value}%`
}

export async function GET() {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const defaults = await getSettlementDefaults()
  return NextResponse.json({ defaults })
}

export async function PUT(request: Request) {
  const admin = await requireAdminSession()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const d = (await request.json().catch(() => null))?.defaults
  if (!d) return NextResponse.json({ error: '沒有收到設定內容' }, { status: 400 })

  const pct = (v: unknown, label: string) => {
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`${label}必須介於 0 ~ 100`)
    return String(n)
  }

  let next: Record<string, string>
  try {
    next = {
      settlement_supplier_share: pct(d.supplierShare, '廠商分潤比'),
      settlement_withholding_rate: pct(d.withholdingRate, '代扣稅率'),
      settlement_ecpay_rate: pct(d.ecpayRate, '綠界手續費估算'),
      settlement_points_mode: ['A', 'B'].includes(String(d.pointsMode)) ? String(d.pointsMode) : '',
      recycle_settlement_mode: ['charge', 'margin'].includes(String(d.recycleMode)) ? String(d.recycleMode) : '',
      recycle_margin_supplier_share: pct(d.recycleMarginShare, '差額分潤'),
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? '參數不正確' }, { status: 400 })
  }
  if (!next.settlement_points_mode) return NextResponse.json({ error: '積分扣除模式不正確' }, { status: 400 })
  if (!next.recycle_settlement_mode) return NextResponse.json({ error: '回收價設定不正確' }, { status: 400 })

  const supabase = getSupabaseAdmin()

  const { data: before } = await supabase
    .from('platform_settings').select('key, value').in('key', SETTLEMENT_KEYS as unknown as string[])
  const prev = Object.fromEntries((before ?? []).map((s: any) => [s.key, s.value]))

  const changes: string[] = []
  for (const [k, v] of Object.entries(next)) {
    const old = prev[k] ?? null
    if (String(old) === v) continue
    changes.push(`${FIELD_LABEL[k] ?? k}：${describe(k, old)} → ${describe(k, v)}`)
  }

  const { error } = await supabase.from('platform_settings').upsert(
    Object.entries(next).map(([key, value]) => ({ key, value })),
    { onConflict: 'key' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 沒有任何變更就不寫紀錄 —— 每按一次儲存都留一筆會把操作記錄灌爆
  if (changes.length > 0) {
    await logAdminAction({
      adminId: admin.adminId,
      action: '更新廠商結算設定',
      targetType: 'platform_settings',
      detail: { changes },
      ip: getClientIp(request),
    })
  }

  return NextResponse.json({ ok: true, changed: changes.length })
}
