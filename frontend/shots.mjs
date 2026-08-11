import { chromium } from '@playwright/test';
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
for (const [url, out] of [['/gacha/37','s-gacha.png'], ['/card/48','s-card.png'], ['/item/81','s-ichiban.png']]) {
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('http://localhost:3000' + url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(9000);
  await page.screenshot({ path: out });
  await page.close();
}
await b.close();
