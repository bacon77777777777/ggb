'use client'

import { AdminLayout, PageCard } from '@/components'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useToast } from '@/contexts/ToastContext'
import ScheduleFields from '@/components/ScheduleFields'
import Input from '@/components/ui/Input'
import ImageUploadField from '@/components/ui/ImageUploadField'
import Textarea from '@/components/ui/Textarea'
import SelectField from '@/components/ui/SelectField'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Event {
  id: string; slug: string; title: string
  bg_color: string; accent_color: string
  is_active: boolean; start_at: string | null; end_at: string | null; kind: string | null
  linked_category_id: string | null
  theme_mode: 'dark' | 'light'
  hero_mode?: 'dark' | 'light' | 'follow'
}
interface Section { id: string; type: SectionType; sort_order: number; content: Record<string, unknown> }
type SectionType = 'hero' | 'text' | 'steps' | 'cards' | 'highlight' | 'cta' | 'product_ref' | 'stats' | 'fukuro' | 'rel' | 'rule' | 'table' | 'gallery' | 'features' | 'countdown' | 'sticky_cta'
interface Product { id: number; name: string }

const TYPE_LABELS: Record<SectionType, string> = {
  hero: '封面主視覺',
  text: '標題＋正文',
  steps: '步驟說明',
  cards: '獎品卡牌',
  stats: '數字亮點',
  fukuro: '重點標籤框',
  rel: '排名清單',
  rule: '規則四格',
  table: '比較表格',
  gallery: '圖片相簿',
  features: '特色四格',
  countdown: '倒數計時',
  sticky_cta: '懸浮按鈕',
  highlight: '強調說明框',
  cta: '底部按鈕',
  product_ref: '商品獎品清單',
}

const TYPE_DESC: Record<SectionType, string> = {
  hero: '活動標題、副標、CTA 按鈕，進場第一屏',
  text: '自由標題＋內文，用於活動說明',
  steps: '1→2→3 編號步驟，說明玩法流程',
  cards: 'SS賞/S賞 等獎品卡，支援一般/豪華兩種樣式，可加圖片',
  stats: '4格大數字指標，展示機率/人數/倍率等關鍵數據',
  fukuro: '帶 chip 標籤的大重點框 + 底部虛線注意事項（預設金色）',
  rel: '名稱 ＋ 數值（金色）＋ 說明，適合稀有度/賠率排名比較',
  rule: '2×2 規則卡片格，各格有彩色標題＋說明，適合規則/優惠重點',
  table: '多欄比較表，支援標頭列與強調欄（第幾欄發光）',
  gallery: '2×N 格圖片或影片相簿（R2 URL），底部可加說明文字',
  features: '4格特色卡，icon（emoji或URL）+ 標題 + 說明文字',
  countdown: '活動倒數計時，自動更新秒數；到期後顯示自訂文字',
  sticky_cta: '頁面底部懸浮的金色 CTA 按鈕，全局唯一，每頁只加一次',
  highlight: '帶邊框的重點框，適合優惠條款或特別說明',
  cta: '底部全寬大按鈕，點擊導向商品頁',
  product_ref: '選一個商品 ID，自動抓取獎品清單顯示',
}
const ALL_TYPES: SectionType[] = [
  'hero', 'text', 'stats', 'steps', 'cards', 'rel', 'rule', 'fukuro',
  'table', 'gallery', 'features', 'countdown', 'sticky_cta',
  'highlight', 'cta', 'product_ref',
]

const THEME_BG: Record<'dark' | 'light', string> = { dark: '#0a0610', light: '#ffffff' }

