'use client'

import AdminLayout from '@/components/AdminLayout'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useState, useEffect } from 'react'
import { formatDateTime } from '@/utils/dateFormat'

interface Supplier {
  id: number
  name: string
  tax_id: string | null
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  address: string | null
  notes: string | null
  is_active: boolean
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
  notes: '',
  is_active: true,
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null)

  const fetchSuppliers = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/suppliers')
      if (!res.ok) throw new Error((await res.json()).error || '載入失敗')
      setSuppliers(await res.json())
    } catch (e: any) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchSuppliers() }, [])

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
      notes: s.notes ?? '',
      is_active: s.is_active,
    })
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { alert('廠商名稱為必填'); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        tax_id: form.tax_id || null,
        contact_name: form.contact_name || null,
        contact_phone: form.contact_phone || null,
        contact_email: form.contact_email || null,
        address: form.address || null,
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
      alert(e.message)
    } finally {
      setSaving(false)
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
      alert(e.message)
    }
  }

  return (
    <AdminLayout pageTitle="廠商管理" breadcrumbs={[{ label: '廠商管理', href: '/suppliers' }]}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-neutral-500">管理商品供應廠商資訊</p>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新增廠商
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-neutral-400 text-sm">載入中…</div>
          ) : suppliers.length === 0 ? (
            <div className="py-16 text-center text-neutral-400 text-sm">尚無廠商資料，點擊「新增廠商」開始建立</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-100">
                  <tr>
                    {['廠商名稱', '統編', '聯絡人', '電話', 'Email', '狀態', '備註', '建立時間', '操作'].map((h) => (
                      <th key={h} className="text-left px-4 py-2 text-xs font-medium text-neutral-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {suppliers.map((s) => (
                    <tr key={s.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-3 font-medium text-neutral-900">{s.name}</td>
                      <td className="px-4 py-3 text-neutral-600 font-mono text-xs">{s.tax_id ?? '—'}</td>
                      <td className="px-4 py-3 text-neutral-600">{s.contact_name ?? '—'}</td>
                      <td className="px-4 py-3 text-neutral-600">{s.contact_phone ?? '—'}</td>
                      <td className="px-4 py-3 text-neutral-500 text-xs">{s.contact_email ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-500'}`}>
                          {s.is_active ? '啟用' : '停用'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-500 max-w-[200px] truncate">{s.notes ?? '—'}</td>
                      <td className="px-4 py-3 text-neutral-400 text-xs whitespace-nowrap">{formatDateTime(s.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEdit(s)}
                            className="text-xs px-3 py-1 border border-neutral-200 rounded hover:bg-neutral-50 transition-colors"
                          >
                            編輯
                          </button>
                          <button
                            onClick={() => setDeleteTarget(s)}
                            className="text-xs px-3 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50 transition-colors"
                          >
                            刪除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="例：廠商公司名稱"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">統一編號</label>
              <input
                type="text"
                value={form.tax_id}
                onChange={(e) => setForm((f) => ({ ...f, tax_id: e.target.value }))}
                placeholder="8碼統編"
                maxLength={8}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">聯絡人</label>
              <input
                type="text"
                value={form.contact_name}
                onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">聯絡電話</label>
              <input
                type="text"
                value={form.contact_phone}
                onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">Email</label>
            <input
              type="email"
              value={form.contact_email}
              onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">地址</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">備註</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="w-4 h-4 rounded border-neutral-300 text-primary focus:ring-primary/30"
            />
            <label htmlFor="is_active" className="text-sm text-neutral-700">啟用</label>
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

      {/* Delete Confirm */}
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
