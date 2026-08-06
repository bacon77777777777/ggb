import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminScope } from '@/lib/requireAdmin'
import { PRODUCT_IMPORT_FIELDS, PRIZE_IMPORT_FIELDS } from '@/lib/productSchema'

export const runtime = 'nodejs'

/**
 * 下載成我們的標準 CSV
 *
 * 這個工具的定位是「格式轉換 + 資料補齊」：輸入任何廠商格式，
 * 輸出我們的標準格式。所以這裡的欄位順序與名稱**必須跟範本一模一樣** ——
 * 下載下來要能原封不動餵回手動批量匯入，中間不用改任何東西。
 *
 * 殺率不輸出。那欄的說明等於把大獎怎麼排籤教出去，而且檔案會被轉寄。
 */

const PRODUCT_FIELDS = PRODUCT_IMPORT_FIELDS
  .filter(f => !f.key.startsWith('_') && f.key !== 'profit_rate')

const esc = (v: unknown) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const scope = await requireAdminScope()
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getSupabaseAdmin()

  const { data: job } = await supabase
    .from('import_jobs').select('filename, supplier_id').eq('id', id).maybeSingle()
  if (!job) return NextResponse.json({ error: '找不到這筆工作' }, { status: 404 })
  if (scope.supplierScope !== undefined && job.supplier_id !== scope.supplierScope) {
    return NextResponse.json({ error: '找不到這筆工作' }, { status: 404 })
  }

  const { data: rows } = await supabase
    .from('import_job_rows').select('product, prizes').eq('job_id', id).order('row_no')

  const list = rows ?? []
  // 欄位組數看實際最多幾個品項，不要固定 20 組 ——
  // 每個商品只有 4 款時，後面 16 組空欄位只會讓人以為漏填了
  const maxPrizes = Math.max(1, ...list.map(r => (r.prizes as unknown[])?.length ?? 0))

  const headers = [
    ...PRODUCT_FIELDS.map(f => f.label),
    ...Array.from({ length: maxPrizes }, (_, i) =>
      PRIZE_IMPORT_FIELDS.map(f => `獎項${i + 1}${f.label === '品項名稱' ? '名稱' : f.label}`)).flat(),
  ]

  const lines = [headers.map(esc).join(',')]
  for (const r of list) {
    const p = (r.product ?? {}) as Record<string, unknown>
    const zs = ((r.prizes ?? []) as Record<string, unknown>[])
    const cells: string[] = PRODUCT_FIELDS.map(f => {
      const v = p[f.key]
      if (f.key === 'type') {
        return String({ ichiban: '一番賞', blindbox: '盒玩', gacha: '轉蛋', card: '抽卡', custom: '自製賞', slot: '機台' }[String(v)] ?? v ?? '')
      }
      if (f.kind === 'bool') return v === true ? '是' : v === false ? '否' : ''
      if (f.key === 'status') return v === 'active' ? '上架' : '待上架'
      return String(v ?? '')
    })
    for (let i = 0; i < maxPrizes; i++) {
      const z = zs[i] ?? {}
      for (const f of PRIZE_IMPORT_FIELDS) cells.push(String(z[f.key] ?? ''))
    }
    lines.push(cells.map(esc).join(','))
  }

  // BOM 一定要加，不然 Excel 開起來中文是亂碼
  const csv = '\uFEFF' + lines.join('\r\n')
  const name = job.filename.replace(/\.[^.]+$/, '') + '_已補齊.csv'

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  })
}
