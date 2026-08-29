#!/usr/bin/env node
/**
 * 品牌素材產生器 —— brand/ 是全站 logo 素材的唯一來源
 *
 * 為什麼要有這支：
 * 換 logo 要動 17 個檔，散在 frontend/public、backend/public、mobile/assets 三個
 * 不同的 app 底下，路徑沒辦法共用（後台跟 App 各自部署，讀不到前台的檔案系統）。
 * 2026-06 那次換 logo 就是漏了幾處，`images/20260629/` 這個「改版暫存資料夾」
 * 被轉正之後根目錄又留了一份同內容的死檔，兩邊並存了兩個月沒人發現。
 *
 * 所以規則改成：**只改 brand/masters/ 的兩張母檔，其餘一律用這支產。**
 *
 *   node scripts/brand_sync.mjs            產出 + 複製到所有目的地
 *   node scripts/brand_sync.mjs --dry      只印要做什麼，不寫檔
 *   node scripts/brand_sync.mjs --no-mobile  跳過 App 圖示（換了要重新送審）
 *
 * ⚠️ brand/generated/ 每次都會被整個重產，不要手動改那裡的檔案 ——
 *    要調整就改母檔或改本檔的 SPECS。brand/manual/ 反過來，只複製不重產。
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
// sharp 沒裝在 repo 根目錄，借前台的（backend 也有同版本）
const sharp = require(path.join(ROOT, 'frontend/node_modules/sharp'))

const DRY = process.argv.includes('--dry')
const NO_MOBILE = process.argv.includes('--no-mobile')

const BRAND = path.join(ROOT, 'brand')
const MASTERS = path.join(BRAND, 'masters')
const GEN = path.join(BRAND, 'generated')
const MANUAL = path.join(BRAND, 'manual')

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }
const NEAR_BLACK = { r: 10, g: 10, b: 10, alpha: 1 }
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 }

/*
 * PNG 直出不壓縮，1024² 的 favicon 會來到 670KB —— 那是要塞進每個玩家瀏覽器
 * 分頁的圖。調色盤量化對這種「大面積純色 + 少數幾個品牌色」的 logo 幾乎無損，
 * 實測可以壓到十分之一。
 */
const PNG_OPTS = { compressionLevel: 9, palette: true, quality: 92, effort: 9 }

/*
 * 佔位圖不能用白底：新 logo 有大片白色紙張，灰階之後那塊就是白的，壓在白底上
 * 等於看不見（第一版產出來只剩幾條淡淡的輪廓）。改用淺灰底，白色紙張與深色
 * 描邊都讀得出來，而且一塊灰方塊本身就在說「這裡的圖還沒上」。
 */
const PLACEHOLDER_BG = { r: 242, g: 242, b: 242, alpha: 1 }

/**
 * 方形圖示的通用作法：畫布填底色，logo 等比縮到 `pct` 寬並置中。
 *
 * `pct` 不是隨便給的：
 *   0.96 是一般圖示（favicon / PWA / App），四邊留一點呼吸
 *   0.62 是 maskable 與 Android 自適應圖示的安全區 —— 系統會把圖示裁成圓形或
 *        squircle，超出 62% 的部分不保證看得到（量自舊檔，317/512 = 61.9%）
 */
async function squareIcon({ size, pct, bg, source = 'vertical' }) {
  const src = path.join(MASTERS, `${source}.png`)
  const w = Math.round(size * pct)
  const logo = await sharp(src).resize({ width: w }).png().toBuffer()
  const { height: h } = await sharp(logo).metadata()
  return sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: logo, left: Math.round((size - w) / 2), top: Math.round((size - h) / 2) }])
    .png(PNG_OPTS)
    .toBuffer()
}

/**
 * 佔位圖（商品／輪播破圖時顯示）：白底 + 灰階淡化的 logo。
 *
 * 淡化是刻意的 —— 佔位圖要一眼看出「這裡本來該有圖」，不能讓玩家誤以為
 * 商品本身長這樣。灰階＋三成透明度是照舊版佔位圖的視覺量出來的。
 */
