/**
 * 商品名稱與品項名稱的台灣化
 *
 * 廠商 list 的名稱來源很雜：日本官方原文、中國賣家的簡體、代理商的繁體。
 * 直接落地的話玩家會在站上看到「手办」「盲盒」「高达」這種一看就不是台灣的字眼。
 *
 * 分兩層，先免費後付費：
 *
 *   L1（免費，這支）：簡體轉繁體（opencc-js 的 s2twp）+ 領域用語替換 + 排版清理
 *   L2（要錢，走 import/translate）：整串日文商品名翻成台灣繁中，Claude Haiku
 *
 * opencc 只換字不換詞 ——「手办」它給「手辦」而不是「公仔」，「高达」給「高達」
 * 而不是「鋼彈」。所以領域詞典是必要的，不是多此一舉。
 *
 * 詞典刻意保守：只收「台灣講法唯一而且中國講法會讓玩家覺得怪」的詞。
 * 像「海賊王 / 航海王」兩種台灣都在用（東立官方是航海王，但玩家講海賊王更多），
 * 這種就不動 —— 硬改反而會讓廠商對不上自己的商品。
 */

import * as OpenCC from 'opencc-js'

const s2twp = OpenCC.Converter({ from: 'cn', to: 'twp' })

/**
 * 中國用語 → 台灣用語。
 * key 用轉繁之後的字形（因為這一步跑在 opencc 後面），簡體寫法一併收以防漏網。
 */
const TW_TERMS: [RegExp, string][] = [
  // 商品形態
  [/手辦|手办/g, '公仔'],
  [/盲盒/g, '盒玩'],
  [/扭蛋機/g, '轉蛋機'],
  [/掛件|挂件/g, '吊飾'],
  [/亞克力|亚克力/g, '壓克力'],
  [/立牌卡/g, '立牌'],
  [/鑰匙扣|钥匙扣/g, '鑰匙圈'],
  [/毛絨玩具|毛绒玩具/g, '絨毛玩偶'],
  [/擺件|摆件/g, '擺飾'],
  [/週邊|周边/g, '周邊'],
  [/景品/g, '景品'],

  // IP 譯名（只收台灣官方譯名與中國譯名差很多、不會誤傷的）
  [/高達/g, '鋼彈'],
  [/奧特曼|奥特曼/g, '超人力霸王'],
  [/精靈寶可夢/g, '寶可夢'],
  [/數碼寶貝/g, '數碼寶貝'],
  [/聖鬥士星矢/g, '聖鬥士星矢'],
  [/龍貓/g, '龍貓'],

  // 一般用字
  [/質量(?=好|佳|優|不錯)/g, '品質'],
  [/信息/g, '資訊'],
  [/視頻/g, '影片'],
  [/軟件/g, '軟體'],
  [/硬件/g, '硬體'],
  [/網絡/g, '網路'],
  [/激活/g, '啟用'],
  [/預售/g, '預購'],
]

/** 有沒有日文假名。有的話 L1 處理不了，要走 AI 翻譯。 */
export function hasJapanese(s: string): boolean {
  // 平假名 / 片假名。漢字不算 —— 中日共用，光看漢字分不出來
  return /[぀-ゟ゠-ヿ]/.test(s)
}

/** 有沒有簡體字。用幾個高頻簡體字當探針，比整串比對便宜。 */
export function hasSimplified(s: string): boolean {
  return s !== s2twp(s)
}

/**
 * L1 台灣化。純字串處理，零成本零風險，所以預設對每一筆都跑。
 */
export function normalizeToTaiwan(raw: string): string {
  if (!raw) return raw

  let s = s2twp(String(raw))

  for (const [re, to] of TW_TERMS) s = s.replace(re, to)

  s = s
    // 全形空白（U+3000）換半形。廠商從 Excel 貼過來常常整串都是全形。
    // 用逸出字元寫 —— 直接貼全形空白會被 ESLint 的 no-irregular-whitespace 擋下，
    // 那條規則已經害部署失敗過兩次
    .replace(/\u3000/g, ' ')
    // 全形英數轉半形（尺寸「約22cm」那種，全形看起來很怪）
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    // 連續空白收成一個
    .replace(/[ \t]{2,}/g, ' ')
    // 括號前後的多餘空白
    .replace(/\s*([（(])\s*/g, ' $1').replace(/\s*([）)])\s*/g, '$1 ')
    .trim()

  return s
}

/** 一筆商品連同它的品項一起台灣化，回報改了幾處，好讓前端顯示「系統動過什麼」。 */
export function normalizeProductNames(
  product: Record<string, unknown>,
  prizes: Record<string, unknown>[],
): { changed: number; needsTranslation: string[] } {
  let changed = 0
  const needsTranslation: string[] = []

  const apply = (obj: Record<string, unknown>, key: string) => {
    const v = obj[key]
    if (typeof v !== 'string' || !v.trim()) return
    const next = normalizeToTaiwan(v)
    if (next !== v) { obj[key] = next; changed++ }
    if (hasJapanese(next)) needsTranslation.push(next)
  }

  apply(product, 'name')
  apply(product, 'description')
  apply(product, 'series')
  for (const p of prizes) apply(p, 'name')

  return { changed, needsTranslation }
}
