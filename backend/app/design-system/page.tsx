'use client'

import { useState, useEffect } from 'react'
import AdminLayout from '@/components/AdminLayout'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
import Badge, { statusVariantMap, BadgeVariant } from '@/components/ui/Badge'
import Card from '@/components/ui/Card'
import Switch from '@/components/ui/Switch'
import Label from '@/components/ui/Label'

// ─── Token 資料 ──────────────────────────────────────────────
const colorTokens = [
  { name: 'primary', hex: '#3B82F6', usage: '主要按鈕、連結、focus ring' },
  { name: 'primary-dark', hex: '#2563EB', usage: 'hover 狀態' },
  { name: 'neutral-50', hex: '#FAFAFA', usage: '極淡背景' },
  { name: 'neutral-100', hex: '#F5F5F5', usage: '頁面背景、sidebar' },
  { name: 'neutral-200', hex: '#E5E5E5', usage: 'border（主要）、surface-subtle' },
  { name: 'neutral-300', hex: '#CCCCCC', usage: 'border-hover、surface-muted' },
  { name: 'neutral-400', hex: '#A3A3A3', usage: 'placeholder、icon fill' },
  { name: 'neutral-500', hex: '#777777', usage: '輔助文字、label' },
  { name: 'neutral-600', hex: '#525252', usage: '次要文字' },
  { name: 'neutral-700', hex: '#333333', usage: '主體文字' },
  { name: 'neutral-800', hex: '#1F1F1F', usage: '強調文字' },
  { name: 'neutral-900', hex: '#111111', usage: '標題' },
]

const semanticTokens = [
  { name: 'success', bg: '#DCFCE7', text: '#166534', border: '#BBF7D0', note: 'green-100/800/200' },
  { name: 'warning', bg: '#FEF9C3', text: '#854D0E', border: '#FEF08A', note: 'yellow-100/800/200' },
  { name: 'danger',  bg: '#FEE2E2', text: '#991B1B', border: '#FECACA', note: 'red-100/800/200' },
  { name: 'info',    bg: '#DBEAFE', text: '#1E40AF', border: '#BFDBFE', note: 'blue-100/800/200' },
]

// ─── Section wrapper ─────────────────────────────────────────
function Section({ title, id, children }: { title: string; id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-12">
      <h2 className="text-sm font-semibold text-neutral-900 mb-4 pb-2 border-b border-neutral-200 flex items-center gap-2">
        {title}
      </h2>
      {children}
    </section>
  )
}

function TokenRow({ name, value, preview }: { name: string; value: string; preview?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-neutral-100">
      {preview}
      <code className="text-xs text-primary font-mono flex-shrink-0 w-40">{name}</code>
      <span className="text-xs text-neutral-500 font-mono">{value}</span>
    </div>
  )
}

// ─── Scan 資料型別 ──────────────────────────────────────────
type ScanRun = {
  ran_at: string
  files_scanned: number
  total_violations: number
  files_with_violations: number
}
type FileViolation = { line_number: number; violation_type: string; violation_class: string; line_content: string; fix_hint: string }
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
    fetch('/api/admin/design-scan')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-xs text-neutral-400 py-4">載入掃描結果...</div>
  if (!data?.run) return (
    <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4 text-xs text-neutral-500">
      尚無掃描記錄。請在本地執行：<code className="font-mono ml-1 text-primary">npx tsx scripts/design-scan.ts</code>
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
              <code className="text-[10px] font-mono text-neutral-600 w-36 flex-shrink-0">{type}</code>
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
                      <code className="text-red-500 font-mono flex-shrink-0">{v.violation_class}</code>
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
        上次掃描：{new Date(run.ran_at).toLocaleString('zh-TW')} ・ 更新請在本地執行 <code className="font-mono">npx tsx scripts/design-scan.ts</code>
      </div>
    </div>
  )
}

