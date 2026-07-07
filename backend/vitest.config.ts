import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    env: {
      ADMIN_SESSION_SECRET: 'test-session-secret-must-be-32chars!',
      ECPAY_MERCHANT_ID: '2000132',
      ECPAY_HASH_KEY: '5294y06JbISpM5x9',
      ECPAY_HASH_IV: 'v77hoKGq4kWxNNIS',
      ECPAY_API_URL: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5',
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      LINE_CHANNEL_SECRET: 'test-line-channel-secret-32chars!!',
      LINE_CHANNEL_ACCESS_TOKEN: 'test-line-access-token',
      NOTIFY_TARGET_ID: 'U0000000000000000000000000000001',
      NOTIFY_TARGET_TYPE: 'user',
      ADMIN_LINE_IDS: 'Uadmin000000000000000000000000001',
      CRON_SECRET: 'test-cron-secret',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['lib/**/*.ts', 'app/api/**/*.ts'],
      exclude: ['**/*.d.ts', 'lib/gbBro.ts', 'lib/csAgent.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
