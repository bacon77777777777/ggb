'use client'
import { useRef, useState } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'

interface Props {
  isOpen: boolean
  onClose: () => void
  onImported: () => void
}

const TYPE_MAP: Record<string, string> = {
  '轉蛋': 'gacha', '一番賞': 'ichiban', '盒玩': 'blindbox',
  '抽卡': 'card', '自製賞': 'custom',
  gacha: 'gacha', ichiban: 'ichiban', blindbox: 'blindbox', card: 'card', custom: 'custom',
}

const PRIZE_LEVELS = ['A', 'B', 'C', 'D', 'E', 'F', 'LAST']

const SAMPLE_HEADERS = [
  '商品名稱', '商品類型', '總數量', '售價', '成本', '日圓原價', '特價',
  '系列', '代理商', '發售年', '發售月', 'JAN條碼', '商品圖檔名',
  ...PRIZE_LEVELS.flatMap(l => [`${l}賞名稱`, `${l}賞數量`, `${l}賞圖檔名`]),
]

const SAMPLE_ROWS = [
  // 一番賞
  [
    '鬼滅之刃 一番賞 Vol.3', '一番賞', '80', '150', '80', '2800', '',
    '鬼滅之刃', '萬代', '2026', '03', '4549660123456', 'kimetsu_v3.jpg',
    '竈門炭治郎 figure', '1', 'kimetsu_A.jpg',
    '我妻善逸 figure', '2', 'kimetsu_B.jpg',
    '嘴平伊之助 figure', '2', 'kimetsu_C.jpg',
    '胡蝶忍 figure', '5', 'kimetsu_D.jpg',
    '煉獄杏壽郎 figure', '10', 'kimetsu_E.jpg',
    '', '', '',
    'LAST ONE 炭治郎特別版', '1', 'kimetsu_LAST.jpg',
  ],
  // 轉蛋
  [
    '星之卡比 轉蛋 冒險系列', '轉蛋', '200', '60', '30', '980', '55',
    '星之卡比', 'BANDAI', '2026', '05', '4549660789012', 'kirby_adventure.jpg',
    '卡比 figure', '50', 'kirby_A.jpg',
    '帝帝帝帝 figure', '50', 'kirby_B.jpg',
    'Meta Knight figure', '50', 'kirby_C.jpg',
    '瓦帝帝 figure', '50', 'kirby_D.jpg',
    '', '', '',
    '', '', '',
    '', '', '',
  ],
  // 盒玩
  [
    'RIBON 盒玩 甜蜜系列', '盒玩', '40', '120', '70', '2200', '',
    'RIBON', 'RIBON', '2026', '04', '', 'ribon_sweet.jpg',
    '草莓造型', '10', 'ribon_A.jpg',
    '巧克力造型', '10', 'ribon_B.jpg',
    '香草造型', '10', 'ribon_C.jpg',
    '抹茶造型', '10', 'ribon_D.jpg',
    '', '', '',
    '', '', '',
    '', '', '',
  ],
  // 抽卡
  [
    '寶可夢 抽卡 朱紫系列', '抽卡', '100', '80', '45', '1500', '75',
    '寶可夢', 'The Pokémon Company', '2026', '06', '4521329123789', 'pokemon_sv.jpg',
    '普通卡', '60', 'pokemon_A.jpg',
    '稀有卡 R', '25', 'pokemon_B.jpg',
    '超稀有卡 RR', '10', 'pokemon_C.jpg',
    '特稀有卡 SAR', '4', 'pokemon_D.jpg',
    '極稀有卡 UR', '1', 'pokemon_E.jpg',
    '', '', '',
    '', '', '',
  ],
  // 自製賞
  [
    'GGB 原創 自製賞 夏日限定', '自製賞', '50', '100', '40', '', '',
    'GGB原創', 'GGB', '2026', '07', '', 'ggb_summer.jpg',
    '小扇子吊飾', '15', 'ggb_A.jpg',
    '夏日貼紙組', '15', 'ggb_B.jpg',
    '涼感毛巾', '10', 'ggb_C.jpg',
    '限定徽章', '8', 'ggb_D.jpg',
    '隱藏版公仔', '2', 'ggb_E.jpg',
    '', '', '',
    'LAST ONE 特製禮盒', '1', 'ggb_LAST.jpg',
  ],
]

function generateSampleCsv(): string {
  const rows = [SAMPLE_HEADERS, ...SAMPLE_ROWS]
  return Papa.unparse(rows)
}

function parseRows(rows: Record<string, string>[]) {
  return rows
    .filter(r => r['商品名稱']?.trim())
    .map(r => {
      const prizes = PRIZE_LEVELS
        .map(l => {
          const name = r[`${l}賞名稱`]?.trim()
          if (!name) return null
          const qty = parseInt(r[`${l}賞數量`] || '0') || 0
          const img = r[`${l}賞圖檔名`]?.trim() || null
          return { level: l === 'LAST' ? 'LAST ONE' : `${l}賞`, name, qty, image_name: img }
        })
        .filter(Boolean) as { level: string; name: string; qty: number; image_name: string | null }[]

      const totalFromPrizes = prizes.reduce((s, p) => s + p.qty, 0)
      const totalCount = parseInt(r['總數量'] || '0') || totalFromPrizes || 1

      const prizeObjs = prizes.map(p => ({
        level: p.level,
        name: p.name,
        total: p.qty || Math.floor(totalCount / prizes.length),
        remaining: p.qty || Math.floor(totalCount / prizes.length),
        probability: totalCount > 0 ? (p.qty / totalCount) * 100 : 100 / prizes.length,
        image_url: null,
        is_last_one: p.level === 'LAST ONE',
      }))

      return {
        product: {
          name: r['商品名稱'].trim(),
          type: TYPE_MAP[r['商品類型']?.trim()] ?? 'gacha',
          total_count: totalCount,
          remaining: totalCount,
          price: parseInt(r['售價'] || '0') || 0,
          cost: r['成本'] ? parseInt(r['成本']) || null : null,
          jp_price_yen: r['日圓原價'] ? parseInt(r['日圓原價']) || null : null,
          special_price: r['特價'] ? parseInt(r['特價']) || null : null,
          series: r['系列']?.trim() || null,
          distributor: r['代理商']?.trim() || null,
          release_year: r['發售年']?.trim() || null,
          release_month: r['發售月']?.trim() || null,
          barcode: r['JAN條碼']?.trim() || null,
          image_url: null,
          status: 'active',
          category: { gacha: '轉蛋', ichiban: '一番賞', blindbox: '盒玩', card: '抽卡', custom: '自製賞' }[TYPE_MAP[r['商品類型']?.trim()] ?? 'gacha'] ?? '轉蛋',
        },
        prizes: prizeObjs,
        imageName: r['商品圖檔名']?.trim() || null,
      }
    })
}

