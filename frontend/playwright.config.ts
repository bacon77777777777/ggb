import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  /*
   * CI 跑 production build，不要跑 dev server。
   *
   * dev 模式是「請求進來才即時編譯」，12 支測試散落在 6 個頁面，等於要在測試
   * 過程中現編 6 次；平行執行時同時開編更慘 —— 實測 dev server 會在跑完第一支
   * 測試後直接死掉（後續全部 net::ERR_EMPTY_RESPONSE），CI 因此長期紅燈。
   *
   * 換成 build + start 之後：12 passed / 9.3 秒（dev 模式是 56 秒還一堆掛掉）。
   * 而且測到的是真正會上線的產物，不是 dev 專用的那份。
   *
   * 本機保持 dev，改一行就能重跑，不必等 build。
   */
  webServer: {
    command: process.env.CI ? 'npm run build && npm run start' : 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    // CI 要先 build，給足時間
    timeout: 600_000,
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 5'] },
    },
  ],
});
