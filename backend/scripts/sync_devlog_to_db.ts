/**
 * 將 DEVLOG.md 所有版本條目同步寫入 dev_logs DB 表
 * 使用方式：npx tsx scripts/sync_devlog_to_db.ts
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('缺少 SUPABASE env，請在 backend/ 目錄下執行')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

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

async function main() {
  const content = fs.readFileSync(DEVLOG_PATH, 'utf-8')
  const entries = parseDevlog(content)

  console.log(`解析出 ${entries.length} 個版本條目`)

  // 取得已存在的 version 清單（避免重複）
  const { data: existing } = await supabase
    .from('dev_logs')
    .select('version, title')
    .like('version', 'v2026%')

  const existingKeys = new Set((existing ?? []).map((r: any) => `${r.version}::${r.title}`))

  const toInsert = entries.filter(e => !existingKeys.has(`${e.version}::${e.title}`))
  console.log(`需要新增 ${toInsert.length} 筆（跳過 ${entries.length - toInsert.length} 筆已存在）`)

  if (toInsert.length === 0) {
    console.log('全部已同步，無需操作')
    return
  }

  // 依版本順序（舊 → 新）插入，保持 created_at 遞增
  const reversed = [...toInsert].reverse()

  for (const entry of reversed) {
    const { error } = await supabase.from('dev_logs').insert({
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