async function placeholder({ w, h, pct, source, fade = 0.65, bg = PLACEHOLDER_BG }) {
  const src = path.join(MASTERS, `${source}.png`)
  const lw = Math.round(w * pct)
  const { data, info } = await sharp(src).resize({ width: lw }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    data[i] = data[i + 1] = data[i + 2] = lum
    data[i + 3] = Math.round(data[i + 3] * fade)
  }
  const logo = await sharp(data, { raw: info }).png().toBuffer()
  return sharp({ create: { width: w, height: h, channels: 4, background: bg } })
    .composite([{ input: logo, left: Math.round((w - info.width) / 2), top: Math.round((h - info.height) / 2) }])
    .png(PNG_OPTS)
    .toBuffer()
}

const copyMaster = (name) => async () => fs.promises.readFile(path.join(MASTERS, name))

/**
 * 產出清單。`dest` 是絕對路徑相對 repo 根，一個產出可以送去多個地方。
 * 尺寸與比例全部量自 2026-08-28 換 logo 後的實際檔案，改這裡就是改全站視覺。
 */
const SPECS = [
  // ── 橫式 logo（原檔直出）
  { out: 'logo.png', desc: '橫式 logo（導覽列 / 維護頁 / LINE 回跳頁 / 後台蓋圖來源）', size: '1554×500',
    make: copyMaster('horizontal.png'), dest: ['frontend/public/images/logo.png'] },
  // ── 直式 logo（原檔直出）
  { out: 'logo-stacked.png', desc: '直式 logo（登入頁）', size: '723×646',
    make: copyMaster('vertical.png'), dest: ['frontend/public/images/logo-stacked.png'] },

  // ── 方形圖示（直式 logo 衍生）
  { out: 'favicon.png', desc: '瀏覽器分頁圖示 / 情報頁 JSON-LD 出版者標誌（方形系）', size: '1024×1024',
    make: () => squareIcon({ size: 1024, ...APPICON }), dest: ['frontend/public/images/favicon.png'] },
  { out: 'icon-192.png', desc: 'PWA / 加到主畫面（方形系）', size: '192×192',
    make: () => squareIcon({ size: 192, ...APPICON }), dest: ['frontend/public/icons/icon-192.png'] },
  { out: 'icon-512.png', desc: 'PWA / 加到主畫面（方形系）', size: '512×512',
    make: () => squareIcon({ size: 512, ...APPICON }), dest: ['frontend/public/icons/icon-512.png'] },
  { out: 'icon-maskable-192.png', desc: 'PWA 可裁切圖示（maskable 系）', size: '192×192',
    make: () => squareIcon({ size: 192, ...MASKABLE }), dest: ['frontend/public/icons/icon-maskable-192.png'] },
  { out: 'icon-maskable-512.png', desc: 'PWA 可裁切圖示（maskable 系）', size: '512×512',
    make: () => squareIcon({ size: 512, ...MASKABLE }), dest: ['frontend/public/icons/icon-maskable-512.png'] },
  { out: 'apple-touch-icon.png', desc: 'iOS 加到主畫面（方形系）', size: '180×180',
    make: () => squareIcon({ size: 180, ...APPICON }), dest: ['frontend/public/icons/apple-touch-icon.png'] },
  { out: 'backend-favicon.png', desc: '後台分頁圖示', size: '1024×1024',
    make: () => squareIcon({ size: 1024, ...APPICON }), dest: ['backend/public/images/favicon.png'] },

  // ── 佔位圖
  { out: 'banner_defaulet.png', desc: '輪播破圖 / 情報無封面 / 交易所無圖（檔名 typo 是原本就有的）', size: '1200×400',
    make: () => placeholder({ w: 1200, h: 400, pct: 0.38, source: 'horizontal' }),
    dest: ['frontend/public/images/banner_defaulet.png'] },
  { out: 'item_defaulet.webp', desc: '商品 / 品項 / 倉庫 / 商城佔位', size: '1024×1024', webp: true,
    make: () => placeholder({ w: 1024, h: 1024, pct: 0.55, source: 'vertical' }),
    dest: ['frontend/public/images/item_defaulet.webp'] },

  // ── App 原生殼（換了要 cap sync + 重新送審才生效）
  { out: 'app-icon.png', desc: 'App 桌面圖示', size: '1024×1024', mobile: true,
    make: () => squareIcon({ size: 1024, ...APPICON }), dest: ['mobile/assets/icon.png'] },
  { out: 'app-icon-foreground.png', desc: 'Android 自適應圖示前景（maskable 系）', size: '1024×1024', mobile: true,
    // bg 強制透明：Android 自適應圖示的前景層外圍要透空，底色由 background 層畫。
    // 若之後提供了滿版的 appicon-maskable.png，它本來就鋪滿畫布，這個 bg 不會有作用
    make: () => squareIcon({ size: 1024, ...MASKABLE, bg: CLEAR }), dest: ['mobile/assets/icon-foreground.png'] },
  { out: 'app-icon-background.png', desc: 'Android 自適應圖示背景（純白）', size: '1024×1024', mobile: true,
    make: () => sharp({ create: { width: 1024, height: 1024, channels: 4, background: WHITE } }).png(PNG_OPTS).toBuffer(),
    dest: ['mobile/assets/icon-background.png'] },
  { out: 'app-splash.png', desc: 'App 開機畫面（淺色）', size: '2732×2732', mobile: true,
    make: () => squareIcon({ size: 2732, pct: 0.21, bg: WHITE }), dest: ['mobile/assets/splash.png'] },
  { out: 'app-splash-dark.png', desc: 'App 開機畫面（深色）', size: '2732×2732', mobile: true,
    make: () => squareIcon({ size: 2732, pct: 0.21, bg: NEAR_BLACK }), dest: ['mobile/assets/splash-dark.png'] },
]

