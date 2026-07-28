'use client'

import { useState, useEffect, useCallback } from 'react'
import AdminLayout from '@/components/AdminLayout'

const LEVEL_LABELS: Record<string, { label: string; color: string }> = {
  normal:      { label: '普通', color: 'bg-gray-100 text-gray-700' },
  rare:        { label: '稀有', color: 'bg-blue-100 text-blue-700' },
  super_rare:  { label: 'SR', color: 'bg-purple-100 text-purple-700' },
  ultra_rare:  { label: 'UR', color: 'bg-yellow-100 text-yellow-800' },
}

interface SlotPrize {
  id: number
  name: string
  level: string
  image_url: string | null
  description: string | null
  remaining: number | null
  is_active: boolean
  created_at: string
}

const EMPTY_FORM = {
  name: '',
  level: 'normal',
  image_url: '',
  description: '',
  remaining: '',
}

export default function SlotPrizesPage() {
  const [prizes, setPrizes] = useState<SlotPrize[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  const fetchPrizes = useCallback(async () => {
    const res = await fetch('/api/admin/slot/prizes')
    const json = await res.json()
    setPrizes(json.prizes ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchPrizes() }, [fetchPrizes])

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowModal(true)
  }

  function openEdit(p: SlotPrize) {
    setEditingId(p.id)
    setForm({
      name: p.name,
      level: p.level,
      image_url: p.image_url ?? '',
      description: p.description ?? '',
      remaining: p.remaining != null ? String(p.remaining) : '',
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    const body = {
      name: form.name.trim(),
      level: form.level,
      image_url: form.image_url.trim() || null,
      description: form.description.trim() || null,
      remaining: form.remaining !== '' ? parseInt(form.remaining) : null,
    }

    const url = editingId
      ? `/api/admin/slot/prizes/${editingId}`
      : '/api/admin/slot/prizes'
    const method = editingId ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      setShowModal(false)
      fetchPrizes()
    }
    setSaving(false)
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/admin/slot/prizes/${id}`, { method: 'DELETE' })
    if (res.ok) {
      fetchPrizes()
    } else {
      const json = await res.json()
      alert(json.error ?? '刪除失敗')
    }
    setDeleteConfirm(null)
  }

  async function toggleActive(p: SlotPrize) {
    await fetch(`/api/admin/slot/prizes/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !p.is_active }),
    })
    fetchPrizes()
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">品項管理</h1>
            <p className="text-sm text-gray-500 mt-1">挑戰機台專用品項，與一般商品品項獨立</p>
          </div>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
          >
            + 新增品項
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400">載入中…</div>
        ) : prizes.length === 0 ? (
          <div className="text-center py-16 text-gray-400">尚無品項，點擊右上角新增</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 font-medium">
                <tr>
                  <th className="text-left px-4 py-3 w-16">圖片</th>
                  <th className="text-left px-4 py-3">品項名稱</th>
                  <th className="text-left px-4 py-3 w-24">稀有度</th>
                  <th className="text-left px-4 py-3 w-24">庫存</th>
                  <th className="text-left px-4 py-3 w-20">狀態</th>
                  <th className="text-right px-4 py-3 w-28">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {prizes.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-10 h-10 object-cover rounded" />
                      ) : (
                        <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-gray-300 text-xs">無</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{p.name}</div>
                      {p.description && <div className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{p.description}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${LEVEL_LABELS[p.level]?.color ?? 'bg-gray-100 text-gray-600'}`}>
                        {LEVEL_LABELS[p.level]?.label ?? p.level}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-gray-700">
                      {p.remaining != null ? p.remaining : '∞'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(p)}
                        className={`px-2 py-0.5 rounded text-xs font-medium ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                      >
                        {p.is_active ? '上架' : '下架'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => openEdit(p)}
                        className="text-indigo-600 hover:underline text-xs"
                      >
                        編輯
                      </button>
                      {deleteConfirm === p.id ? (
                        <>
                          <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:underline text-xs">確認</button>
                          <button onClick={() => setDeleteConfirm(null)} className="text-gray-400 hover:underline text-xs">取消</button>
                        </>
                      ) : (
                        <button onClick={() => setDeleteConfirm(p.id)} className="text-red-400 hover:text-red-600 hover:underline text-xs">刪除</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 新增 / 編輯 Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">
                {editingId ? '編輯品項' : '新增品項'}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">品項名稱 *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="例：特製帆布袋"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">稀有度</label>
                  <select
                    value={form.level}
                    onChange={e => setForm(f => ({ ...f, level: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {Object.entries(LEVEL_LABELS).map(([val, { label }]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">圖片網址</label>
                  <input
                    type="text"
                    value={form.image_url}
                    onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
                    placeholder="https://..."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
                  <textarea
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">庫存數量</label>
                  <input
                    type="number"
                    min="0"
                    value={form.remaining}
                    onChange={e => setForm(f => ({ ...f, remaining: e.target.value }))}
                    placeholder="留空 = 無限"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">留空表示無限庫存</p>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.name.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? '儲存中…' : '儲存'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
