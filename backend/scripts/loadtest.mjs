#!/usr/bin/env node
/**
 * 抽獎壓力測試器
 *
 * 走 HTTP（Supabase PostgREST + 真實使用者 JWT），不是 psql。
 * 用 psql 併發只會量到 pooler 的 session mode 連線上限（15），
 * 那是測試工具的天花板，不是系統的。
 *
 * 零相依：只用 Node 內建 fetch。不引入 k6 / autocannon，
 * 也就不會多一個要裝、要學、之後沒人維護的東西。
 *
 * 用法：
 *   node loadtest.mjs --scenario=hot   --product=123 --concurrency=50 --duration=20
 *   node loadtest.mjs --scenario=mixed --concurrency=50 --duration=30
 *   node loadtest.mjs --scenario=same-ticket --product=123 --concurrency=30
 */

import { readFileSync } from 'node:fs'

const arg = (k, d) => {
  const hit = process.argv.find(a => a.startsWith(`--${k}=`))
  return hit ? hit.split('=').slice(1).join('=') : d
}

const SUPA_URL  = arg('url',  process.env.LT_SUPABASE_URL)
const ANON_KEY  = arg('anon', process.env.LT_ANON_KEY)
const USERS_FILE = arg('users', '/tmp/lt_users.tsv')
const PASSWORD  = arg('password', 'LoadTest!2026')

const SCENARIO    = arg('scenario', 'hot')
const PRODUCT     = Number(arg('product', 0))
const CONCURRENCY = Number(arg('concurrency', 20))
const DURATION    = Number(arg('duration', 15))

if (!SUPA_URL || !ANON_KEY) {
  console.error('缺少 --url / --anon（或 LT_SUPABASE_URL / LT_ANON_KEY）')
  process.exit(1)
}

// ── 登入取得真實 JWT ────────────────────────────────────────────────────
// 必須是真的使用者 token：抽獎函數靠 auth.uid() 認人，
// service role 沒辦法假裝成某個玩家。
async function signIn(email) {
  const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  if (!r.ok) return null
  return (await r.json()).access_token
}

async function rpc(token, fn, params) {
  const t0 = performance.now()
  const r = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })
  const ms = performance.now() - t0
  if (r.ok) return { ok: true, ms }

  const body = await r.text()
  // 把錯誤歸類，才看得出「系統擋下來」與「系統壞掉」的差別
  const kind =
    /TICKET_ALREADY_DRAWN/.test(body) ? 'TICKET_ALREADY_DRAWN' :
    /DRAW_IN_PROGRESS/.test(body)     ? 'DRAW_IN_PROGRESS' :
    /PRODUCT_BUSY/.test(body)         ? 'PRODUCT_BUSY' :
    /lock timeout|canceling statement/.test(body) ? 'LOCK_TIMEOUT' :
    /PER_USER_LIMIT/.test(body)       ? 'PER_USER_LIMIT' :
    /SOLD_OUT|Not enough|No prizes/.test(body) ? 'SOLD_OUT' :
    /INVALID_TICKET/.test(body)       ? 'INVALID_TICKET' :
    /Insufficient/.test(body)         ? 'INSUFFICIENT' :
    /duplicate key/.test(body)        ? 'DUPLICATE_KEY' :
    `HTTP_${r.status}`
  return { ok: false, ms, kind }
}

// ── 情境 ────────────────────────────────────────────────────────────────
const state = { ticket: 0 }

