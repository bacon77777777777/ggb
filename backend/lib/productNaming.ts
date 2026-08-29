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
 * 只換字、不換詞的簡繁轉換 —— 給**長文**用（情報文章）
 *
 * `s2twp` 的 `p` 是 phrase（詞語轉換），為「簡體商品名」設計。套在已經是繁體的
 * 長文上會做一堆不該做的替換，實測正式站的文章被改壞：
 *
 *   設計對象 → 設計物件   （「物件」是 object 的誤譯，這裡指的是設計的對象）
 *   風采     → 風採       （「風採」不是詞）
 *   高級質感 → 高階質感   （語意跑掉，高階是 advanced 不是 premium）
 *   宣布     → 宣佈       （教育部標準用「宣布」）
 *
 * 商品名那條路徑維持 `s2twp` 不動 —— 它處理的是短字串、而且來源常常真的是
 * 中國賣家的簡體，詞語轉換在那裡是有價值的。
 */
const s2t = OpenCC.Converter({ from: 'cn', to: 'tw' })
const t2s = OpenCC.Converter({ from: 'tw', to: 'cn' })

/**
 * 日文新字體 → 繁體（蔵→藏、竜→龍、桜→櫻、剣→劍、沢→澤…）。
 *
 * 只在字串「確定是日文」時才套用，判準是含假名。原因是這個轉換表會把
 * 台灣正字改成舊字形：真→眞、研→硏、郎→郞、即→卽、台→臺、瓶→甁。
 * 對純漢字字串無差別套用的話，正確的繁中商品名會被改壞，
 * 而純漢字本來就分不出中日 —— 分不出來就不該猜。
 *
 * 含假名的字串沒有這個風險：那必定是日文，轉換必定是對的。
 * 分不出來的（純漢字日文名）留給 AI 翻譯那層處理。
 */
const jp2t = OpenCC.Converter({ from: 'jp', to: 'tw' })

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

  // opencc 的台灣變體有兩處會轉成「教育部標準字」而不是實際寫法，改回來。
  // 放在 TW_TERMS 裡是因為它必須跑在 opencc 之後。
  //   臺：台北→臺北、一台→一臺，那是公文書寫法，商品名沒人這樣寫
  //   汙：標準字是汙，但台灣實際上寫「污」（污點、污漬）
  [/臺/g, '台'],
  [/汙/g, '污'],

  // 一般用字
  [/質量(?=好|佳|優|不錯)/g, '品質'],
  [/信息/g, '資訊'],
  [/視頻/g, '影片'],
  [/軟件/g, '軟體'],
  [/硬件/g, '硬體'],
  [/網絡/g, '網路'],
  [/激活/g, '啟用'],
]

/**
 * 只在**商品名**替換的詞
 *
 * `預售` 在台灣是正常用詞（預售屋、預售票），長文裡把它改成「預購」是多餘的修改 ——
 * 實測正式站一篇本來就正確的文章被這樣動到。但商品名的來源常是中國賣家的
 * 「預售」＝我們的「預購」，那個情境改是對的，所以留在商品名那條路徑。
 */
const TW_TERMS_NAME_ONLY: [RegExp, string][] = [
  [/預售/g, '預購'],
]

/** 有沒有日文假名。有的話 L1 處理不了，要走 AI 翻譯。 */
export function hasJapanese(s: string): boolean {
  // 平假名 / 片假名。漢字不算 —— 中日共用，光看漢字分不出來
  return /[぀-ゟ゠-ヿ]/.test(s)
}

/**
 * 有沒有簡體字（`s !== s2t(s)`）
 *
 * ⚠️ 這個判斷會**誤報**：`采`、`里`、`准`、`複` 這些字繁簡通用，
 * 純繁體字串照樣會不相等。要判斷「整段是不是簡體」請用 `looksSimplified()`。
 */
export function hasSimplified(s: string): boolean {
  return s !== s2t(s)
}

/**
 * 整段文字**是不是簡體**（文件層級，不是逐字）
 *
 * 逐字判斷做不到：`采`／`里`／`准`／`布` 這些字繁簡都在用，
 * 任何 S→T 對照表都會把正確的「風采」改成「風採」、「里長」改成「裡長」。
 * 實測正式站的繁體文章被這樣改壞過（設計對象→設計物件、高級質感→高階質感）。
 *
 * 改用兩個方向一起看：
 *   有簡體專用字（`s2t` 會動它） **而且** 沒有繁體專用字（`t2s` 不會動它）
 *
 * 繁體文章一定含繁體專用字（動、劇、質、學…），`t2s` 會動 → 判為繁體，不轉。
 * 簡體文章沒有繁體專用字 → 判為簡體，轉。
 * 實測五組（含「風采依舊，里長宣布准許」這種滿是通用字的）全部判對。
 */
