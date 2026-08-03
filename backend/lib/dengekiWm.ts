/**
 * Dengeki 浮水印角落偵測（免費本地版）：
 * 以浮水印「電ホビ」標誌模板做邊緣 NCC 比對，找相似度最高的角落；
 * 分數低於門檻時預設右上（Dengeki 標準版位）。
 */
import sharp from 'sharp'

export type WmCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

// 74×20 灰階 PNG（自 Dengeki og:image 樣本裁出）
const WM_TEMPLATE_B64 = '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'

let _tpl: { data: Buffer; w: number; h: number } | null = null
async function getTemplate() {
  if (_tpl) return _tpl
  const raw = await sharp(Buffer.from(WM_TEMPLATE_B64, 'base64')).greyscale().raw().toBuffer({ resolveWithObject: true })
  _tpl = { data: raw.data, w: raw.info.width, h: raw.info.height }
  return _tpl
}

// 邊緣圖：e[i] = |dx| + |dy|
function edgeMap(data: Buffer | Uint8Array, W: number, H: number): Float32Array {
  const e = new Float32Array(W * H)
  for (let y = 0; y < H - 1; y++)
    for (let x = 0; x < W - 1; x++) {
      const i = y * W + x
      e[i] = Math.abs(data[i + 1] - data[i]) + Math.abs(data[i + W] - data[i])
    }
  return e
}

// 在區域內滑動模板求最大 NCC（step 2 粗掃）
function maxNcc(region: Float32Array, rw: number, rh: number, tpl: Float32Array, tw: number, th: number): number {
  let tSum = 0, tSq = 0
  for (let i = 0; i < tw * th; i++) { tSum += tpl[i]; tSq += tpl[i] * tpl[i] }
  const tMean = tSum / (tw * th)
  const tVar = Math.sqrt(Math.max(tSq - tSum * tMean, 1e-6))
  let best = 0
  for (let y0 = 0; y0 <= rh - th; y0 += 2)
    for (let x0 = 0; x0 <= rw - tw; x0 += 2) {
      let rSum = 0, rSq = 0, cross = 0
      for (let y = 0; y < th; y++)
        for (let x = 0; x < tw; x++) {
          const r = region[(y0 + y) * rw + (x0 + x)]
          const t = tpl[y * tw + x]
          rSum += r; rSq += r * r; cross += r * t
        }
      const n = tw * th
      const rMean = rSum / n
      const rVar = Math.sqrt(Math.max(rSq - rSum * rMean, 1e-6))
      const ncc = (cross - n * rMean * tMean) / (rVar * tVar)
      if (ncc > best) best = ncc
    }
  return best
}

// 門檻依實測分佈訂定：
//   帶浮水印 0.238~0.380（電ホビ 各式版面）
//   乾淨圖   0.179~0.232（NBA 球員照、玩具人圖）
// 取 0.26 落在兩群之間。仍有重疊風險，故已知帶浮水印的來源不靠門檻，
// 一律以分數最高的角落強制蓋（見 news-agent 的 forceBrand）。
const WM_THRESHOLD = 0.26

/**
 * @deprecated 請改用 detectWatermark()
 *
 * 這支在分數未達門檻時會回 'top-right' 當保底 —— 若呼叫端據此蓋 logo，
 * 遇到浮水印其實在左上的圖就會蓋錯角落，浮水印照樣露出來
 * （PROD 早期文章即因此蓋錯）。detectWatermark() 回傳的 corner 是
 * 分數最高的角落，不會退回固定值。
 */
export async function detectWatermarkCorner(buf: Buffer): Promise<WmCorner> {
  try {
    const tpl = await getTemplate()
    const { data, info } = await sharp(buf).resize(600, null, { withoutEnlargement: true }).greyscale().raw().toBuffer({ resolveWithObject: true })
    const W = info.width, H = info.height
    const regionW = Math.min(Math.round(W * 0.42), W), regionH = Math.min(Math.round(H * 0.2), H)
    if (regionW < tpl.w || regionH < tpl.h) return 'top-right'
    const tplEdge = edgeMap(tpl.data, tpl.w, tpl.h)

    const crop = (x0: number, y0: number): Float32Array => {
      const out = new Float32Array(regionW * regionH)
      for (let y = 0; y < regionH; y++)
        for (let x = 0; x < regionW; x++) out[y * regionW + x] = data[(y0 + y) * W + (x0 + x)]
      const e = edgeMap(out as unknown as Uint8Array, regionW, regionH)
      return e
    }

    const scores: [WmCorner, number][] = [
      ['top-left',     maxNcc(crop(0, 0), regionW, regionH, tplEdge, tpl.w, tpl.h)],
      ['top-right',    maxNcc(crop(W - regionW, 0), regionW, regionH, tplEdge, tpl.w, tpl.h)],
      ['bottom-left',  maxNcc(crop(0, H - regionH), regionW, regionH, tplEdge, tpl.w, tpl.h)],
      ['bottom-right', maxNcc(crop(W - regionW, H - regionH), regionW, regionH, tplEdge, tpl.w, tpl.h)],
    ]
    scores.sort((a, b) => b[1] - a[1])
    return scores[0][1] >= WM_THRESHOLD ? scores[0][0] : 'top-right'
  } catch { return 'top-right' }
}

/**
 * 同一套比對，但回傳是否真的偵測到浮水印（而非只回角落）
 *
 * detectWatermarkCorner() 找不到時會回 'top-right' 當保底，呼叫端無從得知
 * 到底有沒有浮水印。內文配圖需要「沒浮水印就別亂蓋 logo」，故另開此介面。
 *
 * 限制：模板是電ホビ的浮水印，只認得這一種；其他站的浮水印不會被偵測到。
 */
export async function detectWatermark(buf: Buffer): Promise<{ corner: WmCorner; score: number; found: boolean }> {
  try {
    const tpl = await getTemplate()
    const { data, info } = await sharp(buf).resize(600, null, { withoutEnlargement: true }).greyscale().raw().toBuffer({ resolveWithObject: true })
    const W = info.width, H = info.height
    const regionW = Math.min(Math.round(W * 0.42), W), regionH = Math.min(Math.round(H * 0.2), H)
    if (regionW < tpl.w || regionH < tpl.h) return { corner: 'top-right', score: 0, found: false }
    const tplEdge = edgeMap(tpl.data, tpl.w, tpl.h)
    const crop = (x0: number, y0: number): Float32Array => {
      const out = new Float32Array(regionW * regionH)
      for (let y = 0; y < regionH; y++)
        for (let x = 0; x < regionW; x++) out[y * regionW + x] = data[(y0 + y) * W + (x0 + x)]
      return edgeMap(out as unknown as Uint8Array, regionW, regionH)
    }
    const scores: [WmCorner, number][] = [
      ['top-left',     maxNcc(crop(0, 0), regionW, regionH, tplEdge, tpl.w, tpl.h)],
      ['top-right',    maxNcc(crop(W - regionW, 0), regionW, regionH, tplEdge, tpl.w, tpl.h)],
      ['bottom-left',  maxNcc(crop(0, H - regionH), regionW, regionH, tplEdge, tpl.w, tpl.h)],
      ['bottom-right', maxNcc(crop(W - regionW, H - regionH), regionW, regionH, tplEdge, tpl.w, tpl.h)],
    ]
    scores.sort((a, b) => b[1] - a[1])
    const [corner, score] = scores[0]
    return { corner, score, found: score >= WM_THRESHOLD }
  } catch {
    return { corner: 'top-right', score: 0, found: false }
  }
}
