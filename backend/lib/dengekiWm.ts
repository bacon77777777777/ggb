/**
 * Dengeki 浮水印角落偵測（免費本地版）：
 * 以浮水印「電ホビ」標誌模板做邊緣 NCC 比對，找相似度最高的角落；
 * 分數低於門檻時預設右上（Dengeki 標準版位）。
 */
import sharp from 'sharp'

export type WmCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

// 74×20 灰階 PNG（自 Dengeki og:image 樣本裁出）
const WM_TEMPLATE_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAEoAAAAUCAIAAAClNjyhAAAACXBIWXMAAAsTAAALEwEAmpwYAAAIxElEQVR4nIVY2XajSBb0l/dD2ZLYkx1tIDACZLGKRYAAgf1lfayYYtRdVTPx4AMiyZt3ixv4ZfUEmqY5jqMoShCEpmkcxzFNs+s613WHYYiiSFXVMAzrug7DME3T8/kchmEcx4SQIAhM03QcpyiKw+FACInjuCiKqqp0XX97e6uq6v39/a+//rJtu23bIAjKssTrSZIsl8sgCC6XSxiGSZLYth3HsWmaVVVZllVVlSiKOMZ+v6dperVanU6nruuaprndbpfLRdO06/Uax7GqqrZtJ0niOM4L/QSO4/DXcZymaU6nU5qmruv6vt91XRAEhmHUdb3b7SzLgqXT6ZRl2fv7e1EUlmV9fHwUReE4zna7LYrCMIyyLB3H2e/3XdcpisIwTBzHvu9LknS73Xa7XRRFWZa5rnu5XDabTZZlHx8fYRh6nocLmKBp+nQ6XS4XlmXf3t6Wy2UURUVRuK57u90URdlut23b+r6vKApiFATBC/MEmqZZlqUoSpIkRVF0XZdlGbeyLIuiyPO8qqrL5ZKmaUmSKIparVaSJK3Xa4Zh3t7eCCGSJImiSFGULMuLxYLjOFEUGYaRJGmxWDAMI4oi4kgIYVl2tVrJsrxer7GbpmmqqsqyjN9VVd1utzieqqqCILA/QQgRRZFlWUVRlsulIAiiKOq6jjWyLOu6/kI9AfZ0Xc+yDGWTpmnyQPwTYRhGURTH8cfHR/TAXKJYFkURbrESeL4GkiQ5n89YhhSFYZhl2WwljmPsDHNAmqZZlqUPxA+LOEAURTjPbPd0Op3P538UJ8/zgiDAhmmalmVtt9vdbrd/wvYXbDYbwzDWT9j+Aev12jCM7Xa73+93u938u2mahmGoqqrrOjaELZjePYBlpmnidj7VZrOxLGu322maZhiGruuapm02G03TLMt6mXPNcRzLspqmVVUlSRIqkOO45+plGOY52zRNUxS1WCxeX1+fKYr6HfAILbBYLJbL5bx+sViwLCuKoiRJHMe9vr5iZwQddlHPaJ/nlLAsu1wuOY6zLEtRFFEUbdterVY/fvz4do/7CZ7nKYo6Ho+XywXbbTabtm3LsszzvPiJy+WSZVme5yCrxWJBCEmSpK7r8ifwNM/z+ZeiKPI8r+vaNE2WZRmGmQMK+L7ftm3TNPv9nmEYtAl5QBAEQsj5fE7T9P39XRCE+czcYweapm3bHobBNM3r9ZrnOaZAWZYvwk/wPE/TNAgQfZ+m6TiOXdf1fd894fPzsyxLRVEQYFmWfd8/Ho/eA4fDIcuyrutut1sURcfjMQgC/4Hj8QhCCoIA/YNeQnTatr3dblmWXR5I0/R6vQZBQFHUfr+fpunr68t1XZZleZ6f3QNXVVUVRZFlWX3fG4bx+vqqaVrbtv9xD9EC74O1bNsex7Hv+9svOJ1OyADDMIqiIKXID05W13XTNMMwVFWVPZA/gFEhCELf98MwIHDDMNzv977v4d79fv98YJqmz89Px3EYhomi6Ha7tW2LiKCCgCRJiqJomgZ0qKoqJsfxeOy67h/uua5bFAXHcYSQuq77vq/rehzH2TFkLwiC0+kUx7EkSaZp3u/3rus8z7Ms63A4eJ7XNM39fo/j2HrgcDiUZTlNU9u2mDGgiv1+j6dpmg7D0LYtkg/mODygKAqCDut930/TND5hetw2TTOO4263+/HjB0ZRURR93/+3OAkheZ7btk1RVBiGn5+fbdvi6AgtootgI048z0dRhMhJkuT7flEUqDSIFdu2y7KEQEFcMFcJIbZtb7dbhDXP82ma8jzneV6WZcuyTNNUFIXneUKI67r3+30YhiAI9vu9bdsICgCNARadGcSyrNvt1jTNt3vo4M1mU9e1qqqKoqAlUCroIjg2jmOSJLvdDj1NCLEsKwxD13Udx/F937Ztx3Fwa9v28XhE17mua9s2WIFhmDRNv76+6roWBAGCZpqm0+lE07TrukiIZVlYn2XZOI51XRNCoBnp34F50JUgCNgfbfXtHma/7/tJklAUBXUiyzK86h8Yx7EoCtM0CSEYj4IgqKpaFMUwDKCEJEmyLAMPIY1hGBZFgfw7jgOW22636MzD4TBXyjAMUCfH4xEbbjYblmXX63XTNF3Xnc9nBJT/n2Ae4gbdcb1eXyBtBEEoyxK8JMsyz/Ow2vc9Euj7PqpREAT0D8/z2+0WQSqKwvd9z/OSJGnbFprb8zyUK3oY0kwUxSRJYHu2+/X1lec5cnU+n4dhqOvaMAyO4zzPAwk5jgM+5/4M4ZE63/eHB3zf/3aP53mMOEKIoiiCIBwOB3g1OyaKIp5KkoSISJKEGuu6Djo4jmPo97Zt4zgOggCMN45jFEWY1OiKrussy2JZ9nA4TNN0v989z0PgwjAchqEoCk3TCCFhGIJXkXxBEDDKZ8xDH6EnhFRVBaL61pxwD4MI2RcEoSiKcRzDMNR1HY6Jv0CSpDiOZ46GfsfR8zw/nU6e50E0ns/nzWbDMIwsy1VV3e/3KIrQvVmWIUDr9RrhA81kWQYJ4vs+FoDAZokL4DZNU9u24Sc6+X6/g+2+3RME4Xq9WpYFV13XLcsSbUYIwbfCb4EFs7aYI12WJQQxBG6aprvdjmXZKIr6vr9er4ZhMAxjGEbbtp+fn1mWoepQRH3fn89nVIphGOhnzMOvr69fB8M0TZZl4aMEJvq+d12X47gXtFDbtjiuLMu2bWuaJooivkfAPdL/A+KSpilG4vyV8PHxcT6f1+s1y7IQ34ZhoOs0TTsej7ZtbzYbbKKqKoaeruuEEFVVOY7D5+nhcJgF0PEJweMXURRpmtZ1va7raZput5umad/ucRyHTwmGYVC+UL2oY8g/SLZf8axX55b4l7DGBb70cL1cLimKgkTGmAIr/IsnwN4oKJyBpulnIb56AqaC67pd143jiH8gfBcnz/NlWUZRhHn1/v6Ov894jtaf8PyW+0/MT5+v55Xz67j2PO9fO0PKPu/261O8VVVV13XDMNi2zfO8JEl/A69D0Z0jh303AAAAAElFTkSuQmCC'

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

