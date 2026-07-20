'use client'

import { useState, useCallback, Fragment } from 'react'
import AdminLayout from '@/components/AdminLayout'

// ─── Types ───────────────────────────────────────────────────────────────────

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

type EnrichedFields = {
  supplier: string | null
  rarity: number
  isHot: boolean
  aiFilledFields: string[]
}

type WorkItem = {
  url: string
  scrapeStatus: 'pending' | 'loading' | 'ok' | 'error'
  aiStatus: 'pending' | 'loading' | 'ok' | 'skipped'
  result?: ScrapeResult
  enriched?: EnrichedFields
  error?: string
}

type Phase = 'idle' | 'discovering' | 'scraping' | 'ai-filling' | 'done'

// ─── CSV export ───────────────────────────────────────────────────────────────

const CSV_HEADERS = [
  '商品名稱', '商品圖片', '價格', '商品類型', '預購商品', '預計出貨時間',
  '顯示菜單', '狀態', '開賣時間', '稀有度', '上市時間', '代理商', '產品條碼', '熱賣',
  ...Array.from({ length: 20 }, (_, i) => [
    `獎項${i + 1}名稱`, `獎項${i + 1}等級`, `獎項${i + 1}數量`, `獎項${i + 1}圖片名稱`,
  ]).flat(),
]

