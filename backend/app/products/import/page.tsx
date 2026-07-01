'use client'

import AdminLayout from '@/components/AdminLayout'
import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// 系統欄位定義
const SYSTEM_FIELDS = [
  { key: 'name',         label: '商品名稱',   required: true,  hint: '例：鬼滅之刃 一番賞' },
  { key: 'type',         label: '商品類型',   required: true,  hint: 'ichiban / gacha / blindbox / card' },
  { key: 'price',        label: '單抽價格(G)', required: true,  hint: '數字，例：350' },
  { key: 'total_count',  label: '商品總數',   required: true,  hint: '數字，例：80' },
  { key: 'category',     label: '分類',       required: false, hint: '例：動漫、遊戲' },
  { key: 'distributor',  label: '代理商',     required: false, hint: '例：萬代南夢宮' },
  { key: 'series',       label: '系列',       required: false, hint: '例：鬼滅之刃' },
  { key: 'supplier_name',label: '供應廠商',   required: false, hint: '廠商名稱（需已存在）' },
  { key: 'description',  label: '商品描述',   required: false, hint: '商品說明文字' },
  { key: 'release_year', label: '上市年份',   required: false, hint: '例：2024' },
  { key: 'release_month',label: '上市月份',   required: false, hint: '例：6' },
  { key: 'image_url',    label: '圖片網址',   required: false, hint: 'https://... 或留空' },
]

// 智能欄位配對關鍵字
const FIELD_KEYWORDS: Record<string, string[]> = {
  name:          ['名稱', '商品名', 'name', '品名', '商品', 'title'],
  type:          ['類型', 'type', '種類', '商品種類', '商品類型'],
  price:         ['價格', 'price', '單價', '抽獎費', '費用', 'g幣', '代幣', '金額'],
  total_count:   ['總數', '數量', 'count', 'total', '庫存', '總量', '籤數'],
  category:      ['分類', 'category', '類別', '品類'],
  distributor:   ['代理商', 'distributor', '代理', '進口商'],
  series:        ['系列', 'series', 'ip', 'ip系列'],
  supplier_name: ['廠商', 'supplier', '供應商', '合作廠商', '廠商名稱'],
  description:   ['描述', 'description', '說明', '內容', '備註', '介紹'],
  release_year:  ['年份', 'year', '發售年', '上市年'],
  release_month: ['月份', 'month', '發售月', '上市月'],
  image_url:     ['圖片', 'image', 'img', '圖', '封面', '圖片網址', 'url'],
}

function detectField(header: string): string | null {
  const h = header.toLowerCase().trim()
  for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
    if (keywords.some(k => h.includes(k))) return field
  }
  return null
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  if (lines.length === 0) return { headers: [], rows: [] }

  const parseLine = (line: string): string[] => {
    const result: string[] = []
    let cur = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = !inQuote
      } else if (ch === ',' && !inQuote) {
        result.push(cur.trim()); cur = ''
      } else {
        cur += ch
      }
    }
    result.push(cur.trim())
    return result
  }

  const headers = parseLine(lines[0])
  const rows = lines.slice(1).map(parseLine)
  return { headers, rows }
}

const TYPE_MAP: Record<string, string> = {
  '一番賞': 'ichiban', '转蛋': 'gacha', '轉蛋': 'gacha', '盒玩': 'blindbox',
  '集換式卡牌': 'card', '卡牌': 'card', 'ichiban': 'ichiban', 'gacha': 'gacha',
  'blindbox': 'blindbox', 'card': 'card',
}

