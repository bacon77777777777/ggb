/**
 * BANDAI 轉蛋官方站（gashapon.jp）
 *
 * 目前唯一「用條碼直接查得到官方資料」的來源：
 *   https://gashapon.jp/products/detail.php?jan_code=<13 碼條碼>000
 *
 * 拿得到的東西比搜尋引擎準一個量級，而且是結構化的 HTML，不必讓 AI 去猜：
 *   <h1 class="pg-heading">          正式品名
 *   輪播圖每一張的 title             款式名
 *   輪播圖每一張的 src               「那一款」的原廠照片
 *   価格(税込) / 種類数 / 発売時期    定價、共幾款、發售時間
 *
 * 這解掉的是實測最嚴重的兩個問題：
 *   1. 款式圖原本是拿款式名去圖片搜尋，整排配到的都是外盒照。
 *      官方站直接給「那一款」的照片，一對一，不會錯。
 *   2. 款式數原本只能從內文猜。這裡有「全6種」，抓到 4 款就知道少了。
 *
 * 只收錄 BANDAI 的轉蛋。盒玩、一番賞、別家廠牌都查無，回 null 讓上層退回搜尋。
 * 查無時站方回的是 200 + 一頁沒有 h1 的版面，不是 404，所以要靠 h1 判斷。
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

export interface GashaponVariant {
  /** 官方寫的款式名（日文原文，翻譯是上層的事） */
  name: string
  /** 這一款的原廠照片 */
  image: string
}

export interface GashaponProduct {
  /** 官方正式品名（日文原文） */
  name: string
  description: string | null
  /** 稅入定價（日幣） */
  priceYen: number | null
  /** 例：2025年10月 第3週 */
  release: string | null
  /** 官方寫的「全N種」。抓到的款式少於這個數就是頁面只列了一部分 */
  variantCount: number | null
  /** 外盒／主視覺 */
  mainImage: string | null
  variants: GashaponVariant[]
  sourceUrl: string
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 用國際條碼查官方商品頁。
 *
 * 站方的 jan_code 參數是「13 碼條碼 + 000」，不是條碼本身 —— 少了那三個 0 查不到。
 */
export async function lookupGashaponByJan(barcode: string): Promise<GashaponProduct | null> {
  const jan = barcode.replace(/\D/g, '')
  if (jan.length !== 13) return null

  const sourceUrl = `https://gashapon.jp/products/detail.php?jan_code=${jan}000`

  let html: string
  try {
    const res = await fetch(sourceUrl, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    html = await res.text()
  } catch {
    return null
  }

  // 查無商品時站方一樣回 200，只是版面裡沒有這顆 h1
  const name = decode(html.match(/<h1 class="pg-heading">\s*([\s\S]*?)\s*<\/h1>/)?.[1] ?? '')
  if (!name) return null

  /*
   * 款式只取主輪播（data-swiper="main"）裡的圖。
   * 頁面下半部還有「おすすめガシャポン」等別的商品，一起抓會混進別檔商品的圖。
   */
  const carousel = html.match(/data-swiper="main"[\s\S]*?<\/ul>/)?.[0] ?? ''
  const slides = [...carousel.matchAll(/<img[^>]*src="([^"]+)"[^>]*title="([^"]*)"/g)].map(m => ({
    image: m[1],
    title: decode(m[2]),
  }))

  // 第一張是外盒／主視覺，官方不給它 title；有 title 的才是款式
  const mainImage = slides[0]?.image ?? null
  const variants = slides.filter(s => s.title).map(s => ({ name: s.title, image: s.image }))

  const priceYen = Number(html.match(/価格\(税込\)[\s\S]{0,160}?>([\d,]+)円/)?.[1]?.replace(/,/g, '')) || null
  const variantCount = Number(html.match(/種類数[\s\S]{0,160}?>全(\d+)種/)?.[1]) || null

  return {
    name,
    description: decode(html.match(/pg-detail__description">([^<]*)/)?.[1] ?? '') || null,
    priceYen,
    release: decode(html.match(/--releaseDate">\s*([^<]+)/)?.[1] ?? '') || null,
    variantCount,
    mainImage,
    variants,
    sourceUrl,
  }
}