/*
 * 模板是 74×20，但實際的浮水印換算到「縮成 600 寬」的圖上大約 100×35 ——
 * 差了 1.4~1.75 倍，單一尺度比對根本對不上（實測 dengeki 的圖，
 * 浮水印在右下卻被雜訊最高的右上贏走）。所以每個角落都用多個尺度各比一次。
 */
const TPL_SCALES = [0.7, 0.85, 1.0, 1.25, 1.55, 1.9]

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

/*
 * 門檻只是參考，**不能拿來判斷「這張圖有沒有浮水印」**。
 *
 * 2026-08-07 用當時電ホビ RSS 最新四篇的實圖重測，浮水印位置分別是
 * BR / TR / TL / TR（位置隨圖而變，不是固定角）：
 *
 *   帶浮水印的四張   最高分 0.183 ~ 0.248
 *   乾淨圖（BANDAI 商品照、站上預設圖）  最高分 0.145 ~ 0.253
 *
 * 兩群完全重疊 —— 乾淨的商品照可以比真的浮水印還高分。試過單尺度、
 * 多尺度、顏色特徵、換成真浮水印當模板、把搜尋範圍縮到貼齊邊角，
 * 五種都分不開。原因是這個浮水印**半透明**，會吃底圖顏色，
 * 剩下的訊號只有筆畫邊緣，而那在任何有細節的商品照上都找得到相似度。
 *
 * 所以「要不要蓋」改由**圖片來源的網域**決定（100% 準確），
 * 這裡的比對只負責回答「蓋在哪一角」——那個實測 3/4 正確，
 * 遠好過原本寫死的固定角（實測 1/4 正確）。
 */
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
export async function detectWatermark(buf: Buffer): Promise<{ corner: WmCorner; score: number; found: boolean; ranked: [WmCorner, number][] }> {
  try {
    const tpl = await getTemplate()
    const { data, info } = await sharp(buf).resize(600, null, { withoutEnlargement: true }).greyscale().raw().toBuffer({ resolveWithObject: true })
    const W = info.width, H = info.height
    /*
     * 比對區域從 0.42×0.20 放寬到 0.45×0.25。
     * 浮水印在角落但不一定完全貼齊，原本的高度只有 20% ——
     * 實測有一張浮水印在右下、卻因為超出比對範圍而被左下的雜訊贏走。
     */
    const regionW = Math.min(Math.round(W * 0.45), W), regionH = Math.min(Math.round(H * 0.25), H)
    if (regionW < tpl.w || regionH < tpl.h) return { corner: 'top-right', score: 0, found: false, ranked: [] }
    const crop = (x0: number, y0: number): Float32Array => {
      const out = new Float32Array(regionW * regionH)
      for (let y = 0; y < regionH; y++)
        for (let x = 0; x < regionW; x++) out[y * regionW + x] = data[(y0 + y) * W + (x0 + x)]
      return edgeMap(out as unknown as Uint8Array, regionW, regionH)
    }

    // 每個角落取「各尺度中的最高分」
    const tplAtScale = await Promise.all(TPL_SCALES.map(async sc => {
      const tw = Math.round(tpl.w * sc), th = Math.round(tpl.h * sc)
      if (tw < 12 || th < 6 || tw > regionW || th > regionH) return null
      const raw = await sharp(Buffer.from(WM_TEMPLATE_B64, 'base64'))
        .greyscale().resize(tw, th).raw().toBuffer()
      return { edge: edgeMap(raw, tw, th), w: tw, h: th }
    }))
    const best = (region: Float32Array) => tplAtScale.reduce(
      (acc, t) => t ? Math.max(acc, maxNcc(region, regionW, regionH, t.edge, t.w, t.h)) : acc, 0)

    const scores: [WmCorner, number][] = [
      ['top-left',     best(crop(0, 0))],
      ['top-right',    best(crop(W - regionW, 0))],
      ['bottom-left',  best(crop(0, H - regionH))],
      ['bottom-right', best(crop(W - regionW, H - regionH))],
    ]
    scores.sort((a, b) => b[1] - a[1])
    const [corner, score] = scores[0]

    // found 只代表「分數過門檻」，**不代表這張圖真的有浮水印** ——
    // 見上面的實測，乾淨圖也會過。呼叫端必須自己用來源網域把關
    return { corner, score, found: score >= WM_THRESHOLD, ranked: scores }
  } catch {
    return { corner: 'top-right', score: 0, found: false, ranked: [] }
  }
}