export function looksSimplified(s: string): boolean {
  if (!s) return false
  return s2t(s) !== s && t2s(s) === s
}

/**
 * 長文的台灣化：**確定是簡體才換字**，領域用語一律套用
 *
 * 給情報文章用。跟 `normalizeToTaiwan()`（商品名用）的差別：
 *   - 換字前先過 `looksSimplified()` —— 不然會把正確的繁體改壞（見上）
 *   - 用 s2t 不用 s2twp（後者的詞語轉換會亂動長文）
 *   - 不做全形轉半形、括號空白收斂 —— 那是為了對齊廠商 Excel，長文不需要
 *
 * 領域詞典不設條件：「高達→鋼彈」「手辦→公仔」在繁體文章裡一樣該換，
 * 而且那些詞沒有歧義，不會誤傷。
 */
export function toTaiwanProse(raw: string): string {
  if (!raw) return raw
  let s = String(raw)
  if (looksSimplified(s)) s = s2t(s)
  for (const [re, to] of TW_TERMS) s = s.replace(re, to)
  return s
}

/**
 * L1 台灣化。純字串處理，零成本零風險，所以預設對每一筆都跑。
 */
export function normalizeToTaiwan(raw: string): string {
  if (!raw) return raw

  let s = String(raw)

  // 日文新字體只在確定是日文時轉，見 jp2t 的說明
  if (hasJapanese(s)) s = jp2t(s)

  s = s2twp(s)

  for (const [re, to] of TW_TERMS) s = s.replace(re, to)
  for (const [re, to] of TW_TERMS_NAME_ONLY) s = s.replace(re, to)

  s = s
    // 全形空白（U+3000）換半形。廠商從 Excel 貼過來常常整串都是全形。
    // 用逸出字元寫 —— 直接貼全形空白會被 ESLint 的 no-irregular-whitespace 擋下，
    // 那條規則已經害部署失敗過兩次
    .replace(/\u3000/g, ' ')
    // 全形英數轉半形（尺寸「約22cm」那種，全形看起來很怪）
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    // 連續空白收成一個
    .replace(/[ \t]{2,}/g, ' ')
    // 括號旁的多餘空白收成一個 —— 只收斂既有的，不無中生有。
    // 第一版寫成 /\s*([（(])\s*/ → ' $1'，等於每個左括號前都硬塞一個空格，
    // 實測 395 個本來就正確的名稱裡有 112 個被這樣「改」掉。
    // 名稱跟廠商給的不一致，對帳跟搜尋都會出問題。
    .replace(/[ \t]+([（(])/g, ' $1')
    .replace(/([）)])[ \t]+/g, '$1 ')
    .trim()

  return s
}

/** 一筆商品連同它的品項一起台灣化，回報改了幾處，好讓前端顯示「系統動過什麼」。 */
/**
 * 廠商進貨單的商品名雜訊。
 *
 * 真實檔案裡的商品名長這樣：
 *   BAN/polar bear bank夜燈公仔 @30x5 040
 *
 * 「BAN/」是廠牌代碼、「@30x5 040」是裝箱資訊（一箱 30 個 ×5）。
 * 這些對倉管有意義，對玩家沒有 —— 而且更糟的是，帶著它們去搜圖或查品項
 * 一定搜不到，因為沒有任何官網會用這種寫法。
 *
 * 順便把廠牌代碼換算成代理商，那是免費得來的資訊。
 */
const BRAND_CODES: Record<string, string> = {
  BAN: 'BANDAI', BANDAI: 'BANDAI',
  SEGA: 'SEGA', TAITO: 'TAITO', FUR: 'FuRyu', FURYU: 'FuRyu',
  KTN: 'KITAN CLUB', EPO: 'EPOCH', TAR: 'TARLIN', TARLIN: 'TARLIN',
  RE: 'Re-MeNT', REM: 'Re-MeNT', KEN: 'Ken Elephant', QUA: 'Qualia',
  TOMY: 'TAKARA TOMY', TT: 'TAKARA TOMY',
}

export function stripVendorNoise(raw: string): { name: string; distributor: string | null } {
  let s = String(raw ?? '').trim()
  let distributor: string | null = null

  // 開頭的廠牌代碼：BAN/xxx、SEGA/xxx
  const brand = s.match(/^([A-Za-z]{2,6})\s*[/／]\s*/)
  if (brand) {
    distributor = BRAND_CODES[brand[1].toUpperCase()] ?? null
    s = s.slice(brand[0].length)
  }

  // 裝箱資訊：@30x5 040、@ 40 x 5、＠30X5。一律砍到行尾 ——
  // 「@」之後在這種檔案裡從來不是商品名的一部分
  s = s.replace(/\s*[@＠]\s*\d+.*$/i, '')

  return { name: s.replace(/\s+/g, ' ').trim(), distributor }
}

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
