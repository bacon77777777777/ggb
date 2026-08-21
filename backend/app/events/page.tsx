'use client'

import { AdminLayout, ListTableCard, RowAction, type ListColumn } from '@/components'
import { useState, useEffect } from 'react'
import { useToast } from '@/contexts/ToastContext'
import { useRouter } from 'next/navigation'
import { formatDateTime } from '@/utils/dateFormat'
import Input from '@/components/ui/Input'
import SelectField from '@/components/ui/SelectField'
import Switch from '@/components/ui/Switch'
import Modal from '@/components/Modal'
import Button from '@/components/ui/Button'

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

const THEME_BG: Record<'dark' | 'light', string> = {
  dark: '#0a0610',
  light: '#ffffff',
}

const EMPTY_FORM = { slug: '', title: '', bg_color: '#0a0610', accent_color: '#c026d3', is_active: true, start_at: '', end_at: '', linked_category_id: '', theme_mode: 'dark' as 'dark' | 'light' }

function buildTemplateSections(title: string) {
  const A = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/lp-assets/zetcho`
  return [
    // 1. Hero
    {
      type: 'hero',
      content: {
        eyebrow: 'SLOT TYPE D',
        title,
        subtitle: '対決を制せ。突入＝絶頂RUSH。\nカードが、連チャンで降りそそぐ。',
        highlight_text: '機械割 90〜114% / 1突入 平均5連・カードを連チャン獲得',
        badge_text: '',
        cta_text: '今すぐ遊ぶ',
        cta_url: '/',
        bg_video_url: `${A}/banchou-buildup.mp4`,
        bg_poster_url: '',
        gems: [],
      },
    },
    // 2. SPEC
    {
      type: 'stats',
      content: {
        h2: 'SPEC',
        h2_type: 'pp',
        subtitle: '荒い連チャン型・絶頂RUSH',
        stats: [
          { v: 'カード', l: '対決勝利で景品カード獲得', color: '#ffd24a' },
          { v: '平均5連', l: '継続80%・1突入で複数枚', color: '#e879f9' },
          { v: '突入確定', l: '対決成立＝絶頂RUSH確定', color: '#e879f9' },
          { v: '90-114%', l: '機械割（設定で変動）', color: '#ffd24a' },
        ],
      },
    },
    // 3. 流れ
    {
      type: 'steps',
      content: {
        h2: '絶頂RUSH の流れ',
        subtitle: '対決を制すれば、勝つたびにカード。継続が続く限り連チャン',
        steps: [
          { title: '通常スピン', description: '小役でコイン。対決(突入)を待つ' },
          { title: '対決成立＝突入確定', description: '成立した瞬間、絶頂RUSHが確定（全連を事前確定）' },
          { title: '勝利＝カード獲得', description: '1連ごとに景品カードを獲得' },
          { title: '継続！', description: '継続率80%。相手の格＝継続期待度★' },
          { title: '敗北＝RUSH終了 → リザルト', description: '獲得した連数・カードを総まとめ' },
        ],
      },
    },
    // 4. 継続期待度
    {
      type: 'rel',
      content: {
        h2: '継続期待度＝相手の格',
        h2_highlight: { text: '継続期待度', type: 'pp' },
        subtitle: '相手の格は継続のヒント。弱い相手ほど継続に期待（★が多い）\n※連数は突入時に確定済み。相手・★は結果を示すヒント演出です',
        rows: [
          { name: 'チンピラ', name_color: '#ff7a7a', value: '★★★★½', desc: '最弱＝勝ちやすい＝期待大' },
          { name: '番格', name_color: '#f59e0b', value: '★★★★☆', desc: 'やや強い' },
          { name: '頭', name_color: '#ff8a3d', value: '★★★☆☆', desc: '強敵・低期待' },
          { name: '総番', name_color: '#c026d3', value: '★★☆☆☆', desc: '最強＝勝ちにくい。撃破で次回確定' },
        ],
        callout: '普段は弱い相手をサクサク撃破して継続。だが強敵(総番)が出れば一見ピンチ ―― そこで勝てば次回確定のプレミア。',
      },
    },
    // 5. 継続確定の法則
    {
      type: 'rule',
      content: {
        h2: '継続確定の法則',
        h2_highlight: { text: '確定', type: 'gold' },
        subtitle: 'この演出が出れば次回継続が確定。連はすべて事前確定済み＝嘘の煽りなし',
        rules: [
          { title: '強敵撃破', title_color: '#c026d3', desc: '低期待の総番(★2)に勝てば次回確定' },
          { title: '逆転・復活', title_color: '#5aff9a', desc: '敗北→暗転→復活。逆転勝ち＝次回確定' },
          { title: '金の帯', title_color: '#ffd24a', desc: '対決前に金帯「継続確定」が出れば確定' },
          { title: '「次回確定」表示', title_color: '#ff4d5a', desc: 'その名の通り、出れば次回継続が確定' },
        ],
      },
    },
    // 6. 絶頂直撃
    {
      type: 'fukuro',
      content: {
        h2: '絶頂直撃',
        h2_type: 'pp',
        subtitle: '待てないアナタへ ―― コインを払えば、抽選を経ず即・絶頂RUSH突入',
        ft: 'コインで即・絶頂RUSH突入',
        ft_type: 'pp',
        variant: 'accent',
        fb: '中身は通常の絶頂RUSHと同一（継続80%・平均約5連）。連数は引き運次第。',
        fb2: 'さらに 直撃1回ごとに ガチャ券 +4枚（買ったレートの券）',
        chips: ['20Cベット：6,034C', '50Cベット：15,084C', '100Cベット：30,167C', '200Cベット：60,334C', '600Cベット：181,000C'],
        callout: '絶頂直撃は「突入を購入」する機能です。獲得カード・連数は運で変動し、支払ったコインを下回る場合もあります。一撃を保証するものではありません。',
      },
    },
    // 7. 設定推測
    {
      type: 'table',
      content: {
        h2: '設定推測',
        subtitle: '絶頂RUSHの中身は全設定共通 ―― 設定差は「対決(突入)頻度」だけ',
        columns: ['', '設定1', '設定2', '設定3', '設定4', '設定5', '設定6'],
        rows: [
          ['機械割', '90%', '95%', '100%', '104%', '109%', '114%'],
          ['対決(突入)間隔', '1/420', '1/390', '1/364', '1/346', '1/325', '1/307'],
          ['継続率', '80%', '80%', '80%', '80%', '80%', '80%'],
        ],
        highlight_col: 6,
        note: '※ 高設定ほど対決(絶頂突入)が出やすい。継続率・カード価値は全設定共通＝絶頂の中身に設定差なし。',
      },
    },
    // 8. 通常時の小役
    {
      type: 'table',
      content: {
        h2: '通常時の小役',
        h2_highlight: { text: '小役', type: 'pp' },
        subtitle: '通常スピンの小役はコイン払い戻し（カードは対決＝絶頂RUSHのみ）',
        columns: ['役', '20C', '50C', '100C', '200C', '600C'],
        rows: [
          ['強レア', '100C', '250C', '500C', '1,000C', '3,000C'],
          ['チャンス目', '60C', '150C', '300C', '600C', '1,800C'],
          ['チェリー', '40C', '100C', '200C', '400C', '1,200C'],
          ['ベル', '26C', '65C', '130C', '260C', '780C'],
          ['ハズレ', '1C', '3C', '5C', '10C', '30C'],
          ['対決（絶頂突入）', '→ 絶頂RUSH（カード連チャン）', '', '', '', ''],
        ],
        highlight_col: 0,
        note: '※ コインはサイト内通貨。数値は1スピンあたりの払い戻し目安です。',
      },
    },
    // 9. 演出ギャラリー
    {
      type: 'gallery',
      content: {
        h2: '絶頂RUSH 演出',
        h2_type: 'pp',
        subtitle: '対戦相手 → 鍔迫り合い → 勝利＝カード → 継続！ 強敵撃破・逆転は次回確定',
        layout: 'grid',
        items: [
          { media_type: 'video', url: `${A}/banchou-buildup.mp4`, poster: '', caption: '絶頂突入', badge: '突入', color: '#e879f9' },
          { media_type: 'video', url: `${A}/banchou-win.mp4`, poster: '', caption: '勝利＝カード', badge: '連', color: '#ffd24a' },
          { media_type: 'video', url: `${A}/banchou-win-god.mp4`, poster: '', caption: '圧勝', badge: '激アツ', color: '#ff4d5a' },
          { media_type: 'video', url: `${A}/zetcho_reversal.mp4`, poster: '', caption: '逆転・復活', badge: '次回確定', color: '#5aff9a' },
          { media_type: 'video', url: `${A}/banchou-win-strong.mp4`, poster: '', caption: '勝利・強', badge: '強', color: '#ff9a3d' },
          { media_type: 'video', url: `${A}/banchou-yokoku-strong.mp4`, poster: '', caption: '対決煽り', badge: '煽り', color: '#a855f7' },
        ],
        callout_border: '#6a4a1e',
        callout: '連数・カードは突入の瞬間に確定しています。演出はアツさ・結果の格を表現するもので、演出によって結果が変わることはありません（離脱・リロードでも獲得は保証）。',
      },
    },
    // 10. 事前確定式
    {
      type: 'fukuro',
      content: {
        h2: '',
        subtitle: '',
        ft: '事前確定式 ―― 突入で全連ロック',
        ft_type: 'gold',
        fb: '対決成立の瞬間に全連＋全カードを1トランザクションで確定。最低1連保証。後乗せ・吸い込みは一切なし。途中で閉じても獲得は保証されます。',
        fb2: '',
        chips: ['突入＝確定', '最低1連保証', '後乗せなし', '吸い込みなし'],
        callout: '',
      },
    },
    // 11. 最終 CTA
    {
      type: 'cta',
      content: {
        h2: '絶頂は、連チャンする。',
        h2_type: 'pp',
        subtitle: '対決を制し、絶頂の頂きへ。',
        text: '今すぐ遊ぶ',
        url: '/',
      },
    },
    // 12. 底部固定
    {
      type: 'sticky_cta',
      content: {
        text: '今すぐ遊ぶ',
        url: '/',
        sub_text: '突入＝絶頂RUSH確定 · 平均5連',
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
  const [availableCategories, setAvailableCategories] = useState<Array<{ id: string; name: string }>>([])
  const [searchQuery, setSearchQuery] = useState('')

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

  const openCreate = () => {
    setIsModalOpen(true)
    fetch('/api/admin/categories').then(r => r.ok ? r.json() : []).then(setAvailableCategories).catch(() => {})
  }

  const filtered = items.filter(ev => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return ev.title.toLowerCase().includes(q) || ev.slug.toLowerCase().includes(q)
  })

  const columns: ListColumn<Event>[] = [
    {
      key: 'title', label: '標題',
      sortValue: ev => ev.title,
      render: ev => <span className="font-medium text-neutral-900">{ev.title}</span>,
    },
    {
      key: 'slug', label: '網址',
      sortValue: ev => ev.slug,
      className: 'font-mono',
      render: ev => <span className="text-neutral-500">/events/{ev.slug}</span>,
    },
    {
      key: 'period', label: '檔期',
      sortValue: ev => (ev.start_at ? new Date(ev.start_at).getTime() : 0),
      className: 'font-mono',
      render: ev => (
        <>{ev.start_at ? formatDateTime(ev.start_at) : '即刻'} ～ {ev.end_at ? formatDateTime(ev.end_at) : '無期限'}</>
      ),
    },
    {
      key: 'status', label: '上架',
      sortValue: ev => (ev.is_active ? 1 : 0),
      render: ev => (
        <Switch checked={ev.is_active} onCheckedChange={() => void toggleActive(ev)} />
      ),
    },
    {
      key: 'createdAt', label: '建立時間',
      sortValue: ev => new Date(ev.created_at).getTime(),
      className: 'font-mono',
      render: ev => <>{formatDateTime(ev.created_at)}</>,
    },
    {
      key: 'operations', label: '操作', isActions: true,
      render: ev => (
        <div className="flex items-center gap-2">
          <RowAction tone="primary" onClick={() => router.push(`/events/${ev.id}/edit`)}>編輯</RowAction>
          {/* 抽獎公平性頁是系統常駐頁，不給刪除鍵（後端 API 也擋，見 2026-08-21） */}
          {ev.slug !== 'fairness' && (
            <RowAction tone="danger" onClick={() => setDeleteTarget(ev)}>刪除</RowAction>
          )}
        </div>
      ),
    },
  ]

  return (
    <AdminLayout pageTitle="活動頁管理">
      <div className="space-y-6">
        <p className="text-sm text-neutral-500">建立活動 Landing Page，前台路徑：/events/[slug]</p>

        <ListTableCard
          pageKey="events"
          data={filtered}
          columns={columns}
          keyField="id"
          isLoading={isLoading}
          emptyMessage="目前沒有活動"
          searchPlaceholder="搜尋活動標題或網址..."
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          addButtonText="+ 新增活動"
          onAddClick={openCreate}
        />
      </div>

      {/* New Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="新增活動"
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>取消</Button>
            <Button onClick={handleCreate} isLoading={isSaving}>建立並編輯</Button>
          </div>
        }
      >
        {isModalOpen && (
          <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-500 mb-1.5">活動標題</label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="夏日轉蛋祭" className="rounded-xl" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-500 mb-1.5">Slug（網址）</label>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-neutral-400">/lp/</span>
                  <Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))}
                    placeholder="summer-gacha-2026" className="flex-1 rounded-xl font-mono" />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-neutral-500 mb-2">風格</label>
                  <div className="flex items-center gap-1 bg-neutral-100 rounded-lg p-0.5 w-fit">
                    <button onClick={() => setForm(f => ({ ...f, theme_mode: 'dark', bg_color: THEME_BG.dark }))}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${form.theme_mode === 'dark' ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}>
                      深色
                    </button>
                    <button onClick={() => setForm(f => ({ ...f, theme_mode: 'light', bg_color: THEME_BG.light }))}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${form.theme_mode === 'light' ? 'bg-white text-neutral-800 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'}`}>
                      淺色
                    </button>
                  </div>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-neutral-500 mb-2">主題色</label>
                  <div className="flex items-center gap-2">
                    <Input type="color" value={form.accent_color} onChange={e => setForm(f => ({ ...f, accent_color: e.target.value }))} className="w-9 h-9 cursor-pointer" />
                    <span className="text-xs font-mono text-neutral-500">{form.accent_color}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-neutral-500 mb-1.5">開始時間</label>
                  <Input type="datetime-local" value={form.start_at} onChange={e => setForm(f => ({ ...f, start_at: e.target.value }))} className="rounded-xl" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-neutral-500 mb-1.5">結束時間</label>
                  <Input type="datetime-local" value={form.end_at} onChange={e => setForm(f => ({ ...f, end_at: e.target.value }))} className="rounded-xl" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-500 mb-1.5">
                  分類清單 <span className="font-normal text-neutral-400">（選填，LP 底部自動顯示該分類商品）</span>
                </label>
                <SelectField value={form.linked_category_id}
                  onChange={e => setForm(f => ({ ...f, linked_category_id: e.target.value }))} className="rounded-xl">
                  <option value="">不連結分類</option>
                  {availableCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </SelectField>
              </div>
          </div>
        )}
      </Modal>

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
