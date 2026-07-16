'use client'

import AdminLayout from '@/components/AdminLayout'
import { useState, useEffect } from 'react'
import Image from 'next/image'

interface Bot {
  id: number
  nickname: string
  avatar_url: string
  whale_score: number
  draws_score: number
  title_name: string | null
  title_color: string | null
  is_active: boolean
  sort_order: number
  gender: string | null
  birthday: string | null
  bio: string | null
}

const TITLE_COLORS = ['gold', 'red', 'purple', 'blue', 'green']
const COLOR_LABELS: Record<string, string> = { gold: '金', red: '紅', purple: '紫', blue: '藍', green: '綠' }
const COLOR_STYLES: Record<string, string> = {
  gold: 'bg-yellow-100 text-yellow-700',
  red: 'bg-red-100 text-red-700',
  purple: 'bg-purple-100 text-purple-700',
  blue: 'bg-blue-100 text-primary',
  green: 'bg-green-100 text-green-700',
}

const BLANK: Partial<Bot> = {
  nickname: '', avatar_url: '/images/avatar/01.png',
  whale_score: 500, draws_score: 10,
  title_name: '', title_color: 'gold',
  is_active: true, sort_order: 99,
  gender: '', birthday: '', bio: '',
}

export default function LeaderboardBotsPage() {
  const [bots, setBots] = useState<Bot[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Partial<Bot>>(BLANK)
  const [saving, setSaving] = useState(false)

  const fetchBots = async () => {
    setLoading(true)
    const res = await fetch('/api/admin/leaderboard-bots')
    if (res.ok) setBots(await res.json())
    setLoading(false)
  }

  useEffect(() => { fetchBots() }, [])

  const handleSubmit = async () => {
    if (!form.nickname) return
    setSaving(true)
    const payload = {
      ...form,
      title_name: form.title_name || null,
      title_color: form.title_name ? (form.title_color || 'gold') : null,
    }
    const isEdit = !!form.id
    const res = await fetch('/api/admin/leaderboard-bots', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) { await fetchBots(); setShowForm(false); setForm(BLANK) }
    setSaving(false)
  }

  const handleToggleActive = async (bot: Bot) => {
    await fetch('/api/admin/leaderboard-bots', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: bot.id, is_active: !bot.is_active }),
    })
    setBots(prev => prev.map(b => b.id === bot.id ? { ...b, is_active: !b.is_active } : b))
  }

  const handleDelete = async (id: number) => {
    if (!confirm('確定要刪除這個機器人？')) return
    await fetch(`/api/admin/leaderboard-bots?id=${id}`, { method: 'DELETE' })
    setBots(prev => prev.filter(b => b.id !== id))
  }

  const startEdit = (bot: Bot) => {
    setForm({ ...bot })
    setShowForm(true)
  }

  const activeCount = bots.filter(b => b.is_active).length

  return (
    <AdminLayout
      pageTitle="機器人管理"
    >
      <div className="space-y-4">
        {/* 頂部操作列 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm text-neutral-500">共 <span className="font-semibold text-neutral-800">{bots.length}</span> 個機器人，啟用中 <span className="font-semibold text-green-600">{activeCount}</span> 個</span>
            <span className="text-xs text-neutral-400 bg-neutral-100 px-2 py-1 rounded-full">真實用戶優先，機器人填補剩餘名次至 20 名</span>
          </div>
          <button
            onClick={() => { setForm(BLANK); setShowForm(true) }}
            className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新增機器人
          </button>
        </div>

        {/* 新增/編輯表單 */}
        {showForm && (
          <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-neutral-800">{form.id ? '編輯機器人' : '新增機器人'}</h3>
              <button onClick={() => { setShowForm(false); setForm(BLANK) }} className="text-neutral-400 hover:text-neutral-600">✕</button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="col-span-2 md:col-span-1">
                <label className="text-xs text-neutral-500 mb-1 block">名稱 *</label>
                <input value={form.nickname ?? ''} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))}
                  placeholder="機器人名稱"
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/20" />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="text-xs text-neutral-500 mb-1 block">排序</label>
                <input type="number" value={form.sort_order ?? 99} onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/20" />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">賞金榜分數</label>
                <input type="number" value={form.whale_score ?? 0} onChange={e => setForm(f => ({ ...f, whale_score: Number(e.target.value) }))}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/20" />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">轉蛋榜分數</label>
                <input type="number" value={form.draws_score ?? 0} onChange={e => setForm(f => ({ ...f, draws_score: Number(e.target.value) }))}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/20" />
              </div>
            </div>

            <div>
              <label className="text-xs text-neutral-500 mb-1 block">頭像 URL</label>
              <input value={form.avatar_url ?? ''} onChange={e => setForm(f => ({ ...f, avatar_url: e.target.value }))}
                placeholder="/images/avatar/01.png"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/20" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">稱號（選填）</label>
                <input value={form.title_name ?? ''} onChange={e => setForm(f => ({ ...f, title_name: e.target.value }))}
                  placeholder="e.g. 抽蛋之神"
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/20" />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">稱號顏色</label>
                <select value={form.title_color ?? 'gold'} onChange={e => setForm(f => ({ ...f, title_color: e.target.value }))}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/20">
                  {TITLE_COLORS.map(c => <option key={c} value={c}>{COLOR_LABELS[c]}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">性別</label>
                <select value={form.gender ?? ''} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/20">
                  <option value="">未設定</option>
                  <option value="male">男</option>
                  <option value="female">女</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">生日</label>
                <input type="date" value={form.birthday ?? ''} onChange={e => setForm(f => ({ ...f, birthday: e.target.value }))}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/20" />
              </div>
            </div>

            <div>
              <label className="text-xs text-neutral-500 mb-1 block">備注</label>
              <input value={form.bio ?? ''} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                placeholder="機器人備注（僅後台可見）"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/20" />
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="is_active" checked={form.is_active ?? true}
                onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                className="rounded" />
              <label htmlFor="is_active" className="text-sm text-neutral-700">啟用（出現在排行榜）</label>
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowForm(false); setForm(BLANK) }}
                className="px-4 py-2 border border-neutral-200 text-sm rounded-lg hover:bg-neutral-50 transition-colors">取消</button>
              <button onClick={handleSubmit} disabled={saving || !form.nickname}
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {saving ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        )}

        {/* 機器人列表 */}
        {loading ? (
          <div className="bg-white rounded-xl border border-neutral-200 py-16 text-center text-sm text-neutral-400">載入中…</div>
        ) : (
          <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-100">
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 w-10">排序</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500">機器人</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500">稱號</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500">賞金榜</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500">轉蛋榜</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-neutral-500">狀態</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {bots.map(bot => (
                  <tr key={bot.id} className={`hover:bg-neutral-50 ${!bot.is_active ? 'opacity-40' : ''}`}>
                    <td className="px-4 py-3 text-neutral-400 font-mono text-xs">{bot.sort_order}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="relative w-9 h-9 rounded-full overflow-hidden bg-neutral-100 shrink-0">
                          <Image src={bot.avatar_url} alt={bot.nickname} fill className="object-cover" unoptimized />
                        </div>
                        <span className="font-medium text-neutral-800">{bot.nickname}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {bot.title_name ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${COLOR_STYLES[bot.title_color || 'gold'] || COLOR_STYLES.gold}`}>
                          {bot.title_name}
                        </span>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-600 font-mono">{bot.whale_score.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-neutral-600 font-mono">{bot.draws_score}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleActive(bot)}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                          bot.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                        }`}
                      >
                        {bot.is_active ? '啟用' : '停用'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => startEdit(bot)} className="p-1.5 text-neutral-400 hover:text-neutral-600 rounded">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button onClick={() => handleDelete(bot.id)} className="p-1.5 text-neutral-400 hover:text-red-500 rounded">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
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
    </AdminLayout>
  )
}
