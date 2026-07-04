'use client'

import AdminLayout from '@/components/AdminLayout'
import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'

interface UserProfile {
  id: string
  name: string
  email: string
  phone: string
  phone_number: string
  avatar_url: string
  gender: string
  birthday: string
  recipient_name: string
  recipient_phone: string
  address: string
  tokens: number
  points: number
  status: 'active' | 'inactive'
  invite_code: string
  is_bot: boolean
}

export default function UserEditPage() {
  const router = useRouter()
  const params = useParams()
  const userId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Partial<UserProfile>>({})
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const PRESET_AVATARS = Array.from({ length: 8 }, (_, i) => `/images/avatar/${String(i + 1).padStart(2, '0')}.png`)

  const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const ext = file.name.split('.').pop() || 'png'
    const path = `user-avatars/${userId}_${Date.now()}.${ext}`
    const formData = new FormData()
    formData.append('file', file)
    formData.append('bucket', 'avatars')
    formData.append('path', path)
    const res = await fetch('/api/admin/upload', { method: 'POST', body: formData })
    if (res.ok) {
      const { publicUrl } = await res.json()
      set('avatar_url', publicUrl)
      setShowAvatarPicker(false)
    } else {
      const err = await res.json()
      setMsg({ type: 'error', text: err.error || '上傳失敗' })
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/admin/users/${userId}`)
      if (!res.ok) return
      const { user } = await res.json()
      setForm({
        id: user.id,
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        phone_number: user.phone_number || '',
        avatar_url: user.avatar_url || '',
        gender: user.gender || '',
        birthday: user.birthday ? user.birthday.slice(0, 10) : '',
        recipient_name: user.recipient_name || '',
        recipient_phone: user.recipient_phone || '',
        address: user.address || '',
        tokens: user.tokens ?? 0,
        points: user.points ?? 0,
        status: user.status || 'active',
        invite_code: user.invite_code || '',
        is_bot: user.is_bot || false,
      })
      setLoading(false)
    }
    load()
  }, [userId])

  const handleSave = async () => {
    setSaving(true)
    setMsg(null)
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        phone: form.phone,
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
      }),
    })
    if (res.ok) {
      setMsg({ type: 'success', text: '儲存成功' })
    } else {
      const err = await res.json()
      setMsg({ type: 'error', text: err.error || '儲存失敗' })
    }
    setSaving(false)
  }

  const handleSetPassword = async () => {
    if (!newPassword.trim()) return
    setSaving(true)
    setMsg(null)
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword.trim() }),
    })
    if (res.ok) {
      setMsg({ type: 'success', text: '密碼已更新' })
      setNewPassword('')
    } else {
      const err = await res.json()
      setMsg({ type: 'error', text: err.error || '密碼更新失敗' })
    }
    setSaving(false)
  }

  const set = (k: keyof UserProfile, v: any) => setForm(f => ({ ...f, [k]: v }))

  if (loading) return (
    <AdminLayout pageTitle="編輯會員" breadcrumbs={[{ label: '會員管理', href: '/users' }, { label: '編輯' }]}>
      <div className="py-20 text-center text-sm text-neutral-400">載入中…</div>
    </AdminLayout>
  )

  return (
    <AdminLayout
      pageTitle="編輯會員"
      breadcrumbs={[{ label: '會員管理', href: '/users' }, { label: form.name || userId, href: `/users/${userId}` }, { label: '編輯' }]}
    >
      <div className="max-w-2xl space-y-5">

        {msg && (
          <div className={`px-4 py-3 rounded-lg text-sm font-medium ${msg.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {msg.text}
          </div>
        )}

        {/* 頭像 */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <h3 className="font-semibold text-neutral-800 mb-4">頭像</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative w-20 h-20 rounded-full overflow-hidden bg-neutral-100 shrink-0 border-2 border-neutral-200">
                {form.avatar_url ? (
                  <Image src={form.avatar_url} alt="avatar" fill className="object-cover" unoptimized />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl text-neutral-400">
                    {form.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowAvatarPicker(v => !v)}
                  className="px-3 py-1.5 border border-neutral-200 rounded-lg text-sm text-neutral-600 hover:bg-neutral-50 transition-colors"
                >
                  {showAvatarPicker ? '收起' : '選擇預設'}
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {uploading ? '上傳中…' : '上傳圖片'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUploadAvatar}
                />
              </div>
            </div>
            {showAvatarPicker && (
              <div className="flex flex-wrap gap-2 pt-1">
                {PRESET_AVATARS.map(url => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => { set('avatar_url', url); setShowAvatarPicker(false) }}
                    className={`relative w-12 h-12 rounded-full overflow-hidden border-2 transition-all ${
                      form.avatar_url === url ? 'border-primary scale-110' : 'border-neutral-200 hover:border-primary/50'
                    }`}
                  >
                    <Image src={url} alt="" fill className="object-cover" unoptimized />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 基本資料 */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4">
          <h3 className="font-semibold text-neutral-800">基本資料</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">顯示名稱</label>
              <input value={form.name || ''} onChange={e => set('name', e.target.value)}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">Email</label>
              <input value={form.email || ''} onChange={e => set('email', e.target.value)}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">性別</label>
              <select value={form.gender || ''} onChange={e => set('gender', e.target.value)}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                <option value="">未設定</option>
                <option value="male">男</option>
                <option value="female">女</option>
                <option value="other">其他</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">生日</label>
              <input type="date" value={form.birthday || ''} onChange={e => set('birthday', e.target.value)}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">手機號碼</label>
              <input value={form.phone_number || ''} onChange={e => set('phone_number', e.target.value)}
                placeholder="0912345678"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">狀態</label>
              <select value={form.status || 'active'} onChange={e => set('status', e.target.value as 'active' | 'inactive')}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                <option value="active">啟用</option>
                <option value="inactive">停用</option>
              </select>
            </div>
          </div>
        </div>

        {/* 收件資料 */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4">
          <h3 className="font-semibold text-neutral-800">收件資料</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">收件人姓名</label>
              <input value={form.recipient_name || ''} onChange={e => set('recipient_name', e.target.value)}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">收件人電話</label>
              <input value={form.recipient_phone || ''} onChange={e => set('recipient_phone', e.target.value)}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
          </div>
          <div>
            <label className="text-xs text-neutral-500 mb-1 block">地址</label>
            <input value={form.address || ''} onChange={e => set('address', e.target.value)}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
        </div>

        {/* 帳戶數值 */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4">
          <h3 className="font-semibold text-neutral-800">帳戶數值</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">代幣</label>
              <input type="number" value={form.tokens ?? 0} onChange={e => set('tokens', e.target.value)}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">積分</label>
              <input type="number" value={form.points ?? 0} onChange={e => set('points', e.target.value)}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
          </div>
        </div>

        {/* 儲存按鈕 */}
        <div className="flex gap-3">
          <button onClick={() => router.back()}
            className="px-5 py-2 border border-neutral-200 text-sm rounded-lg hover:bg-neutral-50 transition-colors">
            取消
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {saving ? '儲存中…' : '儲存變更'}
          </button>
        </div>

        {/* 密碼管理 */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-3">
          <div>
            <h3 className="font-semibold text-neutral-800">密碼管理</h3>
            <p className="text-xs text-neutral-400 mt-1">密碼經 bcrypt 加密儲存，無法查看原始內容。可在此設定新密碼。</p>
          </div>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="輸入新密碼（至少 8 碼）"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 pr-10"
              />
              <button type="button" onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600">
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            <button onClick={handleSetPassword} disabled={saving || !newPassword.trim()}
              className="px-4 py-2 bg-neutral-800 text-white text-sm font-medium rounded-lg hover:bg-neutral-700 disabled:opacity-50 transition-colors whitespace-nowrap">
              設定密碼
            </button>
          </div>
        </div>

      </div>
    </AdminLayout>
  )
}
