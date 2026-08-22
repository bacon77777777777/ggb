/**
 * 產生靜態資源的內容雜湊表 → lib/assetManifest.generated.json
 *
 * 用途：`lib/asset.ts` 的 `asset('/images/x.png')` 會回 `/images/x.png?v=<hash>`，
 * 搭配 next.config 的 headers（帶 ?v= 才給一年 immutable）與 sw.js（帶 ?v= 才 cache-first）。
 * 圖一改、hash 一變、網址就變 —— 快取永遠命中，卻永遠不會拿到舊圖
 * （老闆 2026-08-22：「不要用到舊圖，會有資訊不對等問題」）。
 *
 * 在 predev / prebuild 自動跑；Vercel build 也會跑，所以不用手動維護。
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(root, 'public')
const DIRS = ['images', 'loading', 'icons', 'audio', 'videos']
const out = join(root, 'lib', 'assetManifest.generated.json')

const manifest = {}
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === '.DS_Store' || name.startsWith('.')) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) { walk(full); continue }
    const hash = createHash('md5').update(readFileSync(full)).digest('hex').slice(0, 10)
    manifest['/' + relative(PUBLIC, full).split('\\').join('/')] = hash
  }
}
for (const d of DIRS) {
  try { walk(join(PUBLIC, d)) } catch { /* 目錄不存在就跳過 */ }
}
const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)))
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(sorted, null, 0) + '\n')
console.log(`[asset-manifest] ${Object.keys(sorted).length} files → ${relative(root, out)}`)
