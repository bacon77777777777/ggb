'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { AdminLayout, PageCard, Modal, SearchToolbar, SortableTableHeader } from '@/components'
import Badge from '@/components/ui/Badge'
import Switch from '@/components/ui/Switch'
import { useToast } from '@/contexts/ToastContext'

const LEVEL_OPTIONS = [
  { value: '一等獎', label: '一等獎' },
  { value: '二等獎', label: '二等獎' },
  { value: '三等獎', label: '三等獎' },
  { value: '四等獎', label: '四等獎' },
  { value: '五等獎', label: '五等獎' },
  { value: '六等獎', label: '六等獎' },
  { value: '七等獎', label: '七等獎' },
  { value: '八等獎', label: '八等獎' },
  { value: '挑戰獎', label: '挑戰獎' },
]

const LEVEL_COLORS: Record<string, 'gray' | 'blue' | 'purple' | 'amber' | 'red'> = {
  '一等獎': 'amber',
  '二等獎': 'purple',
  '三等獎': 'blue',
  '四等獎': 'blue',
  '五等獎': 'gray',
  '六等獎': 'gray',
  '七等獎': 'gray',
  '八等獎': 'gray',
  '挑戰獎': 'red',
}

interface Supplier { id: number; name: string }

interface SlotPrize {
  id: number
  name: string
  level: string
  image_url: string | null
  remaining: number | null
  supplier_id: number | null
  suppliers: Supplier | null
  is_active: boolean
  created_at: string
}

const EMPTY_FORM = {
  name: '',
  level: '一等獎',
  image_url: '',
  remaining: '',
  supplier_id: '',
}

const COLUMNS = [
  { key: 'image',      label: '圖片' },
  { key: 'name',       label: '品項名稱' },
  { key: 'level',      label: '稀有度' },
  { key: 'supplier',   label: '廠商' },
  { key: 'remaining',  label: '庫存' },
  { key: 'status',     label: '上架' },
  { key: 'operations', label: '操作' },
]

const INPUT = 'w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-sm'