// ─── Page ───────────────────────────────────────────────────
export default function DesignSystemPage() {
  const [switchOn, setSwitchOn] = useState(false)
  const [inputVal, setInputVal] = useState('')

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto py-8 px-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-baseline gap-3 mb-1">
            <h1 className="text-xl font-bold text-neutral-900">Design System</h1>
            <span className="text-xs font-mono text-neutral-400">GGB 後台 UI Kit</span>
          </div>
          <p className="text-sm text-neutral-500">所有組件的標準樣式與使用規範。新頁面請以此為基準，禁止自行發明 className。</p>
        </div>

        {/* ── Compliance Scan ── */}
        <Section title="Design Compliance Scan" id="scan">
          <CompliancePanel />
        </Section>

        {/* ── 顏色 tokens ── */}
        <Section title="Color Tokens" id="colors">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Neutral Scale</h3>
          <div className="grid grid-cols-6 gap-2 mb-6">
            {colorTokens.filter(t => t.name.startsWith('neutral')).map(t => (
              <div key={t.name} className="rounded-lg overflow-hidden border border-neutral-200">
                <div className="h-10" style={{ background: t.hex }} />
                <div className="p-2 bg-white">
                  <div className="text-[9px] font-mono font-semibold text-neutral-500 truncate">{t.name.replace('neutral-', '')}</div>
                  <div className="text-[9px] font-mono text-neutral-400">{t.hex}</div>
                </div>
              </div>
            ))}
          </div>

          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Semantic Colors</h3>
          <div className="grid grid-cols-4 gap-3 mb-6">
            {semanticTokens.map(t => (
              <div key={t.name} className="rounded-lg border border-neutral-200 overflow-hidden">
                <div className="p-3 flex items-center gap-2" style={{ background: t.bg }}>
                  <span className="text-sm font-semibold" style={{ color: t.text }}>{t.name}</span>
                </div>
                <div className="p-2 bg-white">
                  <div className="text-[9px] font-mono text-neutral-400">{t.note}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-xs text-neutral-500 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
            <strong className="text-yellow-700">規範：</strong> 禁止使用 <code className="font-mono">gray-*</code>（已從 palette 移除）。
            禁止使用 <code className="font-mono">emerald-*</code>（統一換成 green-*）。
            amber-* 僅限財務金額強調。
          </div>
        </Section>

        {/* ── 文字排版 ── */}
        <Section title="Typography" id="typography">
          <div className="space-y-3 bg-white border border-neutral-200 rounded-lg overflow-hidden">
            {[
              { cls: 'text-xs text-neutral-500', label: 'Label / Helper', sample: 'text-xs text-neutral-500 — 標籤、輔助說明' },
              { cls: 'text-sm text-neutral-700', label: 'Body', sample: 'text-sm text-neutral-700 — 主體內文、按鈕、表格' },
              { cls: 'text-sm font-medium text-neutral-700', label: 'Body Medium', sample: 'text-sm font-medium — 按鈕文字、Nav 項目' },
              { cls: 'text-sm font-semibold text-neutral-900', label: 'Subtitle', sample: 'text-sm font-semibold — 表格標題、區塊標題' },
              { cls: 'text-base font-semibold text-neutral-900', label: 'Section Title', sample: 'text-base font-semibold — Modal 標題' },
              { cls: 'text-lg font-bold text-neutral-900', label: 'Page Title', sample: 'text-lg font-bold — 頁面大標' },
              { cls: 'text-2xl font-bold font-mono text-neutral-900', label: 'Metric', sample: '8,520 — StatsCard 數值' },
            ].map(({ cls, label, sample }) => (
              <div key={label} className="flex items-baseline gap-4 px-4 py-3 border-b border-neutral-100 last:border-0">
                <span className="text-[9px] font-mono text-neutral-400 w-24 flex-shrink-0">{label}</span>
                <span className={cls}>{sample}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
            <strong>規範：</strong> form label 統一 <code className="font-mono">text-xs text-neutral-500</code>。
            helper text 統一 <code className="font-mono">text-xs text-neutral-500</code>。
          </div>
        </Section>

        {/* ── 表單組件 ── */}
        <Section title="Form Components" id="forms">
          <div className="text-xs text-neutral-500 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-4">
            <strong className="text-blue-700">標準：</strong> 全部使用 <code className="font-mono">border border-neutral-200 py-1.5 rounded-lg text-sm focus:ring-1 focus:ring-primary</code>。
            禁止在頁面中直接寫 input/select className，請 import 這裡的組件。
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <Input label="Input" placeholder="請輸入..." value={inputVal} onChange={e => setInputVal(e.target.value)} />
              <Input label="Input Error" placeholder="錯誤狀態" error="此欄位為必填" />
              <Input label="Input Disabled" placeholder="已停用" disabled />
              <Input label="Input with Icon" placeholder="搜尋..." leftIcon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              } />
            </div>
            <div className="space-y-3">
              <Select
                label="Select"
                options={[{ value: '1', label: '選項一' }, { value: '2', label: '選項二' }]}
                placeholder="請選擇..."
              />
              <Select
                label="Select Disabled"
                options={[{ value: '1', label: '已停用' }]}
                disabled
              />
              <Textarea label="Textarea" placeholder="請輸入內容..." rows={3} />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Label>Switch</Label>
            <Switch checked={switchOn} onCheckedChange={setSwitchOn} />
            <span className="text-xs text-neutral-500">{switchOn ? '開啟' : '關閉'}</span>
          </div>
        </Section>

        {/* ── 按鈕 ── */}
        <Section title="Buttons" id="buttons">
          <div className="space-y-4">
            <div>
              <div className="text-xs text-neutral-400 mb-2 font-mono">variant</div>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="danger">Danger</Button>
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-400 mb-2 font-mono">size</div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" size="sm">Small</Button>
                <Button variant="primary" size="md">Medium</Button>
                <Button variant="primary" size="lg">Large</Button>
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-400 mb-2 font-mono">disabled</div>
              <div className="flex gap-2">
                <Button variant="primary" disabled>Primary</Button>
                <Button variant="outline" disabled>Outline</Button>
              </div>
            </div>
          </div>
          <div className="mt-3 text-xs text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
            <strong>規範：</strong> AI 功能按鈕使用 <code className="font-mono">bg-violet-600 hover:bg-violet-700</code>。
            所有其他按鈕必須使用 Button component，禁止自行組合。
          </div>
        </Section>

        {/* ── Badge ── */}
        <Section title="Badge / Status" id="badges">
          <div className="space-y-3">
            <div>
              <div className="text-xs text-neutral-400 mb-2 font-mono">variant</div>
              <div className="flex flex-wrap gap-2">
                {(['default', 'primary', 'success', 'warning', 'danger', 'info'] as BadgeVariant[]).map(v => (
                  <Badge key={v} variant={v}>{v}</Badge>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-400 mb-2 font-mono">status（自動對應 variant）</div>
              <div className="flex flex-wrap gap-2">
                {Object.keys(statusVariantMap).slice(0, 12).map(s => (
                  <Badge key={s} status={s}>{s}</Badge>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-400 mb-2 font-mono">size</div>
              <div className="flex items-center gap-2">
                <Badge variant="success" size="sm">sm</Badge>
                <Badge variant="success" size="md">md</Badge>
                <Badge variant="success" size="lg">lg</Badge>
              </div>
            </div>
          </div>
          <div className="mt-3 text-xs text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
            <strong>規範：</strong> 禁止在頁面中自行寫 getStatusColor() 函數。
            改用 <code className="font-mono">&lt;Badge status="submitted"&gt;已提交&lt;/Badge&gt;</code>，variant 自動套用。
          </div>
        </Section>

        {/* ── Card ── */}
        <Section title="Card" id="cards">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <p className="text-sm text-neutral-700">預設 Card — bg-white border border-neutral-200 rounded-lg shadow-sm</p>
            </Card>
            <Card hover>
              <p className="text-sm text-neutral-700">Hover Card — hover:shadow-md transition-shadow</p>
            </Card>
          </div>
          <div className="mt-3 text-xs text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
            <strong>規範：</strong> 頁面級容器用 <code className="font-mono">rounded-lg</code>。
            最外層大 wrapper 才用 <code className="font-mono">rounded-xl</code>。
          </div>
        </Section>

        {/* ── 間距規範 ── */}
        <Section title="Spacing Rules" id="spacing">
          <div className="grid grid-cols-3 gap-3">
            {[
              { title: '按鈕 padding', rows: [['btn-sm', 'px-3 py-1.5'], ['btn-md', 'px-4 py-2'], ['btn-lg', 'px-6 py-3']] },
              { title: 'Form field', rows: [['input', 'px-3 py-1.5'], ['label gap', 'space-y-1'], ['field gap', 'gap-3 / gap-4']] },
              { title: 'Badge padding', rows: [['sm', 'px-1.5 py-0.5'], ['md', 'px-2 py-1'], ['lg', 'px-3 py-1.5']] },
            ].map(({ title, rows }) => (
              <div key={title} className="bg-white border border-neutral-200 rounded-lg p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">{title}</div>
                {rows.map(([k, v]) => (
                  <div key={k} className="flex justify-between py-1 border-b border-neutral-100 last:border-0">
                    <span className="text-xs font-mono text-primary">{k}</span>
                    <span className="text-xs font-mono text-neutral-500">{v}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Section>

        {/* ── 陰影 ── */}
        <Section title="Shadow Scale" id="shadows">
          <div className="grid grid-cols-5 gap-3">
            {[
              { cls: 'shadow-sm', label: 'shadow-sm', usage: 'Card, Button' },
              { cls: 'shadow-md', label: 'shadow-md', usage: 'Hover state' },
              { cls: 'shadow-lg', label: 'shadow-lg', usage: 'Dropdown' },
              { cls: 'shadow-xl', label: 'shadow-xl', usage: 'Modal' },
              { cls: 'shadow-2xl', label: 'shadow-2xl', usage: 'Overlay' },
            ].map(({ cls, label, usage }) => (
              <div key={label} className={`bg-white rounded-lg p-4 text-center ${cls}`}>
                <div className="text-xs font-mono text-neutral-600 mb-1">{label}</div>
                <div className="text-[9px] text-neutral-400">{usage}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 禁止清單 ── */}
        <Section title="禁止使用" id="forbidden">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="font-semibold text-red-700 mb-2">禁止的 class</div>
                <ul className="space-y-1 text-red-600 font-mono">
                  <li>gray-* → 改用 neutral-*</li>
                  <li>emerald-* → 改用 green-*</li>
                  <li>blue-500/600 → 改用 primary</li>
                  <li>rounded-md → 改用 rounded-lg</li>
                  <li>border-2 (input) → 改用 border</li>
                  <li>min-h-[42px] → 移除</li>
                  <li>focus:ring-2 → 改用 focus:ring-1</li>
                </ul>
              </div>
              <div>
                <div className="font-semibold text-red-700 mb-2">禁止的 pattern</div>
                <ul className="space-y-1 text-red-600">
                  <li>頁面內自定義 getStatusColor()</li>
                  <li>直接寫 disabled:bg-gray-50</li>
                  <li>helper text 用 text-gray-500</li>
                  <li>form label 用 text-sm text-neutral-700</li>
                  <li>status badge 不使用 Badge component</li>
                </ul>
              </div>
            </div>
          </div>
        </Section>
      </div>
    </AdminLayout>
  )
}
