'use client'

import AdminLayout from '@/components/AdminLayout'
import Modal from '@/components/Modal'
import ConfirmDialog from '@/components/ConfirmDialog'
import Switch from '@/components/ui/Switch'
import Input from '@/components/ui/Input'
import SelectField from '@/components/ui/SelectField'
import Textarea from '@/components/ui/Textarea'
import { useState, useEffect } from 'react'
import { formatDateTime } from '@/utils/dateFormat'
import { useToast } from '@/contexts/ToastContext'
import { useAdmin } from '@/contexts/AdminContext'
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
  /** 結算設定。null＝跟隨全站預設，改全站預設時這家跟著變 */
  profit_share_percent: number | null
  withholding_rate_percent: number | null
  points_deduction_mode: 'A' | 'B' | null
  recycle_settlement_mode: 'charge' | 'margin' | null
  recycle_margin_supplier_share: number | null
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
  // 結算設定一律以空字串起手 —— 空＝跟隨全站預設，送出時正規化成 null
  profit_share_percent: '',
  withholding_rate_percent: '',
  points_deduction_mode: '',
  recycle_settlement_mode: '',
  recycle_margin_supplier_share: '',
}

/** 全站預設，用來當表單的佔位提示，讓人看得出留空會套到什麼 */
interface Defaults {
  supplierShare: number
  withholdingRate: number
  pointsMode: 'A' | 'B'
  recycleMode: 'charge' | 'margin'
  recycleMarginShare: number
}

const MODE_TEXT: Record<string, string> = {
  A: '廠商吸收 50%', B: '平台全吸收',
  // 回收價收不收（老闆 2026-08-25 拆成獨立設定，DB 值沿用舊的 charge／margin）
  charge: '收', margin: '不收',
}

