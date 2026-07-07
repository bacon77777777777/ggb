import { NextResponse } from 'next/server'
import { processLineXlsxImport, pushLineMessage } from '@/lib/lineXlsxImport'

export const runtime = 'nodejs'
export const maxDuration = 300  // 5 min — requires Vercel Pro; Hobby caps at 10s

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { bufferBase64, targetId, supplierId } = await req.json()
  if (!bufferBase64 || !targetId) {
    return NextResponse.json({ error: 'Missing bufferBase64 or targetId' }, { status: 400 })
  }

  const buffer = Buffer.from(bufferBase64, 'base64')

  // Await — this invocation has its own maxDuration, independent of the webhook
  try {
    await processLineXlsxImport({ buffer, targetId, supplierId: supplierId ?? null })
  } catch (err) {
    console.error('[line-import-job]', err)
    await pushLineMessage(targetId, '😵 智能上架發生錯誤，請稍後再試。').catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
