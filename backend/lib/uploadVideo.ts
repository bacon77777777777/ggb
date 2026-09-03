/**
 * 後台上傳影片（自製過場影片用）。
 *
 * 圖片走 `/api/admin/upload`：檔案送進 serverless function、壓成 WebP、再上傳。
 * 影片不能照做 —— **Vercel 的 request body 上限是 4.5MB**，而站上現有的過場影片
 * 是 3.9～7MB。所以主要路徑是「跟後端要一張簽名、瀏覽器直接 PUT 到 R2」，
 * 檔案完全不經過我們的機器。
 *
 * ⚠️ 直傳需要 R2 bucket 開 CORS，而我們的 API token 沒有改 bucket 設定的權限
 *（實測 PutBucketCors 回 AccessDenied），要在 Cloudflare 後台設一次。
 * 還沒設之前預檢會 403、瀏覽器只會丟一句 "Failed to fetch"，什麼都看不出來 ——
 * 所以這裡對 4MB 以內的檔案自動退回伺服器代傳，讓小影片現在就能用；
 * 超過 4MB 的則明確告訴使用者要去開 CORS，而不是丟一句網路錯誤。
 */
const PROXY_LIMIT = 4 * 1024 * 1024
/*
 * 錯誤訊息寫給「看到它的人」，不是寫給工程師。
 * 第一版寫的是「影片直傳被瀏覽器擋下（R2 尚未開放 CORS）…設定內容見
 * backend/scripts/r2_set_cors.ts」—— 老闆看到只回了「啥意思」。
 * CORS、R2、檔案路徑對他都不是資訊，他要知道的只有三件事：
 * 哪裡卡住、現在能怎麼辦、要根治該找誰做什麼。
 */
const sizeMB = (bytes: number) => (bytes / 1024 / 1024).toFixed(1)
const tooBigMessage = (bytes: number) =>
  `這支影片 ${sizeMB(bytes)}MB，超過目前一次能上傳的 4MB。\n`
  + '換一支 4MB 以內的影片就能直接上傳。\n'
  + '想解除這個限制的話，要在雲端儲存（Cloudflare R2）開一次上傳權限，開完就沒有大小限制。'

/** 伺服器代傳：只給小檔用（raw=1 原檔直傳，不會被當成圖片壓成 WebP） */
async function viaServer(file: File, ext: string): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  form.append('bucket', 'products')
  form.append('path', `video-${Date.now()}.${ext}`)
  form.append('raw', '1')
  const res = await fetch('/api/admin/upload', { method: 'POST', body: form })
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || '影片上傳失敗')
  return ((await res.json()) as { publicUrl: string }).publicUrl
}

export async function uploadVideo(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const ext = (file.name.split('.').pop() || 'mp4').toLowerCase()
  const contentType = file.type || 'video/mp4'

  const signRes = await fetch('/api/admin/upload/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType, size: file.size, ext }),
  })
  if (!signRes.ok) throw new Error((await signRes.json().catch(() => null))?.error || '取得上傳網址失敗')
  const { uploadUrl, publicUrl, cacheControl } = await signRes.json() as { uploadUrl: string; publicUrl: string; cacheControl?: string }

  try {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', uploadUrl)
      xhr.setRequestHeader('Content-Type', contentType)
      // 簽章裡有 Cache-Control，這裡要帶一模一樣的值（見 lib/r2.ts r2PresignPut）
      if (cacheControl) xhr.setRequestHeader('Cache-Control', cacheControl)
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) onProgress?.(Math.round(e.loaded / e.total * 100))
      }
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300)
        ? resolve()
        : reject(new Error(`R2 回應 ${xhr.status}`))
      // CORS 被擋下時 xhr 走的是 onerror，而且拿不到任何細節
      xhr.onerror = () => reject(new Error('CORS'))
      xhr.send(file)
    })
    return publicUrl
  } catch (e) {
    const blocked = e instanceof Error && e.message === 'CORS'
    if (blocked && file.size <= PROXY_LIMIT) {
      onProgress?.(0)
      return await viaServer(file, ext)
    }
    throw new Error(blocked ? tooBigMessage(file.size) : (e instanceof Error ? e.message : '影片上傳失敗'))
  }
}
