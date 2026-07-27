'use client'

import { AdminLayout, PageCard } from '@/components'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useToast } from '@/contexts/ToastContext'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Event {
  id: string; slug: string; title: string
  bg_color: string; accent_color: string
  is_active: boolean; start_at: string | null; end_at: string | null
}
interface Section { id: string; type: SectionType; sort_order: number; content: Record<string, unknown> }
type SectionType = 'hero' | 'text' | 'steps' | 'cards' | 'highlight' | 'cta' | 'product_ref'
interface Product { id: number; name: string }

const TYPE_LABELS: Record<SectionType, string> = {
  hero: '全屏主視覺', text: '標題＋說明文字', steps: '流程步驟',
  cards: '獎品卡片', highlight: '重點強調框', cta: '底部大按鈕', product_ref: '商品獎品清單',
}

const TYPE_DESC: Record<SectionType, string> = {
  hero: '活動標題、副標、CTA 按鈕，進場第一屏',
  text: '自由標題＋內文，用於活動說明',
  steps: '1→2→3 編號步驟，說明玩法流程',
  cards: 'SS賞/S賞 等獎品卡，支援一般/豪華兩種樣式',
  highlight: '帶邊框的重點框，適合優惠條款或特別說明',
  cta: '底部全寬大按鈕，點擊導向商品頁',
  product_ref: '選一個商品 ID，自動抓取獎品清單顯示',
}
const ALL_TYPES: SectionType[] = ['hero', 'text', 'steps', 'cards', 'highlight', 'cta', 'product_ref']

const PRESETS = [
  { label: '暗金', bg: '#0a0610', accent: '#ffd24a' },
  { label: '暗紫', bg: '#0a0214', accent: '#c026d3' },
  { label: '暗紅', bg: '#0f0505', accent: '#ef4444' },
  { label: '暗藍', bg: '#020b18', accent: '#38bdf8' },
]

// ─── Default content per type ─────────────────────────────────────────────────
function defaultContent(type: SectionType): Record<string, unknown> {
  switch (type) {
    case 'hero': return { eyebrow: '', title: '', subtitle: '', highlight_text: '', badge_text: '進行中', cta_text: '立即參加', cta_url: '/', gems: [] }
    case 'text': return { h2: '', subtitle: '', body: '' }
    case 'steps': return { h2: '遊玩方式', subtitle: '', steps: [{ title: '', description: '' }] }
    case 'cards': return { h2: '獎品', subtitle: '', note: '', cards: [{ tag: '', variant: 'star', title: '', subtitle: '', value: '', unit: '', extras: [] }] }
    case 'highlight': return { title: '', body: '', footer: '' }
    case 'cta': return { text: '立即參加', url: '/' }
    case 'product_ref': return { h2: '商品獎品', subtitle: '', product_id: '' }
  }
}

// ─── Section form components ─────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  )
}
const inputCls = "w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
const textareaCls = inputCls + " resize-none"

