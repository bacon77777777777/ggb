/**
 * 緊急修復：migration 339 - 還原 play_gacha 狀態檢查 'selling' → 'active'
 * 使用 Supabase Admin API 執行 SQL（繞過 psql pooler 超時問題）
 */
import fs from 'fs'
import path from 'path'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('缺少 SUPABASE env')
  process.exit(1)
}

// 從 migration 檔讀取 SQL
const sqlPath = path.resolve(__dirname, '../db/migrations/339_fix_play_gacha_status_check.sql')
const sql = fs.readFileSync(sqlPath, 'utf-8')

async function main() {
  // 使用 Supabase REST API 的 /rest/v1/rpc 無法執行 DDL
  // 改用 management API
  const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
  if (!projectRef) {
    console.error('無法解析 project ref from:', SUPABASE_URL)
    process.exit(1)
  }

  console.log('Project ref:', projectRef)

  // Supabase Management API - 需要 service_role JWT 的 sub claim
  // 改用直接呼叫 pg_query 或透過 extension
  // 實際上最可靠的是透過 exec_sql function

  // 嘗試透過 service_role 呼叫 pg_catalog 的方式
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/execute_readonly_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE}`,
      'apikey': SERVICE_ROLE,
    },
    body: JSON.stringify({ sql: 'SELECT 1 as test' }),
  })
  const data = await res.json()
  console.log('Test query:', JSON.stringify(data))
  console.log('\n請直接用 psql 或 Supabase Dashboard SQL Editor 執行 migration 339')
}

main().catch(console.error)
