/**
 * 檔期判定 —— 與後台 ScheduleFields、DB 的 schedule_state() 為同一套規則
 *
 * 「檔期」與「上下架」是兩個獨立維度：
 *   is_active = false → 前台完全看不到（等同不存在）
 *   ended             → 仍在前台，但顯示為已結束（機台卡／活動頁 hero 蓋黑遮罩）
 *
 * 繼承規則為「逐欄位」：自己該欄留空才繼承上層，
 * 因此輪播圖可只設開始時間提早曝光（預熱），結束時間留空跟隨活動。
 */
export type ScheduleState = 'upcoming' | 'running' | 'ended'

export function scheduleState(startAt?: string | null, endAt?: string | null): ScheduleState {
  const now = Date.now()
  if (startAt && now < new Date(startAt).getTime()) return 'upcoming'
  if (endAt && now > new Date(endAt).getTime()) return 'ended'
  return 'running'
}

/** 逐欄位繼承：自己有值就用自己的，否則用上層的 */
export function inheritSchedule(
  own: { start_at?: string | null; end_at?: string | null } | null | undefined,
  parent: { start_at?: string | null; end_at?: string | null } | null | undefined,
): { start_at: string | null; end_at: string | null } {
  return {
    start_at: own?.start_at ?? parent?.start_at ?? null,
    end_at: own?.end_at ?? parent?.end_at ?? null,
  }
}

/** 距離某時間點還有多久，回傳可直接顯示的字串（如「3 天 4 小時」「12 分鐘」） */
export function untilText(target?: string | null): string {
  if (!target) return ''
  const ms = new Date(target).getTime() - Date.now()
  if (ms <= 0) return ''
  const m = Math.floor(ms / 60000)
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  if (d > 0) return h > 0 ? `${d} 天 ${h} 小時` : `${d} 天`
  if (h > 0) return `${h} 小時 ${m % 60} 分`
  return `${m} 分鐘`
}

/** 輪播圖檔期過濾：自己該欄留空才繼承活動（故可只設開始時間做預熱） */
export function filterBannersBySchedule<T extends {
  start_at?: string | null; end_at?: string | null
  events?: { start_at: string | null; end_at: string | null } | null
}>(rows: T[]): T[] {
  return rows.filter(b => {
    const start = b.start_at ?? b.events?.start_at ?? null
    const end = b.end_at ?? b.events?.end_at ?? null
    return scheduleState(start, end) === 'running'
  })
}