function HeroForm({ c, onChange }: { c: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const set = (k: string, v: unknown) => onChange({ ...c, [k]: v })
  return (
    <div className="space-y-3">
      <Field label="Eyebrow（小標籤）"><input className={inputCls} value={c.eyebrow as string} onChange={e => set('eyebrow', e.target.value)} placeholder="SLOT EVENT" /></Field>
      <Field label="大標題"><input className={inputCls} value={c.title as string} onChange={e => set('title', e.target.value)} placeholder="夏日轉蛋祭" /></Field>
      <Field label="副標題"><textarea className={textareaCls} rows={2} value={c.subtitle as string} onChange={e => set('subtitle', e.target.value)} /></Field>
      <Field label="強調文字（框內）"><input className={inputCls} value={c.highlight_text as string} onChange={e => set('highlight_text', e.target.value)} placeholder="儲值加碼 2倍票券" /></Field>
      <Field label="狀態 Badge"><input className={inputCls} value={c.badge_text as string} onChange={e => set('badge_text', e.target.value)} placeholder="進行中 / 2026.07.27" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="CTA 按鈕文字"><input className={inputCls} value={c.cta_text as string} onChange={e => set('cta_text', e.target.value)} /></Field>
        <Field label="CTA 連結 URL"><input className={inputCls} value={c.cta_url as string} onChange={e => set('cta_url', e.target.value)} placeholder="/shop/xxx" /></Field>
      </div>
    </div>
  )
}

function TextForm({ c, onChange }: { c: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const set = (k: string, v: unknown) => onChange({ ...c, [k]: v })
  return (
    <div className="space-y-3">
      <Field label="標題 H2"><input className={inputCls} value={c.h2 as string} onChange={e => set('h2', e.target.value)} /></Field>
      <Field label="副標"><input className={inputCls} value={c.subtitle as string} onChange={e => set('subtitle', e.target.value)} /></Field>
      <Field label="內文"><textarea className={textareaCls} rows={5} value={c.body as string} onChange={e => set('body', e.target.value)} /></Field>
    </div>
  )
}

function StepsForm({ c, onChange }: { c: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const steps = (c.steps as { title: string; description: string }[]) || []
  const setStep = (i: number, k: string, v: string) => {
    const next = steps.map((s, idx) => idx === i ? { ...s, [k]: v } : s)
    onChange({ ...c, steps: next })
  }
  const addStep = () => onChange({ ...c, steps: [...steps, { title: '', description: '' }] })
  const removeStep = (i: number) => onChange({ ...c, steps: steps.filter((_, idx) => idx !== i) })
  return (
    <div className="space-y-3">
      <Field label="標題 H2"><input className={inputCls} value={c.h2 as string} onChange={e => onChange({ ...c, h2: e.target.value })} /></Field>
      <Field label="副標"><input className={inputCls} value={c.subtitle as string} onChange={e => onChange({ ...c, subtitle: e.target.value })} /></Field>
      <div className="space-y-2">
        {steps.map((s, i) => (
          <div key={i} className="flex gap-2 items-start border border-neutral-100 rounded-lg p-3 bg-neutral-50">
            <span className="text-xs font-black text-neutral-400 mt-2.5 w-4 text-center">{i + 1}</span>
            <div className="flex-1 space-y-2">
              <input className={inputCls} placeholder="步驟標題" value={s.title} onChange={e => setStep(i, 'title', e.target.value)} />
              <input className={inputCls} placeholder="說明" value={s.description} onChange={e => setStep(i, 'description', e.target.value)} />
            </div>
            <button onClick={() => removeStep(i)} className="text-red-400 hover:text-red-600 mt-2 text-lg leading-none">×</button>
          </div>
        ))}
        <button onClick={addStep} className="text-xs text-primary font-bold hover:underline">+ 新增步驟</button>
      </div>
    </div>
  )
}

function CardsForm({ c, onChange }: { c: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  type CardItem = { tag: string; variant: string; title: string; subtitle: string; value: string; unit: string; extras: string[] }
  const cards = (c.cards as CardItem[]) || []
  const setCard = (i: number, k: string, v: unknown) => {
    const next = cards.map((card, idx) => idx === i ? { ...card, [k]: v } : card)
    onChange({ ...c, cards: next })
  }
  const addCard = () => onChange({ ...c, cards: [...cards, { tag: '', variant: 'star', title: '', subtitle: '', value: '', unit: '', extras: [] }] })
  const removeCard = (i: number) => onChange({ ...c, cards: cards.filter((_, idx) => idx !== i) })
  return (
    <div className="space-y-3">
      <Field label="標題 H2"><input className={inputCls} value={c.h2 as string} onChange={e => onChange({ ...c, h2: e.target.value })} /></Field>
      <Field label="副標"><input className={inputCls} value={c.subtitle as string} onChange={e => onChange({ ...c, subtitle: e.target.value })} /></Field>
      <div className="space-y-3">
        {cards.map((card, i) => (
          <div key={i} className="border border-neutral-200 rounded-xl p-3 space-y-2 bg-neutral-50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500">卡片 {i + 1}</span>
              <button onClick={() => removeCard(i)} className="text-red-400 hover:text-red-600 text-sm">刪除</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className={inputCls} placeholder="標籤（SS賞 / 大賞）" value={card.tag} onChange={e => setCard(i, 'tag', e.target.value)} />
              <select className={inputCls} value={card.variant} onChange={e => setCard(i, 'variant', e.target.value)}>
                <option value="star">一般（紫）</option>
                <option value="grand">豪華（金）</option>
              </select>
            </div>
            <input className={inputCls} placeholder="卡片標題" value={card.title} onChange={e => setCard(i, 'title', e.target.value)} />
            <input className={inputCls} placeholder="副說明" value={card.subtitle} onChange={e => setCard(i, 'subtitle', e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <input className={inputCls} placeholder="數字（如 1）" value={card.value} onChange={e => setCard(i, 'value', e.target.value)} />
              <input className={inputCls} placeholder="單位（如 名）" value={card.unit} onChange={e => setCard(i, 'unit', e.target.value)} />
            </div>
            <textarea className={textareaCls} rows={2} placeholder="備註（每行一條）"
              value={(card.extras || []).join('\n')} onChange={e => setCard(i, 'extras', e.target.value.split('\n'))} />
          </div>
        ))}
        <button onClick={addCard} className="text-xs text-primary font-bold hover:underline">+ 新增卡片</button>
      </div>
      <Field label="底部備註"><textarea className={textareaCls} rows={2} value={c.note as string} onChange={e => onChange({ ...c, note: e.target.value })} /></Field>
    </div>
  )
}

function HighlightForm({ c, onChange }: { c: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const set = (k: string, v: string) => onChange({ ...c, [k]: v })
  return (
    <div className="space-y-3">
      <Field label="標題"><input className={inputCls} value={c.title as string} onChange={e => set('title', e.target.value)} /></Field>
      <Field label="內文"><textarea className={textareaCls} rows={4} value={c.body as string} onChange={e => set('body', e.target.value)} /></Field>
      <Field label="底部補充"><input className={inputCls} value={c.footer as string} onChange={e => set('footer', e.target.value)} /></Field>
    </div>
  )
}

function CtaForm({ c, onChange }: { c: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="按鈕文字"><input className={inputCls} value={c.text as string} onChange={e => onChange({ ...c, text: e.target.value })} /></Field>
      <Field label="連結 URL"><input className={inputCls} value={c.url as string} onChange={e => onChange({ ...c, url: e.target.value })} /></Field>
    </div>
  )
}

function ProductRefForm({ c, onChange, products }: { c: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void; products: Product[] }) {
  return (
    <div className="space-y-3">
      <Field label="標題 H2"><input className={inputCls} value={c.h2 as string} onChange={e => onChange({ ...c, h2: e.target.value })} /></Field>
      <Field label="副標"><input className={inputCls} value={c.subtitle as string} onChange={e => onChange({ ...c, subtitle: e.target.value })} /></Field>
      <Field label="綁定商品（自動拉獎品清單）">
        <select className={inputCls} value={c.product_id as string} onChange={e => onChange({ ...c, product_id: e.target.value })}>
          <option value="">-- 選擇商品 --</option>
          {products.map(p => <option key={p.id} value={p.id}>#{p.id} {p.name}</option>)}
        </select>
      </Field>
    </div>
  )
}

// ─── Section row ──────────────────────────────────────────────────────────────
function SectionRow({ section, idx, total, products, onSave, onDelete, onMoveUp, onMoveDown }:
  { section: Section; idx: number; total: number; products: Product[]
    onSave: (id: string, content: Record<string, unknown>) => void
    onDelete: (id: string) => void
    onMoveUp: (id: string) => void
    onMoveDown: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [content, setContent] = useState<Record<string, unknown>>(section.content)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const handleSave = async () => {
    setSaving(true)
    try { await onSave(section.id, content); toast('已儲存', 'success') }
    catch { toast('儲存失敗', 'error') }
    finally { setSaving(false) }
  }

  const FormComponent = {
    hero: HeroForm, text: TextForm, steps: StepsForm, cards: CardsForm,
    highlight: HighlightForm, cta: CtaForm,
    product_ref: (props: { c: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) =>
      <ProductRefForm {...props} products={products} />,
  }[section.type]

  return (
    <div className="border border-neutral-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-white cursor-pointer hover:bg-neutral-50 transition-colors" onClick={() => setOpen(o => !o)}>
        <span className="text-sm font-bold text-neutral-700 flex-1">{TYPE_LABELS[section.type]}</span>
        <div className="flex items-center gap-1">
          <button onClick={e => { e.stopPropagation(); onMoveUp(section.id) }} disabled={idx === 0}
            className="w-7 h-7 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-400 disabled:opacity-30 transition-colors text-sm">↑</button>
          <button onClick={e => { e.stopPropagation(); onMoveDown(section.id) }} disabled={idx === total - 1}
            className="w-7 h-7 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-400 disabled:opacity-30 transition-colors text-sm">↓</button>
          <button onClick={e => { e.stopPropagation(); if (confirm('確定刪除此 section？')) onDelete(section.id) }}
            className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-red-400 transition-colors text-sm">×</button>
          <span className="text-neutral-300 text-sm ml-1">{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && (
        <div className="border-t border-neutral-100 px-4 py-4 bg-neutral-50 space-y-4">
          <FormComponent c={content} onChange={setContent} />
          <div className="flex justify-end">
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-60">
              {saving ? '儲存中...' : '儲存此 Section'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function EventEditPage() {
  const { id } = useParams<{ id: string }>()
  const { toast } = useToast()
  const [event, setEvent] = useState<Event | null>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [savingMeta, setSavingMeta] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [meta, setMeta] = useState<Partial<Event>>({})

  const load = useCallback(async () => {
    const [evtRes, secRes, prodRes] = await Promise.all([
      fetch(`/api/admin/events/${id}`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`/api/admin/events/${id}/sections`).then(r => r.json()).catch(() => []),
      fetch('/api/admin/products').then(r => r.json()).catch(() => []),
    ])
    if (evtRes) { setEvent(evtRes); setMeta(evtRes) }
    setSections(Array.isArray(secRes) ? secRes : [])
    setProducts(Array.isArray(prodRes) ? prodRes : [])
    setIsLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  const saveMeta = async () => {
    setSavingMeta(true)
    try {
      const res = await fetch(`/api/admin/events/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta),
      })
      if (!res.ok) throw new Error()
      toast('已儲存', 'success')
      load()
    } catch { toast('儲存失敗', 'error') }
    finally { setSavingMeta(false) }
  }

  const addSection = async (type: SectionType) => {
    setShowAddMenu(false)
    const res = await fetch(`/api/admin/events/${id}/sections`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, content: defaultContent(type) }),
    })
    if (res.ok) { toast('已新增 section', 'success'); load() }
  }

  const saveSection = async (sectionId: string, content: Record<string, unknown>) => {
    const res = await fetch(`/api/admin/events/${id}/sections/${sectionId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }),
    })
    if (!res.ok) throw new Error()
    load()
  }

  const deleteSection = async (sectionId: string) => {
    await fetch(`/api/admin/events/${id}/sections/${sectionId}`, { method: 'DELETE' })
    load()
  }

  const moveSection = async (sectionId: string, dir: 'up' | 'down') => {
    const idx = sections.findIndex(s => s.id === sectionId)
    if (idx < 0) return
    const next = [...sections]
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= next.length) return
    ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
    const order = next.map(s => s.id)
    await fetch(`/api/admin/events/${id}/sections/reorder`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order }),
    })
    setSections(next)
  }

  if (isLoading) return <AdminLayout pageTitle="編輯活動"><div className="flex items-center justify-center py-32 text-neutral-400">載入中...</div></AdminLayout>
  if (!event) return <AdminLayout pageTitle="編輯活動"><div className="py-32 text-center text-neutral-400">活動不存在</div></AdminLayout>

  return (
    <AdminLayout pageTitle={`編輯：${event.title}`}>
      <div className="space-y-6">
        {/* Basic Info */}
        <PageCard>
          <h2 className="text-base font-bold text-neutral-800 mb-4">基本資訊</h2>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-500 mb-1.5">活動標題</label>
                <input className={inputCls} value={meta.title || ''} onChange={e => setMeta(m => ({ ...m, title: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-500 mb-1.5">Slug（/lp/___）</label>
                <input className={inputCls + ' font-mono'} value={meta.slug || ''} onChange={e => setMeta(m => ({ ...m, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-2">主題色</label>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {PRESETS.map(p => (
                  <button key={p.label} onClick={() => setMeta(m => ({ ...m, bg_color: p.bg, accent_color: p.accent }))}
                    className={`rounded-xl h-10 relative overflow-hidden border-2 transition-all ${meta.bg_color === p.bg ? 'border-primary' : 'border-transparent'}`}
                    style={{ background: p.bg }}>
                    <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 30%, ${p.accent}66, transparent 70%)` }} />
                    <span className="absolute bottom-0.5 left-0 right-0 text-center text-[9px] font-bold text-white/70">{p.label}</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-neutral-400 font-semibold">背景</span>
                  <input type="color" value={meta.bg_color || '#0a0610'} onChange={e => setMeta(m => ({ ...m, bg_color: e.target.value }))} className="w-7 h-7 rounded cursor-pointer border-0" />
                  <span className="text-xs font-mono text-neutral-400">{meta.bg_color}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-neutral-400 font-semibold">主色</span>
                  <input type="color" value={meta.accent_color || '#ffd24a'} onChange={e => setMeta(m => ({ ...m, accent_color: e.target.value }))} className="w-7 h-7 rounded cursor-pointer border-0" />
                  <span className="text-xs font-mono text-neutral-400">{meta.accent_color}</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-500 mb-1.5">開始時間</label>
                <input type="datetime-local" className={inputCls} value={meta.start_at ? new Date(meta.start_at).toISOString().slice(0, 16) : ''}
                  onChange={e => setMeta(m => ({ ...m, start_at: e.target.value || null }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-500 mb-1.5">結束時間</label>
                <input type="datetime-local" className={inputCls} value={meta.end_at ? new Date(meta.end_at).toISOString().slice(0, 16) : ''}
                  onChange={e => setMeta(m => ({ ...m, end_at: e.target.value || null }))} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={meta.is_active ?? true} onChange={e => setMeta(m => ({ ...m, is_active: e.target.checked }))} className="w-4 h-4 accent-primary" />
                <span className="text-sm font-semibold text-neutral-700">上架中</span>
              </label>
              <div className="flex items-center gap-3">
                <a href={`${process.env.NEXT_PUBLIC_FRONTEND_URL}/events/${event.slug}`} target="_blank" rel="noopener"
                  className="text-xs text-primary font-semibold hover:underline">/events/{event.slug} ↗</a>
                <button onClick={saveMeta} disabled={savingMeta}
                  className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-60">
                  {savingMeta ? '儲存中...' : '儲存設定'}
                </button>
              </div>
            </div>
          </div>
        </PageCard>

        {/* Sections */}
        <PageCard>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-neutral-800">Sections（{sections.length}）</h2>
            <div className="relative">
              <button onClick={() => setShowAddMenu(o => !o)}
                className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors">
                + 新增 Section
              </button>
              {showAddMenu && (
                <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden min-w-[160px]">
                  {ALL_TYPES.map(type => (
                    <button key={type} onClick={() => addSection(type)}
                      className="w-full text-left px-4 py-3 hover:bg-neutral-50 transition-colors border-b border-neutral-100 last:border-0">
                      <div className="text-sm font-bold text-neutral-800">{TYPE_LABELS[type]}</div>
                      <div className="text-xs text-neutral-400 mt-0.5">{TYPE_DESC[type]}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {sections.length === 0 ? (
            <div className="py-12 text-center text-neutral-400 text-sm">還沒有 sections，點「新增 Section」開始</div>
          ) : (
            <div className="space-y-2">
              {sections.map((sec, idx) => (
                <SectionRow key={sec.id} section={sec} idx={idx} total={sections.length} products={products}
                  onSave={saveSection} onDelete={deleteSection}
                  onMoveUp={id => moveSection(id, 'up')} onMoveDown={id => moveSection(id, 'down')} />
              ))}
            </div>
          )}
        </PageCard>
      </div>
    </AdminLayout>
  )
}