const escapeCsv = (val: string) => {
  const s = String(val ?? '')
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const typeToZh = (t: ScrapeResult['typeGuess']) =>
  ({ ichiban: '一番賞', blindbox: '盒玩', gacha: '轉蛋', card: '抽卡', custom: '自製賞' }[t] || '一番賞')

const normalizeNameForImport = (raw: string) =>
  String(raw ?? '').replace(/潮玩賞/g, '').replace(/clove/gi, '').replace(/\s+/g, ' ').trim()

const buildRow = (item: WorkItem): string[] => {
  const r = item.result!
  const e = item.enriched
  const row: string[] = []
  row.push(normalizeNameForImport(r.name || ''))
  row.push(r.imageFilename || '')
  row.push(r.price != null ? String(r.price) : '')
  row.push(typeToZh(r.typeGuess))
  row.push('否')         // 預購
  row.push('')           // 預計出貨
  row.push('')           // 顯示菜單
  row.push('上架')        // 狀態
  row.push('')           // 開賣時間
  row.push(e?.rarity != null ? String(e.rarity) : '')  // 稀有度
  row.push('')           // 上市時間
  row.push(e?.supplier || '')   // 代理商
  row.push('')           // 條碼
  row.push(e?.isHot ? '是' : '否')  // 熱賣
  const prizes = (r.prizes || []).slice(0, 20)
  for (let i = 0; i < 20; i++) {
    const p = prizes[i]
    row.push(p?.name || '')
    row.push(p?.level || '')
    row.push(p ? String(p.quantity) : '')
    row.push(p?.imageFilename || '')
  }
  return row
}

const downloadCsv = (items: WorkItem[]) => {
  const ok = items.filter(i => i.scrapeStatus === 'ok' && i.result?.name && i.result?.price != null)
  if (ok.length === 0) return
  const bom = '﻿'
  const rows = ok.map(i => buildRow(i).map(escapeCsv).join(','))
  const csv = [CSV_HEADERS.map(escapeCsv).join(','), ...rows].join('\n')
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = '商品匯入範本_競品工具.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// ─── Competitor list ─────────────────────────────────────────────────────────

const COMPETITORS: { name: string; url: string; note?: string }[] = [
  { name: 'SlimeToy 台灣', url: 'https://slimetoy.com.tw/' },
  { name: 'Dopamine Kuji', url: 'https://dopaminekuji.com/' },
  { name: 'Clove Oripa（日本抽卡）', url: 'https://oripa.clove.jp/zh-TW/oripa/All' },
  { name: '一番賞 Online（官方）', url: 'https://on-line.1kuji.com/Form/Product/ProductList.aspx' },
  { name: '一番賞 Official（JP）', url: 'https://1kuji.com/products' },
  { name: 'OneOne 台灣', url: 'https://www.oneone.com.tw/shop' },
  { name: 'Wonder Kuji 台灣', url: 'https://wonderkuji.com.tw/kujiland' },
  { name: '籤引道 台灣', url: 'https://kujibikido.tw/' },
  { name: 'KujiFlip 台灣', url: 'https://kujiflip.tw/' },
  { name: '91toy 台灣', url: 'https://www.91toy.com.tw/' },
  { name: 'Gashapon 官方（JP）', url: 'https://gashapon.jp/products/' },
  { name: 'Bandai 官方扭蛋', url: 'https://bandainamco-am.co.jp/zh-CHT/others/gashapon-bandai-officialshop/item/' },
  { name: 'TCG Japan 寶可夢', url: 'https://tcg-japan.com/pokemon' },
  { name: 'Konami Premium Kuji', url: 'https://premiumkuji.konami.net/' },
  { name: 'CityDAO', url: 'https://citydao.world/', note: 'SPA，可能無法爬取' },
  { name: 'EggBox Kuji', url: 'https://eggboxkuji.com/lottery', note: 'SPA，可能無法爬取' },
  { name: 'One More Lottery', url: 'https://onemorelottery.tw/home', note: 'SPA，可能無法爬取' },
  { name: 'SEGA Lucky Kuji Online', url: 'https://www.segaluckykujionline.net/', note: 'SPA，可能無法爬取' },
]

// ─── Main component ───────────────────────────────────────────────────────────

export default function ToolsPage() {
  const [inputUrl, setInputUrl] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [progressPct, setProgressPct] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [items, setItems] = useState<WorkItem[]>([])
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [imageModal, setImageModal] = useState<{ url: string; alt: string } | null>(null)
  const [showCompetitors, setShowCompetitors] = useState(false)

  const isRunning = phase === 'discovering' || phase === 'scraping' || phase === 'ai-filling'

  const updateItem = useCallback((url: string, patch: Partial<WorkItem>) => {
    setItems(prev => prev.map(it => it.url === url ? { ...it, ...patch } : it))
  }, [])

  const handleStart = async () => {
    const target = inputUrl.trim()
    if (!target || isRunning) return

    setGlobalError(null)
    setItems([])
    setExpandedRows(new Set())
    setPhase('discovering')
    setProgressPct(5)
    setProgressLabel('分析網址...')

    // Phase 1: discover URLs
    let urls: string[] = []
    try {
      const res = await fetch('/api/tools/expand-list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: target, limit: 300 }),
      })
      const json = await res.json().catch(() => null)
      if (res.ok && Array.isArray(json?.data?.urls) && json.data.urls.length > 0) {
        urls = json.data.urls
      }
    } catch {
      // ignore, treat as single product
    }

    if (urls.length === 0) urls = [target]

    setItems(urls.map(u => ({ url: u, scrapeStatus: 'pending', aiStatus: 'pending' })))
    setProgressPct(20)
    setProgressLabel(`發現 ${urls.length} 個商品，開始抓取...`)
    setPhase('scraping')

    // Phase 2: scrape — keep results in a local map to avoid stale closure issues
    const localResults = new Map<string, ScrapeResult | null>()
    const concurrency = 2
    let scrapeIdx = 0
    let scrapesDone = 0

    const scrapeWorker = async () => {
      while (true) {
        const idx = scrapeIdx++
        if (idx >= urls.length) break
        const u = urls[idx]
        updateItem(u, { scrapeStatus: 'loading' })
        try {
          await new Promise(r => setTimeout(r, 300))
          const res = await fetch('/api/tools/scrape', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ url: u }),
          })
          const json = await res.json().catch(() => null)
          if (!res.ok) {
            updateItem(u, { scrapeStatus: 'error', aiStatus: 'skipped', error: String(json?.error || '抓取失敗') })
            localResults.set(u, null)
          } else {
            localResults.set(u, json?.data || null)
            updateItem(u, { scrapeStatus: 'ok', result: json?.data })
          }
        } catch (e: any) {
          updateItem(u, { scrapeStatus: 'error', aiStatus: 'skipped', error: e?.message || '抓取失敗' })
          localResults.set(u, null)
        }
        scrapesDone++
        setProgressPct(20 + Math.round((scrapesDone / urls.length) * 55))
        setProgressLabel(`抓取商品資料（${scrapesDone}/${urls.length}）...`)
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, scrapeWorker))

    // Phase 3: AI enrich — read from localResults (no stale closure)
    setPhase('ai-filling')
    setProgressPct(75)
    setProgressLabel('AI 補齊欄位...')

    let aiIdx = 0
    let aiDone = 0

    const aiWorker = async () => {
      while (true) {
        const idx = aiIdx++
        if (idx >= urls.length) break
        const u = urls[idx]
        const result = localResults.get(u) ?? null
        if (!result) {
          updateItem(u, { aiStatus: 'skipped' })
          aiDone++
          setProgressPct(75 + Math.round((aiDone / urls.length) * 25))
          continue
        }
        updateItem(u, { aiStatus: 'loading' })
        try {
          const { name, typeGuess, prizes, sourceHost } = result
          const res = await fetch('/api/tools/ai-enrich', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name, typeGuess, prizes, sourceHost }),
          })
          const json = await res.json().catch(() => null)
          updateItem(u, {
            aiStatus: json?.data ? 'ok' : 'skipped',
            enriched: json?.data || undefined,
          })
        } catch {
          updateItem(u, { aiStatus: 'skipped' })
        }
        aiDone++
        setProgressPct(75 + Math.round((aiDone / urls.length) * 25))
        setProgressLabel(`AI 補齊欄位（${aiDone}/${urls.length}）...`)
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, aiWorker))

    setPhase('done')
    setProgressPct(100)
    setProgressLabel('完成')
  }

  const toggleRow = (idx: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  const doneCount = items.filter(i => i.scrapeStatus === 'ok').length
  const errorCount = items.filter(i => i.scrapeStatus === 'error').length

  const starLabel = (r: number) => '★'.repeat(r) + '☆'.repeat(5 - r)

  return (
    <AdminLayout pageTitle="競品爬取工具">
      <div className="space-y-4">

        {/* URL Input */}
        <div className="bg-white rounded-xl border border-neutral-200 p-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={inputUrl}
              onChange={e => setInputUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void handleStart()}
              placeholder="貼上競品首頁、列表頁或單一商品頁 URL..."
              disabled={isRunning}
              className="flex-1 px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary disabled:opacity-50"
            />
            <button
              onClick={() => setShowCompetitors(v => !v)}
              disabled={isRunning}
              className="px-4 py-2 border border-neutral-200 bg-white text-neutral-700 rounded-lg text-sm font-medium hover:bg-neutral-50 transition-colors disabled:opacity-50 shrink-0"
            >
              競品列表 {showCompetitors ? '▲' : '▼'}
            </button>
            <button
              onClick={() => void handleStart()}
              disabled={!inputUrl.trim() || isRunning}
              className="px-5 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-dark transition-colors disabled:opacity-50 shrink-0"
            >
              {isRunning ? '讀取中...' : '開始讀取'}
            </button>
          </div>

          {/* Competitor list dropdown */}
          {showCompetitors && (
            <div className="mt-3 rounded-lg border border-neutral-200 overflow-hidden">
              {COMPETITORS.map((c, i) => (
                <div
                  key={c.url}
                  className={`flex items-center justify-between px-3 py-2.5 gap-3 ${i > 0 ? 'border-t border-neutral-100' : ''} hover:bg-neutral-50 transition-colors`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-neutral-800">{c.name}</span>
                      {c.note && <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{c.note}</span>}
                    </div>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-neutral-400 hover:text-primary hover:underline truncate block"
                    >
                      {c.url}
                    </a>
                  </div>
                  <button
                    onClick={() => {
                      setInputUrl(c.url)
                      setShowCompetitors(false)
                    }}
                    className="px-3 py-1 text-xs font-medium bg-neutral-900 text-white rounded-md hover:bg-black transition-colors shrink-0"
                  >
                    帶入
                  </button>
                </div>
              ))}
            </div>
          )}


          {/* Progress bar */}
          {(isRunning || phase === 'done') && (
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>{progressLabel}</span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 rounded-full"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {/* Phase indicators */}
              <div className="flex gap-4 text-xs mt-1">
                {(['discovering', 'scraping', 'ai-filling', 'done'] as Phase[]).map((p, i) => {
                  const labels = ['1. 發現連結', '2. 抓取資料', '3. AI 補齊', '完成']
                  const phases: Phase[] = ['discovering', 'scraping', 'ai-filling', 'done']
                  const currentIdx = phases.indexOf(phase)
                  const active = i <= currentIdx
                  return (
                    <span key={p} className={active ? 'text-primary font-medium' : 'text-neutral-300'}>
                      {labels[i]}
                    </span>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Global error */}
        {globalError && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            {globalError}
          </div>
        )}

        {/* Results */}
        {items.length > 0 && (
          <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
            {/* Table header actions */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
              <div className="text-sm text-neutral-600">
                共 {items.length} 筆
                {doneCount > 0 && <span className="ml-2 text-emerald-600 font-medium">成功 {doneCount}</span>}
                {errorCount > 0 && <span className="ml-2 text-red-500">失敗 {errorCount}</span>}
              </div>
              <button
                onClick={() => downloadCsv(items)}
                disabled={doneCount === 0}
                className="px-4 py-1.5 bg-neutral-900 text-white rounded-lg text-sm font-medium hover:bg-black transition-colors disabled:opacity-40"
              >
                匯出 CSV（{doneCount} 筆）
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-100 bg-neutral-50">
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-neutral-500 w-20">商品圖</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-neutral-500 min-w-[200px]">商品名稱</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-neutral-500">類型</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-neutral-500">價格</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-neutral-500 min-w-[100px]">代理商</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-neutral-500">稀有度</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-neutral-500">熱賣</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-neutral-500">獎項</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-neutral-500">狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const r = it.result
                    const e = it.enriched
                    const isExpanded = expandedRows.has(idx)
                    const prizeCount = r?.prizes?.length ?? 0
                    const isAiFilled = (field: string) => e?.aiFilledFields?.includes(field)

                    return (
                      <Fragment key={`${it.url}-${idx}`}>
                        <tr
                          className="border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50/50 transition-colors"
                        >
                          {/* 商品圖 */}
                          <td className="px-3 py-2">
                            {r?.imageUrl ? (
                              <button
                                onClick={() => setImageModal({ url: r.imageUrl!, alt: r.name })}
                                className="block w-[72px] h-[72px] rounded-lg overflow-hidden border border-neutral-200 hover:border-primary transition-colors"
                              >
                                <img
                                  src={r.imageUrl}
                                  alt={r.name}
                                  className="w-full h-full object-cover"
                                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                                />
                              </button>
                            ) : it.scrapeStatus === 'loading' ? (
                              <div className="w-[72px] h-[72px] rounded-lg bg-neutral-100 animate-pulse" />
                            ) : (
                              <div className="w-[72px] h-[72px] rounded-lg bg-neutral-50 border border-neutral-200 flex items-center justify-center text-neutral-300 text-xs">無圖</div>
                            )}
                          </td>

                          {/* 商品名稱 */}
                          <td className="px-3 py-2">
                            {r?.name ? (
                              <div>
                                <a
                                  href={it.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary hover:underline text-sm font-medium leading-snug"
                                >
                                  {r.name}
                                </a>
                                <div className="text-xs text-neutral-400 mt-0.5 break-all">{it.url.replace(/^https?:\/\//, '').slice(0, 40)}</div>
                              </div>
                            ) : it.scrapeStatus === 'loading' ? (
                              <div className="h-4 w-32 bg-neutral-100 rounded animate-pulse" />
                            ) : it.scrapeStatus === 'error' ? (
                              <div className="text-xs text-red-500">{it.error}</div>
                            ) : (
                              <div className="text-xs text-neutral-400">待抓取</div>
                            )}
                          </td>

                          {/* 類型 */}
                          <td className="px-3 py-2 text-neutral-700 text-xs whitespace-nowrap">
                            {r ? typeToZh(r.typeGuess) : '—'}
                          </td>

                          {/* 價格 */}
                          <td className="px-3 py-2 text-neutral-900 font-medium text-sm whitespace-nowrap">
                            {r?.price != null ? `${r.price} G` : r ? '—' : ''}
                          </td>

                          {/* 代理商 */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            {it.aiStatus === 'loading' ? (
                              <div className="h-3 w-16 bg-neutral-100 rounded animate-pulse" />
                            ) : e?.supplier ? (
                              <span className={`text-xs ${isAiFilled('supplier') ? 'text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded' : 'text-neutral-700'}`}>
                                {isAiFilled('supplier') && '✦ '}{e.supplier}
                              </span>
                            ) : r ? (
                              <span className="text-neutral-300 text-xs">—</span>
                            ) : null}
                          </td>

                          {/* 稀有度 */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            {it.aiStatus === 'loading' ? (
                              <div className="h-3 w-12 bg-neutral-100 rounded animate-pulse" />
                            ) : e?.rarity != null ? (
                              <span className={`text-xs ${isAiFilled('rarity') ? 'text-amber-600' : 'text-neutral-700'}`}>
                                {starLabel(e.rarity)}
                              </span>
                            ) : r ? (
                              <span className="text-neutral-300 text-xs">—</span>
                            ) : null}
                          </td>

                          {/* 熱賣 */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            {it.aiStatus === 'loading' ? (
                              <div className="h-3 w-8 bg-neutral-100 rounded animate-pulse" />
                            ) : e != null ? (
                              <span className={`text-xs px-1.5 py-0.5 rounded ${e.isHot ? 'bg-red-50 text-red-600' : 'text-neutral-300'}`}>
                                {e.isHot ? '🔥 是' : '否'}
                              </span>
                            ) : r ? null : null}
                          </td>

                          {/* 獎項 */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            {prizeCount > 0 ? (
                              <button
                                onClick={() => toggleRow(idx)}
                                className="flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                                {prizeCount} 項
                                <span className="text-neutral-400">{isExpanded ? '▲' : '▼'}</span>
                              </button>
                            ) : r ? (
                              <span className="text-xs text-neutral-300">—</span>
                            ) : null}
                          </td>

                          {/* 狀態 */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            {it.scrapeStatus === 'pending' && <span className="text-xs text-neutral-400">待處理</span>}
                            {it.scrapeStatus === 'loading' && <span className="text-xs text-neutral-500 animate-pulse">抓取中...</span>}
                            {it.scrapeStatus === 'error' && <span className="text-xs text-red-500">失敗</span>}
                            {it.scrapeStatus === 'ok' && it.aiStatus === 'loading' && <span className="text-xs text-amber-500">AI補齊...</span>}
                            {it.scrapeStatus === 'ok' && it.aiStatus === 'ok' && <span className="text-xs text-emerald-600">完成</span>}
                            {it.scrapeStatus === 'ok' && it.aiStatus === 'skipped' && <span className="text-xs text-emerald-600">完成</span>}
                            {it.scrapeStatus === 'ok' && it.aiStatus === 'pending' && <span className="text-xs text-emerald-500">✓ 已抓取</span>}
                          </td>
                        </tr>

                        {/* Prizes sub-table */}
                        {isExpanded && r && prizeCount > 0 && (
                          <tr key={`prizes-${idx}`} className="bg-neutral-50 border-b border-neutral-100">
                            <td colSpan={9} className="px-4 py-3">
                              <div className="text-xs font-semibold text-neutral-500 mb-2">獎項清單</div>
                              <div className="overflow-x-auto">
                                <table className="text-xs w-full">
                                  <thead>
                                    <tr className="text-neutral-400">
                                      <th className="text-left pb-1 pr-4 font-medium">賞等</th>
                                      <th className="text-left pb-1 pr-4 font-medium">名稱</th>
                                      <th className="text-left pb-1 pr-4 font-medium">數量</th>
                                      <th className="text-left pb-1 font-medium">圖片</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {r.prizes.map((p, pi) => (
                                      <tr key={`${p.name}-${pi}`} className="border-t border-neutral-100">
                                        <td className="py-1.5 pr-4 text-neutral-600 font-medium">{p.level || '—'}</td>
                                        <td className="py-1.5 pr-4 text-neutral-900">{p.name}</td>
                                        <td className="py-1.5 pr-4 text-neutral-600">{p.quantity}</td>
                                        <td className="py-1.5">
                                          {p.image ? (
                                            <button
                                              onClick={() => setImageModal({ url: p.image!, alt: p.name })}
                                              className="block w-9 h-9 rounded overflow-hidden border border-neutral-200 hover:border-primary"
                                            >
                                              <img
                                                src={p.image}
                                                alt={p.name}
                                                className="w-full h-full object-cover"
                                                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                                              />
                                            </button>
                                          ) : (
                                            <span className="text-neutral-300">—</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* AI fill legend */}
            {phase === 'done' && (
              <div className="px-4 py-2.5 border-t border-neutral-100 text-xs text-neutral-400 flex items-center gap-1">
                <span className="text-amber-600 font-medium">✦</span>
                <span>橙色標示為 AI 推測值，請自行確認後再匯入</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Image modal */}
      {imageModal && (
        <div
          className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4"
          onClick={() => setImageModal(null)}
        >
          <div
            className="relative max-w-lg w-full bg-white rounded-2xl overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
              <span className="text-sm font-medium text-neutral-900 truncate pr-4">{imageModal.alt}</span>
              <button
                onClick={() => setImageModal(null)}
                className="text-neutral-400 hover:text-neutral-700 text-lg leading-none"
              >
                ✕
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-neutral-50">
              <img
                src={imageModal.url}
                alt={imageModal.alt}
                className="max-w-full max-h-[60vh] object-contain rounded-lg"
              />
            </div>
            <div className="px-4 py-2.5 border-t border-neutral-100">
              <a
                href={imageModal.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary hover:underline break-all"
              >
                {imageModal.url}
              </a>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
