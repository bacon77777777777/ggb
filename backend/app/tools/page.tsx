'use client'

import { useMemo, useState } from 'react'
import AdminLayout from '@/components/AdminLayout'

type Prize = {
  name: string
  level: string
  quantity: number
  image?: string | null
  imageFilename?: string | null
}

type ScrapeResult = {
  name: string
  imageUrl: string | null
  imageFilename: string | null
  price: number | null
  sourceHost: string | null
  typeGuess: 'ichiban' | 'blindbox' | 'gacha' | 'card' | 'custom'
  prizes: Prize[]
}

const CSV_HEADERS = [
  '商品名稱',
  '商品圖片',
  '價格',
  '商品類型',
  '預購商品',
  '預計出貨時間',
  '顯示菜單',
  '狀態',
  '開賣時間',
  '稀有度',
  '上市時間',
  '代理商',
  '產品條碼',
  '熱賣',
  '獎項1名稱', '獎項1等級', '獎項1數量', '獎項1圖片名稱',
  '獎項2名稱', '獎項2等級', '獎項2數量', '獎項2圖片名稱',
  '獎項3名稱', '獎項3等級', '獎項3數量', '獎項3圖片名稱',
  '獎項4名稱', '獎項4等級', '獎項4數量', '獎項4圖片名稱',
  '獎項5名稱', '獎項5等級', '獎項5數量', '獎項5圖片名稱',
  '獎項6名稱', '獎項6等級', '獎項6數量', '獎項6圖片名稱',
  '獎項7名稱', '獎項7等級', '獎項7數量', '獎項7圖片名稱',
  '獎項8名稱', '獎項8等級', '獎項8數量', '獎項8圖片名稱',
  '獎項9名稱', '獎項9等級', '獎項9數量', '獎項9圖片名稱',
  '獎項10名稱', '獎項10等級', '獎項10數量', '獎項10圖片名稱',
  '獎項11名稱', '獎項11等級', '獎項11數量', '獎項11圖片名稱',
  '獎項12名稱', '獎項12等級', '獎項12數量', '獎項12圖片名稱',
  '獎項13名稱', '獎項13等級', '獎項13數量', '獎項13圖片名稱',
  '獎項14名稱', '獎項14等級', '獎項14數量', '獎項14圖片名稱',
  '獎項15名稱', '獎項15等級', '獎項15數量', '獎項15圖片名稱',
  '獎項16名稱', '獎項16等級', '獎項16數量', '獎項16圖片名稱',
  '獎項17名稱', '獎項17等級', '獎項17數量', '獎項17圖片名稱',
  '獎項18名稱', '獎項18等級', '獎項18數量', '獎項18圖片名稱',
  '獎項19名稱', '獎項19等級', '獎項19數量', '獎項19圖片名稱',
  '獎項20名稱', '獎項20等級', '獎項20數量', '獎項20圖片名稱',
]

const escapeCsvCell = (val: string) => {
  const s = String(val ?? '')
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

const parseCsv = (input: string) => {
  const text = input.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1]
        if (next === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      row.push(cell)
      cell = ''
      continue
    }
    if (ch === '\n') {
      row.push(cell)
      cell = ''
      const normalizedRow = row.map(v => v.replace(/\r$/, ''))
      if (normalizedRow.some(v => v.trim() !== '')) rows.push(normalizedRow)
      row = []
      continue
    }
    cell += ch
  }
  row.push(cell)
  const normalizedRow = row.map(v => v.replace(/\r$/, ''))
  if (normalizedRow.some(v => v.trim() !== '')) rows.push(normalizedRow)
  return rows
}

const normalizeHeaderKey = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '')

const typeToZh = (typeGuess: ScrapeResult['typeGuess']) => {
  const map: Record<ScrapeResult['typeGuess'], string> = {
    ichiban: '一番賞',
    blindbox: '盒玩',
    gacha: '轉蛋',
    card: '抽卡',
    custom: '自製賞',
  }
  return map[typeGuess] || '一番賞'
}

