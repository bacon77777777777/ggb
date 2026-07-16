'use client'

import AdminLayout from '@/components/AdminLayout'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { useState, useEffect } from 'react'

// ── 監控 ────────────────────────────────────────────────────────────────────
interface MonitorLog {
  id: number
  checked_at: string
  supabase_db_mb: number | null
  supabase_status: string
  r2_objects: number | null
  r2_size_mb: number | null
  r2_status: string
  vercel_status: string
  vercel_deploy_state: string | null
  vercel_deployed_at: string | null
  github_status: string
  github_ci_conclusion: string | null
  github_commit_sha: string | null
  overall_status: string
  alerts: string[]
}

type LogType   = 'feature' | 'fix' | 'improvement' | 'issue'
type LogStatus = 'released' | 'planned' | 'open' | 'in_progress' | 'resolved'
type Priority  = 'high' | 'medium' | 'low'

interface DevLog {
  id: number
  version: string | null
  title: string
  description: string | null
  type: LogType
  status: LogStatus
  priority: Priority | null
  created_at: string
  updated_at: string
}

interface MeetingLog {
  id: number
  title: string
  meeting_at: string
  participants: string
  content: string | null
  created_at: string
  updated_at: string
}

const TYPE_META: Record<LogType, { label: string; color: string }> = {
  feature:     { label: '新功能', color: 'bg-blue-100 text-primary' },
  fix:         { label: '修復',   color: 'bg-red-100 text-red-700' },
  improvement: { label: '優化',   color: 'bg-amber-100 text-amber-700' },
  issue:       { label: '問題',   color: 'bg-purple-100 text-purple-700' },
}

const STATUS_META: Record<LogStatus, { label: string; color: string }> = {
  released:   { label: '已發布', color: 'bg-green-100 text-green-700' },
  planned:    { label: '計劃中', color: 'bg-neutral-100 text-neutral-500' },
  open:       { label: '待處理', color: 'bg-red-100 text-red-600' },
  in_progress:{ label: '進行中', color: 'bg-blue-100 text-primary' },
  resolved:   { label: '已解決', color: 'bg-green-100 text-green-700' },
}

const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  high:   { label: '高', color: 'text-red-600' },
  medium: { label: '中', color: 'text-amber-600' },
  low:    { label: '低', color: 'text-neutral-400' },
}

const BLANK: Partial<DevLog> = { version: '', title: '', description: '', type: 'feature', status: 'planned', priority: null }
const MEETING_BLANK: Partial<MeetingLog> = { title: '', meeting_at: '', participants: '', content: '' }

