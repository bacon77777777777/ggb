import { NextRequest, NextResponse } from 'next/server';

/**
 * 同源圖片代理 —— 只為了讓 Canvas 畫得出品項圖（曬獎圖，老闆 2026-08-24）
 *
 * 為什麼需要：品項圖放在 R2 的公開 bucket（`pub-*.r2.dev`），而它**不回
 * `Access-Control-Allow-Origin`**。Canvas 要 `toBlob()` 就必須用
 * `crossOrigin='anonymous'` 載圖，沒有 CORS 標頭就載入失敗（圖畫不出來）；
 * 不帶 crossOrigin 雖然畫得出來，但 canvas 會被「污染」，`toBlob` 直接丟 SecurityError。
 * 走自己網域的代理就完全沒有跨域問題，也不必去改 Cloudflare 的 bucket 設定。
 *
 * ⚠️ **白名單是這支 route 的命門**：不限制來源就是一個開放代理，
 * 別人可以拿我們的伺服器去打內網或當流量跳板（SSRF）。只放行實際存放商品圖的主機，
 * 且只接受 https、只回圖片型別、限制大小。
 */
const ALLOWED_HOST_SUFFIXES = [
  '.r2.dev',              // Cloudflare R2 公開 bucket（商品／品項圖）
  '.supabase.co',         // Supabase Storage
];
const MAX_BYTES = 8 * 1024 * 1024;
/** 圖是 immutable 的（檔名帶時間戳），可以放心長快取 */
const CACHE = 'public, max-age=31536000, immutable';

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('url');
  if (!raw) return new NextResponse('missing url', { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new NextResponse('bad url', { status: 400 });
  }
  if (target.protocol !== 'https:') return new NextResponse('https only', { status: 400 });
  if (!ALLOWED_HOST_SUFFIXES.some(suffix => target.hostname.endsWith(suffix))) {
    return new NextResponse('host not allowed', { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      signal: AbortSignal.timeout(10000),
      headers: { Accept: 'image/*' },
      cache: 'force-cache',
    });
  } catch {
    return new NextResponse('upstream failed', { status: 502 });
  }
  if (!upstream.ok) return new NextResponse('upstream error', { status: 502 });

  const type = upstream.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) return new NextResponse('not an image', { status: 415 });
  const len = Number(upstream.headers.get('content-length') ?? 0);
  if (len && len > MAX_BYTES) return new NextResponse('too large', { status: 413 });

  const buf = await upstream.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return new NextResponse('too large', { status: 413 });

  return new NextResponse(buf, {
    headers: { 'Content-Type': type, 'Cache-Control': CACHE },
  });
}