export default function SuppliersPage() {
  const { toast } = useToast()
  /*
   * 結算設定（分潤比、代扣稅率、差額分潤）比廠商基本資料敏感得多，
   * 但這頁只要 suppliers 權限就進得來 —— 所以那一區另外看 suppliers_settings。
   * 伺服器端在 /api/admin/suppliers 也擋一次，前端只是不要畫出改不了的欄位。
   */
  const { user } = useAdmin()
  const canEditSettlement =
    user?.role === 'super_admin' || user?.role === 'superadmin'
    || (user?.permissions ?? []).includes('suppliers_settings')
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
  // 全站預設只拿來當佔位提示，讓人看得出留空會套到什麼
  const [defaults, setDefaults] = useState<Defaults | null>(null)

  useEffect(() => {
    fetch('/api/admin/supplier-settings')
      .then(r => r.json())
      .then(j => { if (j?.defaults) setDefaults(j.defaults) })
      .catch(() => { /* 拿不到就不顯示佔位數字，不影響編輯 */ })
  }, [])

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
      profit_share_percent: s.profit_share_percent === null ? '' : String(s.profit_share_percent),
      withholding_rate_percent: s.withholding_rate_percent === null ? '' : String(s.withholding_rate_percent),
      points_deduction_mode: s.points_deduction_mode ?? '',
      recycle_settlement_mode: s.recycle_settlement_mode ?? '',
      recycle_margin_supplier_share:
        s.recycle_margin_supplier_share === null ? '' : String(s.recycle_margin_supplier_share),
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
        // 空＝跟隨全站預設。送 null 而不是 ''，否則之後分不出「沒設」與「設成空」
        profit_share_percent: form.profit_share_percent === '' ? null : Number(form.profit_share_percent),
        withholding_rate_percent: form.withholding_rate_percent === '' ? null : Number(form.withholding_rate_percent),
        points_deduction_mode: form.points_deduction_mode || null,
        recycle_settlement_mode: form.recycle_settlement_mode || null,
        recycle_margin_supplier_share:
          form.recycle_margin_supplier_share === '' ? null : Number(form.recycle_margin_supplier_share),
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
      /*
        列表只放摘要。這五個值是「設定完很少再動」的東西，
        全部攤成欄位會讓這張表多出六欄、手機完全沒法看。
      */
      key: 'settlement', label: '結算設定',
      className: 'text-xs whitespace-nowrap',
      render: s => {
        if (!canEditSettlement) return <span className="text-neutral-300">—</span>
        const custom = s.profit_share_percent !== null
          || s.withholding_rate_percent !== null
          || s.points_deduction_mode !== null
          || s.recycle_settlement_mode !== null
          || s.recycle_margin_supplier_share !== null
        if (!custom) return <span className="text-neutral-400">預設</span>
        const share = s.profit_share_percent ?? defaults?.supplierShare
        const mode = s.recycle_settlement_mode ?? defaults?.recycleMode
        const margin = s.recycle_margin_supplier_share ?? defaults?.recycleMarginShare
        return (
          <span className="text-neutral-700">
            分潤 {share ?? '—'}%
            {mode === 'charge' ? ' · 收回收價' : ` · 差額 ${margin ?? '—'}%`}
          </span>
        )
      },
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

          {canEditSettlement && (
          <>
          {/*
            結算設定：留空＝跟隨全站預設（「廠商管理 → 廠商結算設定」），
            佔位提示直接把目前的預設值寫出來，才看得出空白會套到什麼。
            綠界手續費不在這裡 —— 那是平台與綠界之間的費率，不分廠商。
            版面跟上面的「物流寄件資訊」一致：分隔線 + 小灰標題，不另外框一個盒子。
          */}
          <div className="border-t border-neutral-100 pt-4">
            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3">
              結算設定
              <span className="ml-2 normal-case tracking-normal font-medium">留空＝跟隨全站預設</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">廠商分潤比 (%)</label>
                <Input
                  type="number" min={0} max={100} className="font-mono"
                  placeholder={defaults ? `預設 ${defaults.supplierShare}` : '預設'}
                  value={form.profit_share_percent}
                  onChange={(e) => setForm((f) => ({ ...f, profit_share_percent: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">代扣稅率 (%)</label>
                <Input
                  type="number" min={0} max={100} className="font-mono"
                  placeholder={defaults ? `預設 ${defaults.withholdingRate}` : '預設'}
                  value={form.withholding_rate_percent}
                  onChange={(e) => setForm((f) => ({ ...f, withholding_rate_percent: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">積分扣除模式</label>
                <SelectField
                  value={form.points_deduction_mode}
                  onChange={(e) => setForm((f) => ({ ...f, points_deduction_mode: e.target.value }))}
                >
                  <option value="">{defaults ? `預設（${MODE_TEXT[defaults.pointsMode]}）` : '照全站預設'}</option>
                  <option value="A">廠商吸收 50%</option>
                  <option value="B">平台全吸收</option>
                </SelectField>
              </div>
            </div>
          </div>

          {/*
            回收機制（老闆 2026-08-25）：兩件事**互相獨立**，不是二選一 ——
            回收價收不收是「退給玩家的代幣誰吸收」，差額分潤是「剩下的差額分多少給廠商」。
            舊版把差額分潤鎖在「不收回收價」底下，等於收了回收價就不能再分潤，
            但收回收價的廠商一樣可以再分他差額，所以拆成兩個欄位。
            DB 仍沿用 `recycle_settlement_mode`：charge＝收回收價、margin＝不收（平台吸收）。
          */}
          <div className="border-t border-neutral-100 pt-4">
            <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-3">回收機制</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">回收價</label>
                <SelectField
                  value={form.recycle_settlement_mode}
                  onChange={(e) => setForm((f) => ({ ...f, recycle_settlement_mode: e.target.value }))}
                >
                  <option value="">{defaults ? `預設（${MODE_TEXT[defaults.recycleMode]}）` : '照全站預設'}</option>
                  <option value="charge">收</option>
                  <option value="margin">不收</option>
                </SelectField>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">差額分潤 (%)</label>
                <Input
                  type="number" min={0} max={100} className="font-mono"
                  placeholder={defaults ? `預設 ${defaults.recycleMarginShare}` : '預設'}
                  value={form.recycle_margin_supplier_share}
                  onChange={(e) => setForm((f) => ({ ...f, recycle_margin_supplier_share: e.target.value }))}
                />
              </div>
            </div>
          </div>
          </>
          )}

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