export default function ProductImportPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'done'>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({}) // systemField → csvHeader
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<{ name: string; status: 'ok' | 'error'; msg?: string }[]>([])
  const [dragOver, setDragOver] = useState(false)

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const { headers: h, rows: r } = parseCSV(text)
      if (h.length === 0) { alert('無法解析 CSV，請確認格式'); return }
      setHeaders(h)
      setRows(r)

      // 智能自動配對
      const auto: Record<string, string> = {}
      for (const field of SYSTEM_FIELDS) {
        const matched = h.find(hdr => {
          const detected = detectField(hdr)
          return detected === field.key
        })
        if (matched) auto[field.key] = matched
      }
      setMapping(auto)
      setStep('mapping')
    }
    reader.readAsText(file, 'utf-8')
  }, [])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const downloadTemplate = () => {
    const headers = SYSTEM_FIELDS.map(f => f.label)
    const example = [
      '鬼滅之刃一番賞', 'ichiban', '350', '80', '動漫', '萬代南夢宮', '鬼滅之刃', '測試廠商', '商品說明', '2024', '6', '',
    ]
    const bom = '﻿'
    const csv = bom + [headers, example].map(r => r.map(c => `"${c}"`).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = 'ggb_商品批量匯入範本.csv'; a.click()
  }

  const getRowValue = (row: string[], field: string) => {
    const csvHeader = mapping[field]
    if (!csvHeader) return ''
    const idx = headers.indexOf(csvHeader)
    return idx >= 0 ? (row[idx] ?? '').trim() : ''
  }

  const previewRows = rows.slice(0, 5).map(row => ({
    name: getRowValue(row, 'name'),
    type: TYPE_MAP[getRowValue(row, 'type')] || getRowValue(row, 'type'),
    price: getRowValue(row, 'price'),
    total_count: getRowValue(row, 'total_count'),
    series: getRowValue(row, 'series'),
    distributor: getRowValue(row, 'distributor'),
  }))

  const handleImport = async () => {
    setImporting(true)
    const res: typeof results = []
    for (const row of rows) {
      const name = getRowValue(row, 'name')
      if (!name) continue
      const payload = {
        name,
        type: TYPE_MAP[getRowValue(row, 'type')] || 'ichiban',
        price: parseInt(getRowValue(row, 'price')) || 0,
        total_count: parseInt(getRowValue(row, 'total_count')) || 0,
        remaining: parseInt(getRowValue(row, 'total_count')) || 0,
        category: getRowValue(row, 'category') || null,
        distributor: getRowValue(row, 'distributor') || null,
        series: getRowValue(row, 'series') || null,
        description: getRowValue(row, 'description') || null,
        image_url: getRowValue(row, 'image_url') || '/images/item.png',
        release_year: getRowValue(row, 'release_year') || null,
        release_month: getRowValue(row, 'release_month') || null,
        status: 'active',
        is_hot: false,
        sales: 0,
        supplier_name: getRowValue(row, 'supplier_name') || null,
      }
      try {
        const r = await fetch('/api/admin/products/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const json = await r.json()
        if (!r.ok) throw new Error(json.error || '失敗')
        res.push({ name, status: 'ok' })
      } catch (e: any) {
        res.push({ name, status: 'error', msg: e.message })
      }
    }
    setResults(res)
    setStep('done')
    setImporting(false)
  }

  return (
    <AdminLayout
      pageTitle="批量匯入商品"
      breadcrumbs={[{ label: '商品管理', href: '/products' }, { label: '批量匯入', href: '/products/import' }]}
    >
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Step 1: 上傳 */}
        {step === 'upload' && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
              上傳 CSV 檔案，系統會自動偵測欄位並配對。不確定格式請先下載範本。
            </div>

            <button onClick={downloadTemplate}
              className="flex items-center gap-2 px-4 py-2 border-2 border-neutral-200 rounded-lg text-sm font-medium hover:border-neutral-300 transition-colors bg-white">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              下載範本 CSV
            </button>

            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-neutral-300 hover:border-neutral-400 bg-white'}`}
            >
              <svg className="w-10 h-10 mx-auto mb-3 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm font-medium text-neutral-600">拖放 CSV 到這裡，或點擊選擇檔案</p>
              <p className="text-xs text-neutral-400 mt-1">支援 UTF-8 或 UTF-8 BOM 編碼</p>
              <input ref={fileRef} type="file" accept=".csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </div>
          </div>
        )}

        {/* Step 2: 欄位配對 */}
        {step === 'mapping' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-neutral-900">欄位配對</h3>
                  <p className="text-xs text-neutral-500 mt-0.5">系統已自動偵測，請確認對應是否正確</p>
                </div>
                <span className="text-xs text-neutral-400">共 {rows.length} 筆資料</span>
              </div>

              <div className="space-y-2">
                {SYSTEM_FIELDS.map(field => (
                  <div key={field.key} className="grid grid-cols-5 gap-3 items-center py-2 border-b border-neutral-50 last:border-0">
                    <div className="col-span-2">
                      <span className="text-sm font-medium text-neutral-700">{field.label}</span>
                      {field.required && <span className="ml-1 text-red-500 text-xs">*</span>}
                      <p className="text-xs text-neutral-400">{field.hint}</p>
                    </div>
                    <div className="col-span-3">
                      <select
                        value={mapping[field.key] || ''}
                        onChange={e => setMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                        className={`w-full px-3 py-1.5 text-sm border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 ${mapping[field.key] ? 'border-emerald-300 bg-emerald-50' : 'border-neutral-200 bg-white'}`}
                      >
                        <option value="">— 不匯入此欄位 —</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('upload')}
                className="px-4 py-2 border-2 border-neutral-200 rounded-lg text-sm font-medium hover:border-neutral-300 bg-white">
                重新上傳
              </button>
              <button
                onClick={() => {
                  const missing = SYSTEM_FIELDS.filter(f => f.required && !mapping[f.key]).map(f => f.label)
                  if (missing.length > 0) { alert(`必填欄位未配對：${missing.join('、')}`); return }
                  setStep('preview')
                }}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">
                下一步：預覽
              </button>
            </div>
          </div>
        )}

        {/* Step 3: 預覽 */}
        {step === 'preview' && (
          <div className="space-y-4">
            <div className="bg-white rounded-lg border border-neutral-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-neutral-900">預覽（前 5 筆）</h3>
                <span className="text-xs text-neutral-400">共 {rows.length} 筆即將匯入</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-neutral-100">
                      {['商品名稱', '類型', '價格(G)', '總數', '系列', '代理商'].map(h => (
                        <th key={h} className="text-left py-2 px-2 font-semibold text-neutral-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, i) => (
                      <tr key={i} className="border-b border-neutral-50">
                        <td className="py-2 px-2 font-medium text-neutral-800 max-w-[160px] truncate">{r.name || '—'}</td>
                        <td className="py-2 px-2 text-neutral-600">{r.type || '—'}</td>
                        <td className="py-2 px-2 text-neutral-600">{r.price || '—'}</td>
                        <td className="py-2 px-2 text-neutral-600">{r.total_count || '—'}</td>
                        <td className="py-2 px-2 text-neutral-600">{r.series || '—'}</td>
                        <td className="py-2 px-2 text-neutral-600">{r.distributor || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('mapping')}
                className="px-4 py-2 border-2 border-neutral-200 rounded-lg text-sm font-medium hover:border-neutral-300 bg-white">
                返回配對
              </button>
              <button onClick={handleImport} disabled={importing}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60 flex items-center gap-2">
                {importing && (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {importing ? `匯入中…` : `確認匯入 ${rows.length} 筆`}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: 結果 */}
        {step === 'done' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-emerald-600">{results.filter(r => r.status === 'ok').length}</p>
                <p className="text-xs text-emerald-700 mt-1">成功</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-red-600">{results.filter(r => r.status === 'error').length}</p>
                <p className="text-xs text-red-700 mt-1">失敗</p>
              </div>
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-neutral-600">{results.length}</p>
                <p className="text-xs text-neutral-500 mt-1">共計</p>
              </div>
            </div>

            {results.filter(r => r.status === 'error').length > 0 && (
              <div className="bg-white rounded-lg border border-neutral-200 p-4">
                <h3 className="text-sm font-semibold text-red-600 mb-3">失敗明細</h3>
                <div className="space-y-1.5">
                  {results.filter(r => r.status === 'error').map((r, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className="text-red-500 mt-0.5">✕</span>
                      <span className="font-medium text-neutral-700">{r.name}</span>
                      <span className="text-neutral-400">—</span>
                      <span className="text-red-600">{r.msg}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => { setStep('upload'); setResults([]); setHeaders([]); setRows([]); setMapping({}) }}
                className="px-4 py-2 border-2 border-neutral-200 rounded-lg text-sm font-medium hover:border-neutral-300 bg-white">
                再次匯入
              </button>
              <button onClick={() => router.push('/products')}
                className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">
                前往商品列表
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