const normalizeNameForImport = (raw: string) => {
  return String(raw ?? '')
    .replace(/潮玩賞/g, '')
    .replace(/clove/gi, '')
    .replace(/賞\s+/g, '賞')
    .replace(/\s+/g, ' ')
    .trim()
}

const normalizeInputUrl = (raw: string) => {
  let s = raw.trim()
  if (s.startsWith('`') && s.endsWith('`') && s.length >= 2) {
    s = s.slice(1, -1).trim()
  }
  if (!s) return s
  let u: URL
  try {
    u = new URL(s)
  } catch {
    return s
  }

  return s
}

const buildImportRow = (data: ScrapeResult) => {
  const row: string[] = []
  row.push(normalizeNameForImport(data.name || ''))
  row.push(data.imageFilename || '')
  row.push(data.price !== null ? String(data.price) : '')
  row.push(typeToZh(data.typeGuess))
  row.push('否')
  row.push('')
  row.push('')
  row.push('上架')
  row.push('')
  row.push('')
  row.push('')
  row.push('')  // 代理商
  row.push('')  // 產品條碼
  row.push('否')

  const prizes = (data.prizes || []).slice(0, 20)
  for (let i = 0; i < 20; i++) {
    const p = prizes[i]
    row.push(p?.name || '')
    row.push(p?.level || '')
    row.push(p ? String(p.quantity) : '')
    row.push(p?.imageFilename ? String(p.imageFilename) : '')
  }
  return row
}

type BatchItem =
  | { inputUrl: string; status: 'pending' | 'loading'; result?: undefined; error?: undefined }
  | { inputUrl: string; status: 'ok'; result: ScrapeResult; error?: undefined }
  | { inputUrl: string; status: 'error'; result?: undefined; error: string }

