/**
 * 後台權限表一致性檢查（老闆 2026-08-24：新增後台頁面一律要進權限清單）
 *
 * 交叉比對四張表，任何一張漏了就會在這裡被抓出來：
 *   ① app/permissions/page.tsx        權限清單（管理員能勾的項目）
 *   ② components/AdminLayout.tsx      PATH_PERMISSION_MAP（選單可見性）
 *   ③ middleware.ts                   PATH_PERMISSIONS（真正的伺服器端把關）
 *   ④ lib/permissionPaths.ts          MENU_PATH_ORDER（登入後導向第一個有權限的頁）
 *
 * 用法：npm run check:permissions（有問題會回非 0）
 */
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const perms = (v) => v.replace(/[[\]]/g, '').split(',').map(x => x.trim().replace(/^'|'$/g, '')).filter(Boolean);

// ① 權限清單
const listSrc = read('app/permissions/page.tsx');
const declared = new Set([...listSrc.matchAll(/\{\s*id:\s*'([^']+)'/g)].map(m => m[1]));

// ② 選單可見性
const layoutSrc = read('components/AdminLayout.tsx');
const menuBlock = layoutSrc.match(/const PATH_PERMISSION_MAP: Record<string, string \| string\[\]> = \{([\s\S]*?)\n  \}/)[1];
const menuMap = [...menuBlock.matchAll(/'([^']+)':\s*(\[[^\]]*\]|'[^']*')/g)].map(m => ({ path: m[1], need: perms(m[2]) }));

// ③ middleware
const mwSrc = read('middleware.ts');
const mwBlock = mwSrc.match(/const PATH_PERMISSIONS: Array<\{ prefix: string; permission: string \| string\[\] \}> = \[([\s\S]*?)\n\]/)[1];
const mwRules = [...mwBlock.matchAll(/prefix: '([^']+)',\s*permission: (\[[^\]]*\]|'[^']*')/g)].map(m => ({ prefix: m[1], need: perms(m[2]) }));

// ④ 登入導向
const pathsSrc = read('lib/permissionPaths.ts');
const orderPaths = new Set([...pathsSrc.matchAll(/path: '([^']+)'/g)].map(m => m[1]));

const problems = [];

// 選單用到的權限一定要在權限清單裡，否則超管以外的人永遠勾不到
for (const { path, need } of menuMap) {
  for (const p of need) {
    if (!declared.has(p) && !p.startsWith('header_')) {
      problems.push(`選單 ${path} 需要權限 "${p}"，但權限清單（permissions 頁）沒有這一項 → 只有超管看得到`);
    }
  }
}

/*
 * 不變式：**選單放行的每一個權限，middleware 都必須接受**。
 *
 * 用「至少一個相符」是不夠的 —— 2026-08-24 的廠商 bug 就是這樣漏掉的：
 * 選單給 ['reports_accounting_guide', 'reports_settlement']、middleware 只認前者，
 * 「至少一個相符」會通過，但**只有 reports_settlement 的廠商**照樣看得到、點了被踢。
 * 所以要逐一檢查每個權限。
 */
for (const { path, need } of menuMap) {
  const cand = mwRules.filter(r => path === r.prefix || path.startsWith(r.prefix + '/'));
  if (!cand.length) continue;
  const best = cand.sort((a, b) => b.prefix.length - a.prefix.length)[0];
  for (const p of need) {
    if (!best.need.includes(p)) {
      problems.push(`${path}：選單對持有 "${p}" 的人顯示，但 middleware(${best.prefix}) 只認 [${best.need}] → 那些人看得到、點了會被踢回去`);
    }
  }
}

if (problems.length) {
  console.error(`✗ 權限表不一致（${problems.length} 處）：`);
  problems.forEach(p => console.error('  - ' + p));
  console.error('\n修法見 CLAUDE.md「新增後台頁面：一律要進權限清單」。');
  process.exit(1);
}
console.log(`✓ 權限表一致（選單 ${menuMap.length} 條、middleware ${mwRules.length} 條、清單 ${declared.size} 項、導向 ${orderPaths.size} 條）`);