// ─── Default content per type ─────────────────────────────────────────────────
function defaultContent(type: SectionType): Record<string, unknown> {
  switch (type) {
    case 'hero': return { eyebrow: '', title: '', subtitle: '', highlight_text: '', badge_text: '進行中', cta_text: '立即參加', cta_url: '/', gems: [] }
    case 'text': return { h2: '', subtitle: '', body: '' }
    case 'steps': return { h2: '遊玩方式', subtitle: '', steps: [{ title: '', description: '' }] }
    case 'cards': return { h2: '獎品', subtitle: '', note: '', cards: [{ tag: '', variant: 'star', title: '', subtitle: '', value: '', unit: '', extras: [] }] }
    case 'stats': return { h2: '', subtitle: '', stats: [{ v: '', l: '' }, { v: '', l: '' }, { v: '', l: '' }, { v: '', l: '' }] }
    case 'fukuro': return { h2: '', subtitle: '', ft: '', fb: '', fb2: '', chips: [], callout: '', variant: 'gold' }
    case 'rel': return { h2: '', subtitle: '', rows: [{ name: '', value: '', desc: '', name_color: '' }], callout: '' }
    case 'rule': return { h2: '', subtitle: '', rules: [{ title: '', desc: '', title_color: '' }, { title: '', desc: '', title_color: '' }, { title: '', desc: '', title_color: '' }, { title: '', desc: '', title_color: '' }], callout: '' }
    case 'table': return { h2: '', subtitle: '', columns: ['方案', '一般', '優惠', '活動'], rows: [['代幣數', '', '', ''], ['售價', '', '', '']], highlight_col: 3, note: '' }
    case 'gallery': return { h2: '', subtitle: '', layout: 'grid', items: [{ media_type: 'image', url: '', poster: '', caption: '' }] }
    case 'features': return { h2: '', subtitle: '', items: [{ icon: '🎁', title: '', desc: '' }, { icon: '⚡', title: '', desc: '' }, { icon: '🔥', title: '', desc: '' }, { icon: '✨', title: '', desc: '' }] }
    case 'countdown': return { h2: '活動倒數', subtitle: '', target_at: '', expired_text: '活動已結束，敬請期待下次！', cta_text: '立即參加', cta_url: '/' }
    case 'sticky_cta': return { text: '立即參加', url: '/', sub_text: '限時優惠・每人限購一次' }
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

function HeroForm({ c, onChange }: { c: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const set = (k: string, v: unknown) => onChange({ ...c, [k]: v })
  return (
    <div className="space-y-3">
      <Field label="Eyebrow（小標籤）"><Input value={c.eyebrow as string} onChange={e => set('eyebrow', e.target.value)} placeholder="GGB EVENT" /></Field>
      <Field label="大標題"><Input value={c.title as string} onChange={e => set('title', e.target.value)} placeholder="夏日轉蛋祭" /></Field>
      <Field label="副標題"><Textarea rows={2} value={c.subtitle as string} onChange={e => set('subtitle', e.target.value)} /></Field>
      <Field label="強調文字（虛線框）"><Input value={c.highlight_text as string} onChange={e => set('highlight_text', e.target.value)} placeholder="儲值加碼 2倍票券" /></Field>
      <Field label="狀態 Badge"><Input value={c.badge_text as string} onChange={e => set('badge_text', e.target.value)} placeholder="進行中 / 2026.07.27" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="CTA 按鈕文字"><Input value={c.cta_text as string} onChange={e => set('cta_text', e.target.value)} /></Field>
        <Field label="CTA 連結 URL"><Input value={c.cta_url as string} onChange={e => set('cta_url', e.target.value)} placeholder="/shop/xxx" /></Field>
      </div>
      <div className="border border-neutral-200 rounded-xl p-3 space-y-2 bg-neutral-50">
        <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide">背景影片（可選，P3功能）</span>
        <Field label="影片 URL（R2/CDN mp4）"><Input value={c.bg_video_url as string || ''} onChange={e => set('bg_video_url', e.target.value)} placeholder="https://r2.ggb.com.tw/videos/xxx.mp4" /></Field>
        <ImageUploadField label="Poster 圖" hint="（影片載入前顯示）"
          value={c.bg_poster_url as string || ''} onChange={v => set('bg_poster_url', v)} />
      </div>
    </div>
  )
}

function TextForm({ c, onChange }: { c: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const set = (k: string, v: unknown) => onChange({ ...c, [k]: v })
  return (
    <div className="space-y-3">
      <Field label="標題 H2"><Input value={c.h2 as string} onChange={e => set('h2', e.target.value)} /></Field>
      <Field label="副標"><Input value={c.subtitle as string} onChange={e => set('subtitle', e.target.value)} /></Field>
      <Field label="內文"><Textarea rows={5} value={c.body as string} onChange={e => set('body', e.target.value)} /></Field>
    </div>
  )
}

function StatsForm({ c, onChange }: { c: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const stats = (c.stats as { v: string; l: string; color?: string }[]) || []
  const setStat = (i: number, k: string, v: string) => {
    const next = stats.map((s, idx) => idx === i ? { ...s, [k]: v } : s)
    onChange({ ...c, stats: next })
  }
  const addStat = () => onChange({ ...c, stats: [...stats, { v: '', l: '' }] })
  const removeStat = (i: number) => onChange({ ...c, stats: stats.filter((_, idx) => idx !== i) })
  return (
    <div className="space-y-3">
      <Field label="標題 H2"><Input value={c.h2 as string || ''} onChange={e => onChange({ ...c, h2: e.target.value })} placeholder="活動數據" /></Field>
      <Field label="副標"><Input value={c.subtitle as string || ''} onChange={e => onChange({ ...c, subtitle: e.target.value })} /></Field>
      <div className="space-y-2">
        <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wide">指標（最多 4 個，2 欄或 4 欄排列）</label>
        {stats.map((s, i) => (
          <div key={i} className="flex gap-2 items-center border border-neutral-100 rounded-lg p-2 bg-neutral-50">
            <Input className="flex-1" placeholder="數值（如 100+）" value={s.v} onChange={e => setStat(i, 'v', e.target.value)} />
            <Input className="flex-1" placeholder="說明（如 參與獎品）" value={s.l} onChange={e => setStat(i, 'l', e.target.value)} />
            <Input type="color" value={s.color || '#ffd24a'} onChange={e => setStat(i, 'color', e.target.value)} className="w-9 h-9 cursor-pointer flex-none" title="數值顏色" />
            <button onClick={() => removeStat(i)} className="text-red-400 hover:text-red-600 text-lg leading-none w-7 flex-none">×</button>
          </div>
        ))}
        <button onClick={addStat} className="text-xs text-primary font-bold hover:underline">+ 新增指標</button>
      </div>
    </div>
  )
}

function FukuroForm({ c, onChange }: { c: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const set = (k: string, v: unknown) => onChange({ ...c, [k]: v })
  const chips = (c.chips as string[]) || []
  return (
    <div className="space-y-3">
      <Field label="標題 H2"><Input value={c.h2 as string || ''} onChange={e => set('h2', e.target.value)} /></Field>
      <Field label="副標"><Input value={c.subtitle as string || ''} onChange={e => set('subtitle', e.target.value)} /></Field>
      <Field label="框底色風格">
        <SelectField value={c.variant as string || 'gold'} onChange={e => set('variant', e.target.value)}>
          <option value="gold">金/橙（預設）— 適合優惠/特賣</option>
          <option value="accent">主題色 — 適合特別說明</option>
        </SelectField>
      </Field>
      <div className="border border-neutral-200 rounded-xl p-3 space-y-3 bg-neutral-50">
        <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide">框內容</span>
        <Field label="框內大標題 (ft)"><Input value={c.ft as string || ''} onChange={e => set('ft', e.target.value)} placeholder="限時優惠標題" /></Field>
        <Field label="說明文字 (fb)"><Textarea rows={3} value={c.fb as string || ''} onChange={e => set('fb', e.target.value)} placeholder="詳細說明..." /></Field>
        <Field label="強調第二行 (fb2, accent 色)"><Input value={c.fb2 as string || ''} onChange={e => set('fb2', e.target.value)} placeholder="如：額外贈送 4 張票券" /></Field>
        <Field label="Chip 標籤（每行一個）">
          <Textarea rows={3} value={chips.join('\n')} placeholder={'20代幣包\n50代幣包\n100代幣包'} onChange={e => set('chips', e.target.value.split('\n').filter(Boolean))} />
        </Field>
      </div>
      <Field label="底部注意事項（虛線框）"><Textarea rows={3} value={c.callout as string || ''} onChange={e => set('callout', e.target.value)} placeholder="⚠ 注意：..." /></Field>
    </div>
  )
}

function RelForm({ c, onChange }: { c: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  type RelRow = { name: string; value: string; desc?: string; name_color?: string }
  const rows = (c.rows as RelRow[]) || []
  const setRow = (i: number, k: string, v: string) => {
    const next = rows.map((r, idx) => idx === i ? { ...r, [k]: v } : r)
    onChange({ ...c, rows: next })
  }
  const addRow = () => onChange({ ...c, rows: [...rows, { name: '', value: '', desc: '', name_color: '' }] })
  const removeRow = (i: number) => onChange({ ...c, rows: rows.filter((_, idx) => idx !== i) })
  return (
    <div className="space-y-3">
      <Field label="標題 H2"><Input value={c.h2 as string || ''} onChange={e => onChange({ ...c, h2: e.target.value })} /></Field>
      <Field label="副標"><Input value={c.subtitle as string || ''} onChange={e => onChange({ ...c, subtitle: e.target.value })} /></Field>
      <div className="space-y-2">
        <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wide">比較列（左欄名稱，右欄金色數值＋說明）</label>
        {rows.map((r, i) => (
          <div key={i} className="border border-neutral-100 rounded-lg p-3 bg-neutral-50 space-y-2">
            <div className="flex gap-2 items-center">
              <Input type="color" value={r.name_color || '#ff7a7a'} onChange={e => setRow(i, 'name_color', e.target.value)} className="w-9 h-9 cursor-pointer flex-none" title="名稱顏色" />
              <Input className="flex-1" placeholder="名稱（如：S賞）" value={r.name} onChange={e => setRow(i, 'name', e.target.value)} />
              <Input className="flex-1" placeholder="數值/等級（如：★★★★）" value={r.value} onChange={e => setRow(i, 'value', e.target.value)} />
              <button onClick={() => removeRow(i)} className="text-red-400 hover:text-red-600 text-lg leading-none w-7 flex-none">×</button>
            </div>
            <Input placeholder="說明（如：最高稀有度）" value={r.desc || ''} onChange={e => setRow(i, 'desc', e.target.value)} />
          </div>
        ))}
        <button onClick={addRow} className="text-xs text-primary font-bold hover:underline">+ 新增列</button>
      </div>
      <Field label="底部注意事項（虛線框）"><Textarea rows={2} value={c.callout as string || ''} onChange={e => onChange({ ...c, callout: e.target.value })} placeholder="⚠ 補充說明..." /></Field>
    </div>
  )
}

function RuleForm({ c, onChange }: { c: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  type RuleItem = { title: string; desc: string; title_color?: string }
  const rules = (c.rules as RuleItem[]) || []
  const setRule = (i: number, k: string, v: string) => {
    const next = rules.map((r, idx) => idx === i ? { ...r, [k]: v } : r)
    onChange({ ...c, rules: next })
  }
  const addRule = () => onChange({ ...c, rules: [...rules, { title: '', desc: '', title_color: '' }] })
  const removeRule = (i: number) => onChange({ ...c, rules: rules.filter((_, idx) => idx !== i) })
  return (
    <div className="space-y-3">
      <Field label="標題 H2"><Input value={c.h2 as string || ''} onChange={e => onChange({ ...c, h2: e.target.value })} /></Field>
      <Field label="副標"><Input value={c.subtitle as string || ''} onChange={e => onChange({ ...c, subtitle: e.target.value })} /></Field>
      <div className="space-y-2">
        <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wide">規則卡（2欄排列，標題＋說明，偶數格數效果最佳）</label>
        {rules.map((r, i) => (
          <div key={i} className="flex gap-2 items-start border border-neutral-100 rounded-lg p-2 bg-neutral-50">
            <Input type="color" value={r.title_color || '#c026d3'} onChange={e => setRule(i, 'title_color', e.target.value)} className="w-9 h-9 cursor-pointer flex-none mt-0.5" title="標題顏色" />
            <div className="flex-1 space-y-2">
              <Input placeholder="標題（如：最高稀有）" value={r.title} onChange={e => setRule(i, 'title', e.target.value)} />
              <Input placeholder="說明（如：每 100 抽必得一張 SS 賞）" value={r.desc} onChange={e => setRule(i, 'desc', e.target.value)} />
            </div>
            <button onClick={() => removeRule(i)} className="text-red-400 hover:text-red-600 text-lg leading-none w-7 flex-none mt-1">×</button>
          </div>
        ))}
        <button onClick={addRule} className="text-xs text-primary font-bold hover:underline">+ 新增規則</button>
      </div>
      <Field label="底部注意事項（虛線框）"><Textarea rows={2} value={c.callout as string || ''} onChange={e => onChange({ ...c, callout: e.target.value })} placeholder="⚠ 補充說明..." /></Field>
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
      <Field label="標題 H2"><Input value={c.h2 as string} onChange={e => onChange({ ...c, h2: e.target.value })} /></Field>
      <Field label="副標"><Input value={c.subtitle as string} onChange={e => onChange({ ...c, subtitle: e.target.value })} /></Field>
      <div className="space-y-2">
        {steps.map((s, i) => (
          <div key={i} className="flex gap-2 items-start border border-neutral-100 rounded-lg p-3 bg-neutral-50">
            <span className="text-xs font-black text-neutral-400 mt-2.5 w-4 text-center">{i + 1}</span>
            <div className="flex-1 space-y-2">
              <Input placeholder="步驟標題" value={s.title} onChange={e => setStep(i, 'title', e.target.value)} />
              <Input placeholder="說明" value={s.description} onChange={e => setStep(i, 'description', e.target.value)} />
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
  type CardItem = { tag: string; variant: string; title: string; subtitle: string; value: string; unit: string; extras: string[]; image_url?: string }
  const cards = (c.cards as CardItem[]) || []
  const setCard = (i: number, k: string, v: unknown) => {
    const next = cards.map((card, idx) => idx === i ? { ...card, [k]: v } : card)
    onChange({ ...c, cards: next })
  }
  const addCard = () => onChange({ ...c, cards: [...cards, { tag: '', variant: 'star', title: '', subtitle: '', value: '', unit: '', extras: [], image_url: '' }] })
  const removeCard = (i: number) => onChange({ ...c, cards: cards.filter((_, idx) => idx !== i) })
  return (
    <div className="space-y-3">
      <Field label="標題 H2"><Input value={c.h2 as string} onChange={e => onChange({ ...c, h2: e.target.value })} /></Field>
      <Field label="副標"><Input value={c.subtitle as string} onChange={e => onChange({ ...c, subtitle: e.target.value })} /></Field>
      <div className="space-y-3">
        {cards.map((card, i) => (
          <div key={i} className="border border-neutral-200 rounded-xl p-3 space-y-2 bg-neutral-50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-500">卡片 {i + 1}</span>
              <button onClick={() => removeCard(i)} className="text-red-400 hover:text-red-600 text-sm">刪除</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="標籤（SS賞 / 大賞）" value={card.tag} onChange={e => setCard(i, 'tag', e.target.value)} />
              <SelectField value={card.variant} onChange={e => setCard(i, 'variant', e.target.value)}>
                <option value="star">一般</option>
                <option value="grand">豪華（accent 發光）</option>
              </SelectField>
            </div>
            <ImageUploadField label="卡片圖" hint="（可選，顯示在卡片頂部）"
              value={card.image_url || ''} onChange={v => setCard(i, 'image_url', v)} />
            <Input placeholder="卡片標題" value={card.title} onChange={e => setCard(i, 'title', e.target.value)} />
            <Input placeholder="副說明" value={card.subtitle} onChange={e => setCard(i, 'subtitle', e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="數字（如 1）" value={card.value} onChange={e => setCard(i, 'value', e.target.value)} />
              <Input placeholder="單位（如 名）" value={card.unit} onChange={e => setCard(i, 'unit', e.target.value)} />
            </div>
            <Textarea rows={2} placeholder="備註（每行一條）"
              value={(card.extras || []).join('\n')} onChange={e => setCard(i, 'extras', e.target.value.split('\n'))} />
          </div>
        ))}
        <button onClick={addCard} className="text-xs text-primary font-bold hover:underline">+ 新增卡片</button>
      </div>
      <Field label="底部備註"><Textarea rows={2} value={c.note as string} onChange={e => onChange({ ...c, note: e.target.value })} /></Field>
    </div>
  )
}

function TableForm({ c, onChange }: { c: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const columns = (c.columns as string[]) || []
  const rows = (c.rows as string[][]) || []

  const setCol = (i: number, v: string) => {
    const next = [...columns]; next[i] = v; onChange({ ...c, columns: next })
  }
  const addCol = () => onChange({ ...c, columns: [...columns, ''], rows: rows.map(r => [...r, '']) })
  const removeCol = (i: number) => onChange({ ...c, columns: columns.filter((_, ci) => ci !== i), rows: rows.map(r => r.filter((_, ci) => ci !== i)) })

  const setCell = (ri: number, ci: number, v: string) => {
    const next = rows.map((r, idx) => idx === ri ? r.map((c_, j) => j === ci ? v : c_) : r)
    onChange({ ...c, rows: next })
  }
  const addRow = () => onChange({ ...c, rows: [...rows, Array(columns.length).fill('')] })
  const removeRow = (i: number) => onChange({ ...c, rows: rows.filter((_, ri) => ri !== i) })

  return (
    <div className="space-y-3">
      <Field label="標題 H2"><Input value={c.h2 as string || ''} onChange={e => onChange({ ...c, h2: e.target.value })} /></Field>
      <Field label="副標"><Input value={c.subtitle as string || ''} onChange={e => onChange({ ...c, subtitle: e.target.value })} /></Field>
      <Field label="強調欄（第幾欄，0起算；空白=無）">
        <Input type="number" value={c.highlight_col as number ?? ''} min={0}
          onChange={e => onChange({ ...c, highlight_col: e.target.value === '' ? undefined : Number(e.target.value) })} />
      </Field>
      <div className="space-y-2">
        <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wide">表頭欄位</label>
        <div className="flex flex-wrap gap-2">
          {columns.map((col, i) => (
            <div key={i} className="flex items-center gap-1">
              <Input className="w-28" value={col} placeholder={`欄${i+1}`} onChange={e => setCol(i, e.target.value)} />
              <button onClick={() => removeCol(i)} className="text-red-400 hover:text-red-600 text-lg leading-none w-5">×</button>
            </div>
          ))}
          <button onClick={addCol} className="text-xs text-primary font-bold hover:underline self-center">+ 加欄</button>
        </div>
      </div>
      <div className="space-y-2">
        <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wide">資料列（第一格為列標題）</label>
        {rows.map((row, ri) => (
          <div key={ri} className="flex items-center gap-1 flex-wrap">
            {row.map((cell, ci) => (
              <Input key={ci} className="w-28" value={cell} placeholder={ci === 0 ? '列標題' : `欄${ci+1}`}
                onChange={e => setCell(ri, ci, e.target.value)} />
            ))}
            <button onClick={() => removeRow(ri)} className="text-red-400 hover:text-red-600 text-lg leading-none w-5">×</button>
          </div>
        ))}
        <button onClick={addRow} className="text-xs text-primary font-bold hover:underline">+ 加列</button>
      </div>
      <Field label="底部備註"><Input value={c.note as string || ''} onChange={e => onChange({ ...c, note: e.target.value })} /></Field>
    </div>
  )
}

function GalleryForm({ c, onChange }: { c: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  type GItem = { media_type: 'image' | 'video'; url: string; poster?: string; caption?: string }
  const items = (c.items as GItem[]) || []
  const setItem = (i: number, k: string, v: string) => {
    const next = items.map((item, idx) => idx === i ? { ...item, [k]: v } : item)
    onChange({ ...c, items: next })
  }
  const addItem = () => onChange({ ...c, items: [...items, { media_type: 'image', url: '', poster: '', caption: '' }] })
  const removeItem = (i: number) => onChange({ ...c, items: items.filter((_, idx) => idx !== i) })
  return (
    <div className="space-y-3">
      <Field label="標題 H2"><Input value={c.h2 as string || ''} onChange={e => onChange({ ...c, h2: e.target.value })} /></Field>
      <Field label="副標"><Input value={c.subtitle as string || ''} onChange={e => onChange({ ...c, subtitle: e.target.value })} /></Field>
      <div className="space-y-2">
        <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wide">媒體項目</label>
        {items.map((item, i) => (
          <div key={i} className="border border-neutral-200 rounded-xl p-3 space-y-2 bg-neutral-50">
            <div className="flex items-center justify-between">
              <SelectField className="w-28" value={item.media_type} onChange={e => setItem(i, 'media_type', e.target.value)}>
                <option value="image">圖片</option>
                <option value="video">影片</option>
              </SelectField>
              <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600 text-sm">刪除</button>
            </div>
            {item.media_type === 'video'
              ? <Input placeholder="影片 URL（mp4）" value={item.url} onChange={e => setItem(i, 'url', e.target.value)} />
              : <ImageUploadField label="圖片" value={item.url} onChange={v => setItem(i, 'url', v)} />}
            {item.media_type === 'video' && (
              <ImageUploadField label="Poster 圖" hint="（影片載入前顯示）"
                value={item.poster || ''} onChange={v => setItem(i, 'poster', v)} />
            )}
            <Input placeholder="說明文字（可選）" value={item.caption || ''} onChange={e => setItem(i, 'caption', e.target.value)} />
          </div>
        ))}
        <button onClick={addItem} className="text-xs text-primary font-bold hover:underline">+ 新增媒體</button>
      </div>
    </div>
  )
}

function FeaturesForm({ c, onChange }: { c: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  type FItem = { icon: string; title: string; desc: string }
  const items = (c.items as FItem[]) || []
  const setItem = (i: number, k: string, v: string) => {
    const next = items.map((item, idx) => idx === i ? { ...item, [k]: v } : item)
    onChange({ ...c, items: next })
  }
  const addItem = () => onChange({ ...c, items: [...items, { icon: '⭐', title: '', desc: '' }] })
  const removeItem = (i: number) => onChange({ ...c, items: items.filter((_, idx) => idx !== i) })
  return (
    <div className="space-y-3">
      <Field label="標題 H2"><Input value={c.h2 as string || ''} onChange={e => onChange({ ...c, h2: e.target.value })} /></Field>
      <Field label="副標"><Input value={c.subtitle as string || ''} onChange={e => onChange({ ...c, subtitle: e.target.value })} /></Field>
      <div className="space-y-2">
        <label className="block text-[11px] font-bold text-neutral-400 uppercase tracking-wide">特色項目（建議 4 個）</label>
        {items.map((item, i) => (
          <div key={i} className="flex gap-2 items-start border border-neutral-100 rounded-lg p-2 bg-neutral-50">
            <Input className="w-20" placeholder="emoji / URL" value={item.icon} onChange={e => setItem(i, 'icon', e.target.value)} />
            <div className="flex-1 space-y-2">
              <Input placeholder="標題" value={item.title} onChange={e => setItem(i, 'title', e.target.value)} />
              <Input placeholder="說明" value={item.desc} onChange={e => setItem(i, 'desc', e.target.value)} />
            </div>
            <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600 text-lg leading-none w-7 flex-none mt-1">×</button>
          </div>
        ))}
        <button onClick={addItem} className="text-xs text-primary font-bold hover:underline">+ 新增特色</button>
      </div>
    </div>
  )
}

function CountdownForm({ c, onChange }: { c: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const set = (k: string, v: unknown) => onChange({ ...c, [k]: v })
  return (
    <div className="space-y-3">
      <Field label="標題 H2"><Input value={c.h2 as string || ''} onChange={e => set('h2', e.target.value)} /></Field>
      <Field label="副標"><Input value={c.subtitle as string || ''} onChange={e => set('subtitle', e.target.value)} /></Field>
      <Field label="目標時間（ISO 8601）">
        <Input type="datetime-local"
          value={c.target_at ? new Date(c.target_at as string).toISOString().slice(0, 16) : ''}
          onChange={e => set('target_at', e.target.value ? new Date(e.target.value).toISOString() : '')} />
      </Field>
      <Field label="到期後顯示文字"><Input value={c.expired_text as string || ''} onChange={e => set('expired_text', e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="CTA 按鈕文字（未到期顯示）"><Input value={c.cta_text as string || ''} onChange={e => set('cta_text', e.target.value)} /></Field>
        <Field label="CTA 連結 URL"><Input value={c.cta_url as string || ''} onChange={e => set('cta_url', e.target.value)} placeholder="/shop/xxx" /></Field>
      </div>
    </div>
  )
}

function StickyCtaForm({ c, onChange }: { c: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const set = (k: string, v: string) => onChange({ ...c, [k]: v })
  return (
    <div className="space-y-3">
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 font-semibold">
        每個活動頁只能加一個 sticky_cta，它會固定在畫面底部，不跟其他 sections 一起捲動。
      </div>
      <Field label="按鈕文字"><Input value={c.text as string || ''} onChange={e => set('text', e.target.value)} placeholder="立即參加" /></Field>
      <Field label="連結 URL"><Input value={c.url as string || ''} onChange={e => set('url', e.target.value)} placeholder="/shop/xxx" /></Field>
      <Field label="小字說明（按鈕下方）"><Input value={c.sub_text as string || ''} onChange={e => set('sub_text', e.target.value)} placeholder="限時優惠・每人限購一次" /></Field>
    </div>
  )
}

function HighlightForm({ c, onChange }: { c: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  const set = (k: string, v: string) => onChange({ ...c, [k]: v })
  return (
    <div className="space-y-3">
      <Field label="標題"><Input value={c.title as string} onChange={e => set('title', e.target.value)} /></Field>
      <Field label="內文"><Textarea rows={4} value={c.body as string} onChange={e => set('body', e.target.value)} /></Field>
      <Field label="底部補充"><Input value={c.footer as string} onChange={e => set('footer', e.target.value)} /></Field>
    </div>
  )
}

function CtaForm({ c, onChange }: { c: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="按鈕文字"><Input value={c.text as string} onChange={e => onChange({ ...c, text: e.target.value })} /></Field>
      <Field label="連結 URL"><Input value={c.url as string} onChange={e => onChange({ ...c, url: e.target.value })} /></Field>
    </div>
  )
}

function ProductRefForm({ c, onChange, products }: { c: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void; products: Product[] }) {
  return (
    <div className="space-y-3">
      <Field label="標題 H2"><Input value={c.h2 as string} onChange={e => onChange({ ...c, h2: e.target.value })} /></Field>
      <Field label="副標"><Input value={c.subtitle as string} onChange={e => onChange({ ...c, subtitle: e.target.value })} /></Field>
      <Field label="綁定商品（自動拉獎品清單）">
        <SelectField value={c.product_id as string} onChange={e => onChange({ ...c, product_id: e.target.value })}>
          <option value="">-- 選擇商品 --</option>
          {products.map(p => <option key={p.id} value={p.id}>#{p.id} {p.name}</option>)}
        </SelectField>
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

  const formMap: Record<SectionType, React.FC<{ c: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void }>> = {
    hero: HeroForm, text: TextForm, steps: StepsForm, cards: CardsForm,
    stats: StatsForm, fukuro: FukuroForm, rel: RelForm, rule: RuleForm,
    table: TableForm, gallery: GalleryForm, features: FeaturesForm,
    countdown: CountdownForm, sticky_cta: StickyCtaForm,
    highlight: HighlightForm, cta: CtaForm,
    product_ref: (props) => <ProductRefForm {...props} products={products} />,
  }
  const FormComponent = formMap[section.type]

  return (
    <div className="border border-neutral-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-white cursor-pointer hover:bg-neutral-50 transition-colors" onClick={() => setOpen(o => !o)}>
        <span className="text-sm font-bold text-neutral-700 flex-1">{TYPE_LABELS[section.type]}</span>
        <div className="flex items-center gap-1">
          <button onClick={e => { e.stopPropagation(); onMoveUp(section.id) }} disabled={idx === 0}
            className="w-7 h-7 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-400 disabled:opacity-30 transition-colors text-sm">↑</button>
          <button onClick={e => { e.stopPropagation(); onMoveDown(section.id) }} disabled={idx === total - 1}
            className="w-7 h-7 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-400 disabled:opacity-30 transition-colors text-sm">↓</button>
          <button onClick={e => { e.stopPropagation(); if (confirm("\u78ba\u5b9a\u522a\u9664\u6b64 section\uff1f")) onDelete(section.id) }}
            className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-red-400 transition-colors text-sm">×</button>
          <span className="text-neutral-300 text-sm ml-1">{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && (
        <div className="border-t border-neutral-100 px-4 py-4 bg-neutral-50 space-y-4">
          {FormComponent && <FormComponent c={content} onChange={setContent} />}
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
  const [availableCategories, setAvailableCategories] = useState<Array<{ id: string; name: string }>>([])

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
    fetch('/api/admin/categories').then(r => r.json()).then(d => setAvailableCategories(Array.isArray(d) ? d : [])).catch(() => {})
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
                <Input value={meta.title || ''} onChange={e => setMeta(m => ({ ...m, title: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-500 mb-1.5">Slug（/events/___）</label>
                <Input className="font-mono" value={meta.slug || ''} onChange={e => setMeta(m => ({ ...m, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} />
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-neutral-500 mb-1.5">風格</label>
                <SelectField value={meta.theme_mode ?? 'dark'}
                  onChange={e => setMeta(m => ({ ...m, theme_mode: e.target.value as 'dark' | 'light', bg_color: THEME_BG[e.target.value as 'dark' | 'light'] }))}>
                  <option value="dark">深色</option>
                  <option value="light">淺色</option>
                </SelectField>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-neutral-500 mb-1.5">首屏配色</label>
                <SelectField value={meta.hero_mode ?? 'dark'}
                  onChange={e => setMeta(m => ({ ...m, hero_mode: e.target.value as 'dark' | 'light' | 'follow' }))}>
                  <option value="dark">深色（電影感，預設）</option>
                  <option value="light">淺色</option>
                  <option value="follow">跟隨上方風格</option>
                </SelectField>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-neutral-500 mb-1.5">主題色</label>
                <div className="flex items-center gap-2 mt-0.5">
                  <Input type="color" value={meta.accent_color || '#c026d3'} onChange={e => setMeta(m => ({ ...m, accent_color: e.target.value }))} className="w-9 h-9 cursor-pointer" />
                  <span className="text-xs font-mono text-neutral-400">{meta.accent_color}</span>
                </div>
              </div>
            </div>
            <ScheduleFields
              startAt={meta.start_at ?? null}
              endAt={meta.end_at ?? null}
              inheritHint="結束後頁面仍可開啟，版頭顯示「活動已結束」；要完全隱藏請取消上架"
              onChange={patch => setMeta(m => ({ ...m, ...patch }))}
            />
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1.5">
                活動分類 <span className="font-normal text-neutral-400">（僅供後台篩選，不影響前台）</span>
              </label>
              <SelectField value={meta.kind || 'other'}
                onChange={e => setMeta(m => ({ ...m, kind: e.target.value }))}>
                <option value="machine">機台檔期</option>
                <option value="campaign">行銷活動</option>
                <option value="guide">說明指南</option>
                <option value="other">其他</option>
              </SelectField>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1.5">
                分類清單 <span className="font-normal text-neutral-400">（選填，LP 底部自動顯示該分類商品）</span>
              </label>
              <SelectField value={meta.linked_category_id || ''}
                onChange={e => setMeta(m => ({ ...m, linked_category_id: e.target.value || null }))}>
                <option value="">不連結分類</option>
                {availableCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </SelectField>
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
                <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden min-w-[220px]">
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
