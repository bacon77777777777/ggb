'use client'

import { AdminLayout, Modal, ListTableCard, RowAction, type ListColumn } from '@/components'
import Switch from '@/components/ui/Switch'
import Badge from '@/components/ui/Badge'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatDateTime } from '@/utils/dateFormat'
import { useToast } from '@/contexts/ToastContext'
import SelectField from '@/components/ui/SelectField'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import ConfirmDialog from '@/components/ConfirmDialog'

type DiscountType = 'fixed' | 'percentage'
/** 券的用途：draw 抽獎折價｜shipping 運費折抵（migration 681） */
type CouponScope = 'draw' | 'shipping'

interface CouponRow {
  id: string
  code: string | null
  title: string
  description: string | null
  discount_type: DiscountType
  discount_value: number
  min_spend: number
  scope: CouponScope
  is_active: boolean
  created_at: string
}

interface CouponFormState {
  code: string
  title: string
  description: string
  discount_type: DiscountType
  discount_value: string
  min_spend: string
  scope: CouponScope
  is_active: boolean
}

export default function CouponsPage() {
  const { toast } = useToast()
  const { confirm, dialogProps } = useConfirmDialog()
  const [coupons, setCoupons] = useState<CouponRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCoupon, setEditingCoupon] = useState<CouponRow | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [formData, setFormData] = useState<CouponFormState>({
    code: '',
    title: '',
    description: '',
    discount_type: 'fixed',
    discount_value: '',
    min_spend: '',
    scope: 'draw',
    is_active: true,
  })

  const fetchCoupons = async () => {
    try {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setCoupons((data || []) as CouponRow[])
    } catch (error) {
      console.error('Error fetching coupons:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchCoupons()
  }, [])

  const filtered = coupons.filter(c => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return c.title.toLowerCase().includes(q)
      || (c.code ?? '').toLowerCase().includes(q)
      || (c.description ?? '').toLowerCase().includes(q)
  })

  const resetForm = () => {
    setFormData({
      code: '',
      title: '',
      description: '',
      discount_type: 'fixed',
      discount_value: '',
      min_spend: '',
      scope: 'draw',
      is_active: true,
    })
  }

  const handleAdd = () => {
    setEditingCoupon(null)
    resetForm()
    setIsModalOpen(true)
  }

  const handleEdit = (coupon: CouponRow) => {
    setEditingCoupon(coupon)
    setFormData({
      code: coupon.code || '',
      title: coupon.title,
      description: coupon.description || '',
      discount_type: coupon.discount_type,
      discount_value: String(coupon.discount_value),
      min_spend: String(coupon.min_spend),
      scope: coupon.scope || 'draw',
      is_active: coupon.is_active,
    })
    setIsModalOpen(true)
  }

  /** 狀態 Switch 直接切換：樂觀更新，失敗滾回 */
  const toggleActive = async (coupon: CouponRow, next: boolean) => {
    setCoupons(prev => prev.map(c => c.id === coupon.id ? { ...c, is_active: next } : c))
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ id: coupon.id, is_active: next }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setCoupons(prev => prev.map(c => c.id === coupon.id ? { ...c, is_active: !next } : c))
      toast('切換失敗，請重試一次', 'error')
    }
  }

  const handleDelete = async (coupon: CouponRow) => {
    confirm({
      title: '確認操作',
      message: `確定要刪除折價券「${coupon.title}」嗎？`,
      onConfirm: async () => {
      try {
        const res = await fetch(`/api/admin/coupons?id=${coupon.id}`, { method: 'DELETE', credentials: 'include' })
        if (!res.ok) throw new Error('刪除失敗')
        await fetchCoupons()
      } catch (error) {
        console.error('Error deleting coupon:', error)
        toast('刪除折價券失敗', 'error')
      }
      },
    })
  }

  const handleSubmit = async () => {
    const trimmedTitle = formData.title.trim()
    if (!trimmedTitle) {
      toast('請輸入折價券名稱', 'warning')
      return
    }

    const discountValue = Number(formData.discount_value)
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      toast('請輸入有效的折扣數值', 'warning')
      return
    }

    const minSpend = formData.min_spend ? Number(formData.min_spend) : 0
    if (!Number.isFinite(minSpend) || minSpend < 0) {
      toast('請輸入有效的最低消費金額(TWD)', 'warning')
      return
    }

    const payload = {
      code: formData.code.trim() || null,
      title: trimmedTitle,
      description: formData.description.trim() || null,
      discount_type: formData.discount_type,
      discount_value: discountValue,
      min_spend: minSpend,
      scope: formData.scope,
      is_active: formData.is_active,
    }

    try {
      if (editingCoupon) {
        const res = await fetch('/api/admin/coupons', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ id: editingCoupon.id, ...payload }),
        })
        if (!res.ok) throw new Error('更新失敗')
      } else {
        const res = await fetch('/api/admin/coupons', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('新增失敗')
      }

      setIsModalOpen(false)
      setEditingCoupon(null)
      await fetchCoupons()
    } catch (error) {
      console.error('Error saving coupon:', error)
      toast('儲存折價券失敗', 'error')
    }
  }

  const columns: ListColumn<CouponRow>[] = [
    {
      key: 'title', label: '名稱',
      sortValue: c => c.title,
      render: c => (
        <div className="space-y-1 max-w-xs whitespace-normal">
          <div className="font-medium text-neutral-900">{c.title}</div>
          {c.description && (
            <div className="text-xs text-neutral-500 line-clamp-2">{c.description}</div>
          )}
        </div>
      ),
    },
    {
      key: 'code', label: '代碼',
      sortValue: c => c.code ?? '',
      render: c => (
        <span className="text-xs font-mono px-2 py-1 rounded bg-neutral-50 border border-neutral-200 text-neutral-700">
          {c.code || '系統發放'}
        </span>
      ),
    },
    {
      key: 'discount', label: '折扣(TWD/%)',
      render: c => (
        <div className="space-y-1">
          <div className="text-sm font-bold text-pink-500">
            {c.scope === 'shipping'
              ? `折抵運費 ${c.discount_value} G`
              : c.discount_type === 'fixed'
                ? `折抵 ${c.discount_value} (TWD)`
                : `折抵 ${c.discount_value}%`}
          </div>
          {c.scope === 'shipping' && <Badge color="blue">運費券</Badge>}
        </div>
      ),
    },
    {
      key: 'minSpend', label: '最低消費(TWD)',
      sortValue: c => c.min_spend,
      render: c => (
        <span className="text-sm text-neutral-700">
          {c.min_spend > 0 ? `滿 ${c.min_spend} (TWD) 可用` : '無限制'}
        </span>
      ),
    },
    {
      key: 'status', label: '狀態',
      sortValue: c => (c.is_active ? 1 : 0),
      render: c => (
        <Switch checked={c.is_active} onCheckedChange={next => void toggleActive(c, next)} />
      ),
    },
    {
      key: 'createdAt', label: '建立時間',
      sortValue: c => new Date(c.created_at).getTime(),
      className: 'font-mono text-xs text-neutral-500',
      render: c => <>{formatDateTime(c.created_at)}</>,
    },
    {
      key: 'operations', label: '操作', isActions: true,
      render: c => (
        <div className="flex items-center gap-2">
          <RowAction tone="primary" onClick={() => handleEdit(c)}>編輯</RowAction>
          <RowAction tone="danger" onClick={() => handleDelete(c)}>刪除</RowAction>
        </div>
      ),
    },
  ]

  return (
    <AdminLayout pageTitle="折價券管理">
      <div className="space-y-6">
        <ListTableCard
          pageKey="coupons"
          data={filtered}
          columns={columns}
          keyField="id"
          isLoading={isLoading}
          emptyMessage="目前尚無折價券"
          defaultSortField="createdAt"
          defaultSortDirection="desc"
          searchPlaceholder="搜尋名稱、代碼..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          addButtonText="+ 新增折價券"
          onAddClick={handleAdd}
        />

        <Modal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false)
            setEditingCoupon(null)
          }}
          title={editingCoupon ? '編輯折價券' : '新增折價券'}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                名稱
              </label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="例如：新會員折50元"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                顯示描述
              </label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="h-20"
                placeholder="例如：首次下單滿 300 元折 50 元"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                券類型
              </label>
              <SelectField
                value={formData.scope}
                onChange={(e) =>
                  setFormData({ ...formData, scope: e.target.value as CouponScope })
                }
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white"
              >
                <option value="draw">抽獎折價券（購買抽獎時折抵）</option>
                <option value="shipping">運費優惠券（倉庫配送時折抵運費 G）</option>
              </SelectField>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  折扣類型
                </label>
                <SelectField
                  value={formData.discount_type}
                  onChange={(e) =>
                    setFormData({ ...formData, discount_type: e.target.value as DiscountType })
                  }
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white"
                >
                  <option value="fixed">固定金額(TWD)</option>
                  <option value="percentage">百分比</option>
                </SelectField>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  折扣數值
                </label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.discount_value}
                  onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                  placeholder={formData.discount_type === 'fixed' ? '例如：50' : '例如：10 代表 10%'}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  最低消費金額(TWD)
                </label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.min_spend}
                  onChange={(e) => setFormData({ ...formData, min_spend: e.target.value })}
                  placeholder="例如：300 (TWD)，留空代表無限制"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  折價券代碼
                </label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="可留空代表僅系統發放"
                />
              </div>
            </div>

            <div className="flex items-center pt-2">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded text-primary focus:ring-primary"
                />
                <span className="text-sm font-medium text-neutral-700">啟用此折價券</span>
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t mt-4">
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false)
                  setEditingCoupon(null)
                }}
                className="px-4 py-2 border rounded-lg hover:bg-neutral-50 text-sm font-medium"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium"
              >
                儲存
              </button>
            </div>
          </div>
        </Modal>
      </div>
      {dialogProps && <ConfirmDialog {...dialogProps} />}
    </AdminLayout>
  )
}
