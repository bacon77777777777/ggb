/**
 * 商品資訊欄位順序與內容驗證（轉蛋商品）
 *   順序：類別 → 廠商 → 代理商 → 產品編號
 */
import { test, expect } from '@playwright/test';

const PRODUCT_ID = 9902;

const mockProduct = {
  id: PRODUCT_ID,
  name: '測試商品資訊',
  type: 'gacha',
  status: 'active',
  remaining: 10,
  total_count: 20,
  price: 50,
  image_url: '/images/item_defaulet.png',
  supplier_id: 99,
  distributor: '萬代代理商',
  product_code: 'BNDAI-2026-001',
  category: '轉蛋',
  is_hot: false,
  barcode: null,
  release_date: null,
  description: null,
  machine_theme: null,
  notes: null,
};

const mockSupplier = { id: 99, name: '萬代南夢宮' };

const prizes = [
  { id: 10, product_id: PRODUCT_ID, name: 'A賞', level: 'A', remaining: 5, total: 10, image_url: null, probability: 0.5, decompose_type: null, decompose_value: null },
  { id: 11, product_id: PRODUCT_ID, name: 'B賞', level: 'B', remaining: 5, total: 10, image_url: null, probability: 0.5, decompose_type: null, decompose_value: null },
];

test.describe('Product info section', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/*supabase.co/rest/v1/**', async (route) => {
      const url = route.request().url();

      if (url.includes('/products') && url.includes(`id=eq.${PRODUCT_ID}`)) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockProduct) });
        return;
      }
      if (url.includes('/suppliers') && url.includes('id=eq.99')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockSupplier) });
        return;
      }
      if (url.includes('/product_prizes') && url.includes(`product_id=eq.${PRODUCT_ID}`)) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(prizes) });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.goto(`/item/${PRODUCT_ID}`);
    await page.waitForLoadState('domcontentloaded');
    // 等待商品資訊區塊 heading 出現，確保 section 已渲染
    await page.getByRole('heading', { name: '商品資訊' }).waitFor({ timeout: 10_000 });
  });

  test('shows 類別 as first info field', async ({ page }) => {
    const labels = page.locator('.grid .flex span:first-child');
    await expect(labels.filter({ hasText: '類別' }).first()).toBeVisible();
    // type=gacha → 顯示「轉蛋」
    await expect(labels.filter({ hasText: '類別' }).first().locator('..').locator('span:last-child')).toBeVisible();
  });

  test('shows 廠商 with supplier name', async ({ page }) => {
    const labels = page.locator('.grid .flex span:first-child');
    await expect(labels.filter({ hasText: '廠商' }).first()).toBeVisible();
    await expect(page.locator('text=萬代南夢宮').first()).toBeVisible();
  });

  test('shows 代理商', async ({ page }) => {
    const labels = page.locator('.grid .flex span:first-child');
    await expect(labels.filter({ hasText: '代理商' }).first()).toBeVisible();
    await expect(page.locator('text=萬代代理商').first()).toBeVisible();
  });

  test('shows 產品編號', async ({ page }) => {
    const labels = page.locator('.grid .flex span:first-child');
    await expect(labels.filter({ hasText: '產品編號' }).first()).toBeVisible();
    await expect(page.locator('text=BNDAI-2026-001').first()).toBeVisible();
  });

  test('info fields appear in correct order: 類別 → 廠商 → 代理商 → 產品編號', async ({ page }) => {
    const labels = await page.locator('.grid .flex span:first-child').allTextContents();
    const infoLabels = labels.filter(l => ['類別', '廠商', '代理商', '產品編號'].includes(l.trim()));
    expect(infoLabels.map(l => l.trim())).toEqual(['類別', '廠商', '代理商', '產品編號']);
  });

  test('does NOT show deprecated fields (上市時間, 稀有度)', async ({ page }) => {
    // 確認舊欄位不在商品資訊 grid 的 label 清單中
    const labels = await page.locator('.grid .flex span:first-child').allTextContents();
    const labelTexts = labels.map(l => l.trim());
    expect(labelTexts).not.toContain('上市時間');
    expect(labelTexts).not.toContain('稀有度');
    expect(labelTexts).not.toContain('店家');
  });
});
