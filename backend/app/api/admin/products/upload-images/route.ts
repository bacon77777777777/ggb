import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/requireAdmin'
import { r2Upload } from '@/lib/r2'
import AdmZip from 'adm-zip'
import path from 'path'

export const runtime = 'nodejs'
export const maxDuration = 60

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])

const contentTypeMap: Record<string, string> = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
}

export async function POST(req: Request) {
  const session = await requireAdminSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('zip') as File | null
  if (!file) return NextResponse.json({ error: 'No zip file' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())

  let zip: AdmZip
  try {
    zip = new AdmZip(buffer)
  } catch {
    return NextResponse.json({ error: '無法讀取壓縮檔，請確認是 .zip 格式' }, { status: 400 })
  }

  const entries = zip.getEntries()
  const results: { name: string; url: string }[] = []
  const errors:  { name: string; error: string }[] = []

  for (const entry of entries) {
    if (entry.isDirectory) continue
    const ext = path.extname(entry.name).toLowerCase()
    if (!IMAGE_EXTS.has(ext)) continue

    const filename = path.basename(entry.entryName)
    const key = `products/${filename}`

    try {
      const data = entry.getData()
      const url = await r2Upload(key, data, contentTypeMap[ext] ?? 'image/jpeg')
      results.push({ name: filename, url })
    } catch (e: any) {
      errors.push({ name: filename, error: String(e?.message || e) })
    }
  }

  return NextResponse.json({
    ok: true,
    uploaded: results.length,
    failed:   errors.length,
    files:    results,
    errors:   errors.slice(0, 5),
  })
}
