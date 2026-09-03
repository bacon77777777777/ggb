/**
 * 回填 R2 既有物件的 Cache-Control（老闆 2026-09-03：回首頁小卡一片白）。
 *
 * 規則同 lib/r2.ts 的 r2CacheControlFor：唯一檔名一年 immutable、slot/ 與 reels-proto/ 一天。
 * 做法：逐一 HEAD 取現值與 ContentType → 沒有或不同才 CopyObject 到自己
 * （MetadataDirective REPLACE；**一定要帶回 ContentType**，不帶會變 binary/octet-stream）。
 * 內容不動、網址不變，只改 metadata；重跑是冪等的。
 *
 *   npx tsx scripts/r2_set_cache_control.ts --dry [--limit 20] [--prefix products/]
 *   npx tsx scripts/r2_set_cache_control.ts --apply
 */
import { r2, R2_BUCKET, r2CacheControlFor } from '../lib/r2'
import { ListObjectsV2Command, HeadObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const limit = Number(args[args.indexOf('--limit') + 1]) || Infinity
const prefix = args.includes('--prefix') ? args[args.indexOf('--prefix') + 1] : undefined
const CONCURRENCY = 16

async function* listKeys() {
  let token: string | undefined
  do {
    const res = await r2.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix, ContinuationToken: token, MaxKeys: 1000 }))
    for (const o of res.Contents ?? []) if (o.Key) yield o.Key
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
}

async function main() {
  const keys: string[] = []
  for await (const k of listKeys()) { keys.push(k); if (keys.length >= limit) break }
  console.log(`${apply ? 'APPLY' : 'DRY'}: ${keys.length} 個物件${prefix ? `（prefix ${prefix}）` : ''}`)
  let done = 0, updated = 0, skipped = 0, failed = 0
  const worker = async () => {
    while (keys.length) {
      const key = keys.shift()!
      try {
        const head = await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }))
        const want = r2CacheControlFor(key)
        if (head.CacheControl === want) { skipped++ }
        else {
          if (apply) {
            await r2.send(new CopyObjectCommand({
              Bucket: R2_BUCKET, Key: key,
              CopySource: `${R2_BUCKET}/${encodeURIComponent(key).replace(/%2F/g, '/')}`,
              MetadataDirective: 'REPLACE',
              ContentType: head.ContentType,
              Metadata: head.Metadata,
              CacheControl: want,
            }))
          } else if (done < 20) {
            console.log(`  ${key}  ${head.ContentType}  ${head.CacheControl ?? '(none)'} → ${want}`)
          }
          updated++
        }
      } catch (e) { failed++; console.error(`  ✗ ${key}: ${(e as Error).message}`) }
      done++
      if (done % 500 === 0) console.log(`  …${done}`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry', done, updated, skipped, failed }))
}
main().catch(e => { console.error(e); process.exit(1) })
