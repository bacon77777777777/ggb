'use client'

import { AdminLayout, PageCard, Modal, DataTable, type Column } from '@/components'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { formatDateTime } from '@/utils/dateFormat'

type DiscountType = 'fixed' | 'percentage'

interface CouponRow {
  id: string
  code: string | null
  title: string
  description: string | null
  discount_type: DiscountType
  discount_value: number
  min_spend: number
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
  is_active: boolean
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<CouponRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCoupon, setEditingCoupon] = useState<CouponRow | null>(null)
  const [formData, setFormData] = useState<CouponFormState>({
    code: '',
    title: '',
    description: '',
    discount_type: 'fixed',
    discount_value: '',
    min_spend: '',
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

  const resetForm = () => {
    setFormData({
      code: '',
      title: '',
      description: '',
      discount_type: 'fixed',
      discount_value: '',
      min_spend: '',
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
      is_active: coupon.is_active,
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (coupon: CouponRow) => {
    if (!confirm(`確定要刪除折價券「${coupon.title}」嗎？`)) return
    try {
      const { error } = await supabase
        .from('coupons')
        .delete()
        .eq('id', coupon.id)

      if (error) throw error
      await fetchCoupons()
    } catch (error) {
      console.error('Error deleting coupon:', error)
      alert('刪除折價券失敗')
    }
  }

  const handleSubmit = async () => {
    const trimmedTitle = formData.title.trim()
    if (!trimmedTitle) {
      alert('請輸入折價券名稱')
      return
    }

    const discountValue = Number(formData.discount_value)
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      alert('請輸入有效的折扣數值')
      return
    }

    const minSpend = formData.min_spend ? Number(formData.min_spend) : 0
    if (!Number.isFinite(minSpend) || minSpend < 0) {
      alert('請輸入有效的最低消費金額(TWD)')
      return
    }

    const payload = {
      code: formData.code.trim() || null,
      title: trimmedTitle,
      description: formData.description.trim() || null,
      discount_type: formData.discount_type,
      discount_value: discountValue,
      min_spend: minSpend,
      is_active: formData.is_active,
    }

    try {
      if (editingCoupon) {
        const { error } = await supabase
          .from('coupons')
          .update(payload)
          .eq('id', editingCoupon.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('coupons')
          .insert([payload])

        if (error) throw error
      }

      setIsModalOpen(false)
      setEditingCoupon(null)
      await fetchCoupons()
    } catch (error) {
      console.error('Error saving coupon:', error)
      alert('儲存折價券失敗')
    }
  }

  const columns: Column<CouponRow>[] = [
    {
      key: 'title',
      label: '名稱',
      sortable: true,
      render: (item) => (
        <div className="space-y-1">
          <div className="font-medium text-neutral-900">{item.title}</div>
          {item.description && (
            <div className="text-xs text-neutral-500 line-clamp-2">{item.description}</div>
          )}
        </div>
      ),
    },
    {
      key: 'code',
      label: '代碼',
      sortable: true,
      render: (item) => (
        <span className="text-xs font-mono px-2 py-1 rounded bg-neutral-50 border border-neutral-200 text-neutral-700">
          {item.code || '系統發放'}
        </span>
      ),
    },
    {
      key: 'discount',
      label: '折扣(TWD/%)',
      sortable: false,
      render: (item) => (
        <div className="text-sm font-bold text-pink-500">
          {item.discount_type === 'fixed'
            ? `折抵 ${item.discount_value} (TWD)`
            : `折抵 ${item.discount_value}%`}
        </div>
      ),
    },
    {
      key: 'min_spend',
      label: '最低消費(TWD)',
      sortable: true,
      render: (item) => (
        <span className="text-sm text-neutral-700">
          {item.min_spend > 0 ? `滿 ${item.min_spend} (TWD) 可用` : '無限制'}
        </span>
      ),
    },
    {
      key: 'is_active',
      label: '狀態',
      sortable: true,
      render: (item) => (
        <span
          className={`px-2 py-1 rounded text-xs font-semibold ${
            item.is_active ? 'bg-green-50 text-green-700' : 'bg-neutral-100 text-neutral-600'
          }`}
        >
          {item.is_active ? '啟用中' : '已停用'}
        </span>
      ),
    },
    {
      key: 'created_at',
      label: '建立時間',
      sortable: true,
      render: (item) => (
        <span className="text-xs text-neutral-500 font-mono">
          {formatDateTime(item.created_at)}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '操作',
      render: (item) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleEdit(item)}
            className="text-blue-500 hover:text-blue-700 text-sm font-medium"
          >
            編輯
          </button>
          <button
            onClick={() => handleDelete(item)}
            className="text-red-500 hover:text-red-700 text-sm font-medium"
          >
            刪除
          </button>
        </div>
      ),
    },
  ]

  return (
    <AdminLayout pageTitle="折價券管理">
      <div className="space-y-6 p-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-neutral-900">折價券列表</h2>
            <p className="text-sm text-neutral-500 mt-1">
              管理折價券代碼、折扣內容與使用條件
            </p>
          </div>
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-medium"
          >
            + 新增折價券
          </button>
        </div>

        <PageCard>
          <DataTable
            data={coupons}
            columns={columns}
            keyField="id"
            emptyMessage={isLoading ? '載入中...' : '目前尚無折價券'}
          />
        </PageCard>

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
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                placeholder="例如：新會員折50元"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                顯示描述
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm h-20"
                placeholder="例如：首次下單滿 300 元折 50 元"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  折扣類型
                </label>
                <select
                  value={formData.discount_type}
                  onChange={(e) =>
                    setFormData({ ...formData, discount_type: e.target.value as DiscountType })
                  }
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white"
                >
                  <option value="fixed">固定金額(TWD)</option>
                  <option value="percentage">百分比</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  折扣數值
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.discount_value}
                  onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                  placeholder={formData.discount_type === 'fixed' ? '例如：50' : '例如：10 代表 10%'}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  最低消費金額(TWD)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.min_spend}
                  onChange={(e) => setFormData({ ...formData, min_spend: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                  placeholder="例如：300 (TWD)，留空代表無限制"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  折價券代碼
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
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
    </AdminLayout>
  )
}

