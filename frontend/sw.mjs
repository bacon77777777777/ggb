import { chromium } from '@playwright/test';
const b = await chromium.launch({ args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ viewport:{width:390,height:844} });
const bad = new Set();
ctx.on('response', r => { if (r.status() === 404 && /\.(png|jpg|jpeg|webp|svg|gif)$/i.test(new URL(r.url()).pathname)) bad.add(new URL(r.url()).pathname); });
for (const p of ['/','/gacha/19','/ranking','/search','/news','/profile','/market','/sell/manage','/topup']) {
  const page = await ctx.newPage();
  try { await page.goto('http://localhost:3000'+p, {waitUntil:'networkidle', timeout:45000}); } catch {}
  await page.waitForTimeout(1200); await page.close();
}
console.log(bad.size ? '仍有 404：\n' + [...bad].join('\n') : '✅ 九個頁面掃過，沒有圖片 404');
await b.close();
