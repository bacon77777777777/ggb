'use client'

import { useState, useEffect } from 'react'
import AdminLayout from '@/components/AdminLayout'

// ─── 前台 Color Tokens（來源：frontend/tailwind.config.js）─────
const primaryTokens = [
  { name: 'primary',       hex: '#EE4D2D', usage: '主要按鈕、CTA、highlight' },
  { name: 'primary-dark',  hex: '#D9441F', usage: 'hover 態' },
  { name: 'primary-light', hex: '#FF7043', usage: '淡版' },
  { name: 'primary-soft',  hex: '#FFF4EF', usage: '極淡背景' },
]

const accentTokens = [
  { name: 'accent-red',     hex: '#DC2626', usage: '獎項、價格紅' },
  { name: 'accent-yellow',  hex: '#FACC15', usage: '代幣金' },
  { name: 'accent-emerald', hex: '#10B981', usage: '成功綠' },
]

const colorTokens = [
  { name: 'neutral-50',  hex: '#F9FAFB', usage: '極淡背景' },
  { name: 'neutral-100', hex: '#F3F4F6', usage: '次淡背景' },
  { name: 'neutral-200', hex: '#E5E7EB', usage: 'border 主要' },
  { name: 'neutral-300', hex: '#D1D5DB', usage: 'divider' },
  { name: 'neutral-400', hex: '#9CA3AF', usage: 'placeholder、icon' },
  { name: 'neutral-500', hex: '#6B7280', usage: '輔助文字' },
  { name: 'neutral-600', hex: '#4B5563', usage: '次要文字' },
  { name: 'neutral-700', hex: '#374151', usage: '主體文字（light）' },
  { name: 'neutral-800', hex: '#1F2937', usage: 'dark surface（卡片）' },
  { name: 'neutral-900', hex: '#111827', usage: '標題 / dark page bg' },
]

const darkBgTokens = [
  { name: 'neutral-800', hex: '#1F2937', usage: 'dark surface（卡片）' },
  { name: 'neutral-900', hex: '#111827', usage: 'dark page bg' },
]

// ─── Section wrapper ─────────────────────────────────────────
function Section({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-12">
      <h2 className="text-sm font-semibold text-neutral-900 mb-4 pb-2 border-b border-neutral-200">
        {title}
      </h2>
      {children}
    </section>
  )
}

// ─── Scan 資料型別 ──────────────────────────────────────────
type ScanRun = {
  ran_at: string
  files_scanned: number
  total_violations: number
  files_with_violations: number
}
type FileViolation = {
  line_number: number
  violation_type: string
  violation_class: string
  line_content: string
  fix_hint: string
}
type ScanData = {
  run: ScanRun | null
  byType: Record<string, number>
  byFile: Record<string, FileViolation[]>
}

