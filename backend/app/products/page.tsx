'use client'

import AdminLayout from '@/components/AdminLayout'
import CsvImportWizard from '@/components/CsvImportWizard'
import XlsxImportWizard from '@/components/XlsxImportWizard'
import { ProTable } from '@ant-design/pro-components'
import type { ProColumns, ActionType } from '@ant-design/pro-components'
import {
  Button, Tag, Space, Popconfirm, Image, Card, Statistic,
  Tooltip, message, Typography
} from 'antd'
import {
  PlusOutlined, FireOutlined, WarningOutlined, UploadOutlined,
  FileExcelOutlined, FileOutlined, DownloadOutlined, ReloadOutlined
} from '@ant-design/icons'
import { useRef, useState, useEffect, useCallback } from 'react'
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

const TYPE_ENUM = {
  ichiban: { text: '一番賞' },
  blindbox: { text: '盒玩' },
  gacha:    { text: '轉蛋' },
  card:     { text: '抽卡' },
  custom:   { text: '自製賞' },
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

// ─── Prize expand row ─────────────────────────────────────────────────
function PrizeRows({ record }: { record: Product }) {
  const { total: stockTotal } = calcStock(record.prizes)

  return (
    <div style={{ padding: '4px 40px 4px 56px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {record.prizes.map(prize => {
          const pct = (!isLastOne(prize.level) && stockTotal > 0 && prize.total > 0)
            ? ((prize.total / stockTotal) * 100).toFixed(1) + '%'
            : isLastOne(prize.level) ? '最後賞' : '—'
          const stockColor = prize.remaining === 0 ? '#ff4d4f' : prize.remaining <= 3 ? '#fa8c16' : '#595959'
          return (
            <div key={prize.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#fafafa', border: '1px solid #f0f0f0',
              borderRadius: 8, padding: '4px 10px', minWidth: 180,
            }}>
              {prize.imageUrl && (
                <img src={prize.imageUrl} style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} />
              )}
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.3 }}>{prize.name}</div>
                <div style={{ fontSize: 11, color: '#888' }}>
                  <Tag style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', marginRight: 4 }}>{prize.level}</Tag>
                  <span style={{ color: stockColor, fontFamily: 'monospace' }}>
                    {prize.remaining}/{prize.total}
                  </span>
                  <span style={{ marginLeft: 4, color: '#aaa' }}>{pct}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
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
  const [isXlsxOpen, setIsXlsxOpen] = useState(false)
  const [zipUploading, setZipUploading] = useState(false)
  const zipRef = useRef<HTMLInputElement>(null)

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

  // 高亮捲動
  useEffect(() => {
    if (highlightedProductId) {
      setTimeout(() => setHighlightedProductId(null), 3000)
    }
  }, [highlightedProductId, setHighlightedProductId])

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

  // ─── Columns ───────────────────────────────────────────────────────
  const columns: ProColumns<Product>[] = [
    {
      title: '商品',
      dataIndex: 'name',
      ellipsis: true,
      render: (_, r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {r.imageUrl ? (
            <Image src={r.imageUrl} width={40} height={40}
              style={{ borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
              preview={false}
            />
          ) : (
            <div style={{
              width: 40, height: 40, borderRadius: 8, background: '#f5f5f5',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, color: '#bbb', fontWeight: 'bold', flexShrink: 0,
            }}>GGB</div>
          )}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {r.isHot && <FireOutlined style={{ color: '#f5222d', fontSize: 12 }} />}
              <Text style={{ fontSize: 13, fontWeight: 500 }}
                className={r.id === highlightedProductId ? 'text-primary' : ''}>
                {r.name}
              </Text>
            </div>
            <div style={{ fontSize: 11, color: '#aaa', fontFamily: 'monospace' }}>{r.productCode}</div>
          </div>
        </div>
      ),
    },
    {
      title: '類型',
      dataIndex: 'type',
      width: 90,
      filters: true,
      valueEnum: TYPE_ENUM,
      render: (_, r) => {
        const t = TYPE_MAP[r.type]
        return <Tag color={t?.color}>{t?.label ?? r.type}</Tag>
      },
    },
    {
      title: '狀態',
      dataIndex: 'status',
      width: 100,
      filters: true,
      valueEnum: STATUS_ENUM,
    },
    {
      title: '售價',
      dataIndex: 'price',
      width: 72,
      sorter: (a, b) => a.price - b.price,
      render: v => <span style={{ fontFamily: 'monospace' }}>{v}G</span>,
    },
    {
      title: '成本',
      dataIndex: 'cost',
      width: 72,
      render: v => v != null ? <span style={{ fontFamily: 'monospace', color: '#888' }}>{v}G</span> : <Text type="secondary">—</Text>,
    },
    {
      title: '庫存',
      width: 100,
      sorter: (a, b) => calcStock(a.prizes).remaining - calcStock(b.prizes).remaining,
      render: (_, r) => {
        const { total, remaining } = calcStock(r.prizes)
        const pct = total > 0 ? remaining / total : 0
        const color = pct === 0 ? '#ff4d4f' : pct < 0.15 ? '#fa8c16' : '#52c41a'
        return (
          <span style={{ color, fontFamily: 'monospace', fontWeight: 500, fontSize: 12 }}>
            {pct < 0.15 && total > 0 && <WarningOutlined style={{ marginRight: 3 }} />}
            {remaining}/{total}
          </span>
        )
      },
    },
    {
      title: '銷售',
      dataIndex: 'sales',
      width: 60,
      sorter: (a, b) => (a.sales || 0) - (b.sales || 0),
      render: v => <span style={{ fontFamily: 'monospace' }}>{v || 0}</span>,
    },
    {
      title: '開賣',
      dataIndex: 'startedAt',
      width: 100,
      render: (v: any) => v ? new Date(v).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit', year: '2-digit' }) : <Text type="secondary">—</Text>,
    },
    {
      title: '操作',
      width: 130,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" onClick={() => router.push(`/products/${r.id}`)}>編輯</Button>
          <Tooltip title={r.isHot ? '取消熱賣' : '標記熱賣'}>
            <Button
              size="small"
              icon={<FireOutlined />}
              style={r.isHot ? { color: '#f5222d', borderColor: '#f5222d' } : {}}
              onClick={() => handleToggleHot(r)}
            />
          </Tooltip>
          <Popconfirm
            title={`確定刪除「${r.name}」？`}
            description="此操作無法還原"
            onConfirm={() => handleDelete(r)}
            okText="刪除" cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger>刪</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <AdminLayout pageTitle="商品管理">
      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { title: '全部商品', value: stats.total, prefix: undefined },
          { title: '上架中', value: stats.active, valueStyle: { color: '#3f8600' } },
          { title: '低庫存警示', value: stats.lowStock, valueStyle: { color: '#cf1322' } },
          { title: '熱賣標記', value: stats.hot, valueStyle: { color: '#d46b08' } },
        ].map(s => (
          <Card key={s.title} size="small" bodyStyle={{ padding: '12px 16px' }}>
            <Statistic title={s.title} value={s.value} valueStyle={s.valueStyle} suffix="個" />
          </Card>
        ))}
      </div>

      {/* ProTable */}
      <ProTable<Product>
        actionRef={actionRef}
        rowKey="id"
        columns={columns}
        dataSource={products}
        loading={loading}
        search={false}
        options={{
          search: { placeholder: '搜尋商品名稱、編號、品項...', style: { width: 260 } },
          reload: () => fetchProducts(),
          density: true,
          setting: { draggable: true },
        }}
        toolBarRender={() => [
          <Button
            key="reload"
            icon={<ReloadOutlined />}
            onClick={fetchProducts}
            loading={loading}
          />,
          <Button
            key="export"
            icon={<DownloadOutlined />}
            onClick={handleExportCSV}
          >
            匯出
          </Button>,
          <Button
            key="zip"
            icon={<UploadOutlined />}
            loading={zipUploading}
            onClick={() => zipRef.current?.click()}
          >
            上傳圖片包
          </Button>,
          <Button
            key="csv"
            icon={<FileOutlined />}
            onClick={() => setIsBulkOpen(true)}
          >
            匯入 CSV
          </Button>,
          <Button
            key="xlsx"
            icon={<FileExcelOutlined />}
            onClick={() => setIsXlsxOpen(true)}
          >
            匯入 Excel
          </Button>,
          <Button
            key="new"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => router.push('/products/new')}
          >
            新增商品
          </Button>,
        ]}
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
          preserveSelectedRowKeys: true,
        }}
        tableAlertRender={({ selectedRowKeys, onCleanSelected }) => (
          <Space>
            <span>已選 <strong>{selectedRowKeys.length}</strong> 個商品</span>
            <Button size="small" type="primary" onClick={() => handleBulkStatus('active')}>批量上架</Button>
            <Button size="small" onClick={() => handleBulkStatus('pending')}>批量下架</Button>
            <Popconfirm
              title={`確定刪除 ${selectedRowKeys.length} 個商品？`}
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
          expandedRowRender: (record) => <PrizeRows record={record} />,
        }}
        pagination={{
          pageSize: 20,
          showQuickJumper: true,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (total, range) => `第 ${range[0]}-${range[1]} 筆，共 ${total} 筆`,
        }}
        scroll={{ x: 900 }}
        size="small"
        cardProps={{ bodyStyle: { padding: 0 } }}
        rowClassName={(record) =>
          record.id === highlightedProductId ? 'ant-table-row-selected' : ''
        }
      />

      {/* Hidden zip input */}
      <input ref={zipRef} type="file" accept=".zip" className="hidden" onChange={handleZipUpload} />

      {/* Import modals */}
      <CsvImportWizard
        isOpen={isBulkOpen}
        onClose={() => setIsBulkOpen(false)}
        onImported={() => { fetchProducts(); setIsBulkOpen(false) }}
      />
      <XlsxImportWizard
        isOpen={isXlsxOpen}
        onClose={() => setIsXlsxOpen(false)}
        onImported={() => { fetchProducts(); setIsXlsxOpen(false) }}
      />
    </AdminLayout>
  )
}
