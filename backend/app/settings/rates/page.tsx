'use client'

/**
 * 殺率調整
 *
 * 只列一番賞／抽卡／自製賞 —— 轉蛋與盒玩的 play_gacha 根本沒讀 profit_rate，
 * 列出來只會讓人以為調了有用；機台走 slot_themes，不在這裡管。
 *
 * 一列一個商品：拉桿 + 大獎機率。拖動時機率即時變，不需要展開或按計算。
 * 「大獎」由數量佔比自動判定，不需要管理員設定。
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
  drawCount: number
}

/**
 * 套用殺率後的機率：大獎乘上殺率，其餘按比例補足到 100%。
 * 與 DB 的 play_ichiban 同一套規則，兩邊要一起改。
 */
function applyRate(prizes: Prize[], rate: number) {
  const totalOfAll = prizes.reduce((s, p) => s + p.total, 0)
  const major = (p: Prize) => totalOfAll > 0 && p.total / totalOfAll <= MAJOR_PRIZE_RATIO

  const majorSum = prizes.filter(major).reduce((s, p) => s + p.probability, 0)
  const minorSum = prizes.filter(p => !major(p)).reduce((s, p) => s + p.probability, 0)
  const minorFactor = minorSum > 0 ? Math.max(0, 100 - majorSum * rate) / minorSum : 1

  return prizes.map(p => ({
    ...p,
    major: major(p),
    adjusted: major(p) ? p.probability * rate : p.probability * minorFactor,
  }))
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

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('products')
        .select('id, product_code, name, type, profit_rate, product_prizes(level, name, total, probability)')
        .in('type', APPLICABLE_TYPES)
        .order('id', { ascending: false })

      // 已開賣的不可調整，用抽獎筆數判定
      const ids = (data ?? []).map((p: any) => p.id)
      const { data: drawn } = ids.length
        ? await supabase.from('draw_records').select('product_id').in('product_id', ids)
        : { data: [] as any[] }
      const counts = new Map<number, number>()
      for (const d of drawn ?? []) counts.set(d.product_id, (counts.get(d.product_id) ?? 0) + 1)

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
        drawCount: counts.get(p.id) ?? 0,
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
  const lockedCount = useMemo(() => rows.filter(r => r.drawCount > 0).length, [rows])

  const visible = useMemo(() => {
    const k = keyword.trim().toLowerCase()
    return rows
      .filter(r => showLocked || r.drawCount === 0)
      .filter(r => !k || r.name.toLowerCase().includes(k) || (r.productCode ?? '').toLowerCase().includes(k))
  }, [rows, keyword, showLocked])

  const save = async () => {
    setIsSaving(true)
    for (const id of changed) {
      await supabase.from('products').update({ profit_rate: rates[id] }).eq('id', id)
    }
    setSaved({ ...rates })
    setIsSaving(false)
    toast(`已儲存 ${changed.length} 筆`)
  }

  const resetAll = () => {
    const next = { ...rates }
    for (const r of rows) if (r.drawCount === 0) next[r.id] = 1
    setRates(next)
    setConfirmReset(false)
    toast('已全部改回 100%，記得儲存')
  }

  const columns: Column<Row>[] = [
    {
      key: 'type',
      label: '類別',
      render: r => <Badge color="purple">{TYPE_LABEL[r.type] ?? r.type}</Badge>,
    },
    {
      key: 'name',
      label: '商品',
      className: 'font-medium',
      render: r => (
        <div className="min-w-0">
          <div className="truncate">{r.name}</div>
          {r.drawCount > 0 && (
            <div className="text-xs text-neutral-400 mt-0.5">已開賣，不可調整</div>
          )}
        </div>
      ),
    },
    {
      key: 'rate',
      label: '殺率',
      render: r => {
        const rate = rates[r.id] ?? 1
        const locked = r.drawCount > 0
        return (
          <div className="flex items-center gap-3 min-w-[240px]">
            <input
              type="range"
              min={0} max={200} step={5}
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
      label: '大獎機率',
      render: r => {
        const majors = applyRate(r.prizes, rates[r.id] ?? 1).filter(p => p.major)
        if (majors.length === 0) return <span className="text-neutral-400">無大獎賞項</span>
        return (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {majors.map(p => (
              <span key={p.level + p.name} className="whitespace-nowrap">
                <span className="text-neutral-500">{p.level}</span>
                <span className="ml-1.5 font-mono tabular-nums">{p.adjusted.toFixed(2)}%</span>
              </span>
            ))}
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
                {showLocked ? '隱藏' : '顯示'}已開賣（{lockedCount}）
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
        />
      </PageCard>

      <ConfirmDialog
        isOpen={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={resetAll}
        type="warning"
        title="全部重置"
        message="尚未開賣的商品全部改回 100%，已開賣的不受影響。"
      />
    </AdminLayout>
  )
}
