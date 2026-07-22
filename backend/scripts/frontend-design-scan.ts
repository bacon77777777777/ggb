/**
 * 前台 Design System 違規掃描腳本
 * 本地執行：npx tsx scripts/frontend-design-scan.ts
 * 結果寫入 DB，/frontend-design-system 頁面讀取顯示
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

// 前台特有的違規 pattern
const FORBIDDEN = [
  { type: 'bg-[#F5F5F5]',      regex: /bg-\[#F5F5F5\]/gi,            fix: '改用 bg-neutral-50' },
  { type: 'bg-[#...] magic',   regex: /bg-\[#[0-9a-fA-F]{3,6}\]/g,   fix: '改用 design token（bg-neutral-*, bg-primary 等）' },
  { type: 'text-[#...] magic', regex: /text-\[#[0-9a-fA-F]{3,6}\]/g, fix: '改用 design token（text-neutral-*, text-primary 等）' },
  { type: 'bg-primary-600',    regex: /\bbg-primary-[6-9]00\b/g,      fix: '改用 bg-primary（token 不存在）' },
  { type: 'bg-primary-700',    regex: /\bbg-primary-700\b/g,          fix: '改用 bg-primary/90（hover 狀態）' },
  { type: 'gray-*',            regex: /\bgray-\d+\b/g,                fix: '改用 neutral-*' },
  { type: 'emerald-*',         regex: /\bemerald-\d+\b/g,             fix: '改用 green-*' },
  { type: 'rounded-md',        regex: /\brounded-md\b/g,              fix: '改用 rounded-xl（前台）或 rounded-lg' },
  { type: 'z-[magic]',         regex: /\bz-\[\d{2,4}\]\b/g,          fix: '改用標準層級：z-10/20/30/40/50' },
  { type: 'w-[magic px]',      regex: /\bw-\[\d+px\]\b/g,            fix: '改用 Tailwind spacing 或 rem 單位' },
  { type: 'h-[magic px]',      regex: /\bh-\[\d+px\]\b/g,            fix: '改用 Tailwind spacing 或 rem 單位' },
  { type: 'inline style color',regex: /style=\{[^}]*color\s*:/g,      fix: '改用 Tailwind text-* 色彩 token' },
]

// 掃描時排除的路徑片段
const EXCLUDE = [
  'node_modules', '.next', '.git',
  'components/gacha-themes',   // 主題組件含大量 magic value，刻意保留
  'components/shop/GachaMachine', // 轉蛋機 SVG 動畫，刻意保留
  'frontend-design-scan.ts',   // 掃描腳本本身
]

function shouldExclude(rel: string) {
  return EXCLUDE.some(ex => rel.includes(ex))
}

function* walkTsx(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!['node_modules', '.next', '.git', 'profilecard'].includes(entry.name)) yield* walkTsx(full)
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
      yield full
    }
  }
}

async function main() {
  // 前台 src 根目錄（相對於 backend scripts/）
  const frontendRoot = path.resolve(__dirname, '../../frontend')

  if (!fs.existsSync(frontendRoot)) {
    console.error(`找不到前台目錄：${frontendRoot}`)
    process.exit(1)
  }

  console.log(`掃描目錄：${frontendRoot}`)

  // 建立本次 run 記錄
  const { data: run, error: runErr } = await supabase
    .from('frontend_design_scan_runs')
    .insert({ files_scanned: 0, total_violations: 0, files_with_violations: 0 })
    .select('id')
    .single()
  if (runErr || !run) { console.error('無法建立 run 記錄', runErr); process.exit(1) }

  const runId: string = run.id
  const violations: object[] = []
  let filesScanned = 0
  const dirtyFiles = new Set<string>()

  for (const abs of walkTsx(frontendRoot)) {
    const rel = path.relative(frontendRoot, abs)
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
            violation_class: m[0].slice(0, 80),
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
    await supabase.from('frontend_design_scan_results').insert(violations.slice(i, i + 100))
  }

  // 更新 run 統計
  await supabase.from('frontend_design_scan_runs').update({
    files_scanned: filesScanned,
    total_violations: violations.length,
    files_with_violations: dirtyFiles.size,
  }).eq('id', runId)

  // 終端摘要
  console.log(`\n✅ 前台掃描完成`)
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
    console.log(`  ${t.padEnd(28)} ${String(c).padStart(4)}  ${bar}`)
  }
}

main().catch(console.error)
