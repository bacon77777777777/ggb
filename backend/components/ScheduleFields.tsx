'use client'

import { useEffect, useState } from 'react'
import Badge from '@/components/ui/Badge'
import DateRangePicker from '@/components/DateRangePicker'

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
  /**
   * 改用「無限制」勾選框控制時間選擇器的顯示，並隱藏狀態標籤與提示文字。
   * 預設 false —— 輪播圖、機台主題等既有頁面維持原本的呈現。
   */
  unlimitedToggle?: boolean
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
  startAt, endAt, onChange, eventId, showEventLink, inheritHint, unlimitedToggle,
}: Props) {
  const [events, setEvents] = useState<EventOption[]>([])
  const state = scheduleState(startAt, endAt)
  const unlimited = !startAt && !endAt

  // 「無限制」不能單看 startAt/endAt 是否為空：取消勾選的當下兩者仍是空的，
  // 若直接由資料推導會立刻被勾回去，選擇器永遠打不開，故另存展開狀態。
  const [showRange, setShowRange] = useState(!unlimited)
  useEffect(() => { if (!unlimited) setShowRange(true) }, [unlimited])

  useEffect(() => {
    if (!showEventLink) return
    fetch('/api/admin/events')
      .then(r => r.json())
      .then(d => setEvents(d.events ?? d ?? []))
      .catch(() => {})
  }, [showEventLink])

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-neutral-700">檔期</span>
        {!unlimitedToggle && (unlimited
          ? <Badge variant="default">無限制</Badge>
          : <Badge variant={STATE_LABEL[state].variant}>{STATE_LABEL[state].text}</Badge>)}
        {!unlimitedToggle && inheritHint && (
          <span className="text-xs text-neutral-400">{inheritHint}</span>
        )}
        {unlimitedToggle && (
          <label className="ml-auto flex items-center gap-1.5 text-sm text-neutral-600 cursor-pointer">
            <input
              type="checkbox"
              checked={!showRange}
              onChange={e => {
                const on = e.target.checked
                setShowRange(!on)
                if (on) onChange({ start_at: null, end_at: null })
              }}
              className="w-4 h-4 rounded border-neutral-300 text-primary focus:ring-primary"
            />
            無限制
          </label>
        )}
      </div>

      {(!unlimitedToggle || showRange) && (
      <DateRangePicker
        withTime
        placeholder="不限制（留空即無檔期）"
        startDate={toLocalInput(startAt)}
        endDate={toLocalInput(endAt)}
        onStartDateChange={v => onChange({ start_at: fromLocalInput(v) })}
        onEndDateChange={v => onChange({ end_at: fromLocalInput(v) })}
      />
      )}

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
