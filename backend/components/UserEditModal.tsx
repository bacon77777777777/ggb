'use client'

/**
 * 編輯會員（彈窗版）
 *
 * 原本是獨立頁 `/users/[id]/edit`，老闆指定改成跟「編輯管理者」一樣的彈窗。
 * 舊頁面保留成轉址殼（deep link 相容），實際編輯都走這裡。
 *
 * ── 密碼欄位 ──
 * 跟管理者編輯一樣放明文輸入框，但**顯示不了目前密碼**：
 * 會員走 Supabase Auth，密碼是 bcrypt 雜湊，連資料庫裡都沒有明文
 * （管理者能顯示是因為 admins 表本來就存明文字串）。
 * 而且多數玩家用驗證碼／LINE 登入，根本沒有密碼。
 * 所以這欄是「填了就改成新密碼、留空不動」。
 */

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Modal from '@/components/Modal'
import SelectField from '@/components/ui/SelectField'
import { useToast } from '@/contexts/ToastContext'

interface UserForm {
  name: string
  email: string
  phone_number: string
  avatar_url: string
  gender: string
  birthday: string
  recipient_name: string
  recipient_phone: string
  address: string
  tokens: number | string
  points: number | string
  status: 'active' | 'inactive'
}

const EMPTY: UserForm = {
  name: '', email: '', phone_number: '', avatar_url: '', gender: '', birthday: '',
  recipient_name: '', recipient_phone: '', address: '', tokens: 0, points: 0, status: 'active',
}

const PRESET_AVATARS = Array.from({ length: 8 }, (_, i) => `/images/avatar/${String(i + 1).padStart(2, '0')}.webp`)

const FIELD_CLASS =
  'w-full px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-neutral-700">{label}</label>
      {children}
    </div>
  )
}

