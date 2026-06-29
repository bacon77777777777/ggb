import { test, expect } from '@playwright/test';

test.describe('Login input focus', () => {
  test('clicking email input focuses', async ({ page }) => {
    await page.goto('/login');
    const emailInput = page.locator('input[name="email"]');
    await expect(emailInput).toBeVisible();
    await emailInput.click();
    const activeName = await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.name);
    expect(activeName).toBe('email');
  });
});
