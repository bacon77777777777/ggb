import { test, expect } from '@playwright/test';

test.describe('Exchange page - offers render with mocked Supabase', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/*supabase.co/**', async (route) => {
      const url = route.request().url();

      if (url.includes('/rest/v1/exchange_offers')) {
        const now = new Date().toISOString();
        const body = JSON.stringify([
          {
            id: '00000000-0000-0000-0000-000000000001',
            owner_id: '00000000-0000-0000-0000-000000000010',
            status: 'active',
            created_at: now,
            cards: [
              { side: 'want', external_id: 'c1', name: '想要卡A', series: 'JP', image_url: '/images/item.png', value: 100, position: 1 },
              { side: 'give', external_id: 'c2', name: '拿出卡B', series: 'JP', image_url: '/images/item.png', value: 120, position: 1 },
            ],
          },
        ]);
        await route.fulfill({ status: 200, contentType: 'application/json', body });
        return;
      }

      if (url.includes('/rest/v1/rpc/get_user_displays')) {
        const body = JSON.stringify([
          { id: '00000000-0000-0000-0000-000000000010', name: 'alice', avatar_url: '/images/avatar.png' },
        ]);
        await route.fulfill({ status: 200, contentType: 'application/json', body });
        return;
      }

      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });
  });

  test('renders mocked exchange offer', async ({ page }) => {
    await page.goto('/exchange');
    await expect(page.getByText('@alice').first()).toBeVisible();
    await expect(page.getByText('我想要').first()).toBeVisible();
    await expect(page.getByText('我拿出').first()).toBeVisible();
  });
});
