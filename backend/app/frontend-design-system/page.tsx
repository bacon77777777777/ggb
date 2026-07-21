'use client'

import { useState, useEffect } from 'react'
import AdminLayout from '@/components/AdminLayout'

// ─── 前台 Color Tokens ───────────────────────────────────────
const colorTokens = [
  { name: 'primary',       hex: '#4ADE80', usage: '主要按鈕、CTA、highlight' },
  { name: 'neutral-50',    hex: '#FAFAFA', usage: '極淡背景（取代 bg-[#F5F5F5]）' },
  { name: 'neutral-100',   hex: '#F5F5F5', usage: '次淡背景' },
  { name: 'neutral-200',   hex: '#E5E5E5', usage: 'border 主要' },
  { name: 'neutral-400',   hex: '#A3A3A3', usage: 'placeholder、icon' },
  { name: 'neutral-500',   hex: '#737373', usage: '輔助文字' },
  { name: 'neutral-700',   hex: '#404040', usage: '主體文字（light）' },
  { name: 'neutral-900',   hex: '#171717', usage: '標題（light）' },
]

const darkBgTokens = [
  { name: 'neutral-800', hex: '#262626', usage: 'dark surface（卡片）' },
  { name: 'neutral-900', hex: '#171717', usage: 'dark page bg' },
  { name: 'neutral-950', hex: '#0a0a0a', usage: 'dark 最深底色' },
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
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Light Mode</h3>
          <div className="grid grid-cols-4 gap-2 mb-6">
            {colorTokens.map(t => (
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

          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Dark Mode Backgrounds</h3>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {darkBgTokens.map(t => (
              <div key={t.name} className="rounded-lg overflow-hidden border border-neutral-200">
                <div className="h-10" style={{ background: t.hex }} />
                <div className="p-2 bg-neutral-900">
                  <div className="text-[9px] font-mono font-semibold text-neutral-300 truncate">{t.name}</div>
                  <div className="text-[9px] font-mono text-neutral-500">{t.hex}</div>
                  <div className="text-[8px] text-neutral-500 mt-0.5 leading-tight">{t.usage}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-xs text-neutral-500 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
            <strong className="text-yellow-700">規範：</strong>{' '}
            禁止 <code className="font-mono">bg-[#F5F5F5]</code>（改 <code className="font-mono">bg-neutral-50</code>）。
            禁止 <code className="font-mono">bg-primary-600</code>（token 不存在，改 <code className="font-mono">bg-primary</code>）。
            禁止任何 magic hex 色碼。
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
