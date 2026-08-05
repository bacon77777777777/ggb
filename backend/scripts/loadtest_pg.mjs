#!/usr/bin/env node
/**
 * 抽獎壓力測試器（直連資料庫版）
 *
 * 與 loadtest.mjs 的差別：這支走 psql + transaction pooler（6543 埠），
 * 不需要 Supabase 的 anon / service role 金鑰。
 *
 * 什麼時候用這支：
 *   拿不到該環境的 API 金鑰時（例如 PROD 的 key 不在本機 .env）。
 *
 * 兩個關鍵：
 *   1. **必須用 6543（transaction mode）**，不能用 5432（session mode）——
 *      後者每個 client 佔一條連線，上限 15，量到的是工具天花板不是系統能力。
 *   2. 用 set_config('request.jwt.claims', ...) 模擬 auth.uid()。
 *      抽獎函數靠 auth.uid() 認人，沒有這行會直接 Not authenticated。
 *
 * 少測到的部分：PostgREST 與 Next.js API 的那一層。想連那層一起測用 loadtest.mjs。
 */

import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'

const arg = (k, d) => {
  const hit = process.argv.find(a => a.startsWith(`--${k}=`))
  return hit ? hit.split('=').slice(1).join('=') : d
}

const HOST = arg('host')
const USER = arg('user')
const PASS = arg('pass')
const PORT = arg('port', '6543')
const USERS_FILE = arg('users')

const SCENARIO    = arg('scenario', 'hot')
const PRODUCT     = Number(arg('product', 0))
const TICKET_MAX  = Number(arg('tickets', 1000))
const CONCURRENCY = Number(arg('concurrency', 20))
const DURATION    = Number(arg('duration', 15))
const PSQL        = arg('psql', 'psql')

const uids = readFileSync(USERS_FILE, 'utf8').trim().split('\n').map(s => s.trim()).filter(Boolean)

function run(sql) {
  return new Promise(resolve => {
    const t0 = performance.now()
    const p = spawn(PSQL, ['-h', HOST, '-p', PORT, '-U', USER, '-d', 'postgres', '-tAq', '-c', sql],
                    { env: { ...process.env, PGPASSWORD: PASS } })
    let out = '', err = ''
    p.stdout.on('data', d => out += d)
    p.stderr.on('data', d => err += d)
    p.on('close', () => resolve({ ms: performance.now() - t0, out, err }))
  })
}

function job() {
  const uid = uids[Math.floor(Math.random() * uids.length)]
  const claims = `SELECT set_config('request.jwt.claims', json_build_object('sub','${uid}')::text, false);`
  const tk = 1 + Math.floor(Math.random() * TICKET_MAX)
  switch (SCENARIO) {
    case 'hot':
      return claims + `SELECT play_ichiban_locked(${PRODUCT}, ARRAY[${tk}], false, NULL);`
    case 'same-ticket':
      return claims + `SELECT play_ichiban_locked(${PRODUCT}, ARRAY[7], false, NULL);`
    case 'auto':
      return claims + `SELECT play_ichiban_auto_locked(${PRODUCT}, 1, false, NULL);`
    case 'lottery':
      return claims + `SELECT play_lottery(${PRODUCT}, 1);`
    case 'gacha':
      return claims + `SELECT play_gacha_locked(${PRODUCT}, 1, false, NULL);`
    case 'mixed': {
      const p = POOL[Math.floor(Math.random() * POOL.length)]
      if (p.t === 'gacha' || p.t === 'blindbox')
        return claims + `SELECT play_gacha_locked(${p.id}, 1, false, NULL);`
      if (p.t === 'card' || p.t === 'custom')
        return claims + `SELECT play_ichiban_auto_locked(${p.id}, 1, false, NULL);`
      return claims + `SELECT play_ichiban_locked(${p.id}, ARRAY[${tk}], false, NULL);`
    }
    default: throw new Error(`未知情境 ${SCENARIO}`)
  }
}

let POOL = []
if (SCENARIO === 'mixed') {
  const r = await run("SELECT id || ',' || type FROM products WHERE name LIKE 'LT-%' AND is_active")
  POOL = r.out.trim().split('\n').filter(Boolean)
    .map(l => ({ id: Number(l.split(',')[0]), t: l.split(',')[1] }))
  process.stderr.write(`混合池 ${POOL.length} 檔商品\n`)
}

const stats = { ok: 0, lat: [], errors: {} }
const deadline = Date.now() + DURATION * 1000

function classify(err) {
  for (const k of ['TICKET_ALREADY_DRAWN','DRAW_IN_PROGRESS','PRODUCT_BUSY','PER_USER_LIMIT',
                   'INVALID_TICKET','SOLD_OUT','NOT_SEALED'])
    if (err.includes(k)) return k
  if (/lock timeout|canceling statement/.test(err)) return 'LOCK_TIMEOUT'
  if (/Not enough stock|No prizes left/.test(err))  return 'SOLD_OUT'
  if (/Insufficient/.test(err))                     return 'INSUFFICIENT'
  if (/duplicate key/.test(err))                    return 'DUPLICATE_KEY'
  if (/max clients|too many/.test(err))             return 'POOL_EXHAUSTED'
  const m = err.match(/ERROR:\s*([^\n]{0,40})/)
  return m ? `OTHER: ${m[1]}` : 'OTHER'
}

async function worker() {
  while (Date.now() < deadline) {
    const r = await run(job())
    stats.lat.push(r.ms)
    if (r.err.includes('ERROR')) {
      const k = classify(r.err)
      stats.errors[k] = (stats.errors[k] ?? 0) + 1
    } else stats.ok++
  }
}

const t0 = Date.now()
await Promise.all(Array.from({ length: CONCURRENCY }, worker))
const wall = (Date.now() - t0) / 1000

const lat = stats.lat.sort((a, b) => a - b)
const pct = p => lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * p))] : 0
const total = stats.ok + Object.values(stats.errors).reduce((a, b) => a + b, 0)

console.log(JSON.stringify({
  scenario: SCENARIO, product: PRODUCT || null, concurrency: CONCURRENCY,
  duration_s: +wall.toFixed(1), requests: total, ok: stats.ok,
  ok_rps: +(stats.ok / wall).toFixed(1),
  p50_ms: +pct(0.50).toFixed(0), p95_ms: +pct(0.95).toFixed(0),
  p99_ms: +pct(0.99).toFixed(0), max_ms: +(lat[lat.length - 1] ?? 0).toFixed(0),
  errors: stats.errors,
}, null, 2))
