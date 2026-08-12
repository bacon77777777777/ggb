import { chromium } from '/Users/bacon/ggb-dev/frontend/node_modules/playwright/index.mjs'
const tok = process.argv[2]
const d = new Date(), today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const b = await chromium.launch({ headless: true })
for (const w of [1600, 1100, 820]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 1000 }, extraHTTPHeaders: { cookie: `admin_session=${tok}` } })
  await ctx.addInitScript(([t, day]) => { localStorage.setItem('adminToken', t); localStorage.setItem('adminLoginDate', day); localStorage.setItem('adminId', '1') }, [tok, today])
  const p = await ctx.newPage()
  const errs = []; p.on('pageerror', e => errs.push(e.message))
  await p.goto('http://localhost:3001/reports/settlement', { waitUntil: 'domcontentloaded', timeout: 130000 })
  await p.waitForTimeout(12000)
  console.log(`@${w}px`, await p.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter(x => /^\d{4}年\d{2}月/.test(x.textContent.trim()))
    const bar = btns[0]?.parentElement
    const span = [...document.querySelectorAll('span')].find(x => x.textContent.trim() === '廠商')
    const sup = span?.closest('div')
    const exp = [...document.querySelectorAll('button')].find(x => x.textContent.includes('匯出 CSV'))
    const heights = btns.map(x => Math.round(x.getBoundingClientRect().height))
    return {
      期間鈕文字換行: heights.some(h => h > 40) ? '✘ 有' : '✔ 無（皆 ' + heights[0] + 'px）',
      時間bar自己一行: sup && bar ? (Math.abs(sup.getBoundingClientRect().top - bar.getBoundingClientRect().top) > 12 ? '✔ 是' : '否（同一行）') : '?',
      可橫向捲: bar ? (bar.scrollWidth > bar.clientWidth ? '✔ 需要且可捲' : '不需要') : '?',
      匯出可見: !!exp && exp.getBoundingClientRect().width > 0,
    }
  }), errs.length ? 'ERR' : '')
  await ctx.close()
}
await b.close()
