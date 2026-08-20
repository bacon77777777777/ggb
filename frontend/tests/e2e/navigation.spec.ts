import { test, expect } from '@playwright/test';
import { mockFeatureFlags, mockNoPopups } from './helpers';

test.describe('MobileTabbar navigation', () => {
  /*
   * 測的是「底部導航會不會正確換頁」。
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
    await page.addStyleTag({ content: '[data-nextjs-dev-overlay], nextjs-portal, [data-nextjs-scroll-focus-bar] { pointer-events: none !important; opacity: 0 !important; }' });
    await page.waitForLoadState('domcontentloaded');

    const tabbar = page.getByTestId('mobile-tabbar');

    const rankingLink = tabbar.getByRole('link', { name: '排行榜' });
    await expect(rankingLink).toBeVisible({ timeout: 15000 });
    await rankingLink.click({ force: true });
    await page.waitForURL(/\/ranking(?:\?|$)/, { timeout: 15000 });

    const newsLink = tabbar.getByRole('link', { name: '情報' });
    await expect(newsLink).toBeVisible({ timeout: 15000 });
    await newsLink.click({ force: true });
    await page.waitForURL(/\/news(?:\?|$)/, { timeout: 15000 });
  });
});
