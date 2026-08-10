'use client'

import AdminLayout from '@/components/AdminLayout'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import Switch from '@/components/ui/Switch'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import { useState, useEffect } from 'react'
import { formatDateTime } from '@/utils/dateFormat'
import { useToast } from '@/contexts/ToastContext'
import { ListTableCard, RowAction, type ListColumn } from '@/components'

interface Supplier {
  id: number
  name: string
  tax_id: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  address: string | null
  sender_name: string | null
  sender_zip_code: string | null
  sender_address: string | null
  notes: string | null
  is_active: boolean
  /** 平台自營。這一筆不可刪除，列表上也不顯示刪除鈕 */
  is_platform?: boolean
  created_at: string
  updated_at: string
}

const EMPTY_FORM = {
  name: '',
  tax_id: '',
  contact_name: '',
  contact_phone: '',
  contact_email: '',
  address: '',
  sender_name: '',
  sender_zip_code: '',
  sender_address: '',
  notes: '',
  is_active: true,
}

export default function SuppliersPage() {
  const { toast } = useToast()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null)
  // 停用／啟用從編輯視窗搬到列表的狀態欄：那是一個獨立的決定，
  // 不該要人先進編輯、改勾選、再按儲存
  const [toggleTarget, setToggleTarget] = useState<Supplier | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('all')

  const fetchSuppliers = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/suppliers')
      if (!res.ok) throw new Error((await res.json()).error || '載入失敗')
      setSuppliers(await res.json())
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSuppliers() }, [])

  const filtered = suppliers.filter(s => {
    if (selectedStatus !== 'all' && (selectedStatus === 'active') !== s.is_active) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const hit = [s.name, s.tax_id, s.contact_name, s.contact_phone, s.contact_email]
        .some(v => (v ?? '').toLowerCase().includes(q))
      if (!hit) return false
    }
    return true
  })

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setIsModalOpen(true)
  }

  const openEdit = (s: Supplier) => {
    setEditing(s)
    setForm({
      name: s.name,
      tax_id: s.tax_id ?? '',
      contact_name: s.contact_name ?? '',
      contact_phone: s.contact_phone ?? '',
      contact_email: s.contact_email ?? '',
      address: s.address ?? '',
      sender_name: s.sender_name ?? '',
      sender_zip_code: s.sender_zip_code ?? '',
      sender_address: s.sender_address ?? '',
      notes: s.notes ?? '',
      is_active: s.is_active,
    })
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast('廠商名稱為必填', 'error'); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        tax_id: form.tax_id || null,
        contact_name: form.contact_name || null,
        contact_phone: form.contact_phone || null,
        contact_email: form.contact_email || null,
        address: form.address || null,
        sender_name: form.sender_name || null,
        sender_zip_code: form.sender_zip_code || null,
        sender_address: form.sender_address || null,
        notes: form.notes || null,
        is_active: form.is_active,
      }
      const res = editing
        ? await fetch(`/api/admin/suppliers/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/admin/suppliers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })

      if (!res.ok) throw new Error((await res.json()).error || '儲存失敗')
      setIsModalOpen(false)
      fetchSuppliers()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async () => {
    if (!toggleTarget) return
    const next = !toggleTarget.is_active
    try {
      const res = await fetch(`/api/admin/suppliers/${toggleTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: next }),
      })
      if (!res.ok) throw new Error((await res.json()).error || '操作失敗')
      toast(next ? '已啟用' : '已停用')
      fetchSuppliers()
    } catch (e) {
      toast(e instanceof Error ? e.message : '操作失敗', 'error')
    } finally {
      setToggleTarget(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/admin/suppliers/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error || '刪除失敗')
      setDeleteTarget(null)
      fetchSuppliers()
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const columns: ListColumn<Supplier>[] = [
    {
      key: 'name', label: '廠商名稱',
      sortValue: s => s.name,
      // 標記出平台自營那筆。列表上一堆名字時，看得出哪一個是自己家的
      render: s => (
        <span className="inline-flex items-center gap-2 font-medium text-neutral-900">
          {s.name}
          {s.is_platform && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-black text-primary">
              平台自營
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'taxId', label: '統編',
      className: 'font-mono text-xs',
      render: s => <>{s.tax_id ?? '—'}</>,
    },
    {
      key: 'contactName', label: '聯絡人',
      render: s => <>{s.contact_name ?? '—'}</>,
    },
    {
      key: 'contactPhone', label: '電話',
      render: s => <>{s.contact_phone ?? '—'}</>,
    },
    {
      key: 'contactEmail', label: 'Email',
      className: 'text-xs',
      render: s => <>{s.contact_email ?? '—'}</>,
    },
    {
      key: 'status', label: '狀態',
      sortValue: s => (s.is_active ? 1 : 0),
      // 平台自營那筆不給停用：自營商品都掛在它底下。
      // Switch 直接鎖死，比讓人按下去再跳錯誤好。
      // 切換有登入權限等後果，所以按下去先開確認彈窗，不直接生效
      render: s => (
        <Switch
          checked={s.is_active}
          disabled={!!s.is_platform}
          onCheckedChange={() => setToggleTarget(s)}
        />
      ),
    },
    {
      key: 'notes', label: '備註',
      className: 'max-w-[200px] truncate',
      render: s => <>{s.notes ?? '—'}</>,
    },
    {
      key: 'createdAt', label: '建立時間',
      sortValue: s => new Date(s.created_at).getTime(),
      className: 'font-mono',
      render: s => <>{formatDateTime(s.created_at)}</>,
    },
    {
      key: 'operations', label: '操作', isActions: true,
      render: s => (
        <div className="flex items-center gap-2">
          <RowAction tone="primary" onClick={() => openEdit(s)}>編輯</RowAction>
          {!s.is_platform && (
            <RowAction tone="danger" onClick={() => setDeleteTarget(s)}>刪除</RowAction>
          )}
        </div>
      ),
    },
  ]

  return (
    <AdminLayout pageTitle="廠商管理">
      <div className="space-y-6">
        <ListTableCard
          pageKey="suppliers"
          data={filtered}
          columns={columns}
          keyField="id"
          isLoading={loading}
          emptyMessage={suppliers.length === 0 ? '尚無廠商資料，點擊「新增廠商」開始建立' : '沒有找到符合條件的廠商'}
          searchPlaceholder="搜尋廠商名稱、統編、聯絡人..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          addButtonText="+ 新增廠商"
          onAddClick={openCreate}
          filters={[
            {
              key: 'status', label: '狀態',
              value: selectedStatus, onChange: setSelectedStatus,
              options: [
                { value: 'all', label: '全部狀態' },
                { value: 'active', label: '啟用' },
                { value: 'inactive', label: '停用' },
              ],
            },
          ]}
        />
      </div>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editing ? '編輯廠商' : '新增廠商'}
      >
        <div className="space-y-4 p-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">廠商名稱 <span className="text-red-500">*</span></label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="例：廠商公司名稱"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">統一編號</label>
              <Input
                value={form.tax_id}
                onChange={(e) => setForm((f) => ({ ...f, tax_id: e.target.value }))}
                placeholder="8碼統編"
                maxLength={8} className="font-mono"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">聯絡人</label>
              <Input
                value={form.contact_name}
                onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">聯絡電話</label>
              <Input
                value={form.contact_phone}
                onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Email</label>
            <Input
              type="email"
              value={form.contact_email}
              onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">公司地址</label>
            <Input
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </div>

          {/* 寄件資訊（物流用） */}
          <div className="border-t border-neutral-100 pt-4">
            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3">物流寄件資訊</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    寄件人姓名
                    <span className="text-xs text-neutral-400 ml-1">2-5中文字</span>
                  </label>
                  <Input
                    value={form.sender_name}
                    onChange={(e) => setForm((f) => ({ ...f, sender_name: e.target.value }))}
                    placeholder="空白則使用聯絡人"
                    maxLength={10}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">寄件郵遞區號</label>
                  <Input
                    value={form.sender_zip_code}
                    onChange={(e) => setForm((f) => ({ ...f, sender_zip_code: e.target.value }))}
                    placeholder="例：100"
                    maxLength={6} className="font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  寄件地址
                  <span className="text-xs text-neutral-400 ml-1">空白則使用公司地址</span>
                </label>
                <Input
                  value={form.sender_address}
                  onChange={(e) => setForm((f) => ({ ...f, sender_address: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">備註</label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} className="resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-sm border border-neutral-200 rounded-lg hover:bg-neutral-50 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? '儲存中…' : '儲存'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Toggle Active Confirm */}
      <ConfirmDialog
        isOpen={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        onConfirm={handleToggleActive}
        title={toggleTarget?.is_active ? '停用廠商' : '啟用廠商'}
        message={
          toggleTarget?.is_active
            ? `停用「${toggleTarget?.name}」之後，新商品不能再指派給它，它的廠商帳號也登不進後台。既有商品、訂單與結算都不受影響。`
            : `啟用「${toggleTarget?.name}」之後，它會重新出現在商品的廠商選項裡，廠商帳號也能再登入。`
        }
        confirmText={toggleTarget?.is_active ? '停用' : '啟用'}
        type={toggleTarget?.is_active ? 'warning' : 'info'}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="刪除廠商"
        message={`確定要刪除廠商「${deleteTarget?.name}」嗎？相關商品的廠商欄位將被清空。`}
        confirmText="刪除"
        type="danger"
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </AdminLayout>
  )
}