export default function UserEditModal({ userId, onClose, onSaved }: {
  /** null = 關閉 */
  userId: string | null
  onClose: () => void
  /** 儲存成功後呼叫（給列表刷新用） */
  onSaved?: () => void
}) {
  const { toast } = useToast()
  const [form, setForm] = useState<UserForm>(EMPTY)
  const [newPassword, setNewPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof UserForm>(k: K, v: UserForm[K]) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setIsLoading(true)
    setNewPassword('')
    setShowAvatarPicker(false)
    void (async () => {
      try {
        const res = await fetch(`/api/admin/users/${userId}`)
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || '載入失敗')
        const { user } = await res.json()
        if (cancelled) return
        setForm({
          name: user.name || '',
          email: user.email || '',
          phone_number: user.phone_number || '',
          avatar_url: user.avatar_url || '',
          gender: user.gender || '',
          birthday: user.birthday ? String(user.birthday).slice(0, 10) : '',
          recipient_name: user.recipient_name || '',
          recipient_phone: user.recipient_phone || '',
          address: user.address || '',
          tokens: user.tokens ?? 0,
          points: user.points ?? 0,
          status: user.status || 'active',
        })
      } catch (e: any) {
        toast(e?.message || '載入會員資料失敗', 'error')
        onClose()
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint 會要求 onClose/toast 進依賴，但它們是穩定引用，只想在換人時重載
  }, [userId])

  const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'png'
      const fd = new FormData()
      fd.append('file', file)
      fd.append('bucket', 'avatars')
      fd.append('path', `user-avatars/${userId}_${Date.now()}.${ext}`)
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || '上傳失敗')
      const { publicUrl } = await res.json()
      set('avatar_url', publicUrl)
      setShowAvatarPicker(false)
    } catch (err: any) {
      toast(err?.message || '上傳失敗', 'error')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const save = async () => {
    if (!userId) return
    setIsSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        phone_number: form.phone_number,
        avatar_url: form.avatar_url,
        gender: form.gender,
        birthday: form.birthday || null,
        recipient_name: form.recipient_name,
        recipient_phone: form.recipient_phone,
        address: form.address,
        tokens: Number(form.tokens),
        points: Number(form.points),
        status: form.status,
      }
      // 密碼留空 = 不變更（API 收到 password 欄位才會動 Supabase Auth）
      if (newPassword.trim()) payload.password = newPassword.trim()

      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || '儲存失敗')
      toast('已儲存')
      onSaved?.()
      onClose()
    } catch (e: any) {
      toast(e?.message || '儲存失敗', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal isOpen={userId !== null} onClose={onClose} title="編輯會員" size="lg">
      {isLoading ? (
        <div className="py-10 text-center text-sm text-neutral-400">載入中…</div>
      ) : (
        <div className="space-y-4">
          {/* 頭像 */}
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-neutral-200 bg-neutral-100">
              {form.avatar_url ? (
                <Image src={form.avatar_url} alt="avatar" fill className="object-cover" unoptimized />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl text-neutral-400">
                  {form.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowAvatarPicker(v => !v)}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 transition-colors hover:bg-neutral-50"
              >
                {showAvatarPicker ? '收起' : '選擇預設'}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {uploading ? '上傳中…' : '上傳圖片'}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadAvatar} />
            </div>
          </div>
          {showAvatarPicker && (
            <div className="flex flex-wrap gap-2">
              {PRESET_AVATARS.map(url => (
                <button
                  key={url}
                  type="button"
                  onClick={() => { set('avatar_url', url); setShowAvatarPicker(false) }}
                  className={`relative h-12 w-12 overflow-hidden rounded-full border-2 transition-all ${
                    form.avatar_url === url ? 'scale-110 border-primary' : 'border-neutral-200 hover:border-primary/50'
                  }`}
                >
                  <Image src={url} alt="" fill className="object-cover" unoptimized />
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="顯示名稱">
              <input value={form.name} onChange={e => set('name', e.target.value)} className={FIELD_CLASS} />
            </Field>
            <Field label="Email">
              <input value={form.email} onChange={e => set('email', e.target.value)} className={FIELD_CLASS} />
            </Field>
          </div>

          {/* 密碼：位置與樣式照管理者編輯（明文、無眼睛開關） */}
          <Field label="密碼">
            <input
              type="text"
              autoComplete="off"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="設定新密碼（留空不變更）"
              className={FIELD_CLASS}
            />
            <p className="mt-1 text-xs text-neutral-400">
              會員密碼由登入系統加密儲存，看不到目前密碼（多數玩家用驗證碼或 LINE 登入，本來就沒有密碼）。
              這裡填入的內容會直接設成新密碼。
            </p>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="性別">
              <SelectField value={form.gender} onChange={e => set('gender', e.target.value)} className={FIELD_CLASS}>
                <option value="">未設定</option>
                <option value="male">男</option>
                <option value="female">女</option>
                <option value="other">其他</option>
              </SelectField>
            </Field>
            <Field label="生日">
              <input type="date" value={form.birthday} onChange={e => set('birthday', e.target.value)} className={FIELD_CLASS} />
            </Field>
            <Field label="手機號碼">
              <input value={form.phone_number} onChange={e => set('phone_number', e.target.value)} placeholder="0912345678" className={FIELD_CLASS} />
            </Field>
            <Field label="狀態">
              <SelectField value={form.status} onChange={e => set('status', e.target.value as 'active' | 'inactive')} className={FIELD_CLASS}>
                <option value="active">啟用</option>
                <option value="inactive">停用</option>
              </SelectField>
            </Field>
          </div>

          <div className="border-t border-neutral-100 pt-3">
            <div className="mb-2 text-sm font-semibold text-neutral-800">收件資料</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="收件人姓名">
                <input value={form.recipient_name} onChange={e => set('recipient_name', e.target.value)} className={FIELD_CLASS} />
              </Field>
              <Field label="收件人電話">
                <input value={form.recipient_phone} onChange={e => set('recipient_phone', e.target.value)} className={FIELD_CLASS} />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="地址">
                <input value={form.address} onChange={e => set('address', e.target.value)} className={FIELD_CLASS} />
              </Field>
            </div>
          </div>

          <div className="border-t border-neutral-100 pt-3">
            <div className="mb-2 text-sm font-semibold text-neutral-800">帳戶數值</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="代幣">
                <input type="number" value={form.tokens} onChange={e => set('tokens', e.target.value)} className={FIELD_CLASS} />
              </Field>
              <Field label="積分">
                <input type="number" value={form.points} onChange={e => set('points', e.target.value)} className={FIELD_CLASS} />
              </Field>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-neutral-100 px-4 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-200"
            >
              取消
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isSaving}
              className="rounded-lg bg-primary px-4 py-2 text-sm text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
            >
              {isSaving ? '儲存中…' : '儲存'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