export default function SlotPrizesPage() {
  const { toast } = useToast()
  const [prizes, setPrizes] = useState<SlotPrize[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [levelFilter, setLevelFilter] = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [tableDensity, setTableDensity] = useState<'compact' | 'normal' | 'comfortable'>('compact')
  const [sortField, setSortField] = useState('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    Object.fromEntries(COLUMNS.map(c => [c.key, true]))
  )
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchPrizes = useCallback(async () => {
    setIsLoading(true)
    const res = await fetch('/api/admin/slot/prizes')
    const json = await res.json()
    setPrizes(json.prizes ?? [])
    setSuppliers(json.suppliers ?? [])
    setIsLoading(false)
  }, [])

  useEffect(() => { fetchPrizes() }, [fetchPrizes])

  const handleSort = (field: string) => {
    if (sortField === field) setSortDirection(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDirection('asc') }
  }

  const getDensityClasses = () => {
    switch (tableDensity) {
      case 'compact':     return 'py-2 px-2'
      case 'normal':      return 'py-3 px-4'
      case 'comfortable': return 'py-4 px-6'
    }
  }

  function resetImageState() {
    setImageFile(null)
    setImagePreview('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    resetImageState()
    setShowModal(true)
  }

  function openEdit(p: SlotPrize) {
    setEditingId(p.id)
    setForm({
      name: p.name,
      level: p.level,
      image_url: p.image_url ?? '',
      remaining: p.remaining != null ? String(p.remaining) : '',
      supplier_id: p.supplier_id != null ? String(p.supplier_id) : '',
    })
    resetImageState()
    setImagePreview(p.image_url ?? '')
    setShowModal(true)
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }

  async function handleSave() {
    if (!form.name.trim()) { toast('請填寫品項名稱', 'error'); return }
    if (!form.supplier_id) { toast('請選擇廠商', 'error'); return }
    if (form.remaining === '') { toast('請填寫庫存數量', 'error'); return }
    setSaving(true)
    try {
      let finalImageUrl = form.image_url
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop() || 'jpg'
        const fileName = `slot-prize-${Date.now()}.${fileExt}`
        const uploadForm = new FormData()
        uploadForm.append('file', imageFile)
        uploadForm.append('bucket', 'products')
        uploadForm.append('path', fileName)
        const uploadRes = await fetch('/api/admin/upload', { method: 'POST', body: uploadForm })
        const uploadJson = await uploadRes.json()
        if (!uploadRes.ok) throw new Error(uploadJson?.error || '圖片上傳失敗')
        finalImageUrl = String(uploadJson?.publicUrl || '')
      }

      const url = editingId ? `/api/admin/slot/prizes/${editingId}` : '/api/admin/slot/prizes'
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          level: form.level,
          image_url: finalImageUrl || null,
          remaining: parseInt(form.remaining),
          supplier_id: parseInt(form.supplier_id),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast(editingId ? '更新成功' : '品項建立成功')
      setShowModal(false)
      fetchPrizes()
    } catch (e: any) {
      toast(e.message ?? '儲存失敗', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/admin/slot/prizes/${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast('已刪除')
      fetchPrizes()
    } else {
      const json = await res.json()
      toast(json.error ?? '刪除失敗', 'error')
    }
    setDeleteConfirm(null)
  }

  async function toggleActive(p: SlotPrize) {
    const res = await fetch(`/api/admin/slot/prizes/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !p.is_active }),
    })
    if (res.ok) {
      toast(p.is_active ? '已下架' : '已上架')
      setPrizes(prev => prev.map(x => x.id === p.id ? { ...x, is_active: !x.is_active } : x))
    }
  }

  const filtered = prizes
    .filter(p => {
      if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase()) && !(p.suppliers?.name ?? '').toLowerCase().includes(searchQuery.toLowerCase())) return false
      if (statusFilter === 'active' && !p.is_active) return false
      if (statusFilter === 'inactive' && p.is_active) return false
      if (levelFilter !== 'all' && p.level !== levelFilter) return false
      if (supplierFilter !== 'all' && String(p.supplier_id) !== supplierFilter) return false
      return true
    })
    .sort((a, b) => {
      let av: any, bv: any
      switch (sortField) {
        case 'name':      av = a.name ?? '';   bv = b.name ?? '';   break
        case 'level':     av = a.level ?? '';  bv = b.level ?? '';  break
        case 'supplier':  av = a.suppliers?.name ?? ''; bv = b.suppliers?.name ?? ''; break
        case 'remaining': av = a.remaining ?? 99999; bv = b.remaining ?? 99999; break
        default:          av = a.created_at;   bv = b.created_at
      }
      if (typeof av === 'string') return sortDirection === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDirection === 'asc' ? av - bv : bv - av
    })

  const show = (key: string) => visibleColumns[key] !== false
  const dc = getDensityClasses()
  const levelLabel = (level: string) => LEVEL_OPTIONS.find(o => o.value === level)?.label ?? level

  return (
    <AdminLayout pageTitle="品項管理">
      <PageCard>
        <SearchToolbar
          searchPlaceholder="搜尋品項名稱、廠商..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          showAddButton={true}
          addButtonText="+ 新增品項"
          onAddClick={openCreate}
          showDensity={true}
          density={tableDensity}
          onDensityChange={setTableDensity}
          showFilter={true}
          filterOptions={[
            {
              key: 'supplier',
              label: '廠商',
              type: 'select',
              value: supplierFilter,
              onChange: setSupplierFilter,
              options: [
                { value: 'all', label: '全部廠商' },
                ...suppliers.map(s => ({ value: String(s.id), label: s.name })),
              ],
            },
            {
              key: 'level',
              label: '稀有度',
              type: 'select',
              value: levelFilter,
              onChange: setLevelFilter,
              options: [
                { value: 'all', label: '全部稀有度' },
                ...LEVEL_OPTIONS.map(o => ({ value: o.value, label: o.label })),
              ],
            },
            {
              key: 'status',
              label: '上架狀態',
              type: 'select',
              value: statusFilter,
              onChange: setStatusFilter,
              options: [
                { value: 'all',      label: '全部狀態' },
                { value: 'active',   label: '上架中' },
                { value: 'inactive', label: '已下架' },
              ],
            },
          ]}
          showColumnToggle={true}
          columns={COLUMNS.map(c => ({ key: c.key, label: c.label, visible: visibleColumns[c.key] }))}
          onColumnToggle={(key, visible) => setVisibleColumns(prev => ({ ...prev, [key]: visible }))}
        />

        {isLoading ? (
          <div className="py-12 text-center text-sm text-neutral-400">載入中...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-neutral-400">
            {searchQuery || statusFilter !== 'all' || levelFilter !== 'all' || supplierFilter !== 'all'
              ? '找不到符合的品項'
              : '尚無品項，點擊右上角新增'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  {show('image')      && <th className={`${dc} text-left text-xs font-semibold text-neutral-500 whitespace-nowrap`}>圖片</th>}
                  {show('name')       && <SortableTableHeader sortKey="name"      currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={dc}>品項名稱</SortableTableHeader>}
                  {show('level')      && <SortableTableHeader sortKey="level"     currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={dc}>稀有度</SortableTableHeader>}
                  {show('supplier')   && <SortableTableHeader sortKey="supplier"  currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={dc}>廠商</SortableTableHeader>}
                  {show('remaining')  && <SortableTableHeader sortKey="remaining" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort} className={dc}>庫存</SortableTableHeader>}
                  {show('status')     && <th className={`${dc} text-left text-xs font-semibold text-neutral-500 whitespace-nowrap`}>上架</th>}
                  {show('operations') && <th className={`${dc} text-left text-xs font-semibold text-neutral-500 whitespace-nowrap`}>操作</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-neutral-50 transition-colors">
                    {show('image') && (
                      <td className={dc}>
                        {p.image_url
                          ? <img src={p.image_url} alt={p.name} className="w-10 h-10 object-cover rounded-lg" />
                          : <div className="w-10 h-10 bg-neutral-100 rounded-lg flex items-center justify-center text-neutral-300 text-xs">無</div>
                        }
                      </td>
                    )}
                    {show('name') && (
                      <td className={`${dc} font-medium text-neutral-900 whitespace-nowrap`}>
                        <div>{p.name}</div>
                      </td>
                    )}
                    {show('level') && (
                      <td className={`${dc} whitespace-nowrap`}>
                        <Badge color={LEVEL_COLORS[p.level] ?? 'gray'}>{levelLabel(p.level)}</Badge>
                      </td>
                    )}
                    {show('supplier') && (
                      <td className={`${dc} whitespace-nowrap text-neutral-700`}>
                        {p.suppliers?.name ?? <span className="text-neutral-300">—</span>}
                      </td>
                    )}
                    {show('remaining') && (
                      <td className={`${dc} text-neutral-600 whitespace-nowrap tabular-nums`}>
                        {p.remaining != null ? p.remaining : <span className="text-green-600">∞</span>}
                      </td>
                    )}
                    {show('status') && (
                      <td className={`${dc} whitespace-nowrap`}>
                        <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} />
                      </td>
                    )}
                    {show('operations') && (
                      <td className={`${dc} whitespace-nowrap`}>
                        <div className="flex items-center gap-3">
                          <button onClick={() => openEdit(p)} className="text-primary text-sm font-medium">編輯</button>
                          {deleteConfirm === p.id ? (
                            <>
                              <button onClick={() => handleDelete(p.id)} className="text-red-600 text-sm font-medium">確認</button>
                              <button onClick={() => setDeleteConfirm(null)} className="text-neutral-400 text-sm">取消</button>
                            </>
                          ) : (
                            <button onClick={() => setDeleteConfirm(p.id)} className="text-red-500 hover:text-red-700 text-sm font-medium">刪除</button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageCard>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingId ? '編輯品項' : '新增品項'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">品項名稱 *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="例：特製帆布袋"
              className={INPUT}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              廠商 <span className="text-red-500">*</span>
            </label>
            <select
              value={form.supplier_id}
              onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}
              className={INPUT}
            >
              <option value="">— 請選擇廠商 —</option>
              {suppliers.map(s => (
                <option key={s.id} value={String(s.id)}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">稀有度</label>
            <select
              value={form.level}
              onChange={e => setForm(f => ({ ...f, level: e.target.value }))}
              className={INPUT}
            >
              {LEVEL_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">品項圖片</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className={INPUT}
            />
            {imagePreview && (
              <img src={imagePreview} alt="預覽" className="mt-2 w-full h-32 object-cover rounded-lg" />
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              庫存數量 <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0"
              value={form.remaining}
              onChange={e => setForm(f => ({ ...f, remaining: e.target.value }))}
              placeholder="請輸入庫存數量"
              className={INPUT}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors">
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-60"
            >
              {saving ? '儲存中...' : '儲存'}
            </button>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  )
}
