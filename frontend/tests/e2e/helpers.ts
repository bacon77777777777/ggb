import type { Page } from '@playwright/test';

/**
 * E2E 用的功能開關。
 *
 * 前台會依 `feature_flags` 決定類別開不開；**查不到就用預設值，而預設是關的**
 * （見 contexts/FeatureFlagsContext 的 DEFAULT_FLAGS —— 「開了才顯示」比較安全）。
 * 測試把 Supabase 回應一律 mock 成 `[]` 的話，等於所有類別都關閉：
 * 商品頁顯示「商品關閉中」、交易所進不去、底部導航沒有交換 tab，
 * 於是一連串測試全掛，而且看起來像功能壞了（2026-08-20 查 CI 長期紅燈找到的）。
 *
 * 不 mock 也不行：那會讀到線上真實設定，測試就跟著營運決策浮動 ——
 * `exchange` 現在實際是關的，導航測試因此永遠失敗。
 *
 * 所以測試一律自己宣告「這一輪哪些功能是開的」。
 */
const FLAG_KEYS = [
  'sell', 'ichiban', 'blindbox', 'gacha', 'card', 'custom',
  'slot', 'exchange', 'market', 'recharge', 'register',
] as const;

export const ALL_FLAGS_ON = FLAG_KEYS.map((key) => ({ key, enabled: true, state: 'on' }));

/** 攔 feature_flags 查詢並回傳全開；其餘請求不受影響 */
export async function mockFeatureFlags(page: Page, rows = ALL_FLAGS_ON) {
  await page.route('**/*supabase.co/rest/v1/feature_flags*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(rows),
    });
  });
}

/** 給已經有 catch-all route 的測試用：URL 是不是 feature_flags 查詢 */
export function isFeatureFlagsUrl(url: string) {
  return url.includes('/feature_flags');
}

/**
 * 關掉首頁彈窗（站內公告 + 最新上架）。
 *
 * 首頁彈窗預設「每次進來都跳」，蓋在 z-120 會擋住底部導航 ——
 * 導航測試點 tab 時點到的是彈窗遮罩，於是換頁沒發生、waitForURL 逾時
 * （2026-08-20 查 CI 長期紅燈時發現）。
 *
 * 這裡把兩個來源都關掉：`site_promos` 回空、最新上架的開關設成 0。
 */
export async function mockNoPopups(page: Page) {
  await page.route('**/*supabase.co/rest/v1/site_promos*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/*supabase.co/rest/v1/platform_settings*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ key: 'promo_new_arrival_enabled', value: '0' }]),
    });
  });
}