/**
 * 手繪插畫 —— 這些不是 logo 衍生，重跑腳本不會變。
 * 要換就把 brand/manual/ 底下的檔案換掉（同尺寸），再跑一次這支。
 */
const MANUAL_SPECS = [
  { file: 'og-share.png', desc: '全站分享預覽圖（LINE / FB）', size: '1200×630',
    dest: ['frontend/public/images/line_default.png'] },
  { file: 'og-invite.png', desc: '邀請頁分享預覽圖', size: '1200×630',
    dest: ['frontend/public/images/invite/invite_banner.png'] },
  { file: 'app-launch.jpg', desc: 'iOS 原生啟動畫面（直式滿版）', size: '1320×2862', mobile: true,
    dest: ['mobile/ios/App/App/Assets.xcassets/Splash.imageset/splash.jpg'] },
  /*
   * 兩張常駐頁的主視覺。這兩頁（抽獎公平性、邀請好友）不是檔期活動、不會下架，
   * 所以它們的 hero 跟 logo 一樣是長期品牌資產，收進來一起管。
   */
  // 母檔改收 PNG（8/28 老闆換圖時給的是 PNG）：無損留著，webp 由腳本壓
  { file: 'event-fairness-hero.png', desc: '抽獎公平性頁主視覺', size: '1024×1535',
    dest: [], alsoWebp: 'frontend/public/images/fairness/hero2.webp', webpQuality: 88 },
  { file: 'event-invite-hero.png', desc: '邀請好友頁主視覺', size: '800×1320',
    // 滿版顯示的大面積漸層插畫，頭像那組的 q80 會看得出色帶
    dest: [], alsoWebp: 'frontend/public/images/invite/invite.webp', webpQuality: 88 },
  /*
   * 預設頭像三十款（原本八款，老闆 2026-08-29 補到 30），**是輪替用的不是只有一張**：
   * 信箱驗證建帳號時由 `handle_new_user()` 隨機配一款，機器人帳號也是平均分佈。
   * 所以三十張都要在這裡，換的時候整組一起換視覺才會一致。
   *
   * ⚠️ 改這個數字時，另外三個地方要一起改，不然會對不上：
   *   1. `frontend/app/profile/page.tsx` 的 `DEFAULT_AVATARS`（頭像選擇彈窗）
   *   2. `handle_new_user()` 的隨機範圍（migration 641）
   *   3. 機器人帳號的頭像分佈
   */
  ...Array.from({ length: 30 }, (_, i) => {
    const n = String(i + 1).padStart(2, '0')
    return {
      file: `avatar-${n}.png`, size: '1000×1000',
      desc: `預設頭像 ${n}／30（新帳號隨機配一款）`,
      dest: [`frontend/public/images/avatar/${n}.png`],
      alsoWebp: `frontend/public/images/avatar/${n}.webp`,
    }
  }),
]

