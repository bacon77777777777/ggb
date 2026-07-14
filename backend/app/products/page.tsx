'use client'

import AdminLayout from '@/components/AdminLayout'
import CsvImportWizard from '@/components/CsvImportWizard'
import { ProTable } from '@ant-design/pro-components'
import type { ProColumns, ActionType } from '@ant-design/pro-components'
import {
  Button, Tag, Space, Popconfirm, Card, Statistic,
  Tooltip, message, Typography, Spin, Empty, Switch, Input,
} from 'antd'
import {
  PlusOutlined, FireOutlined, UploadOutlined,
  FileOutlined, DownloadOutlined, RightOutlined, UserOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { useLog } from '@/contexts/LogContext'
import { useProduct } from '@/contexts/ProductContext'

const { Text } = Typography

// ─── Types ────────────────────────────────────────────────────────────
type Prize = {
  id: number
  name: string
  level: string
  imageUrl?: string
  total: number
  remaining: number
  probability: number
}

type DrawRecord = {
  id: number
  createdAt: string
  userName?: string
  orderNumber?: string | null
  status?: string
}

const DRAW_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  in_warehouse:     { label: '倉庫中', color: '#6d28d9', bg: '#ede9fe' },
  pending_delivery: { label: '待配送', color: '#b45309', bg: '#fef3c7' },
  shipped:          { label: '已出貨', color: '#1d4ed8', bg: '#dbeafe' },
  dismantled:       { label: '已拆解', color: '#6b7280', bg: '#f3f4f6' },
  exchanged:        { label: '已兌換', color: '#6b7280', bg: '#f3f4f6' },
  success:          { label: '成功',   color: '#15803d', bg: '#dcfce7' },
}

type Product = {
  id: number
  productCode: string
  name: string
  type: string
  price: number
  cost?: number
  remaining: number
  totalCount: number
  status: string
  sales: number
  isHot: boolean
  imageUrl?: string
  startedAt?: string
  endedAt?: string
  prizes: Prize[]
}

// ─── Constants ────────────────────────────────────────────────────────
const TYPE_MAP: Record<string, { label: string; color: string }> = {
  ichiban: { label: '一番賞', color: 'gold' },
  blindbox: { label: '盒玩', color: 'blue' },
  gacha:    { label: '轉蛋', color: 'green' },
  card:     { label: '抽卡', color: 'purple' },
  custom:   { label: '自製賞', color: 'orange' },
}

const STATUS_ENUM = {
  active:  { text: '進行中', status: 'Processing' as const },
  pending: { text: '待上架', status: 'Default' as const },
  ended:   { text: '已完抽', status: 'Success' as const },
}

const LEVEL_COLOR: Record<string, string> = {
  A: '#f59e0b', B: '#3b82f6', C: '#6b7280', D: '#6b7280',
  E: '#a855f7', F: '#a855f7', G: '#ec4899', H: '#ec4899',
  I: '#ef4444', J: '#ef4444',
}

function isLastOne(level: string) {
  const l = (level ?? '').toLowerCase().trim()
  return l === 'last one' || l === 'last_one'
}

function calcStock(prizes: Prize[]) {
  const normal = prizes.filter(p => !isLastOne(p.level))
  return {
    total:     normal.reduce((s, p) => s + p.total, 0),
    remaining: normal.reduce((s, p) => s + p.remaining, 0),
  }
}

function mapProduct(p: any): Product {
  return {
    id: p.id,
    productCode: p.product_code ?? '',
    name: p.name,
    type: p.type,
    price: p.price,
    cost: p.cost ?? undefined,
    remaining: p.remaining,
    totalCount: p.total_count,
    status: p.status,
    sales: p.sales ?? 0,
    isHot: p.is_hot,
    imageUrl: p.image_url,
    startedAt: p.started_at,
    endedAt: p.ended_at,
    prizes: (p.prizes ?? []).map((pr: any) => ({
      id: pr.id,
      name: pr.name,
      level: pr.level,
      imageUrl: pr.image_url,
      total: pr.total,
      remaining: pr.remaining,
      probability: pr.probability,
    })),
  }
}

