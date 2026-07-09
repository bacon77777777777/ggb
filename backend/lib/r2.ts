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
