/**
 * 回填 products/ 既有圖的 400px 縮圖（老闆 2026-09-03，見 lib/r2.ts 的說明）。
 * 逐一 HEAD 縮圖鍵：已存在就跳過；沒有就抓原圖 → sharp 縮 → 上傳 `<key>-thumb.webp`。冪等。
 *
 *   npx tsx scripts/r2_make_thumbs.ts --dry [--limit 20]
 *   npx tsx scripts/r2_make_thumbs.ts --apply
 */
import { r2, R2_BUCKET, r2CacheControlFor, thumbKeyFor, makeThumb } from '../lib/r2'
import { ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const limit = Number(args[args.indexOf('--limit') + 1]) || Infinity
const CONCURRENCY = 8

async function* listKeys() {
  let token: string | undefined
  do {
    const res = await r2.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: 'products/', ContinuationToken: token, MaxKeys: 1000 }))
    for (const o of res.Contents ?? []) if (o.Key) yield o.Key
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)
}

async function main() {
  const existing = new Set<string>()
  const keys: string[] = []
  for await (const k of listKeys()) { if (/-thumb\.webp$/.test(k)) existing.add(k); else if (/\.(webp|png|jpe?g|gif)$/i.test(k)) keys.push(k) }
  const todo = keys.filter(k => !existing.has(thumbKeyFor(k)!)).slice(0, limit)
  console.log(`${apply ? 'APPLY' : 'DRY'}: 原圖 ${keys.length}、已有縮圖 ${existing.size}、要做 ${todo.length}`)
  let done = 0, made = 0, failed = 0, bytesIn = 0, bytesOut = 0
  const worker = async () => {
    while (todo.length) {
      const key = todo.shift()!
      const thumbKey = thumbKeyFor(key)!
      try {
        if (apply) {
          const obj = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }))
          const buf = Buffer.from(await obj.Body!.transformToByteArray())
          const thumb = await makeThumb(buf)
          await r2.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: thumbKey, Body: thumb, ContentType: 'image/webp', CacheControl: r2CacheControlFor(thumbKey) }))
          bytesIn += buf.length; bytesOut += thumb.length
        } else if (done < 10) console.log(`  ${key} → ${thumbKey}`)
        made++
      } catch (e) { failed++; console.error(`  ✗ ${key}: ${(e as Error).message}`) }
      done++
      if (done % 250 === 0) console.log(`  …${done}`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry', done, made, failed, mbIn: +(bytesIn / 1048576).toFixed(1), mbOut: +(bytesOut / 1048576).toFixed(1) }))
}
main().catch(e => { console.error(e); process.exit(1) })
