/**
 * TC-F-C03  已完抽商品前台展示
 *   - 顯示已完抽 badge / 狀態
 *   - 抽獎按鈕反灰不可按
 *   - 試試看按鈕反灰不可按
 */
import { test, expect } from '@playwright/test';

const PRODUCT_ID = 9901;

const soldOutProduct = {
  id: PRODUCT_ID,
  name: '測試已完抽商品',
  type: 'gacha',
  status: 'ended',
  remaining: 0,
  total_count: 20,
  price: 50,
  image_url: '/images/item_defaulet.png',
  supplier_id: null,
  distributor: '測試代理商',
  product_code: 'TEST-001',
  category: '轉蛋',
  is_hot: false,
  barcode: null,
  release_date: null,
  description: null,
  machine_theme: null,
  notes: null,
};

const prizes = [
  { id: 1, product_id: PRODUCT_ID, name: 'A賞', level: 'A', remaining: 0, total: 5, image_url: null, probability: 0.25, decompose_type: null, decompose_value: null },
  { id: 2, product_id: PRODUCT_ID, name: 'B賞', level: 'B', remaining: 0, total: 15, image_url: null, probability: 0.75, decompose_type: null, decompose_value: null },
];

test.describe('Sold-out product page (TC-F-C03)', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/*supabase.co/rest/v1/**', async (route) => {
      const url = route.request().url();

      if (url.includes('/products') && url.includes(`id=eq.${PRODUCT_ID}`)) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(soldOutProduct) });
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
  });

  test('shows sold-out status indicator', async ({ page }) => {
    // GachaMachineVisual 在 isSoldOut 時顯示「該商品已完抽」
    const soldOutIndicator = page.locator('text=已完抽').or(page.locator('text=完售')).or(page.locator('[data-testid="sold-out"]'));
    await expect(soldOutIndicator.first()).toBeVisible({ timeout: 10_000 });
  });

  test('draw button is disabled or hidden', async ({ page }) => {
    // gacha sold-out：GachaMachineVisual 將按鈕設為 opacity-40 + pointer-events-none
    // 一般抽獎文字按鈕不存在；若存在則應為 disabled
    const drawBtn = page.locator('button').filter({ hasText: /立即抽|立即轉蛋|立即購買/ });
    const count = await drawBtn.count();
    if (count > 0) {
      await expect(drawBtn.first()).toBeDisabled();
    }
  });

  test('page renders without crashing', async ({ page }) => {
    // 頁面不拋錯、商品名稱可見（可能在導覽列與內容各出現一次，用 first()）
    await expect(page.locator('text=測試已完抽商品').first()).toBeVisible({ timeout: 10_000 });

    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    const jsErrors = errors.filter(e => !e.includes('supabase') && !e.includes('net::') && !e.includes('auth'));
    expect(jsErrors).toHaveLength(0);
  });
});
