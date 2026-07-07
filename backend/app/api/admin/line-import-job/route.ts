import { NextResponse } from 'next/server'
import { processLineXlsxImport, downloadLineMessageContent, pushLineMessage } from '@/lib/lineXlsxImport'

export const runtime = 'nodejs'
export const maxDuration = 300  // 5 min — requires Vercel Pro; Hobby hard-caps at 10s

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { fileMessageId, targetId, supplierId } = await req.json()
  if (!fileMessageId || !targetId) {
    return NextResponse.json({ error: 'Missing fileMessageId or targetId' }, { status: 400 })
  }

  // Small delay so LINE doesn't rate-limit the re-download from the same messageId
  await new Promise(r => setTimeout(r, 2000))

  const buffer = await downloadLineMessageContent(fileMessageId)
  if (!buffer) {
    await pushLineMessage(targetId, '⚠️ 無法下載檔案，請重試一次。')
    return NextResponse.json({ ok: false })
  }

  try {
    await processLineXlsxImport({ buffer, targetId, supplierId: supplierId ?? null })
  } catch (err) {
    console.error('[line-import-job]', err)
    await pushLineMessage(targetId, '😵 智能上架發生錯誤，請稍後再試。').catch(() => {})
  }

  return NextResponse.json({ ok: true })
}