/**
 * 產一張總覽圖。老闆要的是「打開資料夾就知道有哪些圖」，一張聯絡表比 21 個
 * 檔名好用得多 —— 尤其是要確認「換完 logo 有沒有哪張漏掉」的時候。
 * 洋紅色代表透明區（Android 前景圖那張本來就該是透明的）。
 */
async function overview() {
  const cells = []
  for (const dir of [MASTERS, GEN, MANUAL]) {
    for (const f of fs.readdirSync(dir).sort()) {
      if (f.startsWith('.') || f.endsWith('.svg')) continue
      cells.push([path.basename(dir), f, path.join(dir, f)])
    }
  }
  const CELL = 280, COLS = 6, rows = Math.ceil(cells.length / COLS), t = []
  for (let i = 0; i < cells.length; i++) {
    const [group, name, fp] = cells[i]
    const m = await sharp(fp).metadata()
    const kb = (fs.statSync(fp).size / 1024).toFixed(0)
    const img = await sharp(fp).resize(CELL - 10, CELL - 46, { fit: 'contain', background: '#ff00ff' })
      .flatten({ background: '#ff00ff' }).png().toBuffer()
    const x = (i % COLS) * CELL, y = Math.floor(i / COLS) * CELL
    t.push({ input: img, left: x + 5, top: y + 38 })
    const tone = group === 'masters' ? '#d94f2b' : group === 'manual' ? '#8a6d00' : '#111'
    t.push({ input: Buffer.from(
      `<svg width="${CELL}" height="36"><rect width="${CELL}" height="36" fill="${tone}"/>` +
      `<text x="6" y="15" font-family="sans-serif" font-size="12" fill="#fff">${group}/${name}</text>` +
      `<text x="6" y="30" font-family="sans-serif" font-size="11" fill="#cfc">${m.width}×${m.height}　${kb}KB</text></svg>`),
      left: x, top: y })
  }
  return sharp({ create: { width: COLS * CELL, height: rows * CELL, channels: 3, background: '#666' } })
    .composite(t).png({ compressionLevel: 9 }).toBuffer()
}

const has = (f) => fs.existsSync(path.join(MASTERS, f))

/**
 * 方形圖示（加到主畫面 / PWA / App 桌面）的來源
 *
 * 這類圖示通常是**另外設計的**：滿版方塊、自帶底色、常常只放圖標不放字，
 * 跟導覽列那顆橫式 logo 不是同一件事。所以拉成獨立母檔，不從 vertical 推。
 *
 * 沒放 appicon.png 就退回「直式 logo 貼白底 96%」—— 也就是 2026-08 換 logo 時
 * 的做法，行為不變，之後補設計稿再自動接上。
 */
const APPICON = has('appicon.png')
  ? { source: 'appicon', pct: 1, bg: CLEAR }
  : { source: 'vertical', pct: 0.96, bg: WHITE }

/**
 * maskable 版：Android 會把圖示裁成圓形／squircle，超出中央 62% 的部分不保證看得到。
 * 專門設計的 maskable 稿是「滿版、但重要內容自己縮在安全區內」，所以滿版直出；
 * 只給了 appicon 沒給 maskable 的話，退而求其次把它整張縮到 62% 貼白底。
 */
const MASKABLE = has('appicon-maskable.png')
  ? { source: 'appicon-maskable', pct: 1, bg: CLEAR }
  : has('appicon.png')
    ? { source: 'appicon', pct: 0.62, bg: WHITE }
    : { source: 'vertical', pct: 0.62, bg: WHITE }

const rel = (p) => path.relative(ROOT, p)
const write = async (p, buf) => {
  if (DRY) return
  await fs.promises.mkdir(path.dirname(p), { recursive: true })
  await fs.promises.writeFile(p, buf)
}

