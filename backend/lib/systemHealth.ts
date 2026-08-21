import { Redis } from '@upstash/redis'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 系統健康四燈（老闆 2026-08-21）
 *
 * 只放「會變、會被設錯、查得到」的運行狀態 —— 不放靜態的程式碼事實
 * （那種燈永遠綠，只會給假安心）。四項：
 *   1. 敏感表 RLS 是否仍全開（漏資料的第一現場，某次 migration 手滑就紅）
 *   2. 限流服務 Redis 是否可達（抽獎防連點的命脈）
 *   3. 綠界金流環境 stage / production（統編下來切正式金流的哨兵）
 *   4. 維護模式狀態
 *
 * dashboard 的「系統健康」燈與 health-check cron（推播）共用這支，
 * 兩邊燈號一致。`push` 標記哪幾項該推 LINE —— 只有「壞掉」的才推
 * （RLS 關掉、Redis 掛），金流環境與維護是刻意狀態，推了只是噪音。
 */

export type SysStatus = 'ok' | 'warn' | 'bad'

export interface SysHealthItem {
  key: string
  label: string
  value: string
  status: SysStatus
  /** 該不該推 LINE（壞掉才推；刻意狀態不推） */
  pushMsg?: string
}

export async function checkSystemHealth(admin: SupabaseClient): Promise<SysHealthItem[]> {
  const items: SysHealthItem[] = []

  // ── 1. 敏感表 RLS ─────────────────────────────────────────────
  try {
    const { data, error } = await admin.rpc('sensitive_tables_rls_status')
    if (error) throw error
    const rows = (data ?? []) as { table_name: string; rls_enabled: boolean }[]
    const off = rows.filter((r) => !r.rls_enabled).map((r) => r.table_name)
    if (off.length > 0) {
      items.push({
        key: 'rls',
        label: '資料權限 RLS',
        value: `${off.length} 張表 RLS 已關：${off.join('、')}`,
        status: 'bad',
        pushMsg: `資安警示：敏感表 RLS 已關閉（${off.join('、')}），可能外洩會員資料`,
      })
    } else {
      items.push({ key: 'rls', label: '資料權限 RLS', value: `全部 ${rows.length} 張表已開啟`, status: 'ok' })
    }
  } catch (e: any) {
    items.push({ key: 'rls', label: '資料權限 RLS', value: `查詢失敗：${(e?.message ?? '').slice(0, 60)}`, status: 'warn' })
  }

  // ── 2. 限流 Redis ─────────────────────────────────────────────
  const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  if (!hasRedis) {
    items.push({
      key: 'ratelimit',
      label: '限流服務',
      value: 'UPSTASH 環境變數未設定，抽獎/留言防濫用失效',
      status: 'bad',
      pushMsg: '限流服務未設定（UPSTASH env 缺），抽獎防連點與留言限流失效',
    })
  } else {
    try {
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      })
      const pong = await Promise.race([
        redis.ping(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
      ])
      if (pong === 'PONG') {
        items.push({ key: 'ratelimit', label: '限流服務', value: 'Redis 連線正常', status: 'ok' })
      } else {
        throw new Error(`非預期回應：${String(pong)}`)
      }
    } catch (e: any) {
      items.push({
        key: 'ratelimit',
        label: '限流服務',
        value: `Redis 無回應：${(e?.message ?? '').slice(0, 60)}`,
        status: 'bad',
        pushMsg: '限流服務（Redis）無回應，抽獎防連點與留言限流可能失效',
      })
    }
  }

  // ── 3. 綠界金流環境 ───────────────────────────────────────────
  const ecpayUrl = process.env.ECPAY_API_URL ?? ''
  const isStage = ecpayUrl.includes('stage')
  items.push({
    key: 'ecpay_env',
    label: '金流環境',
    value: isStage ? '測試環境（試營運，未收真錢）' : '正式環境（收真錢中）',
    // 兩種都是刻意狀態、不推播；用 warn(黃) 標測試環境提醒「還沒切正式」，正式=綠
    status: isStage ? 'warn' : 'ok',
  })

  // ── 4. 維護模式 ───────────────────────────────────────────────
  try {
    const { data } = await admin
      .from('platform_settings')
      .select('value')
      .eq('key', 'maintenance_scope')
      .maybeSingle()
    const scope = (data?.value ?? 'off') as string
    const on = scope === 'frontend' || scope === 'all'
    items.push({
      key: 'maintenance',
      label: '維護模式',
      value: on ? `維護中（${scope === 'all' ? '全站' : '前台'}）` : '關閉（正常營運）',
      status: on ? 'warn' : 'ok', // 維護是刻意的，不推播；黃燈提醒現在對外關著
    })
  } catch {
    items.push({ key: 'maintenance', label: '維護模式', value: '狀態查詢失敗', status: 'warn' })
  }

  return items
}
