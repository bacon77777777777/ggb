/**
 * 開 R2 bucket 的 CORS —— 讓後台的瀏覽器可以拿簽名網址直接 PUT 影片上去。
 *
 * 沒有這一步，`/api/admin/upload/presign` 發出來的網址在瀏覽器端會被
 * CORS 擋掉（預檢 OPTIONS 沒有回應），而且錯誤訊息只會說「Failed to fetch」。
 *
 * CORS 不是這裡的安全邊界 —— 真正的授權是簽名網址本身（10 分鐘到期、
 * 綁定 key 與 content-type）。這裡列白名單只是不想讓別的站台拿我們的
 * bucket 當測試對象。
 *
 * 用法：cd backend && export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/r2_set_cors.ts
 */
import { PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3'
import { r2, R2_BUCKET } from '../lib/r2'

const ORIGINS = [
  'https://admin.ggb.com.tw',
  'https://staging.admin.ggb.com.tw',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
]

async function main() {
  await r2.send(new PutBucketCorsCommand({
    Bucket: R2_BUCKET,
    CORSConfiguration: {
      CORSRules: [{
        AllowedOrigins: ORIGINS,
        AllowedMethods: ['PUT', 'GET', 'HEAD'],
        AllowedHeaders: ['content-type'],
        ExposeHeaders:  ['etag'],
        MaxAgeSeconds:  3600,
      }],
    },
  }))
  const now = await r2.send(new GetBucketCorsCommand({ Bucket: R2_BUCKET }))
  console.log(`✅ ${R2_BUCKET} 的 CORS 已設定：`)
  console.dir(now.CORSRules, { depth: null })
}

main().catch(e => { console.error(e); process.exit(1) })