function Badge({ meta }: { meta: { label: string; color: string } }) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta.color}`}>{meta.label}</span>
}

export default function DevLogsPage() {
  const [logs, setLogs] = useState<DevLog[]>([])
  const [meetings, setMeetings] = useState<MeetingLog[]>([])
  const [monitorLogs, setMonitorLogs] = useState<MonitorLog[]>([])
  const [monitorLoading, setMonitorLoading] = useState(false)
  const [monitorRefreshing, setMonitorRefreshing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'changelog' | 'issues' | 'roadmap' | 'meetings' | 'monitor'>('changelog')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Partial<DevLog>>(BLANK)
  const [meetingForm, setMeetingForm] = useState<Partial<MeetingLog>>(MEETING_BLANK)
  const [saving, setSaving] = useState(false)
  const [filterStatus, setFilterStatus] = useState<LogStatus | 'all'>('all')
  const [expandedMeetings, setExpandedMeetings] = useState<Set<number>>(new Set())
  const [expandedRoadmap, setExpandedRoadmap] = useState<Set<number>>(new Set())

  const fetchLogs = async () => {
    setLoading(true)
    const [logsRes, meetingsRes] = await Promise.all([
      fetch('/api/admin/dev-logs'),
      fetch('/api/admin/meeting-logs'),
    ])
    if (logsRes.ok) setLogs(await logsRes.json())
    if (meetingsRes.ok) setMeetings(await meetingsRes.json())
    setLoading(false)
  }

  const fetchMonitor = async () => {
    setMonitorLoading(true)
    const res = await fetch('/api/admin/platform-monitor')
    if (res.ok) setMonitorLogs(await res.json())
    setMonitorLoading(false)
  }

  const triggerMonitor = async () => {
    setMonitorRefreshing(true)
    await fetch('/api/admin/platform-monitor', { method: 'POST' })
    await fetchMonitor()
    setMonitorRefreshing(false)
  }

  useEffect(() => { fetchLogs() }, [])
  useEffect(() => { if (activeTab === 'monitor') fetchMonitor() }, [activeTab])

  const roadmap   = logs.filter(l => l.version === '擴展計畫')
  const changelog = logs.filter(l => l.type !== 'issue' && l.version !== '擴展計畫')
  const issues    = logs.filter(l => l.type === 'issue')

  const byVersion: Record<string, DevLog[]> = {}
  changelog.forEach(l => {
    const v = l.version || '未定版本'
    if (!byVersion[v]) byVersion[v] = []
    byVersion[v].push(l)
  })
  const versionGroups = Object.entries(byVersion).sort(([a], [b]) => b.localeCompare(a))

  const filteredIssues = filterStatus === 'all' ? issues : issues.filter(i => i.status === filterStatus)

  const toggleMeeting = (id: number) => {
    setExpandedMeetings(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSubmit = async () => {
    if (!form.title || !form.type) return
    setSaving(true)
    const isEdit = !!form.id
    const res = await fetch('/api/admin/dev-logs', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) { await fetchLogs(); setShowForm(false); setForm(BLANK) }
    setSaving(false)
  }

  const handleMeetingSubmit = async () => {
    if (!meetingForm.title || !meetingForm.meeting_at) return
    setSaving(true)
    const isEdit = !!meetingForm.id
    const res = await fetch('/api/admin/meeting-logs', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(meetingForm),
    })
    if (res.ok) { await fetchLogs(); setShowForm(false); setMeetingForm(MEETING_BLANK) }
    setSaving(false)
  }

  const handleStatusChange = async (id: number, status: LogStatus) => {
    await fetch('/api/admin/dev-logs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    setLogs(prev => prev.map(l => l.id === id ? { ...l, status } : l))
  }

  const handleDelete = async (id: number) => {
    if (!confirm('確定要刪除這筆紀錄？')) return
    await fetch(`/api/admin/dev-logs?id=${id}`, { method: 'DELETE' })
    setLogs(prev => prev.filter(l => l.id !== id))
  }

  const handleMeetingDelete = async (id: number) => {
    if (!confirm('確定要刪除這筆會議記錄？')) return
    await fetch(`/api/admin/meeting-logs?id=${id}`, { method: 'DELETE' })
    setMeetings(prev => prev.filter(m => m.id !== id))
  }

  const startEdit = (log: DevLog) => {
    setForm({ ...log })
    setShowForm(true)
    setActiveTab(log.type === 'issue' ? 'issues' : log.version === '擴展計畫' ? 'roadmap' : 'changelog')
  }

  const startMeetingEdit = (m: MeetingLog) => {
    setMeetingForm({ ...m, meeting_at: m.meeting_at.slice(0, 16) })
    setShowForm(true)
  }

  const openNewForm = (type?: LogType) => {
    if (activeTab === 'meetings') {
      setMeetingForm(MEETING_BLANK)
    } else {
      setForm({ ...BLANK, type: type || (activeTab === 'issues' ? 'issue' : 'feature'), version: activeTab === 'roadmap' ? '擴展計畫' : '' })
    }
    setShowForm(true)
  }

  const isMeetingTab = activeTab === 'meetings'

  return (
    <AdminLayout
      pageTitle="開發日誌"
    >
      <div className="space-y-4">

        {/* Tab + 新增按鈕 */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 bg-neutral-100 p-1 rounded-lg">
            {([
              ['changelog', '版本紀錄', changelog.length],
              ['issues',   '問題追蹤', issues.length],
              ['roadmap',  '擴展計畫', roadmap.length],
              ['meetings', '會議記錄', meetings.length],
            ['monitor', '監控', null],
            ] as const).map(([tab, label, count]) => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setShowForm(false) }}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === tab ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                {label}
                {count !== null && <span className="ml-1.5 text-xs opacity-60">{count}</span>}
              </button>
            ))}
          </div>
          <button
            onClick={() => openNewForm()}
            className={`px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2 ${activeTab === 'monitor' ? 'invisible' : ''}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新增
          </button>
        </div>

        {/* 監控 Tab 的立即檢查按鈕（取代新增按鈕） */}
        {activeTab === 'monitor' && (
          <div className="flex justify-end -mt-12 mb-4">
            <button
              onClick={triggerMonitor}
              disabled={monitorRefreshing}
              className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {monitorRefreshing ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              {monitorRefreshing ? '檢查中…' : '立即檢查'}
            </button>
          </div>
        )}

        {/* 表單：Dev Log */}
        {showForm && !isMeetingTab && activeTab !== 'monitor' && (
          <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-neutral-800">{form.id ? '編輯紀錄' : '新增紀錄'}</h3>
              <button onClick={() => { setShowForm(false); setForm(BLANK) }} className="text-neutral-400 hover:text-neutral-600">✕</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">類型</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as LogType }))}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/20">
                  {Object.entries(TYPE_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">狀態</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as LogStatus }))}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/20">
                  {Object.entries(STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">版本號</label>
                <input value={form.version ?? ''} onChange={e => setForm(f => ({ ...f, version: e.target.value }))}
                  placeholder="e.g. v1.2.0"
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/20" />
              </div>
              {form.type === 'issue' && (
                <div>
                  <label className="text-xs text-neutral-500 mb-1 block">優先級</label>
                  <select value={form.priority ?? ''} onChange={e => setForm(f => ({ ...f, priority: e.target.value as Priority || null }))}
                    className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/20">
                    <option value="">不設定</option>
                    {Object.entries(PRIORITY_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">標題 *</label>
              <input value={form.title ?? ''} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="簡短描述這筆紀錄"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/20" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">說明</label>
              <textarea value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3} placeholder="詳細說明、重現步驟、解決方案…"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowForm(false); setForm(BLANK) }}
                className="px-4 py-2 border border-neutral-200 text-sm rounded-lg hover:bg-neutral-50 transition-colors">取消</button>
              <button onClick={handleSubmit} disabled={saving || !form.title}
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {saving ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        )}

        {/* 表單：會議記錄 */}
        {showForm && isMeetingTab && (
          <div className="bg-white rounded-xl border border-neutral-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-neutral-800">{meetingForm.id ? '編輯會議記錄' : '新增會議記錄'}</h3>
              <button onClick={() => { setShowForm(false); setMeetingForm(MEETING_BLANK) }} className="text-neutral-400 hover:text-neutral-600">✕</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">標題 *</label>
                <input value={meetingForm.title ?? ''} onChange={e => setMeetingForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="會議名稱"
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/20" />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">時間 *</label>
                <input type="datetime-local" value={meetingForm.meeting_at ?? ''} onChange={e => setMeetingForm(f => ({ ...f, meeting_at: e.target.value }))}
                  className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/20" />
              </div>
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">參與人</label>
              <input value={meetingForm.participants ?? ''} onChange={e => setMeetingForm(f => ({ ...f, participants: e.target.value }))}
                placeholder="e.g. 王小明、李大華"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/20" />
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">會議內容</label>
              <textarea value={meetingForm.content ?? ''} onChange={e => setMeetingForm(f => ({ ...f, content: e.target.value }))}
                rows={6} placeholder="討論事項、決議結論、待辦事項…"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowForm(false); setMeetingForm(MEETING_BLANK) }}
                className="px-4 py-2 border border-neutral-200 text-sm rounded-lg hover:bg-neutral-50 transition-colors">取消</button>
              <button onClick={handleMeetingSubmit} disabled={saving || !meetingForm.title || !meetingForm.meeting_at}
                className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {saving ? '儲存中…' : '儲存'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-xl border border-neutral-200"><CardSkeleton rows={5} /></div>
        ) : (
          <>
            {/* ── 版本紀錄 Tab ── */}
            {activeTab === 'changelog' && (
              <div className="space-y-4">
                {versionGroups.length === 0 && (
                  <div className="bg-white rounded-xl border border-neutral-200 py-16 text-center text-sm text-neutral-400">尚無版本紀錄</div>
                )}
                {versionGroups.map(([version, entries]) => (
                  <div key={version} className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
                    <div className="px-5 py-3 border-b border-neutral-100 flex items-center gap-3 bg-neutral-50">
                      <span className="font-bold text-neutral-800 font-mono">{version}</span>
                      <span className="text-xs text-neutral-400">{new Date(entries[0].created_at).toLocaleDateString('zh-TW')}</span>
                      <span className="text-xs text-neutral-400">{entries.length} 項變更</span>
                    </div>
                    <div className="divide-y divide-neutral-50">
                      {entries.map(log => (
                        <div key={log.id} className="px-5 py-3 flex items-start gap-3 hover:bg-neutral-50 group">
                          <div className="flex gap-1.5 mt-0.5 shrink-0">
                            <Badge meta={TYPE_META[log.type]} />
                            <Badge meta={STATUS_META[log.status]} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-neutral-800">{log.title}</p>
                            {log.description && <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">{log.description}</p>}
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button onClick={() => startEdit(log)} className="p-1.5 text-neutral-400 hover:text-neutral-600 rounded">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button onClick={() => handleDelete(log.id)} className="p-1.5 text-neutral-400 hover:text-red-500 rounded">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── 擴展計畫 Tab ── */}
            {activeTab === 'roadmap' && (
              <div className="space-y-3">
                {roadmap.length === 0 ? (
                  <div className="bg-white rounded-xl border border-neutral-200 py-16 text-center text-sm text-neutral-400">尚無計畫內容</div>
                ) : (
                  <div className="bg-white rounded-xl border border-neutral-200 divide-y divide-neutral-100">
                    {roadmap.map((log, idx) => {
                      const isOpen = expandedRoadmap.has(log.id)
                      return (
                        <div key={log.id}>
                          <div
                            className="px-5 py-4 flex items-start gap-3 cursor-pointer hover:bg-neutral-50 group select-none"
                            onClick={() => setExpandedRoadmap(prev => {
                              const next = new Set(prev)
                              isOpen ? next.delete(log.id) : next.add(log.id)
                              return next
                            })}
                          >
                            <svg
                              className={`w-4 h-4 text-neutral-400 shrink-0 mt-0.5 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <div className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold mt-0.5">
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-neutral-800">{log.title}</p>
                              {log.description && (
                                <p className={`text-xs text-neutral-400 mt-0.5 leading-relaxed ${isOpen ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>
                                  {log.description}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
                              <button onClick={() => startEdit(log)} className="p-1.5 text-neutral-400 hover:text-neutral-600 rounded">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button onClick={() => handleDelete(log.id)} className="p-1.5 text-neutral-400 hover:text-red-500 rounded">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          {isOpen && (
                            <div className="px-5 pb-5 pt-1 bg-neutral-50 border-t border-neutral-100">
                              <div className="flex gap-2">
                                <Badge meta={TYPE_META[log.type]} />
                                <Badge meta={STATUS_META[log.status]} />
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── 問題追蹤 Tab ── */}
            {activeTab === 'issues' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {([['all', '全部'], ['open', '待處理'], ['in_progress', '進行中'], ['resolved', '已解決']] as const).map(([s, label]) => (
                    <button key={s} onClick={() => setFilterStatus(s as LogStatus | 'all')}
                      className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                        filterStatus === s
                          ? 'bg-primary text-white border-primary'
                          : 'border-neutral-200 text-neutral-500 hover:border-neutral-300'
                      }`}>
                      {label}
                      <span className="ml-1 opacity-70">
                        {s === 'all' ? issues.length : issues.filter(i => i.status === s).length}
                      </span>
                    </button>
                  ))}
                </div>
                {filteredIssues.length === 0 ? (
                  <div className="bg-white rounded-xl border border-neutral-200 py-16 text-center text-sm text-neutral-400">
                    {filterStatus === 'all' ? '尚無問題紀錄' : '此狀態無問題'}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-neutral-200 divide-y divide-neutral-100">
                    {filteredIssues.map(log => (
                      <div key={log.id} className="px-5 py-4 flex items-start gap-3 hover:bg-neutral-50 group">
                        <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${
                          log.priority === 'high' ? 'bg-red-500' :
                          log.priority === 'medium' ? 'bg-amber-400' : 'bg-neutral-300'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <p className="text-sm font-medium text-neutral-800">{log.title}</p>
                            {log.priority && (
                              <span className={`text-xs font-medium ${PRIORITY_META[log.priority].color}`}>
                                {PRIORITY_META[log.priority].label}優先
                              </span>
                            )}
                          </div>
                          {log.description && <p className="text-xs text-neutral-400 leading-relaxed">{log.description}</p>}
                          <div className="flex items-center gap-2 mt-2">
                            <Badge meta={STATUS_META[log.status]} />
                            <span className="text-xs text-neutral-400">{new Date(log.created_at).toLocaleDateString('zh-TW')}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {log.status !== 'resolved' && (
                            <button
                              onClick={() => handleStatusChange(log.id, log.status === 'open' ? 'in_progress' : 'resolved')}
                              className="px-2.5 py-1 text-xs border border-neutral-200 rounded-lg hover:bg-neutral-50 text-neutral-500 hover:text-neutral-700 transition-colors whitespace-nowrap">
                              {log.status === 'open' ? '→ 進行中' : '→ 已解決'}
                            </button>
                          )}
                          {log.status === 'resolved' && (
                            <button onClick={() => handleStatusChange(log.id, 'open')}
                              className="px-2.5 py-1 text-xs border border-neutral-200 rounded-lg hover:bg-neutral-50 text-neutral-500 transition-colors">
                              重開
                            </button>
                          )}
                          <button onClick={() => startEdit(log)} className="p-1.5 text-neutral-400 hover:text-neutral-600 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button onClick={() => handleDelete(log.id)} className="p-1.5 text-neutral-400 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── 監控 Tab ── */}
            {activeTab === 'monitor' && (
              <div className="space-y-4">
                {monitorLoading ? (
                  <div className="bg-white rounded-xl border border-neutral-200"><CardSkeleton rows={5} /></div>
                ) : monitorLogs.length === 0 ? (
                  <div className="bg-white rounded-xl border border-neutral-200 py-16 text-center text-sm text-neutral-400">
                    尚無監控資料，點「立即檢查」執行第一次快照
                  </div>
                ) : (() => {
                  const latest = monitorLogs[0]
                  const statusColor = (s: string) =>
                    s === 'ok' ? 'text-green-600 bg-green-50 border-green-200'
                    : s === 'warning' ? 'text-amber-600 bg-amber-50 border-amber-200'
                    : s === 'error' ? 'text-red-600 bg-red-50 border-red-200'
                    : 'text-neutral-400 bg-neutral-50 border-neutral-200'
                  const statusDot = (s: string) =>
                    s === 'ok' ? 'bg-green-500' : s === 'warning' ? 'bg-amber-400' : s === 'error' ? 'bg-red-500' : 'bg-neutral-300'
                  const statusLabel = (s: string) =>
                    s === 'ok' ? '正常' : s === 'warning' ? '注意' : s === 'error' ? '異常' : '未知'

                  return (
                    <>
                      {/* 最新快照卡片 */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                          {
                            name: 'Supabase DB',
                            status: latest.supabase_status,
                            detail: latest.supabase_db_mb != null
                              ? `${latest.supabase_db_mb} MB / 500 MB`
                              : '—',
                            sub: latest.supabase_db_mb != null
                              ? `${Math.round(latest.supabase_db_mb / 500 * 100)}% 已用`
                              : '',
                          },
                          {
                            name: 'Cloudflare R2',
                            status: latest.r2_status,
                            detail: latest.r2_size_mb != null
                              ? `${latest.r2_size_mb} MB / 10,240 MB`
                              : '—',
                            sub: latest.r2_objects != null ? `${latest.r2_objects.toLocaleString()} 個檔案` : '',
                          },
                          {
                            name: 'Vercel',
                            status: latest.vercel_status,
                            detail: latest.vercel_deploy_state ?? latest.vercel_status,
                            sub: latest.vercel_deployed_at
                              ? new Date(latest.vercel_deployed_at).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                              : '未設定 token',
                          },
                          {
                            name: 'GitHub CI',
                            status: latest.github_status,
                            detail: latest.github_ci_conclusion ?? latest.github_status,
                            sub: latest.github_commit_sha
                              ? `#${latest.github_commit_sha}`
                              : '未設定 token',
                          },
                        ].map(card => (
                          <div key={card.name} className={`rounded-xl border p-4 ${statusColor(card.status)}`}>
                            <div className="flex items-center gap-2 mb-2">
                              <div className={`w-2 h-2 rounded-full ${statusDot(card.status)}`} />
                              <span className="text-xs font-medium opacity-70">{card.name}</span>
                            </div>
                            <p className="text-sm font-semibold">{statusLabel(card.status)}</p>
                            <p className="text-xs mt-0.5 opacity-75">{card.detail}</p>
                            {card.sub && <p className="text-xs opacity-50">{card.sub}</p>}
                          </div>
                        ))}
                      </div>

                      {/* 告警列表 */}
                      {latest.alerts?.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                          <p className="text-sm font-semibold text-red-700 mb-2">告警</p>
                          <ul className="space-y-1">
                            {latest.alerts.map((a, i) => (
                              <li key={i} className="text-sm text-red-600 flex items-start gap-2">
                                <span className="mt-0.5 shrink-0">⚠</span>{a}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* 最後檢查時間 */}
                      <p className="text-xs text-neutral-400">
                        最後檢查：{new Date(latest.checked_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
                        {'　'}每 6 小時自動更新
                      </p>

                      {/* 歷史紀錄 */}
                      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
                        <div className="px-5 py-3 border-b border-neutral-100 bg-neutral-50">
                          <span className="text-sm font-semibold text-neutral-700">歷史紀錄</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-neutral-50 border-b border-neutral-200">
                              <tr>
                                {['時間', 'DB (MB)', 'R2 (MB)', 'R2 檔數', 'Vercel', 'GitHub CI', '整體'].map(h => (
                                  <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-neutral-500 whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-50">
                              {monitorLogs.map(log => (
                                <tr key={log.id} className="hover:bg-neutral-50">
                                  <td className="px-4 py-2 whitespace-nowrap text-neutral-500">
                                    {new Date(log.checked_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                  </td>
                                  <td className="px-4 py-2 font-mono">{log.supabase_db_mb ?? '—'}</td>
                                  <td className="px-4 py-2 font-mono">{log.r2_size_mb ?? '—'}</td>
                                  <td className="px-4 py-2 font-mono">{log.r2_objects?.toLocaleString() ?? '—'}</td>
                                  <td className="px-4 py-2">
                                    <span className={`px-1.5 py-0.5 rounded text-xs ${statusColor(log.vercel_status)}`}>
                                      {log.vercel_deploy_state ?? log.vercel_status}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2">
                                    <span className={`px-1.5 py-0.5 rounded text-xs ${statusColor(log.github_status)}`}>
                                      {log.github_ci_conclusion ?? log.github_status}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2">
                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${statusColor(log.overall_status)}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${statusDot(log.overall_status)}`} />
                                      {statusLabel(log.overall_status)}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )
                })()}
              </div>
            )}

            {/* ── 會議記錄 Tab ── */}
            {activeTab === 'meetings' && (
              <div className="space-y-2">
                {meetings.length === 0 ? (
                  <div className="bg-white rounded-xl border border-neutral-200 py-16 text-center text-sm text-neutral-400">尚無會議記錄</div>
                ) : (
                  <div className="bg-white rounded-xl border border-neutral-200 divide-y divide-neutral-100">
                    {meetings.map(m => {
                      const isOpen = expandedMeetings.has(m.id)
                      return (
                        <div key={m.id}>
                          {/* 標題列（點擊展開） */}
                          <div
                            className="px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-neutral-50 group select-none"
                            onClick={() => toggleMeeting(m.id)}
                          >
                            <svg
                              className={`w-4 h-4 text-neutral-400 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                              fill="none" stroke="currentColor" viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-neutral-800">{m.title}</p>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-xs text-neutral-400">
                                  {new Date(m.meeting_at).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {m.participants && (
                                  <span className="text-xs text-neutral-400 flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    {m.participants}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={e => e.stopPropagation()}>
                              <button onClick={() => { startMeetingEdit(m); setActiveTab('meetings') }} className="p-1.5 text-neutral-400 hover:text-neutral-600 rounded">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              <button onClick={() => handleMeetingDelete(m.id)} className="p-1.5 text-neutral-400 hover:text-red-500 rounded">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          {/* 展開內容 */}
                          {isOpen && (
                            <div className="px-5 pb-5 pt-1 bg-neutral-50 border-t border-neutral-100">
                              {m.content ? (
                                <p className="text-sm text-neutral-600 leading-relaxed whitespace-pre-wrap">{m.content}</p>
                              ) : (
                                <p className="text-sm text-neutral-400 italic">無會議內容</p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  )
}