export default function ToolsPage() {
  const [mode, setMode] = useState<'single' | 'batch'>('single')
  const [url, setUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ScrapeResult | null>(null)

  const [batchItems, setBatchItems] = useState<BatchItem[]>([])
  const [batchIsLoading, setBatchIsLoading] = useState(false)
  const [batchError, setBatchError] = useState<string | null>(null)
  const [batchIsDownloadingImages, setBatchIsDownloadingImages] = useState(false)
  const [batchListUrl, setBatchListUrl] = useState('')
  const [batchIsLoadingList, setBatchIsLoadingList] = useState(false)

  const canExport = useMemo(() => {
    if (!data) return false
    if (!data.name) return false
    if (data.price === null || Number.isNaN(data.price)) return false
    const total = (data.prizes || []).reduce((sum, p) => sum + (Number(p.quantity) || 0), 0)
    return total > 0
  }, [data])

  const batchStats = useMemo(() => {
    const total = batchItems.length
    const ok = batchItems.filter(i => i.status === 'ok').length
    const errorCount = batchItems.filter(i => i.status === 'error').length
    const loading = batchItems.filter(i => i.status === 'loading').length
    return { total, ok, error: errorCount, loading }
  }, [batchItems])

  const handleScrape = async () => {
    const target = normalizeInputUrl(url)
    if (!target || isLoading) return
    setIsLoading(true)
    setError(null)
    setData(null)
    try {
      const res = await fetch('/api/tools/scrape', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: target }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setError(String(json?.error || '抓取失敗'))
        return
      }
      setData(json?.data || null)
    } catch (e: any) {
      setError(e?.message || '抓取失敗')
    } finally {
      setIsLoading(false)
    }
  }

  const handleExport = () => {
    if (!data) return
    const row = buildImportRow(data)
    const bom = '\uFEFF'
    const csv = [CSV_HEADERS.map(escapeCsvCell).join(','), row.map(escapeCsvCell).join(',')].join('\n')
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
    const downloadUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = '商品匯入範本_含獎項_由工具產生.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(downloadUrl)
  }

  const loadCsvText = (text: string) => {
    const rows = parseCsv(text)
    if (rows.length < 2) {
      setBatchItems([])
      setBatchError('CSV 內容不足（至少需要表頭＋1 筆資料）')
      return
    }
    const headers = rows[0].map(h => h.trim())
    const headerKeys = headers.map(normalizeHeaderKey)
    const urlIdx =
      headerKeys.findIndex(k => ['商品url', '商品網址', 'url', '網址', '商品連結', '商品連結url', '商品頁', '商品頁面'].includes(k)) ??
      -1

    const resolvedUrlIdx = urlIdx >= 0 ? urlIdx : headerKeys.findIndex(k => k.includes('url') || k.includes('網址') || k.includes('連結'))
    if (resolvedUrlIdx < 0) {
      setBatchItems([])
      setBatchError('找不到 URL 欄位（建議表頭命名：商品URL）')
      return
    }

    const items: BatchItem[] = rows
      .slice(1)
      .map(r => normalizeInputUrl(String(r[resolvedUrlIdx] ?? '')))
      .map(u => u.trim())
      .filter(Boolean)
      .map((u) => ({ inputUrl: u, status: 'pending' as const }))

    if (items.length === 0) {
      setBatchItems([])
      setBatchError('CSV 沒有可用的 URL')
      return
    }

    setBatchError(null)
    setBatchItems(items)
  }

  const handleBatchFile = async (file: File) => {
    setBatchIsLoading(false)
    setBatchError(null)
    setBatchItems([])
    const text = await file.text()
    loadCsvText(text)
  }

  const handleLoadSample = async () => {
    setBatchIsLoading(false)
    setBatchError(null)
    setBatchItems([])
    const res = await fetch('/Thunderbit_fixed_encoding.csv')
    if (!res.ok) {
      setBatchError('無法載入範例 CSV')
      return
    }
    const text = await res.text()
    loadCsvText(text)
  }

  const loadListUrlToBatch = async () => {
    const target = normalizeInputUrl(batchListUrl)
    if (!target || batchIsLoadingList || batchIsLoading) return
    setBatchIsLoadingList(true)
    setBatchError(null)
    setBatchItems([])
    try {
      const res = await fetch('/api/tools/expand-list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: target, limit: 500 }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setBatchError(String(json?.error || '載入失敗'))
        return
      }
      const urls = Array.isArray(json?.data?.urls) ? json.data.urls : []
      if (urls.length === 0) {
        setBatchError('找不到可用的商品連結')
        return
      }
      setBatchItems(urls.map((u: string) => ({ inputUrl: normalizeInputUrl(String(u)), status: 'pending' as const })))
    } catch (e: any) {
      setBatchError(e?.message || '載入失敗')
    } finally {
      setBatchIsLoadingList(false)
    }
  }

  const runBatchScrape = async () => {
    if (batchIsLoading || batchItems.length === 0) return
    setBatchIsLoading(true)
    setBatchError(null)
    const urls = batchItems.map(i => i.inputUrl)
    setBatchItems(prev => prev.map(it => ({ inputUrl: it.inputUrl, status: 'pending' as const })))

    const concurrency = 2
    let cursor = 0

    const worker = async () => {
      while (true) {
        const idx = cursor
        cursor++
        if (idx >= urls.length) break

        setBatchItems(prev => {
          const next = [...prev]
          const cur = next[idx]
          if (!cur) return prev
          next[idx] = { inputUrl: cur.inputUrl, status: 'loading' }
          return next
        })

        try {
          const inputUrl = urls[idx]
          await new Promise(resolve => setTimeout(resolve, 250))
          const res = await fetch('/api/tools/scrape', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ url: inputUrl }),
          })
          const json = await res.json().catch(() => null)
          if (!res.ok) {
            const message = String(json?.error || '抓取失敗')
            setBatchItems(prev => {
              const next = [...prev]
              const cur = next[idx]
              if (!cur) return prev
              next[idx] = { inputUrl: inputUrl, status: 'error', error: message }
              return next
            })
            continue
          }
          const result = (json?.data || null) as ScrapeResult | null
          if (!result) throw new Error('回傳格式不正確')

          setBatchItems(prev => {
            const next = [...prev]
            const cur = next[idx]
            if (!cur) return prev
            next[idx] = { inputUrl: inputUrl, status: 'ok', result }
            return next
          })
        } catch (e: any) {
          const message = e?.message || '抓取失敗'
          setBatchItems(prev => {
            const next = [...prev]
            const cur = next[idx]
            if (!cur) return prev
            next[idx] = { inputUrl: urls[idx], status: 'error', error: message }
            return next
          })
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker))
    setBatchIsLoading(false)
  }

  const exportBatchImportCsv = () => {
    const ok = batchItems.filter((i): i is Extract<BatchItem, { status: 'ok' }> => i.status === 'ok')
    const rows = ok
      .map(i => i.result)
      .filter(r => {
        if (!r?.name) return false
        if (r.price === null || Number.isNaN(r.price)) return false
        return true
      })
      .map(buildImportRow)

    const bom = '\uFEFF'
    const csv = [CSV_HEADERS.map(escapeCsvCell).join(','), ...rows.map(r => r.map(escapeCsvCell).join(','))].join('\n')
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
    const downloadUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = '商品匯入範本_批量_由工具產生.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(downloadUrl)
  }

  const exportBatchResultCsv = () => {
    const headers = ['商品URL', '狀態', '商品名稱', '價格', '商品類型', '獎項數量總和', '錯誤']
    const rows = batchItems.map(i => {
      if (i.status === 'ok') {
        const total = (i.result.prizes || []).reduce((sum, p) => sum + (Number(p.quantity) || 0), 0)
        return [
          i.inputUrl,
          '成功',
          i.result.name || '',
          i.result.price !== null ? String(i.result.price) : '',
          typeToZh(i.result.typeGuess),
          String(total),
          '',
        ]
      }
      if (i.status === 'error') {
        return [i.inputUrl, '失敗', '', '', '', '', i.error]
      }
      return [i.inputUrl, '待處理', '', '', '', '', '']
    })
    const bom = '\uFEFF'
    const csv = [headers.map(escapeCsvCell).join(','), ...rows.map(r => r.map(escapeCsvCell).join(','))].join('\n')
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
    const downloadUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = '批量抓取結果.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(downloadUrl)
  }

  const downloadBatchImagesZip = async () => {
    const ok = batchItems.filter((i): i is Extract<BatchItem, { status: 'ok' }> => i.status === 'ok')
    const files: Array<{ url: string; filename: string; mode: 'slimetoy' | 'clove' | 'auto' }> = []
    const seen = new Set<string>()

    for (const it of ok) {
      const host = it.result.sourceHost || ''
      const mode = host === 'slimetoy.com.tw' ? 'slimetoy' : host === 'oripa.clove.jp' ? 'clove' : 'auto'

      if (it.result.imageUrl && it.result.imageFilename) {
        const key = `${it.result.imageUrl}::${it.result.imageFilename}`
        if (!seen.has(key)) {
          seen.add(key)
          files.push({ url: it.result.imageUrl, filename: it.result.imageFilename, mode })
        }
      }

      for (const p of it.result.prizes || []) {
        if (!p.image || !p.imageFilename) continue
        if (!/^https?:\/\//i.test(p.image)) continue
        const key = `${p.image}::${p.imageFilename}`
        if (seen.has(key)) continue
        seen.add(key)
        files.push({ url: p.image, filename: p.imageFilename, mode })
      }
    }

    if (files.length === 0 || batchIsDownloadingImages) return
    setBatchIsDownloadingImages(true)
    try {
      const res = await fetch('/api/tools/images/download', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ files }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(String(json?.error || `下載失敗 (${res.status})`))
      }
      const blob = await res.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = 'images_500x500_webp.zip'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(downloadUrl)
    } catch (e: any) {
      setBatchError(e?.message || '下載失敗')
    } finally {
      setBatchIsDownloadingImages(false)
    }
  }

  return (
    <AdminLayout pageTitle="工具" pageSubtitle="貼上 URL 或上傳 CSV 批量抓取並匯出">
      <div className="p-6 space-y-4">
        <div className="bg-white rounded-xl border border-neutral-200 p-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMode('single')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${mode === 'single' ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'}`}
              >
                單筆
              </button>
              <button
                onClick={() => setMode('batch')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${mode === 'batch' ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-50'}`}
              >
                批量（CSV）
              </button>
            </div>

            {mode === 'batch' && (
              <div className="space-y-3">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-neutral-800">列表頁 URL（可直接載入商品清單）</label>
                  <div className="flex flex-col md:flex-row md:items-center gap-2">
                    <input
                      value={batchListUrl}
                      onChange={(e) => setBatchListUrl(e.target.value)}
                      placeholder="https://slimetoy.com.tw/ 或 https://oripa.clove.jp/zh-TW/oripa/All"
                      className="w-full md:flex-1 px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <button
                      onClick={() => void loadListUrlToBatch()}
                      disabled={batchIsLoadingList || batchIsLoading}
                      className="px-4 py-2 bg-neutral-100 text-neutral-900 rounded-lg hover:bg-neutral-200 transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      {batchIsLoadingList ? '載入中...' : '載入商品清單'}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-neutral-800">上傳 CSV（建議含欄位：商品URL）</label>
                  <div className="flex flex-col md:flex-row md:items-center gap-2">
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void handleBatchFile(f)
                      }}
                      className="w-full md:w-auto"
                    />
                    <button
                      onClick={handleLoadSample}
                      className="px-3 py-2 bg-neutral-100 text-neutral-900 rounded-lg hover:bg-neutral-200 transition-colors text-sm font-medium"
                    >
                      載入範例（Thunderbit_fixed_encoding.csv）
                    </button>
                  </div>
                </div>

                {batchError && <div className="text-sm text-red-600 whitespace-pre-wrap">{batchError}</div>}

                {batchItems.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm text-neutral-700">
                        共 {batchStats.total} 筆，成功 {batchStats.ok}，失敗 {batchStats.error}
                        {batchStats.loading > 0 ? `（處理中 ${batchStats.loading}）` : ''}
                      </div>
                      <button
                        onClick={runBatchScrape}
                        disabled={batchIsLoading || batchItems.length === 0}
                        className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-medium disabled:opacity-50"
                      >
                        {batchIsLoading ? '批次讀取中...' : '開始批次讀取'}
                      </button>
                      <button
                        onClick={exportBatchImportCsv}
                        disabled={batchStats.ok === 0}
                        className="px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-black transition-colors text-sm font-medium disabled:opacity-50"
                      >
                        匯出匯入範本 CSV
                      </button>
                      <button
                        onClick={() => void downloadBatchImagesZip()}
                        disabled={batchStats.ok === 0 || batchIsDownloadingImages}
                        className="px-4 py-2 bg-neutral-100 text-neutral-900 rounded-lg hover:bg-neutral-200 transition-colors text-sm font-medium disabled:opacity-50"
                      >
                        {batchIsDownloadingImages ? '打包圖片中...' : '下載圖片（webp）'}
                      </button>
                      <button
                        onClick={exportBatchResultCsv}
                        disabled={batchItems.length === 0}
                        className="px-4 py-2 bg-neutral-100 text-neutral-900 rounded-lg hover:bg-neutral-200 transition-colors text-sm font-medium disabled:opacity-50"
                      >
                        匯出結果 CSV
                      </button>
                    </div>

                    <div className="rounded-lg border border-neutral-200 overflow-hidden">
                      <div className="overflow-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-white">
                            <tr className="border-b border-neutral-200">
                              <th className="text-left px-3 py-2 font-semibold text-neutral-500">URL</th>
                              <th className="text-left px-3 py-2 font-semibold text-neutral-500">狀態</th>
                              <th className="text-left px-3 py-2 font-semibold text-neutral-500">商品名稱</th>
                              <th className="text-left px-3 py-2 font-semibold text-neutral-500">價格</th>
                              <th className="text-left px-3 py-2 font-semibold text-neutral-500">獎項</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white">
                            {batchItems.slice(0, 200).map((it, idx) => {
                              const statusText =
                                it.status === 'pending'
                                  ? '待處理'
                                  : it.status === 'loading'
                                    ? '讀取中'
                                    : it.status === 'ok'
                                      ? '成功'
                                      : '失敗'
                              const name = it.status === 'ok' ? it.result.name : ''
                              const price = it.status === 'ok' ? (it.result.price ?? '') : ''
                              const total =
                                it.status === 'ok'
                                  ? (it.result.prizes || []).reduce((sum, p) => sum + (Number(p.quantity) || 0), 0)
                                  : ''
                              return (
                                <tr key={`${it.inputUrl}-${idx}`} className="border-b border-neutral-100 last:border-b-0">
                                  <td className="px-3 py-2 text-neutral-900 max-w-[520px]">
                                    <a className="text-primary break-all" href={it.inputUrl} target="_blank" rel="noreferrer">
                                      {it.inputUrl}
                                    </a>
                                  </td>
                                  <td className="px-3 py-2 text-neutral-700">
                                    {statusText}
                                    {it.status === 'error' ? (
                                      <div className="text-xs text-red-600 whitespace-pre-wrap">{it.error}</div>
                                    ) : null}
                                  </td>
                                  <td className="px-3 py-2 text-neutral-900">{name}</td>
                                  <td className="px-3 py-2 text-neutral-700">{price}</td>
                                  <td className="px-3 py-2 text-neutral-700">{total}</td>
                                </tr>
                              )
                            })}
                            {batchItems.length > 200 && (
                              <tr>
                                <td className="px-3 py-3 text-neutral-500" colSpan={5}>
                                  只顯示前 200 筆（匯出不受影響）
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {mode === 'single' && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-neutral-800">商品 URL</label>
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleScrape}
                    disabled={!url.trim() || isLoading}
                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    {isLoading ? '讀取中...' : '開始讀取'}
                  </button>
                  <button
                    onClick={handleExport}
                    disabled={!canExport}
                    className="px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-black transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    匯出 CSV
                  </button>
                </div>
                {error && <div className="text-sm text-red-600 whitespace-pre-wrap">{error}</div>}
                {data && (
                  <div className="mt-2 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
                        <div className="text-xs text-neutral-500">商品名稱</div>
                        <div className="text-sm font-semibold text-neutral-900 break-words">{data.name}</div>
                      </div>
                      <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
                        <div className="text-xs text-neutral-500">價格</div>
                        <div className="text-sm font-semibold text-neutral-900">{data.price ?? '—'}</div>
                      </div>
                      <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
                        <div className="text-xs text-neutral-500">類型</div>
                        <div className="text-sm font-semibold text-neutral-900">{typeToZh(data.typeGuess)}</div>
                      </div>
                    </div>

                    {data.imageUrl && (
                      <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200">
                        <div className="text-xs text-neutral-500 mb-2">商品圖片</div>
                        <a href={data.imageUrl} target="_blank" rel="noreferrer" className="text-sm text-primary break-all">
                          {data.imageUrl}
                        </a>
                      </div>
                    )}

                    <div className="rounded-lg border border-neutral-200 overflow-hidden">
                      <div className="px-3 py-2 bg-neutral-50 border-b border-neutral-200 text-sm font-semibold text-neutral-900">
                        獎項（最多 20 筆）
                      </div>
                      <div className="overflow-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-white">
                            <tr className="border-b border-neutral-200">
                              <th className="text-left px-3 py-2 font-semibold text-neutral-500">名稱</th>
                              <th className="text-left px-3 py-2 font-semibold text-neutral-500">等級</th>
                              <th className="text-left px-3 py-2 font-semibold text-neutral-500">數量</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white">
                            {(data.prizes || []).slice(0, 20).map((p, idx) => (
                              <tr key={`${p.name}-${idx}`} className="border-b border-neutral-100 last:border-b-0">
                                <td className="px-3 py-2 text-neutral-900">{p.name}</td>
                                <td className="px-3 py-2 text-neutral-700">{p.level || '—'}</td>
                                <td className="px-3 py-2 text-neutral-700">{p.quantity}</td>
                              </tr>
                            ))}
                            {(data.prizes || []).length === 0 && (
                              <tr>
                                <td className="px-3 py-3 text-neutral-500" colSpan={3}>
                                  未抓到獎項清單
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {!canExport && (
                      <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        匯出 CSV 需要：商品名稱、價格、且獎項數量總和大於 0
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