const LEVELED_TYPES = new Set(['ichiban', 'custom', 'card'])

// ─── PrizeRow ─────────────────────────────────────────────────────────
function PrizeRow({ prize, stockTotal, productType }: {
  prize: Prize; stockTotal: number; productType: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [draws, setDraws] = useState<DrawRecord[]>([])
  const [drawTotal, setDrawTotal] = useState(0)
  const [loadingDraws, setLoadingDraws] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [fetched, setFetched] = useState(false)
  const recordsRef = useRef<HTMLDivElement>(null)

  const hasLevel = LEVELED_TYPES.has(productType)
  const pct = !isLastOne(prize.level) && stockTotal > 0 && prize.total > 0
    ? ((prize.total / stockTotal) * 100).toFixed(1) + '%'
    : isLastOne(prize.level) ? '最後賞' : '—'

  const remainColor = prize.remaining === 0 ? '#dc2626' : (prize.total > 0 && prize.remaining / prize.total < 0.2) ? '#ea580c' : '#15803d'
  const sold = prize.total - prize.remaining

  const mapRow = (r: any): DrawRecord => ({
    id: r.id,
    createdAt: r.created_at,
    userName: r.userName ?? '—',
    orderNumber: r.orderNumber ?? null,
    status: r.status ?? undefined,
  })

  const handleExpand = async () => {
    if (!fetched) {
      setLoadingDraws(true)
      try {
        const res = await fetch(`/api/prize-draws/${prize.id}?limit=10&offset=0`, { credentials: 'include' })
        if (res.ok) {
          const json = await res.json()
          setDraws((json.rows ?? []).map(mapRow))
          setDrawTotal(json.total ?? 0)
        }
      } finally {
        setLoadingDraws(false)
        setFetched(true)
      }
    }
    setExpanded(v => !v)
  }

  const handleRecordsScroll = useCallback(async () => {
    const el = recordsRef.current
    if (!el || loadingMore) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight > 60) return
    if (draws.length >= drawTotal) return

    setLoadingMore(true)
    try {
      const res = await fetch(`/api/prize-draws/${prize.id}?limit=10&offset=${draws.length}`, { credentials: 'include' })
      if (res.ok) {
        const json = await res.json()
        setDraws(prev => [...prev, ...(json.rows ?? []).map(mapRow)])
        setDrawTotal(json.total ?? 0)
      }
    } finally {
      setLoadingMore(false)
    }
  }, [draws.length, drawTotal, loadingMore, prize.id])

  const levelColor = LEVEL_COLOR[(prize.level ?? '').toUpperCase().replace('賞', '')] ?? '#6b7280'

  return (
    <div style={{ borderBottom: '1px solid #f0f0f0' }}>
      <div
        onClick={handleExpand}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', cursor: 'pointer',
          transition: 'background 0.15s',
          background: expanded ? '#f0f5ff' : 'transparent',
        }}
        onMouseEnter={e => { if (!expanded) (e.currentTarget as HTMLDivElement).style.background = '#fafafa' }}
        onMouseLeave={e => { if (!expanded) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
      >
        {/* Thumbnail */}
        <div style={{
          width: 36, height: 36, borderRadius: 6, flexShrink: 0,
          background: '#f5f5f5', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {prize.imageUrl
            ? <img src={prize.imageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 10, color: '#ccc' }}>無圖</span>
          }
        </div>

        {/* Level tag */}
        {hasLevel ? (
          <div style={{ width: 44, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            <Tag style={{
              fontSize: 11, lineHeight: '18px', padding: '0 5px',
              color: levelColor, borderColor: levelColor, background: `${levelColor}18`,
              margin: 0, whiteSpace: 'nowrap',
            }}>
              {isLastOne(prize.level) ? 'Last' : prize.level}
            </Tag>
          </div>
        ) : null}

        {/* Name */}
        <Tooltip title={prize.name} placement="top">
          <div style={{ width: 240, flexShrink: 0, overflow: 'hidden', cursor: 'default' }}>
            <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {prize.name}
            </div>
          </div>
        </Tooltip>

        {/* Stats */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
          <div style={{ width: 96, paddingLeft: 12 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 1.4 }}>
              <span style={{ color: remainColor, fontWeight: 600 }}>{prize.remaining}</span>
              <span style={{ color: '#333' }}>/{prize.total}</span>
            </div>
            <div style={{ fontSize: 11, color: '#aaa' }}>剩餘/總數</div>
          </div>
          <div style={{ width: 72, paddingLeft: 8 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 1.4, color: '#555' }}>{pct}</div>
            <div style={{ fontSize: 11, color: '#aaa' }}>機率</div>
          </div>
          <div style={{ width: 56, paddingLeft: 8 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 1.4, color: sold > 0 ? '#3b82f6' : '#ccc', fontWeight: sold > 0 ? 600 : 400 }}>
              {sold}
            </div>
            <div style={{ fontSize: 11, color: '#aaa' }}>已出</div>
          </div>
        </div>

        <div style={{ flex: 1 }} />
        <RightOutlined style={{
          fontSize: 10, color: '#bbb', flexShrink: 0,
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s',
        }} />
      </div>

      {/* Draw records */}
      {expanded && (
        <div style={{ background: '#f8faff', borderTop: '1px solid #e8f0fe', padding: '8px 14px' }}>
          {loadingDraws ? (
            <div style={{ textAlign: 'center', padding: '12px 0' }}><Spin size="small" /></div>
          ) : draws.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚無真實玩家出貨紀錄" style={{ margin: '8px 0' }} />
          ) : (
            <>
              {/* Column header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 0,
                padding: '3px 10px 5px', fontSize: 11, color: '#9ca3af', fontWeight: 500,
              }}>
                <div style={{ width: 140, flexShrink: 0 }}>玩家</div>
                <div style={{ width: 64, flexShrink: 0 }}>狀態</div>
                <div style={{ flex: 1 }}>訂單號</div>
                <div style={{ width: 120, textAlign: 'right' }}>時間</div>
              </div>
              {/* Records list — fixed height + scroll */}
              <div
                ref={recordsRef}
                onScroll={handleRecordsScroll}
                style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}
              >
                {draws.map(d => {
                  const st = d.status ? DRAW_STATUS[d.status] : undefined
                  return (
                    <div key={d.id} style={{
                      display: 'flex', alignItems: 'center', gap: 0,
                      padding: '5px 10px', background: '#fff',
                      borderRadius: 6, border: '1px solid #e8f0fe',
                    }}>
                      <div style={{ width: 140, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <UserOutlined style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: '#334155', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.userName}
                        </span>
                      </div>
                      <div style={{ width: 64, flexShrink: 0 }}>
                        {st ? (
                          <span style={{
                            fontSize: 11, padding: '1px 6px', borderRadius: 4,
                            color: st.color, background: st.bg, fontWeight: 500, whiteSpace: 'nowrap',
                          }}>
                            {st.label}
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: '#ccc' }}>—</span>
                        )}
                      </div>
                      <div style={{ flex: 1 }}>
                        {d.orderNumber
                          ? <span style={{ fontSize: 11, color: '#3b82f6', fontFamily: 'monospace' }}>{d.orderNumber}</span>
                          : <span style={{ fontSize: 11, color: '#ccc' }}>—</span>
                        }
                      </div>
                      <div style={{ width: 120, textAlign: 'right', fontSize: 11, color: '#9ca3af', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {new Date(d.createdAt).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' })}
                        {' '}
                        {new Date(d.createdAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  )
                })}
                {loadingMore && (
                  <div style={{ textAlign: 'center', padding: '8px 0' }}><Spin size="small" /></div>
                )}
              </div>
              {draws.length < drawTotal && !loadingMore && (
                <div style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', padding: '6px 0 2px' }}>
                  顯示 {draws.length} / {drawTotal} 筆，向下捲動載入更多
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── PrizeRows ────────────────────────────────────────────────────────
function PrizeRows({ record }: { record: Product }) {
  const { total: stockTotal } = calcStock(record.prizes)
  const hasLevel = LEVELED_TYPES.has(record.type)

  if (record.prizes.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚無品項" style={{ margin: '8px 0' }} />
  }
  return (
    <div style={{ background: '#fff', overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 14px', background: '#f0f5ff',
        fontSize: 11, color: '#6b7280', fontWeight: 500,
      }}>
        <div style={{ width: 36, flexShrink: 0 }} />
        {hasLevel && <div style={{ width: 44, flexShrink: 0 }} />}
        <div style={{ width: 240, flexShrink: 0 }}>品項 × {record.prizes.length} · 點擊展開出貨流向</div>
        <div style={{ width: 96, paddingLeft: 12 }}>剩餘/總數</div>
        <div style={{ width: 72, paddingLeft: 8 }}>機率</div>
        <div style={{ width: 56, paddingLeft: 8 }}>已出</div>
        <div style={{ flex: 1 }} />
        <div style={{ width: 20 }} />
      </div>
      {record.prizes.map(prize => (
        <PrizeRow key={prize.id} prize={prize} stockTotal={stockTotal} productType={record.type} />
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────
export default function ProductsPage() {
  const router = useRouter()
  const { addLog } = useLog()
  const { highlightedProductId, setHighlightedProductId } = useProduct()
  const actionRef = useRef<ActionType>()

  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [isBulkOpen, setIsBulkOpen] = useState(false)
  const [zipUploading, setZipUploading] = useState(false)
  const zipRef = useRef<HTMLInputElement>(null)

  // Infinite scroll + sort
  const [searchText, setSearchText] = useState('')
  const [sortConfig, setSortConfig] = useState<{ field?: string; order?: 'ascend' | 'descend' }>({})
  const [displayCount, setDisplayCount] = useState(20)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('products')
      .select('*, prizes:product_prizes(*)')
      .order('created_at', { ascending: false })

    if (!error && data) {
      setProducts(data.map(mapProduct))
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchProducts() }, [fetchProducts])

  useEffect(() => {
    if (highlightedProductId) {
      setTimeout(() => setHighlightedProductId(null), 3000)
    }
  }, [highlightedProductId, setHighlightedProductId])

  // Filter → sort → slice pipeline
  const filteredProducts = useMemo(() => {
    if (!searchText) return products
    const q = searchText.toLowerCase()
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.productCode.toLowerCase().includes(q) ||
      p.prizes.some(pr => pr.name.toLowerCase().includes(q))
    )
  }, [products, searchText])

  const sortedProducts = useMemo(() => {
    if (!sortConfig.field || !sortConfig.order) return filteredProducts
    const m = sortConfig.order === 'ascend' ? 1 : -1
    return [...filteredProducts].sort((a, b) => {
      switch (sortConfig.field) {
        case 'type':
          return m * (TYPE_MAP[a.type]?.label ?? a.type).localeCompare(TYPE_MAP[b.type]?.label ?? b.type, 'zh-TW')
        case 'status': {
          const ord = { active: 0, pending: 1, ended: 2 }
          return m * ((ord[a.status as keyof typeof ord] ?? 9) - (ord[b.status as keyof typeof ord] ?? 9))
        }
        case 'price': return m * (a.price - b.price)
        case 'cost': return m * ((a.cost ?? 0) - (b.cost ?? 0))
        case 'remaining': return m * (calcStock(a.prizes).remaining - calcStock(b.prizes).remaining)
        case 'sales': return m * ((a.sales || 0) - (b.sales || 0))
        case 'isHot': return m * (Number(b.isHot) - Number(a.isHot))
        case 'startedAt': return m * (new Date(a.startedAt || 0).getTime() - new Date(b.startedAt || 0).getTime())
        case 'endedAt': {
          if (!a.endedAt && !b.endedAt) return 0
          if (!a.endedAt) return m
          if (!b.endedAt) return -m
          return m * (new Date(a.endedAt).getTime() - new Date(b.endedAt).getTime())
        }
        default: return 0
      }
    })
  }, [filteredProducts, sortConfig])

  const displayedProducts = useMemo(() => sortedProducts.slice(0, displayCount), [sortedProducts, displayCount])
  const hasMore = displayCount < sortedProducts.length

  // Load more when sentinel enters viewport
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore) {
        setDisplayCount(c => Math.min(c + 20, sortedProducts.length))
      }
    }, { rootMargin: '0px 0px 200px 0px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasMore, sortedProducts.length])

  // ─── Stats ─────────────────────────────────────────────────────────
  const stats = {
    total:    products.length,
    active:   products.filter(p => p.status === 'active').length,
    lowStock: products.filter(p => {
      const { remaining } = calcStock(p.prizes)
      return remaining < 10 && p.status === 'active'
    }).length,
    hot: products.filter(p => p.isHot).length,
  }

  // ─── Actions ───────────────────────────────────────────────────────
  const handleDelete = async (product: Product) => {
    try {
      const res = await fetch(`/api/admin/products/${product.id}`, {
        method: 'DELETE', credentials: 'include',
      })
      if (!res.ok) throw new Error('刪除失敗')
      setProducts(prev => prev.filter(p => p.id !== product.id))
      addLog('刪除商品', '商品管理', `刪除「${product.name}」`)
      message.success('商品已刪除')
    } catch {
      message.error('刪除失敗')
    }
  }

  const handleBulkStatus = async (status: 'active' | 'pending') => {
    const ids = selectedRowKeys as number[]
    try {
      const res = await fetch('/api/admin/products/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'update_status', ids, status, autoGenerateTxid: status === 'active' }),
      })
      if (!res.ok) throw new Error()
      setSelectedRowKeys([])
      fetchProducts()
      addLog(`批量${status === 'active' ? '上架' : '下架'}`, '商品管理', `${ids.length} 個商品`)
      message.success(`已${status === 'active' ? '上架' : '下架'} ${ids.length} 個商品`)
    } catch {
      message.error('操作失敗')
    }
  }

  const handleBulkDelete = async () => {
    const ids = selectedRowKeys as number[]
    try {
      await fetch('/api/admin/products/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'delete', ids }),
      })
      setProducts(prev => prev.filter(p => !ids.includes(p.id)))
      setSelectedRowKeys([])
      addLog('批量刪除', '商品管理', `刪除 ${ids.length} 個商品`)
      message.success(`已刪除 ${ids.length} 個商品`)
    } catch {
      message.error('批量刪除失敗')
    }
  }

  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setZipUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/admin/products/upload-images', { method: 'POST', body: form, credentials: 'include' })
      const data = await res.json()
      if (res.ok) {
        message.success(`上傳完成：${data.uploaded} 張成功，${data.failed} 張失敗`)
        fetchProducts()
      } else {
        message.error(data.error || '上傳失敗')
      }
    } catch {
      message.error('上傳失敗')
    } finally {
      setZipUploading(false)
      if (zipRef.current) zipRef.current.value = ''
    }
  }

  const handleExportCSV = () => {
    const rows = [
      ['商品編號', '商品名稱', '類型', '狀態', '售價', '成本', '庫存', '銷售'],
      ...products.map(p => {
        const { remaining, total } = calcStock(p.prizes)
        return [p.productCode, p.name, TYPE_MAP[p.type]?.label ?? p.type, STATUS_ENUM[p.status as keyof typeof STATUS_ENUM]?.text ?? p.status, p.price, p.cost ?? '', remaining, p.sales]
      }),
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url; a.download = `商品管理_${new Date().toISOString().split('T')[0]}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const handleToggleHot = async (product: Product) => {
    const newHot = !product.isHot
    await fetch(`/api/admin/products/${product.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ is_hot: newHot }),
    })
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, isHot: newHot } : p))
  }

  const handleTableChange = (_: any, __: any, sorter: any) => {
    const s = Array.isArray(sorter) ? sorter[0] : sorter
    const field = s?.columnKey ?? s?.field
    if (field && s?.order) {
      setSortConfig({ field, order: s.order })
    } else {
      setSortConfig({})
    }
    setDisplayCount(20)
  }

  // Helper for sort order indicator per column
  const so = (field: string) => sortConfig.field === field ? sortConfig.order : undefined

  // ─── Columns ───────────────────────────────────────────────────────
  const columns: ProColumns<Product>[] = [
    {
      title: '商品',
      dataIndex: 'name',
      width: 340,
      ellipsis: true,
      render: (_, r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Tooltip title={r.imageUrl ? <img src={r.imageUrl} style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 6 }} /> : '無商品圖片'} placement="right">
            <div style={{ width: 40, height: 40, borderRadius: 8, flexShrink: 0, overflow: 'hidden', cursor: 'default' }}>
              {r.imageUrl ? (
                <img src={r.imageUrl} style={{ width: 40, height: 40, objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{ width: 40, height: 40, background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#bbb', fontWeight: 'bold' }}>GGB</div>
              )}
            </div>
          </Tooltip>
          <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
            <Tooltip title={r.name} placement="top">
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                {r.isHot && (
                  <Tooltip title="熱賣中">
                    <FireOutlined style={{ color: '#f5222d', fontSize: 12, flexShrink: 0 }} />
                  </Tooltip>
                )}
                <Text style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', flex: 1 }}
                  className={r.id === highlightedProductId ? 'text-primary' : ''}
                >
                  {r.name}
                </Text>
              </div>
            </Tooltip>
            <Tooltip title="商品編號" placement="bottom">
              <div style={{ fontSize: 11, color: '#aaa', fontFamily: 'monospace', cursor: 'default', whiteSpace: 'nowrap' }}>{r.productCode}</div>
            </Tooltip>
          </div>
        </div>
      ),
    },
    {
      title: '類型', dataIndex: 'type', width: 90,
      key: 'type', sorter: true, sortOrder: so('type'),
      render: (_, r) => {
        const t = TYPE_MAP[r.type]
        return (
          <Tooltip title={`商品類型：${t?.label ?? r.type}`}>
            <Tag color={t?.color} style={{ cursor: 'default' }}>{t?.label ?? r.type}</Tag>
          </Tooltip>
        )
      },
    },
    {
      title: '狀態', dataIndex: 'status', width: 90,
      key: 'status', sorter: true, sortOrder: so('status'),
      render: (_, r) => {
        const s = STATUS_ENUM[r.status as keyof typeof STATUS_ENUM]
        const dotColor = r.status === 'active' ? '#1677ff' : r.status === 'ended' ? '#52c41a' : '#d9d9d9'
        return (
          <Tooltip title={r.status === 'active' ? '上架中，玩家可抽' : r.status === 'ended' ? '已全數抽完' : '尚未上架'}>
            <span style={{ whiteSpace: 'nowrap', cursor: 'default' }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: dotColor, marginRight: 6, verticalAlign: 'middle' }} />
              {s?.text ?? r.status}
            </span>
          </Tooltip>
        )
      },
    },
    {
      title: <Tooltip title="每抽售價（代幣 G）">售價</Tooltip>,
      dataIndex: 'price', width: 72,
      key: 'price', sorter: true, sortOrder: so('price'),
      render: v => (
        <Tooltip title={`每抽售價 ${v} 代幣`}>
          <span style={{ fontFamily: 'monospace', cursor: 'default' }}>{v}G</span>
        </Tooltip>
      ),
    },
    {
      title: <Tooltip title="廠商進貨成本">成本</Tooltip>,
      dataIndex: 'cost', width: 72,
      key: 'cost', sorter: true, sortOrder: so('cost'),
      render: v => v != null ? (
        <Tooltip title={`進貨成本 ${v} 代幣`}>
          <span style={{ fontFamily: 'monospace', color: '#888', cursor: 'default' }}>{v}G</span>
        </Tooltip>
      ) : (
        <Tooltip title="尚未設定成本"><Text type="secondary" style={{ cursor: 'default' }}>—</Text></Tooltip>
      ),
    },
    {
      title: <Tooltip title="剩餘/總數（不含最後賞）">庫存</Tooltip>,
      width: 110, key: 'remaining', sorter: true, sortOrder: so('remaining'),
      render: (_, r) => {
        const { total, remaining } = calcStock(r.prizes)
        const pct = total > 0 ? remaining / total : 0
        const remainColor = remaining === 0 ? '#dc2626' : pct < 0.2 ? '#ea580c' : '#15803d'
        return (
          <Tooltip title={`剩餘 ${remaining} 件 / 共 ${total} 件（${(pct * 100).toFixed(1)}%）`}>
            <span style={{ fontFamily: 'monospace', cursor: 'default', whiteSpace: 'nowrap' }}>
              <span style={{ color: remainColor, fontWeight: 600 }}>{remaining}</span>
              <span style={{ color: '#333' }}>/{total}</span>
            </span>
          </Tooltip>
        )
      },
    },
    {
      title: <Tooltip title="累計銷售抽數">銷售</Tooltip>,
      dataIndex: 'sales', width: 60,
      key: 'sales', sorter: true, sortOrder: so('sales'),
      render: v => (
        <Tooltip title={`累計銷售 ${v || 0} 抽`}>
          <span style={{ fontFamily: 'monospace', cursor: 'default' }}>{v || 0}</span>
        </Tooltip>
      ),
    },
    {
      title: <Tooltip title="標記為熱賣商品，顯示於前台熱賣區">熱賣</Tooltip>,
      dataIndex: 'isHot', width: 60,
      key: 'isHot', sorter: true, sortOrder: so('isHot'),
      render: (_, r) => (
        <Switch
          size="small"
          checked={r.isHot}
          onChange={() => handleToggleHot(r)}
          onClick={(_checked, e) => e.stopPropagation()}
        />
      ),
    },
    {
      title: <Tooltip title="商品上架開賣的時間（started_at）">開賣</Tooltip>,
      dataIndex: 'startedAt', width: 90,
      key: 'startedAt', sorter: true, sortOrder: so('startedAt'),
      render: (v: any) => v ? (
        <Tooltip title={new Date(v).toLocaleString('zh-TW')}>
          <span style={{ cursor: 'default', whiteSpace: 'nowrap' }}>
            {new Date(v).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit', year: '2-digit' })}
          </span>
        </Tooltip>
      ) : (
        <Tooltip title="尚未設定上架時間"><Text type="secondary" style={{ cursor: 'default' }}>—</Text></Tooltip>
      ),
    },
    {
      title: <Tooltip title="商品完全抽完的時間（ended_at）">完抽</Tooltip>,
      dataIndex: 'endedAt', width: 90,
      key: 'endedAt', sorter: true, sortOrder: so('endedAt'),
      render: (v: any) => {
        const d = v ? new Date(v) : null
        if (!d || isNaN(d.getTime())) return <Tooltip title="尚未完抽"><Text type="secondary" style={{ cursor: 'default' }}>—</Text></Tooltip>
        return (
          <Tooltip title={d.toLocaleString('zh-TW')}>
            <span style={{ cursor: 'default', whiteSpace: 'nowrap', color: '#52c41a' }}>
              {d.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit', year: '2-digit' })}
            </span>
          </Tooltip>
        )
      },
    },
    {
      title: '操作', width: 90, fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Tooltip title="編輯商品資料">
            <Button type="link" size="small" onClick={e => { e.stopPropagation(); router.push(`/products/${r.id}`) }}>
              編輯
            </Button>
          </Tooltip>
          <Tooltip title="刪除此商品（無法還原）">
            <Popconfirm
              title={`確定刪除「${r.name}」？`}
              description="此操作無法還原"
              onConfirm={() => handleDelete(r)}
              onPopupClick={e => e.stopPropagation()}
              okText="刪除" cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button type="link" size="small" danger onClick={e => e.stopPropagation()}>
                刪除
              </Button>
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ]

  return (
    <AdminLayout pageTitle="商品管理">
      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { title: '全部商品(個)', value: stats.total, tip: '所有商品總數（含下架）' },
          { title: '上架中(個)', value: stats.active, valueStyle: { color: '#3f8600' }, tip: '目前玩家可見、可抽的商品數' },
          { title: '低庫存警示(個)', value: stats.lowStock, valueStyle: { color: '#cf1322' }, tip: '上架中且剩餘庫存不足 10 件的商品' },
          { title: '熱賣標記(個)', value: stats.hot, valueStyle: { color: '#d46b08' }, tip: '已勾選「熱賣」標記的商品數' },
        ].map(s => (
          <Tooltip key={s.title} title={s.tip} placement="bottom">
            <Card size="small" styles={{ body: { padding: '12px 16px' } }} style={{ cursor: 'default' }}>
              <Statistic title={s.title} value={s.value} valueStyle={s.valueStyle} />
            </Card>
          </Tooltip>
        ))}
      </div>

      {/* ProTable */}
      <ProTable<Product>
        className="products-table"
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        dataSource={displayedProducts}
        loading={loading}
        search={false}
        onChange={handleTableChange}
        options={{
          reload: () => fetchProducts(),
          density: true,
          setting: { draggable: true },
        }}
        toolBarRender={() => [
          <Input.Search
            key="search"
            placeholder="搜尋商品名稱、編號、品項..."
            style={{ width: 240 }}
            value={searchText}
            onChange={e => { setSearchText(e.target.value); setDisplayCount(20) }}
            onSearch={v => { setSearchText(v); setDisplayCount(20) }}
            allowClear
          />,
          <Button key="export" icon={<DownloadOutlined />} onClick={handleExportCSV}>匯出</Button>,
          <Button key="zip" icon={<UploadOutlined />} loading={zipUploading} onClick={() => zipRef.current?.click()}>
            上傳圖片包
          </Button>,
          <Button key="bulk" icon={<ThunderboltOutlined />} onClick={() => setIsBulkOpen(true)}>
            智能批量
          </Button>,
          <Button key="new" type="primary" icon={<PlusOutlined />} onClick={() => router.push('/products/new')}>
            新增商品
          </Button>,
        ]}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
          preserveSelectedRowKeys: true,
        }}
        tableAlertRender={({ selectedRowKeys: sel, onCleanSelected }) => (
          <Space>
            <span>已選 <strong>{sel.length}</strong> 個商品</span>
            <Button size="small" type="primary" onClick={() => handleBulkStatus('active')}>批量上架</Button>
            <Button size="small" onClick={() => handleBulkStatus('pending')}>批量下架</Button>
            <Popconfirm
              title={`確定刪除 ${sel.length} 個商品？`}
              onConfirm={handleBulkDelete}
              okText="刪除" cancelText="取消" okButtonProps={{ danger: true }}
            >
              <Button size="small" danger>批量刪除</Button>
            </Popconfirm>
            <Button size="small" onClick={onCleanSelected}>取消選擇</Button>
          </Space>
        )}
        tableAlertOptionRender={false}
        expandable={{
          expandedRowRender: record => <PrizeRows record={record} />,
          expandRowByClick: true,
          showExpandColumn: false,
        }}
        pagination={false}
        scroll={{ x: 1240 }}
        cardProps={{ styles: { body: { padding: 0 } } } as any}
        rowClassName={record =>
          record.id === highlightedProductId ? 'ant-table-row-selected' : ''
        }
        footer={() => (
          <div ref={sentinelRef} style={{ textAlign: 'center', padding: '8px 0', color: '#aaa', fontSize: 12 }}>
            {hasMore
              ? `顯示 ${displayedProducts.length} / ${sortedProducts.length} 筆，繼續捲動載入更多…`
              : sortedProducts.length > 0 ? `共 ${sortedProducts.length} 筆，已全部顯示` : ''
            }
          </div>
        )}
      />

      {/* Hidden zip input */}
      <input ref={zipRef} type="file" accept=".zip" className="hidden" onChange={handleZipUpload} />

      {/* Import modal */}
      <CsvImportWizard
        isOpen={isBulkOpen}
        onClose={() => setIsBulkOpen(false)}
        onImported={() => { fetchProducts(); setIsBulkOpen(false) }}
      />
    </AdminLayout>
  )
}
