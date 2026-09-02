import { S3Client, PutObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

export const R2_BUCKET = process.env.R2_BUCKET ?? 'ggb'
export const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '')

export function r2PublicUrl(key: string) {
  return `${R2_PUBLIC_URL}/${key}`
}

export async function r2Upload(key: string, data: Buffer, contentType: string): Promise<string> {
  await r2.send(new PutObjectCommand({
    Bucket:      R2_BUCKET,
    Key:         key,
    Body:        data,
    ContentType: contentType,
  }))
  return r2PublicUrl(key)
}

/**
 * 產生一組「瀏覽器可以直接 PUT 上去」的簽名網址。
 *
 * **為什麼不走 /api/admin/upload**：那支是把檔案整包收進 serverless function
 * 再轉手上傳，而 Vercel 的 request body 上限是 4.5MB。站上現有的過場影片
 * 是 3.9～7MB（video1.mp4 4.1MB、blindbox_op.mp4 7MB），照那條路走一半會失敗。
 * 簽名直傳是瀏覽器 → R2，完全不經過我們的機器，沒有這個限制。
 *
 * 用完記得 bucket 要開 CORS（scripts/r2_set_cors.ts），不然瀏覽器會擋下 PUT。
 */
export async function r2PresignPut(key: string, contentType: string, expiresIn = 600) {
  const url = await getSignedUrl(r2, new PutObjectCommand({
    Bucket: R2_BUCKET, Key: key, ContentType: contentType,
  }), { expiresIn })
  return { uploadUrl: url, publicUrl: r2PublicUrl(key) }
}

export async function r2DeletePrefix(prefix: string): Promise<number> {
  let deleted = 0
  let continuationToken: string | undefined

  do {
    const list = await r2.send(new ListObjectsV2Command({
      Bucket:            R2_BUCKET,
      Prefix:            prefix,
      ContinuationToken: continuationToken,
      MaxKeys:           1000,
    }))

    const objects = list.Contents ?? []
    if (objects.length > 0) {
      await r2.send(new DeleteObjectsCommand({
        Bucket: R2_BUCKET,
        Delete: { Objects: objects.map(o => ({ Key: o.Key! })) },
      }))
      deleted += objects.length
    }

    continuationToken = list.NextContinuationToken
  } while (continuationToken)

  return deleted
}

/**
 * 列出某個前綴底下所有物件的檔名（不含路徑）。
 *
 * 用途是把廠商檔案裡的「圖片檔名」對回真正的網址：
 * 廠商 list 的圖片欄位常常只寫 `01KEVC....webp`，而 upload-images
 * 會把 zip 裡的圖存成 `products/<檔名>`，所以只要知道 bucket 裡有哪些檔名就對得回去。
 *
 * 一次列完存成 Set，比逐張圖打一次 HEAD 便宜得多（一批 100 個商品可能有上千張圖）。
 */
export async function r2ListFilenames(prefix: string): Promise<Set<string>> {
  const names = new Set<string>()
  let continuationToken: string | undefined

  do {
    const list = await r2.send(new ListObjectsV2Command({
      Bucket:            R2_BUCKET,
      Prefix:            prefix,
      ContinuationToken: continuationToken,
      MaxKeys:           1000,
    }))
    for (const o of list.Contents ?? []) {
      if (o.Key) names.add(o.Key.slice(prefix.length))
    }
    continuationToken = list.NextContinuationToken
  } while (continuationToken)

  return names
}
