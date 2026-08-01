'use client'

import { useEffect, useState } from 'react'
import Badge from '@/components/ui/Badge'

const INPUT = 'w-full px-3 py-2 border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-sm'

export type ScheduleState = 'upcoming' | 'running' | 'ended'

/** 與 DB 的 schedule_state() 同一套判定：留空＝不限制 */
export function scheduleState(startAt?: string | null, endAt?: string | null): ScheduleState {
  const now = Date.now()
  if (startAt && now < new Date(startAt).getTime()) return 'upcoming'
  if (endAt && now > new Date(endAt).getTime()) return 'ended'
  return 'running'
}

/** timestamptz ⇄ <input type="datetime-local">（以瀏覽器本地時區呈現） */
function toLocalInput(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fromLocalInput(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

interface EventOption { id: string; slug: string; title: string }

interface Props {
  startAt: string | null
  endAt: string | null
  onChange: (patch: { start_at?: string | null; end_at?: string | null; event_id?: string | null }) => void
  /** 顯示「關聯活動」下拉（輪播圖用） */
  eventId?: string | null
  showEventLink?: boolean
  /** 繼承來源說明，例如「留空＝跟隨主題」 */
  inheritHint?: string
}

const STATE_LABEL: Record<ScheduleState, { text: string; variant: 'warning' | 'success' | 'danger' }> = {
  upcoming: { text: '尚未開始', variant: 'warning' },
  running: { text: '進行中', variant: 'success' },
  ended: { text: '已結束', variant: 'danger' },
}

/**
 * 檔期設定（上下架開關由各頁自行保留，此處只管時間與關聯）
 *
 * 檔期與上下架是兩個獨立維度：
 *   下架   → 前台完全看不到
 *   已結束 → 仍在前台，但顯示為已結束（機台卡／活動頁 hero 蓋黑遮罩）
 */
export default function ScheduleFields({
  startAt, endAt, onChange, eventId, showEventLink, inheritHint,
}: Props) {
  const [events, setEvents] = useState<EventOption[]>([])
  const state = scheduleState(startAt, endAt)
  const unlimited = !startAt && !endAt

  useEffect(() => {
    if (!showEventLink) return
    fetch('/api/admin/events')
      .then(r => r.json())
      .then(d => setEvents(d.events ?? d ?? []))
      .catch(() => {})
  }, [showEventLink])

  const quick = (days: number) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    d.setHours(23, 59, 0, 0)
    onChange({ end_at: d.toISOString() })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-neutral-700">檔期</span>
        {unlimited
          ? <Badge variant="default">無限制</Badge>
          : <Badge variant={STATE_LABEL[state].variant}>{STATE_LABEL[state].text}</Badge>}
        {inheritHint && <span className="text-xs text-neutral-400">{inheritHint}</span>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-neutral-600 mb-1">開始時間</label>
          <input type="datetime-local" className={INPUT} value={toLocalInput(startAt)}
            onChange={e => onChange({ start_at: fromLocalInput(e.target.value) })} />
        </div>
        <div>
          <label className="block text-sm text-neutral-600 mb-1">結束時間</label>
          <input type="datetime-local" className={INPUT} value={toLocalInput(endAt)}
            onChange={e => onChange({ end_at: fromLocalInput(e.target.value) })} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-neutral-400">快速設定結束</span>
        {[[7, '一週'], [14, '兩週'], [30, '一個月']].map(([d, label]) => (
          <button key={label as string} type="button" onClick={() => quick(d as number)}
            className="px-2.5 py-1 text-xs text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors">
            {label as string}
          </button>
        ))}
        {(startAt || endAt) && (
          <button type="button" onClick={() => onChange({ start_at: null, end_at: null })}
            className="px-2.5 py-1 text-xs text-neutral-500 hover:text-neutral-800 transition-colors">
            清除（不限制）
          </button>
        )}
      </div>

      {showEventLink && (
        <div>
          <label className="block text-sm text-neutral-600 mb-1">關聯活動</label>
          <select className={INPUT} value={eventId ?? ''}
            onChange={e => onChange({ event_id: e.target.value || null })}>
            <option value="">不關聯（自行填寫連結）</option>
            {events.map(ev => (
              <option key={ev.id} value={ev.id}>{ev.title}（/events/{ev.slug}）</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-neutral-400">
            選擇後連結自動指向該活動頁；結束時間留空則跟隨活動結束，開始時間可自行提早以做預熱。
          </p>
        </div>
      )}
    </div>
  )
}