// ─── Compliance Scan Panel ──────────────────────────────────
function CompliancePanel() {
  const [data, setData] = useState<ScanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedFile, setExpandedFile] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/frontend-design-scan')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-xs text-neutral-400 py-4">載入掃描結果...</div>
  if (!data?.run) return (
    <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 text-xs text-neutral-500">
      尚無掃描記錄。請在本地執行：
      <code className="font-mono ml-1 text-primary">npx tsx scripts/frontend-design-scan.ts</code>
    </div>
  )

  const { run, byType, byFile } = data
  const typeEntries = Object.entries(byType).sort((a, b) => b[1] - a[1])
  const maxCount = typeEntries[0]?.[1] || 1
  const fileEntries = Object.entries(byFile).sort((a, b) => b[1].length - a[1].length)
  const cleanPct = Math.round((1 - run.files_with_violations / run.files_scanned) * 100)

  return (
    <div className="space-y-4">
      {/* 統計摘要 */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: '掃描檔案', value: run.files_scanned, color: 'text-neutral-700' },
          { label: '總違規數', value: run.total_violations, color: run.total_violations > 0 ? 'text-red-600' : 'text-green-600' },
          { label: '違規檔案', value: run.files_with_violations, color: run.files_with_violations > 0 ? 'text-orange-600' : 'text-green-600' },
          { label: '合規率', value: `${cleanPct}%`, color: cleanPct >= 80 ? 'text-green-600' : cleanPct >= 50 ? 'text-orange-600' : 'text-red-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white border border-neutral-200 rounded-lg p-3 text-center">
            <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
            <div className="text-[10px] text-neutral-400 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* 違規類型分布 */}
      <div className="bg-white border border-neutral-200 rounded-lg p-4">
        <div className="text-xs font-semibold text-neutral-500 mb-3">違規類型分布</div>
        <div className="space-y-2">
          {typeEntries.map(([type, count]) => (
            <div key={type} className="flex items-center gap-3">
              <code className="text-[10px] font-mono text-neutral-600 w-44 flex-shrink-0">{type}</code>
              <div className="flex-1 bg-neutral-100 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full bg-red-400"
                  style={{ width: `${(count / maxCount) * 100}%` }}
                />
              </div>
              <span className="text-xs font-mono text-neutral-500 w-8 text-right">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 違規檔案列表 */}
      <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 text-xs font-semibold text-neutral-500">
          違規檔案（{fileEntries.length} 個，依違規數排序）
        </div>
        <div className="divide-y divide-neutral-100 max-h-96 overflow-y-auto">
          {fileEntries.map(([file, viols]) => (
            <div key={file}>
              <button
                onClick={() => setExpandedFile(expandedFile === file ? null : file)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-neutral-50 transition-colors text-left"
              >
                <code className="text-[10px] font-mono text-neutral-600 truncate flex-1">{file}</code>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <span className="text-[10px] text-red-500 font-mono">{viols.length} 處</span>
                  <svg className={`w-3 h-3 text-neutral-400 transition-transform ${expandedFile === file ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>
              {expandedFile === file && (
                <div className="bg-neutral-50 px-4 py-2 space-y-1.5">
                  {viols.map((v, i) => (
                    <div key={i} className="flex items-start gap-2 text-[10px]">
                      <span className="text-neutral-400 font-mono w-8 flex-shrink-0">L{v.line_number}</span>
                      <code className="text-red-500 font-mono flex-shrink-0 max-w-[120px] truncate">{v.violation_class}</code>
                      <span className="text-neutral-400 truncate flex-1" title={v.line_content}>{v.line_content}</span>
                      <span className="text-green-600 flex-shrink-0">→ {v.fix_hint}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="text-[10px] text-neutral-400">
        上次掃描：{new Date(run.ran_at).toLocaleString('zh-TW')} ・ 更新請在本地執行{' '}
        <code className="font-mono">npx tsx scripts/frontend-design-scan.ts</code>
      </div>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────
export default function FrontendDesignSystemPage() {
  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto py-8 px-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-baseline gap-3 mb-1">
            <h1 className="text-xl font-bold text-neutral-900">前台 Design System</h1>
            <span className="text-xs font-mono text-neutral-400">GGB frontend/ 合規稽核</span>
          </div>
          <p className="text-sm text-neutral-500">掃描前台所有 .tsx/.ts 檔案，檢查 token 使用、magic value、z-index 混亂等違規。</p>
        </div>

        {/* ── Compliance Scan ── */}
        <Section title="Design Compliance Scan" id="scan">
          <CompliancePanel />
        </Section>

        {/* ── 前台 Color Tokens ── */}
        <Section title="Color Tokens" id="colors">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Primary（橘紅）</h3>
          <div className="grid grid-cols-4 gap-2 mb-5">
            {primaryTokens.map(t => (
              <div key={t.name} className="rounded-lg overflow-hidden border border-neutral-200">
                <div className="h-10" style={{ background: t.hex }} />
                <div className="p-2 bg-white">
                  <div className="text-[9px] font-mono font-semibold text-neutral-600 truncate">{t.name}</div>
                  <div className="text-[9px] font-mono text-neutral-400">{t.hex}</div>
                  <div className="text-[8px] text-neutral-400 mt-0.5 leading-tight">{t.usage}</div>
                </div>
              </div>
            ))}
          </div>

          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Accent</h3>
          <div className="grid grid-cols-3 gap-2 mb-5">
            {accentTokens.map(t => (
              <div key={t.name} className="rounded-lg overflow-hidden border border-neutral-200">
                <div className="h-10" style={{ background: t.hex }} />
                <div className="p-2 bg-white">
                  <div className="text-[9px] font-mono font-semibold text-neutral-600 truncate">{t.name}</div>
                  <div className="text-[9px] font-mono text-neutral-400">{t.hex}</div>
                  <div className="text-[8px] text-neutral-400 mt-0.5 leading-tight">{t.usage}</div>
                </div>
              </div>
            ))}
          </div>

          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Neutral</h3>
          <div className="grid grid-cols-5 gap-2 mb-5">
            {colorTokens.map(t => (
              <div key={t.name} className="rounded-lg overflow-hidden border border-neutral-200">
                <div className="h-8" style={{ background: t.hex }} />
                <div className="p-1.5 bg-white">
                  <div className="text-[8px] font-mono font-semibold text-neutral-600 truncate">{t.name}</div>
                  <div className="text-[8px] font-mono text-neutral-400">{t.hex}</div>
                  <div className="text-[7px] text-neutral-400 mt-0.5 leading-tight">{t.usage}</div>
                </div>
              </div>
            ))}
          </div>

          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Dark Mode Backgrounds</h3>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {darkBgTokens.map(t => (
              <div key={t.name} className="rounded-lg overflow-hidden border border-neutral-200">
                <div className="h-10" style={{ background: t.hex }} />
                <div className="p-2" style={{ background: '#111827' }}>
                  <div className="text-[9px] font-mono font-semibold text-neutral-300 truncate">{t.name}</div>
                  <div className="text-[9px] font-mono text-neutral-500">{t.hex}</div>
                  <div className="text-[8px] text-neutral-500 mt-0.5 leading-tight">{t.usage}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-xs text-neutral-500 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
            <strong className="text-yellow-700">規範：</strong>{' '}
            禁止 <code className="font-mono">bg-[#xxx]</code> magic hex。
            禁止 <code className="font-mono">bg-primary-600</code>（token 不存在，改 <code className="font-mono">bg-primary</code>）。
            禁止 <code className="font-mono">gray-*</code>（改 <code className="font-mono">neutral-*</code>）。
          </div>
        </Section>

        {/* ── z-index 規範 ── */}
        <Section title="Layer / z-index 規範" id="layers">
          <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden mb-3">
            {[
              { z: 'z-10',  label: '懸浮按鈕、sticky bar',  examples: 'FloatingCheckIn、購買 bar' },
              { z: 'z-20',  label: '下拉選單、tooltip',      examples: 'dropdown, popover' },
              { z: 'z-30',  label: 'Navbar（固定頂部）',     examples: 'Navbar, MobileTabbar' },
              { z: 'z-40',  label: 'Drawer、側邊欄',         examples: '購物車 drawer' },
              { z: 'z-50',  label: 'Modal、Dialog',          examples: '各種 modal overlay' },
              { z: 'z-[60]',label: 'Toast（例外允許）',      examples: 'Sonner toast' },
            ].map(({ z, label, examples }) => (
              <div key={z} className="flex items-center gap-4 px-4 py-2.5 border-b border-neutral-100 last:border-0">
                <code className="font-mono text-[11px] text-primary w-16 flex-shrink-0">{z}</code>
                <span className="text-xs text-neutral-700 w-44 flex-shrink-0">{label}</span>
                <span className="text-[10px] text-neutral-400">{examples}</span>
              </div>
            ))}
          </div>
          <div className="text-xs text-neutral-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <strong className="text-red-700">禁止：</strong> 任意 magic z-index（<code className="font-mono">z-[90]</code>、<code className="font-mono">z-[95]</code>、<code className="font-mono">z-[999]</code>）。若需突破層級，先在此文件新增一個有意義的值。
          </div>
        </Section>

        {/* ── UI Components ── */}
        <Section title="UI Kit Components" id="components">
          {/* Button */}
          <div className="mb-6">
            <div className="text-xs font-semibold text-neutral-500 mb-2 uppercase tracking-wider">Button</div>
            <div className="flex flex-wrap gap-2 mb-2">
              {[
                { label: 'primary', bg: '#EE4D2D', text: '#fff', shadow: '0 1px 3px rgba(238,77,45,0.3)' },
                { label: 'solid',   bg: '#EE4D2D', text: '#fff', shadow: '0 4px 14px rgba(238,77,45,0.3)' },
                { label: 'danger',  bg: '#EF4444', text: '#fff', shadow: '0 1px 3px rgba(239,68,68,0.2)' },
                { label: 'secondary', bg: '#F3F4F6', text: '#374151', shadow: 'none' },
                { label: 'ghost',   bg: 'transparent', text: '#EE4D2D', shadow: 'none' },
                { label: 'outline', bg: 'transparent', text: '#374151', shadow: 'none', border: '1px solid #E5E7EB' },
              ].map(b => (
                <button key={b.label} style={{ background: b.bg, color: b.text, boxShadow: b.shadow, border: b.border ?? 'none', borderRadius: 12, padding: '8px 16px', fontSize: 13, fontWeight: 900, cursor: 'default' }}>
                  {b.label}
                </button>
              ))}
              <button style={{ background: '#EE4D2D', color: '#fff', borderRadius: 12, padding: '8px 16px', fontSize: 13, fontWeight: 900, opacity: 0.5, cursor: 'not-allowed' }}>
                disabled
              </button>
            </div>
            <div className="text-[10px] text-neutral-400 font-mono">
              {'<Button variant="primary|solid|danger|secondary|ghost|outline" size="sm|md|lg" isLoading fullWidth>'}
            </div>
          </div>

          {/* Input */}
          <div className="mb-6">
            <div className="text-xs font-semibold text-neutral-500 mb-2 uppercase tracking-wider">Input / Select / Textarea</div>
            <div className="grid grid-cols-3 gap-3 mb-2">
              <div>
                <div className="text-[10px] text-neutral-400 mb-1">default</div>
                <input readOnly placeholder="placeholder" style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: 12, padding: '8px 12px', fontSize: 14, color: '#374151', background: '#fff', outline: 'none' }} />
              </div>
              <div>
                <div className="text-[10px] text-neutral-400 mb-1">focus</div>
                <input readOnly placeholder="focus ring" style={{ width: '100%', border: '1px solid #EE4D2D', borderRadius: 12, padding: '8px 12px', fontSize: 14, color: '#374151', background: '#fff', outline: 'none', boxShadow: '0 0 0 1px #EE4D2D' }} />
              </div>
              <div>
                <div className="text-[10px] text-neutral-400 mb-1">error</div>
                <input readOnly value="錯誤值" style={{ width: '100%', border: '1px solid #EF4444', borderRadius: 12, padding: '8px 12px', fontSize: 14, color: '#374151', background: '#FFF5F5', outline: 'none', boxShadow: '0 0 0 1px #EF4444' }} />
              </div>
            </div>
            <div className="text-[10px] text-neutral-400 font-mono">
              {'<Input label error helperText /> · <Select /> · <Textarea /> — 全部 rounded-xl border focus:ring-1'}
            </div>
          </div>

          {/* Modal */}
          <div className="mb-6">
            <div className="text-xs font-semibold text-neutral-500 mb-2 uppercase tracking-wider">Modal</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-neutral-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 bg-neutral-50">
                  <span className="text-sm font-semibold text-neutral-900">標準 Modal</span>
                  <div className="w-6 h-6 rounded-full bg-neutral-200 flex items-center justify-center text-neutral-500 text-xs">✕</div>
                </div>
                <div className="p-4 text-xs text-neutral-500">{'<Modal isOpen onClose title> · max-w-lg rounded-xl'}</div>
              </div>
              <div className="border border-neutral-200 rounded-2xl overflow-hidden" style={{ maxWidth: 220 }}>
                <div className="relative h-[42px] flex items-center justify-center border-b border-neutral-100 bg-neutral-50">
                  <span className="text-sm font-semibold text-neutral-900">Compact</span>
                  <div className="absolute right-3 w-5 h-5 rounded-full bg-neutral-200 flex items-center justify-center text-neutral-400 text-[10px]">✕</div>
                </div>
                <div className="p-3 text-[10px] text-neutral-500">{'compact — 320px rounded-2xl 置中標題'}</div>
              </div>
            </div>
          </div>

          {/* ActionBar / BottomSheet */}
          <div className="mb-2">
            <div className="text-xs font-semibold text-neutral-500 mb-2 uppercase tracking-wider">ActionBar · BottomSheet</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl overflow-hidden border border-neutral-200">
                <div className="bg-white/90 border-t border-neutral-200 px-4 py-2.5 flex items-center gap-2" style={{ backdropFilter: 'blur(12px)' }}>
                  <div className="flex-1 h-9 rounded-xl flex items-center justify-center text-xs font-black text-white" style={{ background: '#EE4D2D' }}>立即購買</div>
                  <div className="flex-1 h-9 rounded-xl flex items-center justify-center text-xs font-semibold" style={{ background: '#F3F4F6', color: '#374151' }}>加入倉庫</div>
                </div>
                <div className="px-3 py-1.5 text-[10px] text-neutral-400 font-mono bg-neutral-50">{'<ActionBar hideOn="lg" zIndex="z-50">'}</div>
              </div>
              <div className="rounded-xl overflow-hidden border border-neutral-200">
                <div className="bg-white rounded-t-2xl border-t border-neutral-200">
                  <div className="flex justify-center pt-2 pb-1"><div className="w-8 h-1 rounded-full bg-neutral-200" /></div>
                  <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-100">
                    <span className="text-xs font-black text-neutral-900">抽屜標題</span>
                    <span className="text-neutral-400 text-xs">✕</span>
                  </div>
                  <div className="px-4 py-2 text-[10px] text-neutral-400">scroll content...</div>
                </div>
                <div className="px-3 py-1.5 text-[10px] text-neutral-400 font-mono bg-neutral-50">{'<BottomSheet isOpen onClose title height="60vh">'}</div>
              </div>
            </div>
          </div>
        </Section>

        {/* ── 禁止清單 ── */}
        <Section title="禁止使用" id="forbidden">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="font-semibold text-red-700 mb-2">禁止的 class</div>
                <ul className="space-y-1 text-red-600 font-mono">
                  <li>bg-[#任何hex] → design token</li>
                  <li>text-[#任何hex] → design token</li>
                  <li>bg-primary-600 → bg-primary</li>
                  <li>gray-* → neutral-*</li>
                  <li>emerald-* → green-*</li>
                  <li>rounded-md → rounded-xl / rounded-lg</li>
                  <li>z-[magic 數字]</li>
                  <li>w-[Npx] / h-[Npx]（非必要）</li>
                </ul>
              </div>
              <div>
                <div className="font-semibold text-red-700 mb-2">禁止的 pattern</div>
                <ul className="space-y-1 text-red-600">
                  <li>style=&#123;&#123; color: &#39;#...&#39; &#125;&#125;（inline 色碼）</li>
                  <li>複製貼上 tailwind.config 沒有的 token</li>
                  <li>多頁面複製貼上相同 header JSX</li>
                  <li>頁面內重複定義 timeAgo / formatDate</li>
                  <li>超過 2 套 Modal 系統</li>
                  <li>直接用 import 不存在的 token</li>
                </ul>
              </div>
            </div>
          </div>
        </Section>
      </div>
    </AdminLayout>
  )
}
