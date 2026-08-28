/**
 * 將 DEVLOG.md 所有版本條目同步寫入 dev_logs DB 表
 * 使用方式：npx tsx scripts/sync_devlog_to_db.ts
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { Client } from 'pg'

/*
 * 兩種連法：
 *   預設      → 讀 backend/.env.local 的 Supabase 設定（本機通常指向 STG）
 *   DEVLOG_DB_URL → 直接用 psql 連線字串，用來同步**正式站**
 *
 * 為什麼要有第二條：`.env.local` 只會有一個環境的金鑰，所以在本機跑這支
 * 永遠只同步得到那一邊。2026-08-28 發現 PROD 的 dev_logs 停在 v2026.08.24j、
 * 落後二十幾筆，就是因為每次都只同步了 STG，而且沒有任何徵兆。
 *
 * 正式站：DEVLOG_DB_URL="postgresql://postgres.<ref>:<pw>@<host>:5432/postgres" npx tsx scripts/sync_devlog_to_db.ts
 */
const DB_URL = process.env.DEVLOG_DB_URL || ''
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!DB_URL && (!SUPABASE_URL || !SERVICE_ROLE)) {
  console.error('缺少 SUPABASE env（或 DEVLOG_DB_URL），請在 backend/ 目錄下執行')
  process.exit(1)
}

const supabase = DB_URL ? null : createClient(SUPABASE_URL, SERVICE_ROLE)

/** 直連 Postgres 的最小介面，行為對齊上面用到的那幾個 supabase 呼叫 */
async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  await client.connect()
  try { return await fn(client) } finally { await client.end() }
}

const DEVLOG_PATH = path.resolve(__dirname, '../../DEVLOG.md')

function inferType(title: string, description: string): 'feature' | 'fix' | 'improvement' | 'issue' {
  const text = (title + ' ' + description).toLowerCase()
  if (text.match(/修復|修正|hotfix|阻塞|bug|error|500|fix/)) return 'fix'
  if (text.match(/新增|新功能|升級|新模組|新組件|新增|大修|建立/)) return 'feature'
  return 'improvement'
}

interface DevLogEntry {
  version: string
  title: string
  description: string
  type: 'feature' | 'fix' | 'improvement' | 'issue'
  status: 'released'
  created_at: string
}

function parseDevlog(content: string): DevLogEntry[] {
  const entries: DevLogEntry[] = []
  const sections = content.split(/^## /m).slice(1)

  for (const section of sections) {
    const firstLine = section.split('\n')[0].trim()
    // 只處理 v2026.xx.xx 格式
    const match = firstLine.match(/^(v2026\.\d+\.\d+\w*)[｜|]\s*(\d{4}-\d{2}-\d{2})[｜|]\s*(.+)$/)
    if (!match) continue

    const version = match[1]
    const dateStr = match[2]
    const title = match[3].trim()
    const description = section.split('\n').slice(1).join('\n').trim()

    entries.push({
      version,
      title,
      description,
      type: inferType(title, description),
      status: 'released',
      created_at: `${dateStr}T00:00:00+08:00`,
    })
  }

  return entries
}

async function syncViaPg(entries: DevLogEntry[]) {
  await withPg(async (c) => {
    const { rows } = await c.query('SELECT id, version, title, description FROM dev_logs WHERE version LIKE $1', ['v2026%'])
    const byVersion = new Map(rows.map((r: any) => [r.version, r]))
    const toInsert = entries.filter(e => !byVersion.has(e.version))
    const toUpdate = entries.filter(e => {
      const cur: any = byVersion.get(e.version)
      return cur && (cur.description !== e.description || cur.title !== e.title)
    })
    console.log(`需要新增 ${toInsert.length} 筆、更新 ${toUpdate.length} 筆（跳過 ${entries.length - toInsert.length - toUpdate.length} 筆未異動）`)

    for (const e of toUpdate) {
      const cur: any = byVersion.get(e.version)
      await c.query('UPDATE dev_logs SET title = $1, description = $2 WHERE id = $3', [e.title, e.description, cur.id])
      console.log(`♻️  ${e.version}｜內文已更新`)
    }
    // 舊 → 新，保持 created_at 遞增
    for (const e of [...toInsert].reverse()) {
      await c.query(
        'INSERT INTO dev_logs (version, title, description, type, status, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [e.version, e.title, e.description, e.type, e.status, e.created_at],
      )
      console.log(`✅ ${e.version}｜${e.title}`)
    }
    console.log('\n同步完成')
  })
}

async function main() {
  const content = fs.readFileSync(DEVLOG_PATH, 'utf-8')
  const entries = parseDevlog(content)

  console.log(`解析出 ${entries.length} 個版本條目`)

  if (DB_URL) {
    console.log('連線方式：DEVLOG_DB_URL（直連 Postgres）')
    return syncViaPg(entries)
  }

  // 已存在的條目：連內文一起取回，才判斷得出「有改過但沒同步」
  const { data: existing } = await supabase!
    .from('dev_logs')
    .select('id, version, title, description')
    .like('version', 'v2026%')

  const existingByVersion = new Map(
    (existing ?? []).map((r: any) => [r.version, r]),
  )

  const toInsert = entries.filter(e => !existingByVersion.has(e.version))

  // 同一個版本的內容被補寫是常態（推版後又發現問題、補上修法），
  // 原本只 INSERT 不 UPDATE，所以第一次同步之後的所有修改都進不了資料庫，
  // 後台開發紀錄看到的會是舊版內文，而且完全沒有徵兆。
  const toUpdate = entries.filter(e => {
    const cur = existingByVersion.get(e.version)
    return cur && (cur.description !== e.description || cur.title !== e.title)
  })

  console.log(
    `需要新增 ${toInsert.length} 筆、更新 ${toUpdate.length} 筆` +
    `（跳過 ${entries.length - toInsert.length - toUpdate.length} 筆未異動）`,
  )

  for (const entry of toUpdate) {
    const cur = existingByVersion.get(entry.version)
    const { error } = await supabase!
      .from('dev_logs')
      .update({ title: entry.title, description: entry.description })
      .eq('id', cur.id)
    if (error) console.error(`❌ ${entry.version} 更新失敗:`, error.message)
    else console.log(`♻️  ${entry.version}｜內文已更新`)
  }

  if (toInsert.length === 0) {
    if (toUpdate.length === 0) console.log('全部已同步，無需操作')
    else console.log('\n同步完成')
    return
  }

  // 依版本順序（舊 → 新）插入，保持 created_at 遞增
  const reversed = [...toInsert].reverse()

  for (const entry of reversed) {
    const { error } = await supabase!.from('dev_logs').insert({
      version: entry.version,
      title: entry.title,
      description: entry.description,
      type: entry.type,
      status: entry.status,
      created_at: entry.created_at,
    })
    if (error) {
      console.error(`❌ ${entry.version} 插入失敗:`, error.message)
    } else {
      console.log(`✅ ${entry.version}｜${entry.title}`)
    }
  }

  console.log('\n同步完成')
}

main().catch(console.error)
