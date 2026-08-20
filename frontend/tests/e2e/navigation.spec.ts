import { test, expect } from '@playwright/test';
import { mockFeatureFlags, mockNoPopups } from './helpers';

test.describe('MobileTabbar navigation', () => {
  /*
   * 測的是「底部導航會不會正確換頁」。
   *
   * ⚠️ 不要用 `click({ force: true })`。force 會跳過 Playwright 的可點擊檢查
   * 直接派發事件 —— 換頁時我們會蓋 ProductLoadingScreen（z-9999），本機夠快
   * 它早就消失了，CI 慢一拍就點在遮罩上，換頁不會發生（2026-08-20 CI 實測）。
   * 拿掉 force，Playwright 會等到元素真的可點才動手。
   * （force 原本是為了閃避 Next.js dev overlay，但 CI 跑的是 production build，
   * 沒有那個東西。）
   *
   * ⚠️ 原本走的是 首頁 → 交換 → 排行榜，但**底部導航早就沒有「交換」了** ——
   * 販售／交易所／卡牌交換以前要搶中央那一格，改版後三個入口都搬到首頁右下角
   * 的懸浮按鈕（見 components/MobileTabbar 的說明），這個測試從那時起就必定
   * 失敗（2026-08-20 查 CI 長期紅燈時發現）。改用現在真的存在的分頁。
   */
  test('tabs navigate: Home -> Ranking -> News', async ({ page }) => {
    await mockFeatureFlags(page);
    // 首頁彈窗蓋在 z-120，不關掉的話點 tab 會點到它而不是導航
    await mockNoPopups(page);
    await page.goto('/');
    // 本機跑 dev 模式時會有 Next.js 的開發浮層擋在上面（CI 跑 production build 沒有）
    await page.addStyleTag({ content: '[data-nextjs-dev-overlay], nextjs-portal, [data-nextjs-scroll-focus-bar] { pointer-events: none !important; opacity: 0 !important; }' });
    await page.waitForLoadState('domcontentloaded');

    const tabbar = page.getByTestId('mobile-tabbar');

    const rankingLink = tabbar.getByRole('link', { name: '排行榜' });
    await expect(rankingLink).toBeVisible({ timeout: 15000 });
    await rankingLink.click();
    await page.waitForURL(/\/ranking(?:\?|$)/, { timeout: 15000 });

    const newsLink = tabbar.getByRole('link', { name: '情報' });
    await expect(newsLink).toBeVisible({ timeout: 15000 });
    await newsLink.click();
    await page.waitForURL(/\/news(?:\?|$)/, { timeout: 15000 });
  });
});
