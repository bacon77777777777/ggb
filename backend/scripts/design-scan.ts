/**
 * Design System 違規掃描腳本
 * 本地執行：npx tsx scripts/design-scan.ts
 * 結果寫入 DB，/design-system 頁面讀取顯示
 */
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const FORBIDDEN = [
  { type: 'gray-*',           regex: /\bgray-\d+\b/g,             fix: '改用 neutral-*' },
  { type: 'emerald-*',        regex: /\bemerald-\d+\b/g,          fix: '改用 green-*' },
  { type: 'blue-500/600/700', regex: /\bblue-[5-7]\d{2}\b/g,      fix: '改用 bg-primary / text-primary' },
  { type: 'rounded-md',       regex: /\brounded-md\b/g,            fix: '改用 rounded-lg' },
  { type: 'border-2',         regex: /\bborder-2\b/g,              fix: 'input 欄位改用 border' },
  { type: 'min-h-[42px]',     regex: /min-h-\[42px\]/g,           fix: '移除，改用 py-1.5' },
  { type: 'focus:ring-2',     regex: /focus:ring-2\b/g,            fix: '改用 focus:ring-1' },
  { type: 'getStatusColor',   regex: /\bgetStatusColor\b/g,        fix: '改用 <Badge status=...>' },
  { type: 'disabled:bg-gray', regex: /disabled:bg-gray-\d+/g,     fix: '改用 disabled:bg-neutral-100' },
  { type: 'text-gray-',       regex: /\btext-gray-\d+\b/g,        fix: '改用 text-neutral-*' },
]

// 掃描時排除的路徑片段
const EXCLUDE = [
  'node_modules', '.next', '.git',
  'design-system/page.tsx',  // 本身引用了禁用 class 當範例
  'design-scan.ts',          // 掃描腳本本身
]

function shouldExclude(rel: string) {
  return EXCLUDE.some(ex => rel.includes(ex))
}

function* walkTsx(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!['node_modules', '.next', '.git'].includes(entry.name)) yield* walkTsx(full)
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      yield full
    }
  }
}

async function main() {
  const root = path.join(__dirname, '..')

  // 建立本次 run 記錄
  const { data: run, error: runErr } = await supabase
    .from('design_scan_runs')
    .insert({ files_scanned: 0, total_violations: 0, files_with_violations: 0 })
    .select('id')
    .single()
  if (runErr || !run) { console.error('無法建立 run 記錄', runErr); process.exit(1) }

  const runId: string = run.id
  const violations: object[] = []
  let filesScanned = 0
  const dirtyFiles = new Set<string>()

  for (const abs of walkTsx(root)) {
    const rel = path.relative(root, abs)
    if (shouldExclude(rel)) continue
    filesScanned++

    const lines = fs.readFileSync(abs, 'utf-8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      for (const p of FORBIDDEN) {
        p.regex.lastIndex = 0
        let m
        while ((m = p.regex.exec(line)) !== null) {
          violations.push({
            run_id: runId,
            file_path: rel,
            line_number: i + 1,
            violation_type: p.type,
            violation_class: m[0],
            line_content: line.trim().slice(0, 200),
            fix_hint: p.fix,
          })
          dirtyFiles.add(rel)
        }
      }
    }
  }

  // 批次寫入違規
  for (let i = 0; i < violations.length; i += 100) {
    await supabase.from('design_scan_results').insert(violations.slice(i, i + 100))
  }

  // 更新 run 統計
  await supabase.from('design_scan_runs').update({
    files_scanned: filesScanned,
    total_violations: violations.length,
    files_with_violations: dirtyFiles.size,
  }).eq('id', runId)

  // 終端摘要
  console.log(`\n✅ 掃描完成`)
  console.log(`   掃描檔案：${filesScanned}`)
  console.log(`   總違規數：${violations.length}`)
  console.log(`   違規檔案：${dirtyFiles.size}`)

  const byType: Record<string, number> = {}
  for (const v of violations as Array<{ violation_type: string }>) {
    byType[v.violation_type] = (byType[v.violation_type] || 0) + 1
  }
  console.log('\n違規類型：')
  for (const [t, c] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    const bar = '█'.repeat(Math.ceil(c / 2))
    console.log(`  ${t.padEnd(20)} ${String(c).padStart(4)}  ${bar}`)
  }
}

main().catch(console.error)
