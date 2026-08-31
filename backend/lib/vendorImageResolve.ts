import { r2ListFilenames, r2PublicUrl } from '@/lib/r2'

/**
 * 把廠商檔案裡的「圖片檔名」對回真正的網址。
 *
 * ## 為什麼需要批次
 *
 * 廠商的 zip 裡就是 `1.jpg`、`main.jpg`、`A賞.jpg` —— 這是他們的習慣，不是他們的錯。
 * 未來十家廠商同時供貨，撞名是必然。
 *
 * 錯的是我們把「這一批交付內部的代號」直接當成全站永久 key：
 * 舊版 upload-images 一律存成 `products/<原檔名>`，所以
 *   ① A 廠商的 1.jpg 會被 B 廠商的 1.jpg 蓋掉（PutObject 同 key 就是覆蓋，無警告）
 *   ② 已經上架商品的 image_url 指著那個 key，圖片會在某天被別人的檔案默默換掉
 *   ③ zip 裡 `A/1.jpg` 與 `B/1.jpg` 被 basename 壓平成同一個
 * 實測：同 key 上傳兩次，第一張直接消失。
 *
 * 檔名只需要在「同一次交付」裡唯一，所以作用域縮回批次：
 *
 *   products/vendor/<廠商id>/<批次>/<zip 裡的相對路徑>
 *
 * 全站唯一的部分（廠商、批次）由我們產生，廠商只負責他那一批裡不重複。
 *
 * ## 查找順序
 *
 *   1. 這批       products/vendor/<sid>/<batch>/
 *   2. 這家以前   products/vendor/<sid>/
 *   3. 舊資料     products/            ← 現有 2,500+ 個檔靠這步接住，不用搬家
 *
 * 每一層先比對「完整相對路徑」，比不到才退回比對檔名；檔名在該層對到多筆
 * 就是真的分不出來，回錯誤要人把路徑寫清楚 —— 不要猜，猜錯是默默配錯圖，
 * 比破圖更難發現。
 */

export interface ImageResolver {
  /** 回 { url } 或 { error }。空值回 { url: null } */
  resolve(raw: string | null | undefined): { url: string | null; error?: string }
  /** 這次總共列了幾個物件，回報用 */
  stats: { batch: number; supplier: number; legacy: number }
}

/** 一層查找範圍：前綴 + 該前綴底下的相對路徑 */
interface Layer {
  prefix: string
  paths: Set<string>
  /** 檔名 → 相對路徑清單。同名多筆代表這一層分不出來 */
  byBasename: Map<string, string[]>
}

function toLayer(prefix: string, paths: Set<string>): Layer {
  const byBasename = new Map<string, string[]>()
  for (const p of paths) {
    const base = p.split('/').pop() ?? p
    byBasename.set(base, [...(byBasename.get(base) ?? []), p])
  }
  return { prefix, paths, byBasename }
}

export function vendorImagePrefix(supplierId: number, batch?: string | null) {
  return batch
    ? `products/vendor/${supplierId}/${batch}/`
    : `products/vendor/${supplierId}/`
}

export async function buildImageResolver(
  supplierId: number,
  batch?: string | null,
): Promise<ImageResolver> {
  /*
   * 一次列完做成 Set，不要逐張打 HEAD ——
   * 一批一百個商品可能有上千張圖，那是上千次 HTTP。
   */
  const [batchPaths, supplierPaths, legacyPaths] = await Promise.all([
    batch ? r2ListFilenames(vendorImagePrefix(supplierId, batch)) : Promise.resolve(new Set<string>()),
    r2ListFilenames(vendorImagePrefix(supplierId)),
    r2ListFilenames('products/'),
  ])

  const layers: Layer[] = [
    ...(batch ? [toLayer(vendorImagePrefix(supplierId, batch), batchPaths)] : []),
    toLayer(vendorImagePrefix(supplierId), supplierPaths),
    toLayer('products/', legacyPaths),
  ]

  return {
    stats: { batch: batchPaths.size, supplier: supplierPaths.size, legacy: legacyPaths.size },

    resolve(raw) {
      const v = String(raw ?? '').trim()
      if (!v) return { url: null }

      // 已經是網址或站內路徑：原樣採用，不去圖庫找
      if (/^https?:\/\//i.test(v) || v.startsWith('/')) return { url: v }

      // 廠商偶爾會寫成 ./images/1.jpg 或 \ 分隔
      const rel  = v.replace(/^\.?\//, '').replace(/\\/g, '/')
      const base = rel.split('/').pop() ?? rel

      for (const layer of layers) {
        if (layer.paths.has(rel)) return { url: r2PublicUrl(layer.prefix + rel) }

        const hits = layer.byBasename.get(base)
        if (!hits?.length) continue
        if (hits.length > 1) {
          return {
            url: null,
            error: `「${v}」在圖庫裡有 ${hits.length} 個同名檔（${hits.slice(0, 3).join('、')}…），請在檔名前補上資料夾`,
          }
        }
        return { url: r2PublicUrl(layer.prefix + hits[0]) }
      }

      return { url: null, error: `圖庫裡找不到「${v}」` }
    },
  }
}