export default function SimpleBatchImportModal({ isOpen, onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<'idle' | 'preview' | 'importing' | 'done'>('idle')
  const [rows, setRows] = useState<ReturnType<typeof parseRows>>([])
  const [progress, setProgress] = useState(0)
  const [successCount, setSuccessCount] = useState(0)
  const [failCount, setFailCount] = useState(0)
  const [errors, setErrors] = useState<string[]>([])

  if (!isOpen) return null

  const handleClose = () => {
    setStep('idle'); setRows([]); setProgress(0)
    setSuccessCount(0); setFailCount(0); setErrors([])
    onClose()
  }

  const handleFile = async (file: File) => {
    const isXlsx = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
    let parsed: Record<string, string>[] = []

    if (isXlsx) {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      parsed = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })
    } else {
      await new Promise<void>((resolve) => {
        Papa.parse<Record<string, string>>(file, {
          header: true, skipEmptyLines: true,
          transformHeader: h => h.replace(/^﻿/, '').trim(),
          complete: r => { parsed = r.data; resolve() },
        })
      })
    }

    const items = parseRows(parsed)
    setRows(items)
    setStep('preview')
  }

  const handleImport = async () => {
    setStep('importing')
    let ok = 0, fail = 0
    const errs: string[] = []

    for (let i = 0; i < rows.length; i++) {
      const item = rows[i]
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ product: item.product, prizes: item.prizes, tagIds: [] }),
      })
      if (res.ok) { ok++ } else {
        fail++
        const body = await res.json().catch(() => null)
        errs.push(`${item.product.name}：${body?.error || res.status}`)
      }
      setProgress(Math.round(((i + 1) / rows.length) * 100))
    }

    setSuccessCount(ok); setFailCount(fail)
    setErrors(errs.slice(0, 10))
    setStep('done')
    if (ok > 0) onImported()
  }

  const downloadSample = () => {
    const csv = generateSampleCsv()
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = '商品批量匯入範例.csv'
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200">
          <div>
            <h2 className="text-lg font-bold text-neutral-900">批量新增商品</h2>
            <p className="text-xs text-neutral-500 mt-0.5">上傳 CSV / XLSX，按欄位直接匯入，不含 AI 補全</p>
          </div>
          <button onClick={handleClose} className="text-neutral-400 hover:text-neutral-600 text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 'idle' && (
            <div className="space-y-4">
              <button
                onClick={downloadSample}
                className="flex items-center gap-2 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg text-sm font-medium transition-colors"
              >
                ⬇ 下載範例 CSV
              </button>
              <div
                className="border-2 border-dashed border-neutral-300 rounded-xl p-10 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <div className="text-4xl mb-3">📂</div>
                <p className="text-neutral-600 font-medium">點擊選擇 CSV 或 XLSX 檔案</p>
                <p className="text-xs text-neutral-400 mt-1">欄位名稱需與範例對應</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <p className="text-sm text-neutral-600">共解析 <strong>{rows.length}</strong> 筆商品，確認後開始匯入。</p>
              <div className="max-h-64 overflow-y-auto border border-neutral-200 rounded-lg divide-y divide-neutral-100">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="font-medium text-neutral-800 truncate max-w-[300px]">{r.product.name}</span>
                    <div className="flex items-center gap-3 text-neutral-500 text-xs flex-shrink-0 ml-2">
                      <span>{r.product.type}</span>
                      <span>NT${r.product.price}</span>
                      <span>{r.prizes.length} 賞等</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep('idle')} className="px-4 py-2 text-sm text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200">
                  重新上傳
                </button>
                <button onClick={handleImport} className="px-5 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-dark">
                  開始匯入 {rows.length} 筆
                </button>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="text-center py-8">
              <div className="text-2xl mb-3">⏳</div>
              <p className="text-neutral-700 font-medium mb-4">匯入中... {progress}%</p>
              <div className="w-full bg-neutral-200 rounded-full h-2">
                <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-4 space-y-4">
              <div className="text-5xl">{failCount === 0 ? '✅' : '⚠️'}</div>
              <p className="text-xl font-bold text-neutral-800">
                成功 {successCount} 筆 / 失敗 {failCount} 筆
              </p>
              {errors.length > 0 && (
                <div className="text-left bg-red-50 border border-red-200 rounded-lg p-4 text-xs text-red-700 space-y-1">
                  <p className="font-semibold mb-2">失敗詳情：</p>
                  {errors.map((e, i) => <p key={i}>• {e}</p>)}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-neutral-200 flex justify-end">
          <button onClick={handleClose} className="px-5 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-dark">
            {step === 'done' ? '完成' : '關閉'}
          </button>
        </div>
      </div>
    </div>
  )
}
