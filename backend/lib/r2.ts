import { S3Client, PutObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'

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
