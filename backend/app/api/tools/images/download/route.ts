import archiver from 'archiver'
import sharp from 'sharp'
import { PassThrough } from 'stream'

export const runtime = 'nodejs'

type InputFile = {
  url: string
  filename: string
  mode?: 'slimetoy' | 'clove' | 'auto'
}

const sanitizeZipName = (name: string) => {
  return String(name ?? '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\.\.[/\\]/g, '')
    .replace(/[^\w./-]+/g, '_')
    .slice(0, 200) || 'image.webp'
}

const processToWebp = async (buf: Buffer, mode: 'slimetoy' | 'clove') => {
  const base = sharp(buf, { failOn: 'none', limitInputPixels: 40_000_000 })

  if (mode !== 'slimetoy') {
    return await base.webp({ quality: 85 }).toBuffer()
  }

  const resizedBuf = await base.resize(500, 500, { fit: 'cover', position: 'centre' }).toBuffer()
  const img = sharp(resizedBuf, { failOn: 'none' })
  const logoW = 150
  const logoH = 90
  const patch = await img
    .clone()
    .extract({ left: 0, top: logoH, width: logoW, height: logoH })
    .blur(10)
    .toBuffer()

  const filledBuf = await img.composite([{ input: patch, left: 0, top: 0 }]).toBuffer()
  const filled = sharp(filledBuf, { failOn: 'none' })
  const softened = await filled
    .clone()
    .extract({ left: 0, top: 0, width: logoW, height: logoH })
    .blur(6)
    .toBuffer()

  return await filled
    .composite([{ input: softened, left: 0, top: 0 }])
    .webp({ quality: 85 })
    .toBuffer()
}

const inferMode = (url: string, declared?: InputFile['mode']): 'slimetoy' | 'clove' => {
  if (declared === 'slimetoy' || declared === 'clove') return declared
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host.endsWith('slimetoy.com.tw') || host === 'img.slimetoy.com.tw') return 'slimetoy'
  } catch {
    return 'clove'
  }
  return 'clove'
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const files = Array.isArray(body?.files) ? (body.files as InputFile[]) : []
    if (files.length === 0) {
      return new Response(JSON.stringify({ error: '缺少 files' }), { status: 400, headers: { 'content-type': 'application/json' } })
    }
    if (files.length > 8000) {
      return new Response(JSON.stringify({ error: 'files 過多' }), { status: 400, headers: { 'content-type': 'application/json' } })
    }

    const pass = new PassThrough()
    const archive = archiver('zip', { zlib: { level: 9 } })
    archive.on('error', err => {
      pass.destroy(err)
    })
    archive.pipe(pass)

    const failures: Array<{ url: string; filename: string; error: string }> = []
    const usedNames = new Set<string>()

    for (const f of files) {
      const url = String(f?.url ?? '').trim()
      const filenameRaw = String(f?.filename ?? '').trim()
      if (!url || !filenameRaw) continue
      const safeNameBase = sanitizeZipName(filenameRaw)
      const safeName = (() => {
        if (!usedNames.has(safeNameBase)) {
          usedNames.add(safeNameBase)
          return safeNameBase
        }
        const dot = safeNameBase.lastIndexOf('.')
        const stem = dot > 0 ? safeNameBase.slice(0, dot) : safeNameBase
        const ext = dot > 0 ? safeNameBase.slice(dot) : ''
        for (let i = 2; i < 10000; i++) {
          const cand = `${stem}_${i}${ext}`
          if (!usedNames.has(cand)) {
            usedNames.add(cand)
            return cand
          }
        }
        return safeNameBase
      })()

      try {
        const res = await fetch(url, {
          headers: {
            'user-agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const buf = Buffer.from(await res.arrayBuffer())
        const mode = inferMode(url, f.mode)
        const out = await processToWebp(buf, mode)
        archive.append(out, { name: safeName })
      } catch (e: any) {
        failures.push({ url, filename: safeName, error: String(e?.message || e) })
      }
    }

    if (failures.length > 0) {
      archive.append(JSON.stringify({ failures }, null, 2), { name: 'failed.json' })
    }

    void archive.finalize()

    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    return new Response(pass as any, {
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="images_${ts}.zip"`,
        'cache-control': 'no-store',
      },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || '下載失敗' }), { status: 500, headers: { 'content-type': 'application/json' } })
  }
}
