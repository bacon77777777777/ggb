import { test, expect } from '@playwright/test';

test.describe('MobileTabbar navigation', () => {
  test('tabs navigate: Home -> Exchange -> Ranking', async ({ page }) => {
    await page.goto('/');
    await page.addStyleTag({ content: '[data-nextjs-dev-overlay], nextjs-portal, [data-nextjs-scroll-focus-bar] { pointer-events: none !important; opacity: 0 !important; }' });
    await page.waitForLoadState('domcontentloaded');

    // Exchange (center tab)
    const tabbar = page.getByTestId('mobile-tabbar');
    const exchangeLink = tabbar.getByRole('link', { name: '交換' });
    await expect(exchangeLink).toBeVisible({ timeout: 15000 });
    await exchangeLink.click({ force: true });
    await page.waitForURL(/\/exchange(?:\?|$)/, { timeout: 15000 });

    // Ranking
    const rankingLink = tabbar.getByRole('link', { name: '排行榜' });
    await expect(rankingLink).toBeVisible({ timeout: 15000 });
    await rankingLink.click({ force: true });
    await page.waitForURL(/\/ranking(?:\?|$)/, { timeout: 15000 });
  });
});