function nextJob(pool) {
  const token = pool[Math.floor(Math.random() * pool.length)]
  switch (SCENARIO) {
    case 'hot': {
      // 一番賞是「自己挑籤號」的玩法，play_ichiban_auto 只收 card/custom。
      // 隨機挑一張還沒被抽走的籤 —— 撞號是真實情境的一部分，不迴避。
      const tk = 1 + Math.floor(Math.random() * TICKET_MAX)
      return [token, 'play_ichiban_locked',
              { p_product_id: PRODUCT, p_ticket_numbers: [tk], p_use_points: false, p_coupon_id: null }]
    }
    case 'auto':         // 抽卡／自製賞：後端自動配籤
      return [token, 'play_ichiban_auto_locked',
              { p_product_id: PRODUCT, p_count: 1, p_use_points: false, p_coupon_id: null }]
    case 'same-ticket':  // 所有人搶同一張籤
      return [token, 'play_ichiban_locked',
              { p_product_id: PRODUCT, p_ticket_numbers: [7], p_use_points: false, p_coupon_id: null }]
    case 'lottery':
      return [token, 'play_lottery', { p_product_id: PRODUCT, p_count: 1 }]
    case 'gacha':
      return [token, 'play_gacha_locked',
              { p_product_id: PRODUCT, p_count: 1, p_use_points: false, p_coupon_id: null }]
    case 'mixed': {     // 全站流量：隨機商品
      const p = MIXED_POOL[Math.floor(Math.random() * MIXED_POOL.length)]
      if (p.type === 'gacha' || p.type === 'blindbox')
        return [token, 'play_gacha_locked',
                { p_product_id: p.id, p_count: 1, p_use_points: false, p_coupon_id: null }]
      if (p.type === 'card' || p.type === 'custom')
        return [token, 'play_ichiban_auto_locked',
                { p_product_id: p.id, p_count: 1, p_use_points: false, p_coupon_id: null }]
      // 一番賞：指定籤號
      return [token, 'play_ichiban_locked',
              { p_product_id: p.id, p_ticket_numbers: [1 + Math.floor(Math.random() * TICKET_MAX)],
                p_use_points: false, p_coupon_id: null }]
    }
    default:
      throw new Error(`未知情境 ${SCENARIO}`)
  }
}

let TICKET_MAX = Number(arg('tickets', 1000))
let MIXED_POOL = []
async function loadMixedPool(token) {
  const r = await fetch(
    `${SUPA_URL}/rest/v1/products?select=id,type&name=like.LT-*&is_active=eq.true&limit=600`,
    { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } })
  MIXED_POOL = (await r.json()).filter(p => p.type !== 'slot')
}

// ── 主程式 ──────────────────────────────────────────────────────────────
const emails = readFileSync(USERS_FILE, 'utf8').trim().split('\n')
  .map(l => l.split('\t')[1]).filter(Boolean)

// 分批登入：一次全部打會被 GoTrue 限流，實測 60 個同時送只成功 30 個
process.stderr.write(`登入 ${emails.length} 個帳號… `)
const tokens = []
for (let i = 0; i < emails.length; i += 6) {
  const batch = await Promise.all(emails.slice(i, i + 6).map(signIn))
  tokens.push(...batch.filter(Boolean))
  await new Promise(r => setTimeout(r, 350))
}
process.stderr.write(`成功 ${tokens.length}\n`)
if (tokens.length === 0) { console.error('沒有可用帳號'); process.exit(1) }

if (SCENARIO === 'mixed') await loadMixedPool(tokens[0])

const stats = { ok: 0, lat: [], errors: {} }
const deadline = Date.now() + DURATION * 1000
let running = true

async function worker() {
  while (running && Date.now() < deadline) {
    const [token, fn, params] = nextJob(tokens)
    const r = await rpc(token, fn, params)
    stats.lat.push(r.ms)
    if (r.ok) stats.ok++
    else stats.errors[r.kind] = (stats.errors[r.kind] ?? 0) + 1
  }
}

const t0 = Date.now()
await Promise.all(Array.from({ length: CONCURRENCY }, worker))
running = false
const wall = (Date.now() - t0) / 1000

const lat = stats.lat.sort((a, b) => a - b)
const pct = p => lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * p))] : 0
const total = stats.ok + Object.values(stats.errors).reduce((a, b) => a + b, 0)

console.log(JSON.stringify({
  scenario: SCENARIO, product: PRODUCT || null,
  concurrency: CONCURRENCY, duration_s: +wall.toFixed(1),
  requests: total, ok: stats.ok,
  rps: +(total / wall).toFixed(1),
  ok_rps: +(stats.ok / wall).toFixed(1),
  p50_ms: +pct(0.50).toFixed(0),
  p95_ms: +pct(0.95).toFixed(0),
  p99_ms: +pct(0.99).toFixed(0),
  max_ms: +(lat[lat.length - 1] ?? 0).toFixed(0),
  errors: stats.errors,
}, null, 2))
