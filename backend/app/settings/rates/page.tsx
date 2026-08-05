'use client'

/**
 * 殺率調整
 *
 * 只列一番賞／抽卡／自製賞 —— 轉蛋與盒玩的 play_gacha 根本沒讀 profit_rate，
 * 列出來只會讓人以為調了有用；機台走 slot_themes，不在這裡管。
 *
 * 一列一個商品：拉桿 + 機率。拖動時機率即時變，不需要展開或按計算。
 * 「大獎」由數量佔比自動判定，不需要管理員設定。
 *
 * 只有還沒上架的商品能調。商品一上架就自動排籤封存，承諾值也同時公布出去，
 * 這時再改殺率不會有任何效果（表已經排好），DB 也會直接擋下來 ——
 * 讓拉桿還能拖只會讓管理員以為調到了。
 */

import { useState, useMemo, useEffect } from 'react'
import { AdminLayout, PageCard, ConfirmDialog, DataTable, type Column } from '@/components'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from '@/contexts/ToastContext'

/** 只有這三種走 play_ichiban，才會用到 profit_rate */
const APPLICABLE_TYPES = ['ichiban', 'card', 'custom']

const TYPE_LABEL: Record<string, string> = {
  ichiban: '一番賞',
  card:    '抽卡',
  custom:  '自製賞',
}

/** 總量佔比低於此值的賞項視為大獎，不必人工指定 */
const MAJOR_PRIZE_RATIO = 0.05

interface Prize {
  level: string
  name: string
  total: number
  probability: number
}

interface Row {
  id: number
  name: string
  productCode: string | null
  type: string
  prizes: Prize[]
  isSealed: boolean
}

/**
 * 套用殺率後的機率：大獎乘上殺率，其餘按比例補足到 100%。
 * 與 DB 的 play_ichiban 同一套規則，兩邊要一起改。
 *
 * 依賞等合併 —— 同一賞等常有多個品項（例如 C賞 有 4 個不同公仔），
 * 逐筆列出會爆版，合併後才看得懂整體分佈。
 */
function applyRate(prizes: Prize[], rate: number) {
  const totalOfAll = prizes.reduce((s, p) => s + p.total, 0)
  const major = (p: Prize) => totalOfAll > 0 && p.total / totalOfAll <= MAJOR_PRIZE_RATIO

  const majorSum = prizes.filter(major).reduce((s, p) => s + p.probability, 0)
  const minorSum = prizes.filter(p => !major(p)).reduce((s, p) => s + p.probability, 0)
  const minorFactor = minorSum > 0 ? Math.max(0, 100 - majorSum * rate) / minorSum : 1

  const byLevel = new Map<string, { level: string; adjusted: number; major: boolean }>()
  for (const p of prizes) {
    const adjusted = major(p) ? p.probability * rate : p.probability * minorFactor
    const hit = byLevel.get(p.level)
    if (hit) {
      hit.adjusted += adjusted
      hit.major = hit.major || major(p)
    } else {
      byLevel.set(p.level, { level: p.level, adjusted, major: major(p) })
    }
  }
  return [...byLevel.values()].sort((a, b) => a.level.localeCompare(b.level, 'zh-Hant'))
}

