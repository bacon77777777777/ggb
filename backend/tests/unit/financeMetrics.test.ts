import { describe, it, expect } from 'vitest'
import {
  getTaiwanNow,
  getTaiwanDayStartUtc,
  getTaiwanYesterdayWindow,
  getFinancePeriodWindow,
  formatTaiwanDate,
  formatTaiwanTime,
  isRealRevenueRecharge,
} from '@/lib/financeMetrics'

// 固定基準時間：UTC 2026-01-15 10:00 → 台灣時間 2026-01-15 18:00
const BASE = new Date('2026-01-15T10:00:00.000Z')
// 台灣午夜 2026-01-15 00:00 TW = 2026-01-14 16:00 UTC
const TW_MIDNIGHT_UTC = '2026-01-14T16:00:00.000Z'

describe('getTaiwanNow', () => {
  it('base UTC + 8h = TW time', () => {
    const tw = getTaiwanNow(BASE)
    expect(tw.getUTCHours()).toBe(18)
    expect(tw.getUTCDate()).toBe(15)
  })

  it('across midnight: UTC 2026-01-15T17:00 → TW 2026-01-16T01:00', () => {
    const d = new Date('2026-01-15T17:00:00Z')
    const tw = getTaiwanNow(d)
    expect(tw.getUTCDate()).toBe(16)
    expect(tw.getUTCHours()).toBe(1)
  })
})

describe('getTaiwanDayStartUtc', () => {
  it('returns UTC timestamp of TW midnight for BASE', () => {
    const start = getTaiwanDayStartUtc(BASE)
    expect(start.toISOString()).toBe(TW_MIDNIGHT_UTC)
  })

  it('TW 00:30 → same day midnight', () => {
    const d = new Date('2026-01-14T16:30:00Z') // TW: 01-15 00:30
    expect(getTaiwanDayStartUtc(d).toISOString()).toBe(TW_MIDNIGHT_UTC)
  })

  it('TW 23:59 → same day midnight', () => {
    const d = new Date('2026-01-15T15:59:00Z') // TW: 01-15 23:59
    expect(getTaiwanDayStartUtc(d).toISOString()).toBe(TW_MIDNIGHT_UTC)
  })
})

describe('getTaiwanYesterdayWindow', () => {
  it('yesterday window is exactly 24 hours before today start', () => {
    const { start, end } = getTaiwanYesterdayWindow(BASE)
    expect(end.toISOString()).toBe(TW_MIDNIGHT_UTC)
    expect(end.getTime() - start.getTime()).toBe(86_400_000)
  })
})

describe('getFinancePeriodWindow', () => {
  it('today: starts at TW midnight, ends at base', () => {
    const { start, end } = getFinancePeriodWindow('today', BASE)
    expect(start.toISOString()).toBe(TW_MIDNIGHT_UTC)
    expect(end).toBe(BASE)
  })

  it('yesterday: 24h window ending at TW midnight', () => {
    const { start, end } = getFinancePeriodWindow('yesterday', BASE)
    expect(end.toISOString()).toBe(TW_MIDNIGHT_UTC)
    expect(end.getTime() - start.getTime()).toBe(86_400_000)
  })

  it('last_7_days: exactly 7×24h before base', () => {
    const { start, end } = getFinancePeriodWindow('last_7_days', BASE)
    expect(end).toBe(BASE)
    expect(BASE.getTime() - start.getTime()).toBe(7 * 86_400_000)
  })

  it('last_30_days: exactly 30×24h before base', () => {
    const { start } = getFinancePeriodWindow('last_30_days', BASE)
    expect(BASE.getTime() - start.getTime()).toBe(30 * 86_400_000)
  })

  it('this_month: starts on TW month first day', () => {
    // BASE = TW 2026-01-15 → month start = TW 2026-01-01 00:00 = UTC 2025-12-31 16:00
    const { start } = getFinancePeriodWindow('this_month', BASE)
    const tw = new Date(start.getTime() + 8 * 3600_000)
    expect(tw.getUTCDate()).toBe(1)
    expect(tw.getUTCMonth()).toBe(0) // January
  })

  it('this_week: Monday as week start', () => {
    // BASE = TW 2026-01-15 (Thursday)
    // Monday = TW 2026-01-12 → UTC 2026-01-11 16:00
    const { start } = getFinancePeriodWindow('this_week', BASE)
    const tw = new Date(start.getTime() + 8 * 3600_000)
    expect(tw.getUTCDay()).toBe(1) // Monday
  })
})

describe('formatTaiwanTime', () => {
  it('formats TW HH:MM', () => {
    // BASE = UTC 10:00 → TW 18:00
    expect(formatTaiwanTime(BASE)).toBe('18:00')
  })
})

describe('formatTaiwanDate', () => {
  it('returns zh-TW locale date string', () => {
    const result = formatTaiwanDate(BASE)
    expect(result).toMatch(/2026/)
  })
})

describe('isRealRevenueRecharge', () => {
  it('blank payment_method is real revenue', () => {
    expect(isRealRevenueRecharge({ payment_method: '' })).toBe(true)
  })

  it.each(['test', 'promotion', 'compensation'])(
    '"%s" is NOT real revenue',
    method => {
      expect(isRealRevenueRecharge({ payment_method: method })).toBe(false)
    }
  )

  it('null payment_method is real revenue', () => {
    expect(isRealRevenueRecharge({ payment_method: null })).toBe(true)
  })

  it('ecpay/credit payment is real revenue', () => {
    expect(isRealRevenueRecharge({ payment_method: 'Credit_CreditCard' })).toBe(true)
  })
})