async function main() {
  // appicon.png / appicon-maskable.png 是選配，缺了就走 fallback（見 APPICON / MASKABLE）
  for (const m of ['horizontal.png', 'vertical.png']) {
    if (!fs.existsSync(path.join(MASTERS, m))) {
      console.error(`✗ 缺母檔 brand/masters/${m}`)
      process.exit(1)
    }
  }
  if (!DRY) await fs.promises.mkdir(GEN, { recursive: true })

  // 方形圖示吃哪張母檔要講出來 —— 放了 appicon 卻打錯檔名時，
  // 產出來的東西看起來「正常」（因為有 fallback），只是不是你想要的那張
  console.log(`方形圖示來源：${APPICON.source}.png${has('appicon.png') ? '（滿版直出）' : '（未提供 appicon.png，退回直式 logo 貼白底）'}`)
  console.log(`maskable 來源：${MASKABLE.source}.png${has('appicon-maskable.png') ? '（滿版直出）' : `（未提供 appicon-maskable.png，退回 ${MASKABLE.source} 縮 ${Math.round(MASKABLE.pct * 100)}%）`}`)

  /*
   * App 圖示是「另外設計」的，換 logo 時**不會**自動跟著變。
   * 換了 vertical.png 卻忘了換 appicon.png，網頁 logo 換新、手機上那顆還是舊的 ——
   * 而且不會有任何錯誤，要有人開手機才會發現。所以比一下改檔時間先喊一聲。
   */
  const mtime = (f) => fs.statSync(path.join(MASTERS, f)).mtimeMs
  for (const f of ['appicon.png', 'appicon-maskable.png']) {
    if (has(f) && mtime(f) < mtime('vertical.png')) {
      console.log(`⚠️  ${f} 比 vertical.png 舊 —— 換了 logo 但 App 圖示沒跟著換？`)
    }
  }
  console.log()

  let made = 0, copied = 0, skipped = 0
  for (const s of SPECS) {
    if (s.mobile && NO_MOBILE) { skipped++; continue }
    let buf = await s.make()
    if (s.webp) buf = await sharp(buf).webp({ quality: 90 }).toBuffer()
    await write(path.join(GEN, s.out), buf)
    made++
    console.log(`  產出  brand/generated/${s.out.padEnd(24)} ${s.size}`)
    for (const d of s.dest) {
      await write(path.join(ROOT, d), buf)
      copied++
      console.log(`   └→   ${d}`)
    }
  }

  for (const s of MANUAL_SPECS) {
    if (s.mobile && NO_MOBILE) { skipped++; continue }
    const src = path.join(MANUAL, s.file)
    if (!fs.existsSync(src)) { console.log(`  跳過  brand/manual/${s.file}（不存在）`); continue }
    const buf = await fs.promises.readFile(src)
    for (const d of s.dest) {
      await write(path.join(ROOT, d), buf)
      copied++
      console.log(`  複製  brand/manual/${s.file.padEnd(20)} → ${d}`)
    }
    if (s.alsoWebp) {
      await write(path.join(ROOT, s.alsoWebp), await sharp(buf).webp({ quality: s.webpQuality ?? 80, effort: 6 }).toBuffer())
      copied++
      console.log(`   └→   ${s.alsoWebp}`)
    }
  }

  if (!DRY) {
    await write(path.join(BRAND, 'OVERVIEW.png'), await overview())
    console.log('  產出  brand/OVERVIEW.png（總覽聯絡表）')
  }

  console.log(`\n${DRY ? '[乾跑] ' : ''}產出 ${made} 張、複製 ${copied} 個位置${skipped ? `、跳過 ${skipped} 個 App 素材` : ''}`)
  if (NO_MOBILE) console.log('（--no-mobile：mobile/ 底下沒動）')
  else {
    // cap sync **不會**重產 Xcode 的圖示目錄（它只同步設定與外掛）——
    // 2026-08-28 換 logo 後模擬器仍是舊圖示就是這個原因
    console.log('⚠️  App 圖示還要 `cd mobile && npx @capacitor/assets generate --ios` 才會進 Xcode 圖示目錄')
    console.log('    ⚠️ 那支會順手改寫 Splash.imageset/Contents.json、塞進它自己產的 Default@*.png，')
    console.log('       把我們的 splash.jpg 蓋掉 —— 跑完要 `git checkout` 那個 Contents.json 並刪掉 Default@*.png')
    console.log('    最後重新編譯、送 App Store／Play 審核才會生效')
  }
  console.log('資源雜湊表會在下次 npm run dev / build 自動重產（frontend 的 predev/prebuild）')
}

main().catch((e) => { console.error(e); process.exit(1) })
