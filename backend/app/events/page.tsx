'use client'

import { AdminLayout, PageCard } from '@/components'
import { useState, useEffect } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { useRouter } from 'next/navigation'
import { formatDateTime } from '@/utils/dateFormat'
import Link from 'next/link'

interface Event {
  id: string
  slug: string
  title: string
  bg_color: string
  accent_color: string
  is_active: boolean
  start_at: string | null
  end_at: string | null
  created_at: string
}

const PRESETS = [
  { label: '暗紫（預設）', bg: '#0a0610', accent: '#c026d3' },
  { label: '暗金', bg: '#0a0610', accent: '#ffd24a' },
  { label: '暗紅', bg: '#0f0505', accent: '#ef4444' },
  { label: '暗藍', bg: '#020b18', accent: '#38bdf8' },
]

const EMPTY_FORM = { slug: '', title: '', bg_color: '#0a0610', accent_color: '#c026d3', is_active: true, start_at: '', end_at: '' }

function buildTemplateSections(title: string) {
  const A = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/lp-assets/zetcho`
  return [
    // 1. 全屏主視覺 — 影片背景 hero
    {
      type: 'hero',
      content: {
        eyebrow: 'GGB SPECIAL EVENT',
        title,
        subtitle: '期間限定・即抽即開・限量到手為止',
        highlight_text: '🔥 超稀有大賞等你來拿',
        badge_text: '熱烈進行中',
        cta_text: '立即參加',
        cta_url: '/',
        bg_video_url: `${A}/banchou-buildup.mp4`,
        bg_poster_url: `${A}/slot-d-wide.png`,
        gems: [
          { color: '#c026d3' }, { color: '#e879f9' }, { color: '#86198f' }, { color: '#a21caf' }, { color: '#d946ef' },
        ],
      },
    },
    // 2. SPEC 數字區
    {
      type: 'stats',
      content: {
        h2: 'SPEC',
        subtitle: '活動數據一覽',
        stats: [
          { v: '80口', l: '本次活動總量', color: '#c026d3' },
          { v: '1賞', l: '最高大賞', color: '#e879f9' },
          { v: '即抽', l: '即時開獎', color: '#a21caf' },
          { v: '24H', l: '全天候服務', color: '#d946ef' },
        ],
      },
    },
    // 3. 亮點特色
    {
      type: 'features',
      content: {
        h2: '活動特色',
        subtitle: '為什麼要參加這次活動',
        items: [
          { icon: '🎰', title: '即抽即開', desc: '扣除代幣後立即抽獎，秒看結果' },
          { icon: '🏆', title: '超豪華大賞', desc: '最高大賞只有一個，稀有度拉滿' },
          { icon: '📦', title: '自動入倉庫', desc: '中獎品項直接入帳，方便管理' },
          { icon: '🚚', title: '安全出貨', desc: '填寫地址即可出貨，台灣全境到府' },
        ],
      },
    },
    // 4. 賞等價格表
    {
      type: 'table',
      content: {
        h2: '賞等一覽',
        subtitle: '本次活動獎品明細',
        columns: ['賞等', '獎品名稱', '數量', '機率'],
        rows: [
          ['🏅 A 賞', '請填入獎品名稱', '1個', '1/80'],
          ['🥈 B 賞', '請填入獎品名稱', '3個', '3/80'],
          ['🥉 C 賞', '請填入獎品名稱', '6個', '6/80'],
          ['🎁 D 賞', '請填入獎品名稱', '10個', '10/80'],
          ['✨ 大賞', '請填入獎品名稱', '1個', '1/80'],
        ],
        highlight_col: 3,
        note: '※ 機率以本活動實際設定為準，詳見活動頁面',
      },
    },
    // 5. 遊玩流程
    {
      type: 'steps',
      content: {
        h2: '遊玩方式',
        subtitle: '簡單四步驟，輕鬆參與',
        steps: [
          { title: 'STEP 1｜儲值代幣', description: '前往儲值頁面，選擇適合的代幣方案' },
          { title: 'STEP 2｜進入活動', description: '從活動列表點入，確認賞等與機率' },
          { title: 'STEP 3｜即抽即開獎', description: '選擇抽獎數量，立即扣除代幣並看結果' },
          { title: 'STEP 4｜申請出貨', description: '到我的倉庫選品，填寫地址完成配送' },
        ],
      },
    },
    // 6. 獎品卡片
    {
      type: 'cards',
      content: {
        h2: '獎品展示',
        subtitle: '各賞等獎品搶先看',
        note: '※ 圖片僅供參考，實際以活動頁面為準',
        cards: [
          { tag: 'A 賞', variant: 'star', title: '限定頂級獎品', subtitle: '請填入實際獎品名稱與說明', value: '1', unit: '個', extras: [] },
          { tag: 'B 賞', variant: 'star', title: '人氣精選獎品', subtitle: '請填入實際獎品名稱與說明', value: '3', unit: '個', extras: [] },
          { tag: 'C 賞', variant: 'star', title: '超值好禮', subtitle: '請填入實際獎品名稱與說明', value: '6', unit: '個', extras: [] },
          { tag: '✨ 大賞', variant: 'grand', title: '絶頂豪華大賞', subtitle: '全場唯一，強者才能拿到', value: '1', unit: '個', extras: ['活動期間僅此一個', '可至會員中心查看紀錄'] },
        ],
      },
    },
    // 7. 影片畫廊
    {
      type: 'gallery',
      content: {
        h2: '精彩片段',
        subtitle: '看看其他玩家的開獎瞬間',
        layout: 'grid',
        items: [
          { media_type: 'video', url: `${A}/banchou-buildup.mp4`, poster: `${A}/slot-d-wide.png`, caption: '活動開場' },
          { media_type: 'video', url: `${A}/banchou-win.mp4`, poster: '', caption: '中獎瞬間' },
          { media_type: 'video', url: `${A}/banchou-win-god.mp4`, poster: '', caption: '神級大賞' },
          { media_type: 'video', url: `${A}/zetcho_reversal.mp4`, poster: '', caption: '絶頂逆転' },
          { media_type: 'video', url: `${A}/banchou-win-strong.mp4`, poster: '', caption: '強力連發' },
          { media_type: 'video', url: `${A}/banchou-yokoku-strong.mp4`, poster: '', caption: '下次預告' },
        ],
      },
    },
    // 8. 活動亮點框（fukuro）
    {
      type: 'fukuro',
      content: {
        h2: '本次活動特別企劃',
        subtitle: '期間限定 · 只有這裡有',
        ft: '▶ 特別加碼',
        fb: '活動期間購買指定數量，享有額外回饋代幣！\n詳細條件請見活動頁面說明。',
        fb2: '🎁 限時加碼，代幣回饋 10%！',
        chips: ['即抽即開獎', '超稀有大賞', '期間限定', '每日補貨'],
        callout: '⚠ 注意：活動獎品數量有限，售完為止。實際機率以活動頁面標示為準。',
      },
    },
    // 9. 活動倒數
    {
      type: 'countdown',
      content: {
        h2: '活動倒數',
        subtitle: '把握時間，機會不等人',
        target_at: '',
        expired_text: '活動已結束，期待下次再見！',
        cta_text: '立即參加',
        cta_url: '/',
      },
    },
    // 10. 注意事項
    {
      type: 'highlight',
      content: {
        title: '活動注意事項',
        body: '1. 本活動限台灣地區玩家參與。\n2. 每人不限購買次數，但大賞全場限量一個，先到先得。\n3. 活動期間如遇系統維護，將暫停受理，恢復後繼續。\n4. 抽獎結果即時確定，不可撤銷。\n5. 獎品出貨以申請時間排程，約 7-14 個工作天到貨。\n\n請至後台填入實際活動規則與注意事項。',
        footer: '如有疑問請聯繫客服，我們會盡快回覆',
      },
    },
    // 11. 補充說明
    {
      type: 'text',
      content: {
        h2: '關於本活動',
        body: '本次活動由 GGB 獨家引進，精選高人氣品牌聯名商品，數量稀少，每位玩家都有機會拿到超值獎品。活動採即抽即開獎制度，公平公正，歡迎所有玩家參與！\n\n請至後台填入實際活動簡介。',
      },
    },
    // 12. 大按鈕 CTA
    {
      type: 'cta',
      content: {
        text: '立即參加活動',
        url: '/',
      },
    },
    // 13. 底部固定列
    {
      type: 'sticky_cta',
      content: {
        text: '立即參加',
        url: '/',
        sub_text: '限量 80 口 · 即抽即開獎',
      },
    },
  ]
}

export default function EventsPage() {
  const { toast } = useToast()
  const router = useRouter()
  const [items, setItems] = useState<Event[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState<Event | null>(null)

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/events')
      if (!res.ok) throw new Error()
      setItems(await res.json())
    } catch { toast('載入失敗', 'error') }
    finally { setIsLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  const handleCreate = async () => {
    if (!form.slug.trim() || !form.title.trim()) { toast('請填寫 Slug 和標題', 'error'); return }
    setIsSaving(true)
    try {
      const res = await fetch('/api/admin/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, start_at: form.start_at || null, end_at: form.end_at || null }),
      })
      if (!res.ok) { const e = await res.json(); toast(e.error || '新增失敗', 'error'); return }
      const newEvent = await res.json()
      const sections = buildTemplateSections(form.title)
      for (const section of sections) {
        await fetch(`/api/admin/events/${newEvent.id}/sections`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(section),
        })
      }
      toast('已建立，正在進入編輯器...', 'success')
      setIsModalOpen(false)
      setForm(EMPTY_FORM)
      router.push(`/events/${newEvent.id}/edit`)
    } catch { toast('新增失敗', 'error') }
    finally { setIsSaving(false) }
  }

  const toggleActive = async (item: Event) => {
    try {
      await fetch(`/api/admin/events/${item.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...item, is_active: !item.is_active }),
      })
      fetchData()
    } catch { toast('更新失敗', 'error') }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await fetch(`/api/admin/events/${deleteTarget.id}`, { method: 'DELETE' })
      toast('已刪除', 'success')
      setDeleteTarget(null)
      fetchData()
    } catch { toast('刪除失敗', 'error') }
  }

  return (
    <AdminLayout pageTitle="活動頁管理">
      <PageCard>
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-neutral-500">建立活動 Landing Page，前台路徑：/events/[slug]</p>
          <button onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors">
            + 新增活動
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-neutral-400">載入中...</div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center text-neutral-400 text-sm">目前沒有活動</div>
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id}
                className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${item.is_active ? 'border-neutral-200 bg-white' : 'border-neutral-100 bg-neutral-50 opacity-60'}`}>
                {/* 色塊預覽 */}
                <div className="w-10 h-10 rounded-lg flex-none border border-neutral-200 overflow-hidden relative"
                  style={{ background: item.bg_color }}>
                  <div className="absolute inset-0 opacity-60 rounded-lg"
                    style={{ background: `radial-gradient(circle at 50% 30%, ${item.accent_color}55, transparent 70%)` }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-bold text-neutral-900 truncate">{item.title}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-neutral-400">
                    <span className="font-mono">/events/{item.slug}</span>
                    {item.start_at && <span>· {formatDateTime(item.start_at)} 起</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => toggleActive(item)}
                    className={`text-xs px-2.5 py-1 rounded-lg font-semibold transition-colors ${item.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}>
                    {item.is_active ? '上架中' : '已下架'}
                  </button>
                  <Link href={`/events/${item.id}/edit`}
                    className="text-xs px-2.5 py-1 rounded-lg bg-neutral-100 text-neutral-700 font-semibold hover:bg-neutral-200 transition-colors">
                    編輯
                  </Link>
                  <button onClick={() => setDeleteTarget(item)}
                    className="text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-600 font-semibold hover:bg-red-100 transition-colors">
                    刪除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageCard>

      {/* New Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 pt-6 pb-4 border-b border-neutral-100">
              <h2 className="text-lg font-bold text-neutral-900">新增活動</h2>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-500 mb-1.5">活動標題</label>
                <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="夏日轉蛋祭" className="w-full px-3 py-2.5 text-sm border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-500 mb-1.5">Slug（網址）</label>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-neutral-400">/lp/</span>
                  <input type="text" value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                    placeholder="summer-gacha-2026" className="flex-1 px-3 py-2.5 text-sm border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 font-mono" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-500 mb-2">主題色</label>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {PRESETS.map(p => (
                    <button key={p.label} onClick={() => setForm(f => ({ ...f, bg_color: p.bg, accent_color: p.accent }))}
                      className={`rounded-xl h-12 relative overflow-hidden border-2 transition-all ${form.bg_color === p.bg ? 'border-primary scale-105' : 'border-transparent'}`}
                      style={{ background: p.bg }}>
                      <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 30%, ${p.accent}66, transparent 70%)` }} />
                      <span className="absolute bottom-1 left-0 right-0 text-center text-[10px] font-bold text-white/80">{p.label}</span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-[10px] font-semibold text-neutral-400 mb-1">背景色</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={form.bg_color} onChange={e => setForm(f => ({ ...f, bg_color: e.target.value }))} className="w-8 h-8 rounded cursor-pointer border-0" />
                      <span className="text-xs font-mono text-neutral-500">{form.bg_color}</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] font-semibold text-neutral-400 mb-1">主色</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={form.accent_color} onChange={e => setForm(f => ({ ...f, accent_color: e.target.value }))} className="w-8 h-8 rounded cursor-pointer border-0" />
                      <span className="text-xs font-mono text-neutral-500">{form.accent_color}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-neutral-500 mb-1.5">開始時間</label>
                  <input type="datetime-local" value={form.start_at} onChange={e => setForm(f => ({ ...f, start_at: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-neutral-500 mb-1.5">結束時間</label>
                  <input type="datetime-local" value={form.end_at} onChange={e => setForm(f => ({ ...f, end_at: e.target.value }))}
                    className="w-full px-3 py-2.5 text-sm border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex justify-end gap-3">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-semibold text-neutral-600 hover:bg-neutral-100 rounded-xl transition-colors">取消</button>
              <button onClick={handleCreate} disabled={isSaving}
                className="px-5 py-2 text-sm font-semibold bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-60">
                {isSaving ? '建立中...' : '建立並編輯'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-base font-bold text-neutral-900 mb-2">確認刪除</h2>
            <p className="text-sm text-neutral-600 mb-6">刪除「{deleteTarget.title}」及其所有 sections？不可復原。</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm font-semibold text-neutral-600 hover:bg-neutral-100 rounded-xl transition-colors">取消</button>
              <button onClick={handleDelete} className="px-4 py-2 text-sm font-semibold bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors">刪除</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