export default function RatesPage() {
  const { toast } = useToast()
  const [rows, setRows] = useState<Row[]>([])
  const [rates, setRates] = useState<Record<number, number>>({})
  const [saved, setSaved] = useState<Record<number, number>>({})
  const [keyword, setKeyword] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [sortField, setSortField] = useState<'type' | 'name' | 'rate'>('type')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('products')
        .select('id, product_code, name, type, profit_rate, sealed_at, product_prizes(level, name, total, probability)')
        .in('type', APPLICABLE_TYPES)
        .order('id', { ascending: false })

      // 已封存的不可調整。判定用 products.sealed_at 而不是抽獎筆數 ——
      // 上架後還沒人抽的商品也已經封存，用抽獎筆數會讓它看起來還能改。
      // 也不要直接查 product_ticket_seals：那張表是 service role only，
      // 這裡的 anon client 只會拿到空陣列，而且不會報錯。

      const initial: Record<number, number> = {}
      for (const p of data ?? []) initial[p.id] = Number(p.profit_rate ?? 1)

      setRows((data ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        productCode: p.product_code,
        type: p.type,
        prizes: (p.product_prizes ?? []).map((z: any) => ({
          level: z.level, name: z.name, total: z.total, probability: Number(z.probability ?? 0),
        })),
        isSealed: p.sealed_at !== null,
      })))
      setRates(initial)
      setSaved(initial)
      setIsLoading(false)
    }
    load()
  }, [])

  const changed = useMemo(
    () => Object.keys(rates).map(Number).filter(id => rates[id] !== saved[id]),
    [rates, saved],
  )
  // 「已調整」只計真的不是 100% 的，不是「有設定值的」
  const adjustedCount = useMemo(() => Object.values(saved).filter(r => r !== 1).length, [saved])

  // 已開賣的調不了，列出來只是雜訊；要看的話再切換
  const [showLocked, setShowLocked] = useState(false)
  const lockedCount = useMemo(() => rows.filter(r => r.isSealed).length, [rows])

  const visible = useMemo(() => {
    const k = keyword.trim().toLowerCase()
    const list = rows
      .filter(r => showLocked || !r.isSealed)
      .filter(r => !k || r.name.toLowerCase().includes(k) || (r.productCode ?? '').toLowerCase().includes(k))

    const dir = sortDir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      // 殺率用當前值（含尚未儲存的），排完才符合畫面上看到的
      if (sortField === 'rate') return ((rates[a.id] ?? 1) - (rates[b.id] ?? 1)) * dir
      const av = sortField === 'type' ? (TYPE_LABEL[a.type] ?? a.type) : a.name
      const bv = sortField === 'type' ? (TYPE_LABEL[b.type] ?? b.type) : b.name
      return av.localeCompare(bv, 'zh-Hant') * dir
    })
  }, [rows, keyword, showLocked, sortField, sortDir, rates])

  const save = async () => {
    setIsSaving(true)
    for (const id of changed) {
      await fetch(`/api/admin/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ product: { profit_rate: rates[id] } }),
      })
    }
    setSaved({ ...rates })
    setIsSaving(false)
    toast(`已儲存 ${changed.length} 筆`)
  }

  const resetAll = () => {
    const next = { ...rates }
    for (const r of rows) if (!r.isSealed) next[r.id] = 1
    setRates(next)
    setConfirmReset(false)
    toast('已全部改回 100%，記得儲存')
  }

  const columns: Column<Row>[] = [
    {
      key: 'type',
      label: '類別',
      sortable: true,
      render: r => <Badge color="purple">{TYPE_LABEL[r.type] ?? r.type}</Badge>,
    },
    {
      key: 'name',
      label: '商品',
      sortable: true,
      className: 'font-medium',
      render: r => (
        <div className="min-w-0">
          <div className="truncate">{r.name}</div>
          {r.isSealed && (
            <div className="text-xs text-neutral-400 mt-0.5">已上架封存，不可調整</div>
          )}
        </div>
      ),
    },
    {
      key: 'rate',
      label: '殺率',
      sortable: true,
      render: r => {
        const rate = rates[r.id] ?? 1
        const locked = r.isSealed
        return (
          <div className="flex items-center gap-3 min-w-[240px]">
            <input
              type="range"
              min={1} max={200} step={1}
              value={Math.round(rate * 100)}
              disabled={locked}
              onChange={e => setRates({ ...rates, [r.id]: Number(e.target.value) / 100 })}
              className="flex-1 accent-primary disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <span className={`w-12 text-right font-mono tabular-nums ${
              rate === 1 ? 'text-neutral-400' : 'text-primary font-semibold'
            }`}>
              {Math.round(rate * 100)}%
            </span>
          </div>
        )
      },
    },
    {
      key: 'prizes',
      label: '機率',
      render: r => {
        const levels = applyRate(r.prizes, rates[r.id] ?? 1)
        if (levels.length === 0) return <span className="text-neutral-400">無賞項</span>
        const sum = levels.reduce((s2, p) => s2 + p.adjusted, 0)

        // 最爛賞（機率最高的普獎）獨立靠右固定欄位 ——
        // 各商品賞等數量不同（5 個 vs 6 個），全部塞同一個 flex 會讓它左右飄
        const worst = levels.reduce((a, b) => (b.adjusted > a.adjusted ? b : a))
        const rest = levels.filter(p => p !== worst)

        const cell = (p: typeof worst) => (
          <span key={p.level} className="whitespace-nowrap">
            <span className="text-neutral-500">{p.level}</span>
            <span className={`ml-1.5 font-mono tabular-nums ${
              p.major ? 'text-primary font-semibold' : ''
            }`}>
              {p.adjusted.toFixed(2)}%
            </span>
          </span>
        )

        return (
          <div>
            <div className="flex items-start gap-4">
              <div className="flex-1 flex flex-wrap gap-x-4 gap-y-1">
                {rest.map(cell)}
              </div>
              <div className="w-28 flex-shrink-0 text-right">{cell(worst)}</div>
            </div>
            {/* 正常是 100%，不必顯示；只有資料有問題時才提示 */}
            {Math.abs(sum - 100) >= 0.05 && (
              <div className="mt-1 text-xs text-red-500">合計 {sum.toFixed(2)}%，配率資料有誤</div>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <AdminLayout pageTitle="殺率調整">
      <PageCard>
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <Input
              className="w-64"
              placeholder="搜尋商品"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
            />
            <span className="text-sm text-neutral-500 whitespace-nowrap">
              {visible.length} 項{adjustedCount > 0 && `，${adjustedCount} 項已調整`}
            </span>
            {lockedCount > 0 && (
              <button
                onClick={() => setShowLocked(v => !v)}
                className="text-sm text-neutral-400 hover:text-neutral-600 whitespace-nowrap"
              >
                {showLocked ? '隱藏' : '顯示'}已封存（{lockedCount}）
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="secondary" onClick={() => setConfirmReset(true)}>全部重置</Button>
            <Button onClick={save} isLoading={isSaving} disabled={changed.length === 0}>
              儲存{changed.length > 0 ? `（${changed.length}）` : ''}
            </Button>
          </div>
        </div>

        <DataTable
          data={visible}
          columns={columns}
          keyField="id"
          isLoading={isLoading}
          emptyMessage="沒有符合的商品"
          sortField={sortField}
          sortDirection={sortDir}
          onSort={f => {
            if (f === sortField) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
            else { setSortField(f as typeof sortField); setSortDir('asc') }
          }}
        />
      </PageCard>

      <ConfirmDialog
        isOpen={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={resetAll}
        type="warning"
        title="全部重置"
        message="尚未上架的商品全部改回 100%，已封存的不受影響。"
      />
    </AdminLayout>
  )
}
