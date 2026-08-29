/**
 * news-agent — 每小時從 Google News RSS 抓取最新
 * 一番賞/盒玩/盲盒/轉蛋/卡牌資訊，用 Claude 改寫成繁中，寫入 news 表（預設下架）。
 * 排程：每小時整點（UTC 0 * * * *）
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import Anthropic from '@anthropic-ai/sdk'
import { r2Upload } from '@/lib/r2'
import sharp from 'sharp'
import { brandCoverImage, contentBox, stampUrlWatermark } from '@/lib/newsBranding'
import type { WmCorner } from '@/lib/dengekiWm'
import { createClaude } from '@/lib/aiUsage'
import { toTaiwanProse } from '@/lib/productNaming'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0 Safari/537.36'
const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
const UA_BOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

/*
 * Google News 已移除（老闆 2026-08-29 指定）
 *
 * 兩個理由：
 *   1. **它抓到的是各家媒體的轉載**，站標風險完全不可控 —— 我們才剛把唯一
 *      會壓站標的電撃ホビー拿掉，從 Google News 進來的稿等於把它換個門走回來。
 *   2. **它從來沒真正運作過。** `resolveGoogleLink` 靠 HTTP 轉址，但 Google
 *      現在是 JS 轉址，網址原封不動 —— 整條流程都在抓 Google 自己那頁中繼頁面：
 *      內文圖 0 張（全是 googleusercontent，被 BLOCKED_IMG_DOMAINS 擋掉）、
 *      正文 0 字，Claude 只能靠 RSS 標題硬寫。實測產出的文章只有 420 字，
 *      其他來源都是 1000～2000 字。
 *
 * 解得開（用文章頁的 data-n-a-id/-sg/-ts 打 Google News 自己的 batchexecute，
 * 實測可還原成 inside-games.jp 的真實網址、5 張內文圖、3523 字正文），
 * 但那是 Google 的內部 RPC，會壞的相依，而且解決不了第 1 點。
 *
 * `tcg` 分類原本主要靠這組查詢供稿，移除後只能靠 ホビーウォッチ／PRTimes
 * 偶爾出現的トレカ新聞 —— 要補齊得另外找卡牌專門的來源。
 */

// ── 直接 RSS 來源（非 Google News）──────────────────────────────────────────
/**
 * HTML 來源（無可用 RSS，需解析列表頁）
 *
 * 玩具人 toy-people.com：頁面 <head> 有宣告 rss.php 等三支 feed，但實際皆 404，
 * 故改抓列表頁的文章連結。繁中原生、內文長、圖多且無浮水印，
 * 是目前最適合的來源之一。
 */
interface HtmlSource {
  url: string
  category: string
  label: string
  /** 列表頁 → 文章網址（絕對或站內相對皆可） */
  extract: (html: string) => string[]
  /**
   * 文章頁 → 封面圖網址。不給就走預設（og:image → 掃 <img>）。
   * Union Arena 一定要給：它每篇的 og:image 都是站台通用橫幅（見下方說明）。
   */
  pickCover?: (html: string) => string
}

/** 從玩具人列表頁取出文章連結（?p=數字） */
function extractToyPeopleLinks(html: string): string[] {
  const links = [...html.matchAll(/href="(https:\/\/www\.toy-people\.com\/\?p=\d+)"/g)].map(m => m[1])
  return [...new Set(links)]
}

/**
 * UNION ARENA（萬代自家 TCG 官方站）—— 老闆 2026-08-29 指定加入
 *
 * 補的是「卡牌有官方一手消息」這一塊。**它只有一個品牌**（沒有寶可夢、遊戲王、
 * 海賊王卡、球員卡），所以是補充不是主力；卡牌的量靠 inside-games。
 *
 * 三件跟別家不一樣的事：
 *
 * ① **列表頁的分類是 client-side 的。** `?tags=products` 那個網址不會讓伺服器
 *    幫你過濾，回來的 1MB HTML 是全部分類。能用的是每個 `<li>` 上的 `data-tags`，
 *    自己挑 `products`（商品情報），跳過卡表／牌組／賽事報導／規則勘誤。
 *
 * ② **「商品情報」連到的是商品頁不是新聞內頁**（`/jp/products/…`，不是
 *    `/jp/news/<id>.php`）。第一版照著新聞內頁去抓，結果 1097 則裡挑出 0 篇 ——
 *    因為連到 `/jp/news/N.php` 的那些全是規則勘誤與活動公告。
 *    商品頁反而比新聞頁好：有主視覺、有發售日、有內容物。
 *
 * ③ **og:image 是站台通用橫幅 `ogp.png`**（新聞頁與商品頁都是），不是商品圖 ——
 *    照預設流程會被封面體檢擋掉，一篇都產不出來。真正的主視覺在
 *    `/jp/images/products/<系列>/img_mv*`，實測 710×768 的官方主視覺、
 *    上面就印著發售日、無浮水印。
 */
const UNION_ARENA_ORIGIN = 'https://www.unionarena-tcg.com'

/**
 * 只取近期的商品情報
 *
 * 列表頁是**全部歷史**（實測 1097 則、其中商品情報 138 筆，跨好幾年）。
 * 不設日期上限的話：每輪抓前 8 筆、寫過的進黑名單，跑久了就會一路往回
 * 把兩年前的舊商品當成新聞發出去。
 * 日期在同一個 `<li>` 的 `newsDate`，就用它擋。
 */
const UNION_ARENA_MAX_AGE_DAYS = 14

function extractUnionArenaLinks(html: string): string[] {
  const out: string[] = []
  const cutoff = Date.now() - UNION_ARENA_MAX_AGE_DAYS * 86400_000
  const re = /<li class="newsDetail"[^>]*data-tags="([^"]*)"[\s\S]{0,400}?href="(\/jp\/products\/[^"]+\.php)"[\s\S]{0,900}?newsDate">\s*(\d{4})\.(\d{2})\.(\d{2})/g
  for (const m of html.matchAll(re)) {
    if (!m[1].split(',').includes('products')) continue
    const t = Date.parse(`${m[3]}-${m[4]}-${m[5]}T00:00:00+09:00`)
    if (!isNaN(t) && t < cutoff) continue
    const url = UNION_ARENA_ORIGIN + m[2]
    if (!out.includes(url)) out.push(url)
  }
  return out
}

function pickUnionArenaCover(html: string): string {
  const imgs = [...html.matchAll(/<img[^>]+src="(\/jp\/images\/products\/[^"]+)"/g)]
    .map(m => m[1])
    .filter(u => !/img_thumbnail/i.test(u))   // 列表用的小縮圖，不是主視覺
  // 主視覺優先（img_mv*，上面就印著發售日），沒有就退回第一張商品圖
  const mv = imgs.find(u => /\/img_mv/i.test(u)) ?? imgs[0]
  return mv ? UNION_ARENA_ORIGIN + mv : ''
}

const HTML_SOURCES: HtmlSource[] = [
  { url: 'https://www.toy-people.com/?cat=8', category: 'toy',    label: 'ToyPeople-新聞', extract: extractToyPeopleLinks },
  { url: 'https://www.toy-people.com/',       category: 'figure', label: 'ToyPeople-首頁', extract: extractToyPeopleLinks },
  { url: `${UNION_ARENA_ORIGIN}/jp/news/`,    category: 'tcg',    label: 'UnionArena',
    extract: extractUnionArenaLinks, pickCover: pickUnionArenaCover },
]

/**
 * oneone 宇宙（universe.oneone.com.tw）—— 繁中玩具情報，老闆 2026-08-29 指定
 *
 * 為什麼單獨寫一支而不是丟進 DIRECT_FEEDS：這個來源有三件事跟別家不一樣，
 * 走共用流程一定會出事。
 *
 * ① **它是同業**（站上就有「線上抽一番賞」與 /store）。每篇內文都被塞了
 *    「就上台港最大 oneone 線上商城」這類置入與回站連結 —— 不先清乾淨，
 *    等於在我們自己的情報頁幫對手導流。所以送進 Claude 的是
 *    `oneOneBodyText()` 清過的版本，不是整頁純文字；改寫完再檢查一次，
 *    還留著就整篇不發。
 * ② **他們的 404 頁會回一整份正常版面**（實測 /posts/6228 是 HTTP 404
 *    卻吐 46KB HTML，裡面就有紅底商城 banner）。`fetchText` 只收 res.ok，
 *    所以拿不到 404 的內容 —— 但圖片仍走下面的白名單，不靠這一層擋。
 * ③ **圖分三種路徑，只有兩種能用**（老闆特別交代：不要抓到紅底 logo 當封面）：
 *
 *      upload/featured/…            文章封面            ✅
 *      images/editor/YYYY-MM-DD/…   內文圖（官方原圖）   ✅
 *      images/<雜湊>.png            商城廣告版位         ❌ ← 紅底 oneone logo
 *      upload/author/…              作者頭像             ❌
 *      /assets/images/…             站台 logo、按鈕       ❌
 *
 *    用白名單而不是「跳過含 logo 字樣的 <img>」那種黑名單：廣告圖的檔名是
 *    雜湊（c522e1ae….png），字面上完全看不出它是 logo。
 *
 * 圖片本身沒有 oneone 浮水印 —— 他們貼的是廠商官方宣傳圖原檔，角落的
 * BANDAI／©創通・サンライズ 是**權利人標記，不可以蓋掉**（下游的浮水印
 * 流程本來就只認 WATERMARKED_SOURCES，這裡不必特別處理）。
 */
const ONEONE_FEED = 'https://universe.oneone.com.tw/feed'
const ONEONE_CDN  = 'd89889xojlqhy.cloudfront.net'
/** 一次最多看幾則；真正寫幾篇仍受 MAX_TOTAL 與分類配額管 */
const ONEONE_SCAN = 12

const isOneOneCoverUrl = (u: string) => !!u && u.includes(`${ONEONE_CDN}/upload/featured/`)
const isOneOneBodyUrl  = (u: string) => !!u && u.includes(`${ONEONE_CDN}/images/editor/`)

/** 他們自家生意的分類：4=線上抽（自家平台公告）、38=集團動態 */
const ONEONE_SKIP_CATEGORY = new Set(['4', '38'])

/** 他們的分類代碼 → 我們的 category；沒對到的交給 pickCategory 用標題判 */
const ONEONE_CATEGORY: Record<string, string> = {
  '7':  'ichiban',   // 一番賞
  '5':  'gacha',     // 盲盒扭蛋
  '12': 'figure',    // 公仔週邊
  '8':  'toy',       // 動漫
  '10': 'toy',       // 潮流文創
  '28': 'toy',       // 電影娛樂
  '53': 'toy',       // 聯名消息
}

/** 文章頁掛的分類代碼（一篇通常 2~4 個） */
function oneOneCategoryIds(html: string): string[] {
  return [...html.matchAll(/post-category-marker"\s+href="\/category\/(\d+)"/g)].map(m => m[1])
}

function oneOneCategory(html: string, fallback: string): string {
  for (const id of oneOneCategoryIds(html)) {
    if (ONEONE_CATEGORY[id]) return ONEONE_CATEGORY[id]
  }
  return fallback
}

/**
 * 商城置入的特徵字。改寫後的稿子也用它複驗 —— 漏一句就是幫對手打廣告。
 * 「快抽選」是他們的自家產品名（oneone LITE 快抽選）。
 */
const ONEONE_AD_RE = /oneone|線上商城|線上輕鬆等商品|24\s*小時線上抽|快抽選/i

/**
 * 內文純文字，商城置入整段刪掉
 *
 * 以 <p> 為單位過濾，不是逐句 —— 業配句常常沒有句號，逐句切會把它跟
 * 後面的真內容黏成同一段，一起被丟掉或一起被留下。
 * 兩層都要：整段是商城連結的（含 oneone.com.tw）先拿掉，剩下的再比對字樣，
 * 因為有些置入是純文字沒包連結。
 */
function oneOneBodyText(html: string): string {
  const i = html.indexOf('post-content')
  const seg = (i >= 0 ? html.slice(i, i + 80_000) : html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
  const plain = (x: string) => x
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim()

  const kept = [...seg.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(m => m[1])
    .filter(b => !/oneone\.com\.tw/i.test(b))
    .map(plain)
    .filter(t => t && !ONEONE_AD_RE.test(t))
  if (kept.length) return kept.join('\n').slice(0, 1500)

  // 版型改成不用 <p> 時的退路：先拔掉回站連結整塊，再逐句過濾
  return plain(seg.replace(/<a[^>]+href="[^"]*oneone\.com\.tw[^"]*"[\s\S]*?<\/a>/gi, ' '))
    .split(/(?<=[。！？])/)
    .filter(x => !ONEONE_AD_RE.test(x))
    .join('')
    .slice(0, 1500)
}

/** 內文配圖只收 images/editor/ 底下的（廣告版位與作者頭像都不在這一層） */
function extractOneOneBodyImages(html: string, limit: number): string[] {
  const i = html.indexOf('post-content')
  const seg = i >= 0 ? html.slice(i, i + 80_000) : html
  const urls = [...seg.matchAll(/https:\/\/[^"'\s)]+/g)].map(m => m[0]).filter(isOneOneBodyUrl)
  return [...new Set(urls)].slice(0, limit)
}

/**
 * 玩具／周邊題材的關鍵字 —— 給綜合型 feed 用的前置過濾
 *
 * PRTimes 的 index.rdf 是**全分類消防栓**（馬肉、鰻魚、籃球都在裡面），
 * 巴哈 GNN 是遊戲新聞台（實測 31 則裡玩具相關只有 1 則）。
 * 不先濾掉，每一則不相干的都要付一次文章 fetch ＋ 一次 Claude 改寫才被退回。
 */
const TOY_TOPIC_RE = /フィギュア|一番くじ|ガシャポン|ガチャ|カプセルトイ|プライズ|景品|食玩|ぬいぐるみ|ソフビ|プラモ|ガンプラ|ROBOT魂|トレカ|カードゲーム|新弾|一番賞|轉蛋|扭蛋|盒玩|盲盒|公仔|模型|卡牌|周邊|開賣|發售/

/**
 * 卡牌題材關鍵字 —— 給 inside-games 這種綜合遊戲媒體做前置過濾
 *
 * 比 TOY_TOPIC_RE 專一：那支是玩具通用詞（フィギュア／一番くじ／ガシャポン…），
 * 用在遊戲媒體上會把大量電玩新聞放進來。
 */
const TCG_TOPIC_RE = /ポケカ|ポケモンカード|遊戯王|デュエル・?マスターズ|デュエマ|ヴァイスシュヴァルツ|ワンピースカード|ユニオンアリーナ|トレカ|トレーディングカード|カードゲーム|TCG|新弾|拡張パック|ブースターパック/

/**
 * 球員卡：正面關鍵字（品牌／產品線）
 *
 * 用品牌白名單而不是「sports card」這種泛稱：這兩家的標題一定會出現
 * Topps／Panini／Upper Deck 之類的產品線名，泛稱反而抓不到。
 */
const SPORTSCARD_TOPIC_RE = /Topps|Panini|Upper Deck|Bowman|Onit|Prizm|Chrome|Optic|Mosaic|Donruss|Immaculate|Obsidian|Flawless|Artifacts|Checklist|Set Review|Pok[eé]mon/i

/**
 * 球員卡：一定要排除的
 *
 * CardLines 的內容是混的 —— 商品預覽之外還有投資分析（「Top 10 NFL Rookies
 * To Invest In」）、辨偽教學，以及**他們自家的開箱拍賣廣告**（Cardlines Break
 * Auctions／Club Rewards）。後者跟 oneone 的商城置入是同一類問題：
 * 幫對手導流。這些就算送進 Claude 也會被「不是商品發售消息」退回，
 * 但那要付一次改寫的錢，不如先擋掉。
 */
const SPORTSCARD_SKIP_RE = /Cardlines|Break Auction|Club Rewards|Invest|Repack|Fake|To Buy|Top \d+/i

const DIRECT_FEEDS: Array<{
  url: string
  category: string
  label: string
  titleFilter?: RegExp
  /** 命中就跳過，比 titleFilter 後判定（綜合型來源的自家廣告與投資文用這個擋） */
  titleSkip?: RegExp
  /**
   * 這個來源多久才准出一篇（小時）。用來壓低配角來源的比重。
   *
   * 老闆 2026-08-29：「球員卡兩天一篇或三天一篇也行，畢竟寶可夢或其他日系
   * 卡牌才是主流」。沒有這個節流的話，只要它排在前面就會一直吃掉 tcg 的名額。
   * 判斷依據是 news 表裡同網域最近一篇的時間，不需要另外存狀態。
   */
  minIntervalHours?: number
  /**
   * 只收幾天內的文章，預設 3 天。
   *
   * 低頻來源要自己的窗口：CardboardConnection 一個月才十幾篇、而且是一陣一陣的，
   * 實測最新一篇是 **25.6 天前** —— 用 3 天窗口它永遠貢獻 0 則，
   * 等於接了等於沒接（我一度誤判成被改寫階段退回，其實根本沒進到那一步）。
   *
   * 放寬的代價是「舊聞當新聞發」。對球員卡這種**商品情報**影響小：
   * 「2026 Panini Immaculate 收錄清單」講的是還沒發售的商品，寫於三週前
   * 不影響它的正確性。時效性強的來源（ホビーウォッチ、PRTimes）維持 3 天。
   */
  maxAgeDays?: number
}> = [
  /*
   * 球員卡（老闆 2026-08-29 指定：未來會有這條商品線，情報先鋪）
   *
   * 兩家都是英文美系來源（NBA／MLB／NFL／足球），圖是**廠商官方商品渲染圖、
   * 無浮水印**（抓過 Panini Immaculate 的鐵盒圖確認）。
   *
   * 官方站 Topps 與 Panini 都掛 Cloudflare 挑戰頁，依取材原則不繞過。
   * Sports Collectors Daily（403）、Beckett（500）、日系 BBM／Epoch／Calbee
   *（都沒有 feed）皆不可用。
   *
   * ⚠️ 中華職棒卡目前沒有來源，這兩家不會報。
   * ⚠️ 球員卡的商品圖幾乎都是白底，而我們的浮水印是單層白字 —— 蓋上去看不見。
   *    這條線真的重要的話，浮水印要做「依亮度自動選白字或深色字」。
   */
  /*
   * **順序刻意把球員卡放前面**，配合 minIntervalHours 一起看才對：
   * 球員卡有 60 小時節流，等於每 2~3 天才准出一篇；沒被節流的那一輪讓它先拿
   * tcg 名額，其餘所有輪次都是日系卡牌（inside-games）在用。
   * 反過來把它排最後的話，tcg 名額會被日系吃光，球員卡永遠輪不到 ——
   * 那是加來源之前實際發生過的狀況。
   */
  // 純產品導向，20 則全是 Set Review + Checklist，但量少（約 10 篇/月）
  { url: 'https://www.cardboardconnection.com/feed', category: 'tcg', label: 'CardboardConn',
    titleFilter: SPORTSCARD_TOPIC_RE, titleSkip: SPORTSCARD_SKIP_RE,
    minIntervalHours: 60, maxAgeDays: 30 },
  // 更新較勤但內容混雜，靠上面兩條規則篩
  { url: 'https://cardlines.com/feed/', category: 'tcg', label: 'CardLines',
    titleFilter: SPORTSCARD_TOPIC_RE, titleSkip: SPORTSCARD_SKIP_RE,
    minIntervalHours: 60, maxAgeDays: 14 },
  /*
   * inside-games —— `tcg` 分類的主力（老闆 2026-08-29 指定）
   *
   * Google News 移除後 tcg 沒有來源了。這家是綜合遊戲媒體，但**卡牌是多品牌的**
   * （實測 50 則裡 4 則卡牌新聞：ポケカ 30 週年抽選、ポケポケ 新シーズン、
   * 遊戲王原畫展周邊…），一天大約 1～2 則，剛好對得上一天 12 篇裡 tcg 該有的份量。
   * 圖是官方原圖、無浮水印（抓過一張 ポケカ 確認）。
   *
   * 只收卡牌題材：フィギュア／グッズ那些交給 ホビーウォッチ，不重複抓。
   */
  { url: 'https://www.inside-games.jp/rss/index.rdf', category: 'tcg', label: 'InsideGames', titleFilter: TCG_TOPIC_RE },
  /*
   * ホビーウォッチ（Impress）—— 2026-08-29 起的主力
   *
   * 題材幾乎 100% 重疊（一番くじ／ガンプラ／フィギュア／ROBOT魂），
   * 圖是廠商官方商品照與自家展場照，**兩種都沒有站標**。
   * 實測 12 則全部有 og:image、全部通過封面體檢。
   */
  { url: 'https://hobby.watch.impress.co.jp/data/rss/1.0/hbw/feed.rdf', category: 'figure', label: 'HobbyWatch' },
  /*
   * PR TIMES —— 官方新聞稿，圖就是廠商自己發的原圖（沒有任何媒體站標）
   *
   * 舊的 `rss/category/17.rss` 已經 404（實測），換成全站 `index.rdf` 並用
   * 標題關鍵字過濾。它一次只有 200 則、大約涵蓋兩小時，所以 6 小時一輪會
   * 漏掉大部分 —— 撈得到就是賺，不當主力。
   */
  { url: 'https://prtimes.jp/index.rdf', category: 'figure', label: 'PRTimes', titleFilter: TOY_TOPIC_RE },
  /*
   * 巴哈姆特 GNN（繁中）—— 遊戲新聞台，玩具題材是少數
   * 近 30 天實際產出 0 篇。留著但加關鍵字過濾，不再為了它燒 Claude 額度。
   */
  { url: 'https://gnn.gamer.com.tw/rss.xml', category: 'figure', label: 'GNN-TW', titleFilter: TOY_TOPIC_RE },
]

/*
 * 拿掉了電撃ホビー（`hobby.dengeki.com/feed/`）—— 老闆 2026-08-29 指定，
 * 因為**它是唯一會在圖上壓自己站標的來源**。
 *
 * 它原本佔近 30 天文章的 88%（290/329），所以不是單純刪掉：同一次把
 * ホビーウォッチ 補上（題材重疊、圖乾淨），並修好兩條死掉的 feed。
 *
 * WATERMARKED_SOURCES 與那整套「偵測 → 蓋白墊 → 複驗」保留不動：
 * 之後任何來源開始壓站標都還接得住，而現在它幾乎不會被觸發。
 */

// ─── RSS 解析 ────────────────────────────────────────────────────────────────

interface RssItem {
  title:       string
  link:        string
  description: string
  pubDate:     string
  source:      string
  rssImage:    string  // enclosure / media:thumbnail / content:encoded 內的圖片
  // content:encoded 原文。抓 RSS 時就一起下載了，不是額外請求。
  // 文章頁抓不到時用它當內文配圖的來源（電擊的 feed 一則就帶 18 張圖）
  rssHtml:     string
}

function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = []
  // `<item rdf:about="…">`：ホビーウォッチ 與 PRTimes 走 RSS 1.0／RDF，
  // 舊的 /<item>/ 只認沒有屬性的標籤，那兩家會一則都解不出來
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi
  let m
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[1]
    const title = block.match(/<title>([\s\S]*?)<\/title>/i)?.[1]
      ?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1')
      ?.replace(/<[^>]+>/g, '').trim() ?? ''
    const link  = block.match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim() ?? ''
    const desc  = block.match(/<description>([\s\S]*?)<\/description>/i)?.[1]
      ?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1')
      ?.replace(/<a[^>]+>|<\/a>|<font[^>]+>|<\/font>/gi, '').trim() ?? ''
    // RDF 沒有 pubDate，日期在 dc:date
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]
      ?? block.match(/<dc:date>([\s\S]*?)<\/dc:date>/i)?.[1]
      ?? '').trim()
    const source  = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1]?.trim() ?? ''
    // 從 enclosure / media:content / media:thumbnail / content:encoded 取圖片
    const contentEncoded = block.match(/<content:encoded>([\s\S]*?)<\/content:encoded>/i)?.[1]
      ?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1') ?? ''
    const rssImage =
      block.match(/enclosure[^>]+url=["']([^"']+)/i)?.[1] ??
      block.match(/media:content[^>]+url=["']([^"']+)/i)?.[1] ??
      block.match(/media:thumbnail[^>]+url=["']([^"']+)/i)?.[1] ??
      contentEncoded.match(/<img[^>]+src=["']([^"']+)/i)?.[1] ??
      block.match(/<img[^>]+src=["']([^"']+)/i)?.[1] ??
      ''
    if (title && link) items.push({ title, link, description: desc, pubDate, source, rssImage, rssHtml: contentEncoded })
  }
  return items
}

// 跳過太舊的文章（超過 7 天）
function isRecent(pubDate: string, days = 7): boolean {
  if (!pubDate) return true
  const d = new Date(pubDate)
  return !isNaN(d.getTime()) && (Date.now() - d.getTime()) < days * 86400_000
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

async function fetchText(url: string, timeoutMs = 10_000): Promise<string> {
  for (const ua of [UA, UA_MOBILE, UA_BOT]) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
          'Accept-Language': 'ja,zh-TW;q=0.9,en;q=0.7',
        },
        redirect: 'follow',
      })
      if (res.ok) return await res.text()
    } catch { continue }
  }
  return ''
}

/**
 * 從文章頁抽出**正文**（2026-08-29）
 *
 * 原本是「整頁去標籤、取前 1500 字」。對版面簡單的站沒事，對選單長的站是災難 ——
 * CardboardConnection 的前 1500 字全是導覽列：
 *
 *   「…Baseball Review Home Site Search Forum Repackz Products New Release
 *     Calendar Reviews Auction Search Brands Collecting Supplies Hot Top 50…」
 *
 * Claude 看不到任何商品資訊，當然回 null。實測球員卡每輪被退 17~18 篇，
 * 一直以為是篩選規則太嚴，其實是**餵進去的內容根本不是文章**。
 *
 * 作法：先縮到正文容器再去標籤。`<article>` 是 HTML5 語意標籤，
 * 現代 CMS 幾乎都有（實測 CardboardConnection 與 ホビーウォッチ 都有）；
 * 沒有就退回幾個常見的 class，再沒有才用整頁（維持舊行為，不會比現在差）。
 *
 * 容器內仍要拿掉 nav/header/footer/aside —— 有些站把側欄放在 <article> 裡面。
 */
/**
 * 把文章頁縮到「正文容器」的 HTML —— 文字與**取圖都要用這個**
 *
 * 取圖不縮範圍會拿到側欄「相關文章」的縮圖。實測 ホビーウォッチ 的
 * `/docs/special/2135846.html`，整頁由上往下掃到的前六張是
 * `2136/662`、`2135/950`、`2135/951`…**屬於本篇（2135/846）的 0 張** ——
 * 於是文章的封面是 A 商品、內文圖全是 B、C、D 商品（老闆回報的那兩篇）。
 *
 * `<article>` 可能有多個（相關文章列表也用這個標籤），取**最長**的才是正文。
 */
function articleScope(html: string): string {
  if (!html) return ''
  const articles = [...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)].map(m => m[1])
  if (articles.length) {
    const best = articles.sort((a, b) => b.length - a.length)[0]
    if (best.length >= 400) return best
  }
  for (const cls of ['entry-content', 'post-content', 'article-body', 'articleBody', 'td-post-content']) {
    const i = html.indexOf(cls)
    if (i < 0) continue
    const frag = html.slice(i, i + 60_000)
    if (frag.length >= 400) return frag
  }
  return html   // 都找不到就照舊用整頁
}

/**
 * 從文章頁抽出**正文文字**（2026-08-29）
 *
 * 原本是「整頁去標籤、取前 1500 字」。對版面簡單的站沒事，對選單長的站是災難 ——
 * CardboardConnection 的前 1500 字全是導覽列，Claude 看不到任何商品資訊、
 * 每輪退 17~18 篇。錯的不是篩選規則，是餵進去的東西。
 *
 * 容器內仍要拿掉 nav/header/footer/aside —— 有些站把側欄放在 `<article>` 裡面。
 */
function extractArticleText(html: string, limit = 1500): string {
  if (!html) return ''
  const text = articleScope(html)
    .replace(/<(script|style|nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ').trim()
  return text.slice(0, limit)
}

function extractMeta(html: string, prop: string): string {
  return (
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']{1,500})["']`, 'i'))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']{1,500})["'][^>]*(?:property|name)=["']${prop}["']`, 'i'))?.[1] ??
    ''
  ).trim()
}

function extractOgImage(html: string): string {
  return extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image') || ''
}

// og:image 抓不到時，從 <img> 標籤掃描（跳過小圖示）
function extractBodyImage(html: string): string {
  const matches = [...html.matchAll(/<img[^>]+src=["']([^"']{20,500})["'][^>]*/gi)]
  for (const m of matches) {
    const src = m[0]
    if (/logo|icon|avatar|pixel|spacer|sprite|banner_\d+x\d+/i.test(src)) continue
    const url = m[1]
    if (!url || url.startsWith('data:')) continue
    if (url.startsWith('http://') || url.startsWith('https://')) {
      if (BLOCKED_IMG_DOMAINS.some(d => url.includes(d))) continue
      return url
    }
  }
  return ''
}

// 內文配圖：沿用單圖的過濾規則，取前 N 張不重複的圖（文章 HTML 已抓過，不額外耗成本）
function extractBodyImages(html: string, limit: number): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']{20,500})["'][^>]*/gi)) {
    if (out.length >= limit) break
    const tag = m[0]
    if (/logo|icon|avatar|pixel|spacer|sprite|banner_\d+x\d+/i.test(tag)) continue
    const url = m[1]
    if (!url || url.startsWith('data:')) continue
    if (!url.startsWith('http://') && !url.startsWith('https://')) continue
    if (BLOCKED_IMG_DOMAINS.some(d => url.includes(d))) continue
    if (out.includes(url)) continue
    out.push(url)
  }
  return out
}

// 將可能的相對路徑解析成絕對 URL；data: URI 或解析失敗回傳空字串
/*
 * 會在圖片上壓站方浮水印的來源。
 *
 * 「要不要蓋 GGB logo」由這份名單決定，不由偵測分數決定 ——
 * 2026-08-07 實測（見 lib/dengekiWm.ts 的註解）：帶浮水印的圖分數
 * 0.183~0.248，乾淨的 BANDAI 商品照卻可以到 0.253，兩群完全重疊。
 * 靠分數判斷的結果是「四張漏兩張，四張乾淨圖誤蓋一張」——
 * 玩家會看到官方商品照上莫名其妙多一個 GGB logo。
 *
 * 網域是 100% 準確的訊號，偵測只用來挑角落（實測 3/4 正確）。
 * 角落不寫死：同一個電ホビ，實測四張分別在 右下／右上／左上／右上，
 * 寫死 bottom-right 只會有 1/4 正確。
 */
const WATERMARKED_SOURCES = ['dengeki.com']

/**
 * 已知**不會壓站標**的來源：整套視覺偵測與蓋 logo 白墊一律跳過，只蓋自家網址
 *（老闆 2026-08-29 指定）。
 *
 * oneone 貼的是廠商官方宣傳圖原檔，上面只有權利人自己的東西
 *（BANDAI 食玩圓標、©創通・サンライズ、※画像はイメージです…）。
 * 對這種來源跑偵測，抓到的百分之百是誤判 —— 實測四張官方圖三張被判成
 * 「有站標」，於是封面被蓋上白墊遮住版權聲明、四張內文圖全被丟掉，
 * 那篇文章一張配圖都沒有。
 *
 * 跳過還順便省掉每張圖 1～2 次視覺呼叫。
 *
 * 要再加來源進來之前先確認：**它是不是自己壓浮水印**。判斷方式是隨機開幾篇，
 * 看圖的角落有沒有跟照片內容無關的半透明站名。
 */
const NO_SITE_WATERMARK_SOURCES = ['universe.oneone.com.tw']

const isCleanSource = (...urls: string[]) =>
  urls.some(u => NO_SITE_WATERMARK_SOURCES.some(d => u?.includes(d)))

/**
 * 品牌張冠李戴的防呆（2026-08-29）
 *
 * prompt 已經有「品牌名不可張冠李戴」的對照表，但那只是降低機率 ——
 * 實測重發三輪，第一輪正確、第三輪又寫出「UNION ARENA 遊戲王卡牌」。
 * 模型的輸出是機率性的，靠指示擋不住，要在程式層再把一次。
 *
 * 規則：某個來源的稿子裡出現「這個來源不可能提到的競品品牌」就整篇不發。
 * 寧可少一篇，不要發一篇把 BANDAI 的產品說成別家的稿。
 */
const BRAND_CONFLICTS: Array<{ host: string; forbid: RegExp }> = [
  // UNION ARENA 是 BANDAI 自家的 TCG，跟遊戲王（KONAMI）沒有任何關係
  { host: 'unionarena-tcg.com', forbid: /遊戲王|遊戯王|Yu-?Gi-?Oh/i },
]

/** 這篇稿子有沒有把來源的品牌寫成別家的？ */
function hasBrandMixup(sourceUrl: string, ...texts: Array<string | undefined>): boolean {
  const rule = BRAND_CONFLICTS.find(r => sourceUrl.includes(r.host))
  if (!rule) return false
  return texts.some(t => !!t && rule.forbid.test(t))
}

/**
 * 「這是權利人自己的標記，不是新聞網站的浮水印」—— 用來否決視覺誤判
 *
 * 版權／免責聲明（©、※画像は…）與廠商官方標記（BANDAI 食玩圓標之類）
 * 是誤判的兩大宗。清單只放**權利人**的東西，不放新聞網站的名字。
 */
const RIGHTS_MARK_RE = /©|\(c\)|copyright|画像は|イメージです|創通|サンライズ|東映|集英社|BANDAI|バンダイ|食玩|SHOKUGAN|GASHAPON|ガシャポン|TAKARA|TOMY|GOOD ?SMILE|グッドスマイル|MEGAHOUSE|FURYU|フリュー|SEGA|セガ|TAITO|タイトー|KOTOBUKIYA|コトブキヤ/i

/** 這張圖是不是來自會壓浮水印的站 */
const isWatermarkedSource = (...urls: string[]) =>
  urls.some(u => WATERMARKED_SOURCES.some(d => u?.includes(d)))
/**
 * 封面圖體檢：擋掉「站方拿自家 logo 當 og:image」的文章
 *
 * 玩具人與 oneone universe 在沒有專屬 og:image 時會回傳站標，結果文章
 * 封面就是一塊紅底白字的 logo（老闆截圖回報）。老闆的規則是
 * 「沒圖就不要生成此文章，找別篇」—— 所以這裡回 false 就整篇跳過。
 *
 * 兩個門檻是拿實際資料量出來的（站上 14 張正常封面 vs 那兩張 logo）：
 *
 *   尺寸    正常封面最小 640×360；玩具人站標只有 161×50
 *   色彩數  縮到 32×32 後數不重複顏色，正常封面 505～1021；
 *           oneone 站標只有 123（純色塊 + 白字）
 *
 * 為什麼兩個都要：玩具人站標太小，縮放到 32×32 反而被插值撐出 853 色，
 * 光看色彩數抓不到；oneone 是 700×700 的正方形，光看尺寸也抓不到。
 *
 * 全程本地 sharp，不呼叫付費服務。放在 Claude 改寫「之前」——
 * 多抓一張圖是幾十 KB，改寫一篇才是真的成本。
 */
/*
 * 同一次執行內，同一張圖只下載一次、只問一次 Claude。
 *
 * 封面圖會被摸兩次（先體檢、再處理），內文圖也常常就是封面的同一張，
 * 每次都重抓重問等於白花額度。用網址擋下載、用內容雜湊擋視覺呼叫 ——
 * 網址不同但內容相同的縮圖變體也擋得掉。
 */
const imgBufCache = new Map<string, Buffer | null>()
const wmVerdictCache = new Map<string, WmVisionResult | null>()

async function fetchImageOnce(url: string): Promise<Buffer | null> {
  if (imgBufCache.has(url)) return imgBufCache.get(url) ?? null
  let out: Buffer | null = null
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'image/*,*/*;q=0.8' },
      signal: AbortSignal.timeout(12_000),
      redirect: 'follow',
    })
    if (res.ok) {
      const b = Buffer.from(await res.arrayBuffer())
      if (b.length >= 3_000) out = b
    }
  } catch { out = null }
  // 單次執行的快取，超過就整個清掉（serverless 實例可能被重用）
  if (imgBufCache.size > 60) imgBufCache.clear()
  imgBufCache.set(url, out)
  return out
}

const MIN_COVER_W = 480
const MIN_COVER_H = 270
const MIN_COVER_COLORS = 300

/*
 * 內文圖的尺寸下限。比封面寬鬆（內文圖本來就可能小一點），但小到這種程度的
 * 一定不是商品照 —— 實測 CardboardConnection 的內文圖抓到一張 **125×50** 的
 * 「Hobby Boxes best price」廣告橫幅。
 *
 * 尺寸才是這類東西的破綻：那張的色彩數有 787，色彩檢查抓不到；
 * 檔名也沒有 logo／banner 字樣，`extractBodyImages` 的關鍵字黑名單同樣漏掉。
 */
const MIN_BODY_W = 300
const MIN_BODY_H = 200

/**
 * 封面**來源原圖**的雜湊 —— 用來擋「同商品不同通路」的重複文章
 *
 * 吃 `fetchImageOnce` 的快取，不會多抓一次；封面在 `isUsableCover` 已經下載過。
 * 雜湊的是來源原圖而不是轉存後的成品：成品經過縮圖與編碼，同一張來源圖
 * 不同時間轉出來的位元組不保證一樣。
 */
/** 這張圖大到可以當內文配圖嗎？（擋站方的小廣告橫幅） */
async function bigEnoughForBody(buf: Buffer): Promise<boolean> {
  try {
    const m = await sharp(buf).metadata()
    return (m.width ?? 0) >= MIN_BODY_W && (m.height ?? 0) >= MIN_BODY_H
  } catch { return false }
}

async function coverHashOf(url: string): Promise<string | null> {
  const buf = await fetchImageOnce(url)
  return buf ? crypto.createHash('sha1').update(buf).digest('hex') : null
}

async function isUsableCover(url: string): Promise<boolean> {
  try {
    const buf = await fetchImageOnce(url)
    if (!buf) return false
    const meta = await sharp(buf).metadata()
    const W = meta.width ?? 0, H = meta.height ?? 0
    if (W < MIN_COVER_W || H < MIN_COVER_H) return false

    const { data, info } = await sharp(buf).resize(32, 32, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true })
    const seen = new Set<string>()
    for (let i = 0; i < data.length; i += info.channels) {
      seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`)
    }
    return seen.size >= MIN_COVER_COLORS
  } catch {
    return false
  }
}

const DEFAULT_NEWS_IMAGE =
  `${(process.env.NEXT_PUBLIC_FRONTEND_URL || 'https://www.ggb.com.tw').replace(/\/$/, '')}/images/banner_defaulet.png`


/**
 * 浮水印偵測：讓 Claude 視覺看四個角（**所有來源、所有圖都跑**）
 *
 * 原本只有 dengeki 走這條，其他來源的圖完全不檢查、原樣轉存 ——
 * 只要哪家開始壓站標就會直接出現在文章裡。老闆的要求是「百分之百
 * 無差錯，不要看到別人 logo」，所以改成不分來源一律檢查。
 *
 * 為什麼不用本地模板比對當主判準：那支是照電ホビ浮水印做的邊緣模板，
 * 只認得那一種；而且實測三張電ホビ原圖只挑對一張（分數 0.175／0.176／
 * 0.140，全都低於門檻）。半透明疊白的浮水印本來就沒什麼邊緣可對。
 *
 * 兩個關鍵細節：
 *   1. 角落裁切先做 normalise（直方圖拉伸）—— 浮水印是半透明的，
 *      拉伸後對比才看得出來，直接送原圖 Claude 也容易漏。
 *   2. Prompt 必須講清楚「商品包裝上的品牌 logo（BANDAI／GASHAPON／
 *      TOMY…）不算浮水印」，否則商品照會被誤判，蓋在商品本體上。
 *
 * 回傳 'none' = 乾淨；回傳角落 = 那一角有站方浮水印；
 * 回傳 null = 呼叫失敗／看不懂 → 呼叫端一律當作不確定，整張不用。
 */
type WmVisionResult = WmCorner | 'none'

type Box = { left: number; top: number; width: number; height: number }

/**
 * 上緣／下緣兩條長條（取自內容區，已拉高對比）—— 送給模型看的就是這兩張
 *
 * `box` 一定要由呼叫端算好傳進來，不要在這裡自己算：蓋完 logo 之後那塊
 * 白墊會跟左右的白色留白連成一片，trim 會多吃掉一截，量出來的內容區
 * 跟原圖不一樣，複驗裁到的位置就整個歪掉（實跑一輪 6 篇全被誤判擋下）。
 */
async function edgeStrips(buf: Buffer, box: Box): Promise<[string, string] | null> {
  try {
    const W = box.width, H = box.height
    if (!W || !H) return null
    const sh = Math.max(40, Math.round(H * 0.16))
    const top = await sharp(buf).extract({ left: box.left, top: box.top, width: W, height: sh })
      .resize(700, null).normalise().png().toBuffer()
    const bottom = await sharp(buf).extract({ left: box.left, top: box.top + H - sh, width: W, height: sh })
      .resize(700, null).normalise().png().toBuffer()
    return [top.toString('base64'), bottom.toString('base64')]
  } catch { return null }
}

async function askVision(strips: [string, string], prompt: string): Promise<string> {
  const claude = createClaude('news-agent-wm-verify', process.env.ANTHROPIC_API_KEY)
  const res = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    /*
     * 給它思考空間再作答。逼它一個字答完反而會亂猜 —— 實測「不准說明」時
     * 三張錯兩張，允許先描述再作答是三張全對。
     *
     * **但 150 太小**（2026-08-29）：說明還沒講完就被截斷，結論那行根本沒寫出來，
     * 而解析是「取全文最後一次出現的代碼」—— 於是從說明文字裡的「（BR区域）」
     * 把答案撿走。實測一張的判定是 BR，它自己的理由卻寫著
     * 「属于商品本身的官方logo，不算网站浮水印…未发现浮水印」。
     * 老闆回報的「浮水印在右下角但你蓋左下角」就是這樣來的。
     */
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'text', text: '上緣：' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: strips[0] } },
        { type: 'text', text: '下緣：' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: strips[1] } },
      ],
    }],
  })
  return (res.content[0] as { text?: string }).text ?? ''
}

/**
 * 從回答裡取結論。**只認 `ANSWER=` 那一行**，不從說明文字裡撿。
 *
 * 舊版是「全文最後一次出現的代碼」，遇到說明被截斷（或說明裡順口提到
 * 「下緣的右側（BR区域）」）就會把說明當成結論 —— 見上面 max_tokens 的說明。
 */
function readAnswer(raw: string, re: RegExp): string | null {
  const m = [...raw.toUpperCase().matchAll(re)].map(x => x[1])
  return m.length ? m[m.length - 1] : null
}

/**
 * 浮水印偵測：**所有來源、所有圖都跑**（老闆：百分之百不要看到別人 logo）
 *
 * 送的是「上緣整條 + 下緣整條」而不是四張角落裁圖。實測差很多：
 * 四張角落裁圖時 Haiku 三張錯兩張、換 Sonnet 才全對；改成兩條長條之後
 * Haiku 就三張全對，而且 input 從約 800 token 掉到約 400 —— 模型看得到
 * 整條邊，比看四塊各自孤立的裁圖好判斷。既準又便宜。
 *
 * 三個關鍵細節：
 *   1. 長條取自**內容區**而非畫布。電ホビ的 og:image 常是直式照片放進
 *      1200×630 畫布、左右補白，站標壓在照片角落 —— 用畫布角落去找，
 *      差半張圖（老闆截圖那張的內容區從 x=286 才開始）
 *   2. normalise() 拉高對比，半透明站標才看得出來
 *   3. prompt 必須列出「不算浮水印」的東西：商品／包裝上的品牌標誌、
 *      廠商 logo（BANDAI、GASHAPON、FuRyu…）、作品 logo、價格規格文字
 *
 * 回 'none' = 乾淨；回角落 = 那一角有站方浮水印；回 null = 不確定 →
 * 呼叫端一律不用這張圖。
 */
async function findWatermarkWithVision(buf: Buffer, sourceUrl = '', box?: Box): Promise<WmVisionResult | null> {
  const hash = crypto.createHash('sha1').update(buf).digest('hex')
  if (wmVerdictCache.has(hash)) return wmVerdictCache.get(hash) ?? null
  const remember = (v: WmVisionResult | null) => {
    if (wmVerdictCache.size > 120) wmVerdictCache.clear()
    wmVerdictCache.set(hash, v)
    return v
  }
  try {
    const strips = await edgeStrips(buf, box ?? await contentBox(buf))
    if (!strips) return remember(null)
    let host = ''
    try { host = new URL(sourceUrl).hostname.replace(/^www\./, '') } catch { host = '' }

    const raw = await askVision(strips, [
      '兩張圖分別是同一張照片的「上緣整條」與「下緣整條」（已拉高對比）。',
      host ? `照片取自新聞網站 ${host}。` : '',
      '請判斷這個新聞網站有沒有在角落壓上自己的站標／浮水印（通常半透明、低對比，跟照片內容無關）。',
      '有的話在哪一角：TL（上緣的左邊三分之一）、TR（上緣的右邊三分之一）、BL（下緣的左邊三分之一）、BR（下緣的右邊三分之一）；沒有就 NONE。',
      '注意：商品或包裝上印的品牌標誌、玩具廠商官方 logo（BANDAI、GASHAPON、FuRyu、TOMY、Good Smile…）、',
      '作品本身的 logo、宣傳圖裡的價格與規格文字，都**不算**浮水印，不要選它們。',
      '先用一到兩句話說明，然後換兩行：倒數第二行寫 MARK=<你在那一角看到的文字，逐字照抄；沒有文字就寫 MARK=->，',
      '最後一行寫 ANSWER=TL 或 ANSWER=TR 或 ANSWER=BL 或 ANSWER=BR 或 ANSWER=NONE。這兩行不可以有其他文字。',
    ].join(''))

    const ans = readAnswer(raw, /ANSWER\s*=\s*(TL|TR|BL|BR|NONE)/g)
    if (!ans) return remember(null)
    if (ans === 'NONE') return remember('none')

    /*
     * 用「它讀到的字」否決誤判（2026-08-29）
     *
     * 模型很容易把**廠商官方標記**與**版權／免責聲明**當成新聞網站的浮水印。
     * 實測 oneone 的四張官方宣傳圖，三張被判成有站標，MARK 分別是
     * 「©universe」「※画像はイメージです…サンライズ」「BANDAI 食玩」——
     * 全都是權利人自己的東西，蓋掉比露出來更糟。
     * 同一輪的電ホビ 對照組 MARK 是「電撃hobby.net」，不在這份清單裡，照樣保留。
     *
     * 只做否決、不做「一定要含站名才算」：有些站的浮水印是沒有字的圖樣，
     * 要求含站名會把真的漏掉。寧可多蓋，不要漏蓋（老闆的原則）。
     */
    const mark = raw.match(/MARK\s*=\s*(.+)/i)?.[1]?.trim() ?? ''
    if (mark && RIGHTS_MARK_RE.test(mark)) return remember('none')

    const map: Record<string, WmCorner> = { TL: 'top-left', TR: 'top-right', BL: 'bottom-left', BR: 'bottom-right' }
    return remember(map[ans])
  } catch {
    return remember(null)  // 看不出來就是不確定 —— 寧可不用這張圖
  }
}

/**
 * 蓋完之後的複驗：白框以外還看不看得到原本的站標
 *
 * 問的是二元問題而不是再問一次「浮水印在哪一角」—— 後者在蓋完之後會把
 * 我們自己的 GGB logo 當成浮水印指回來，等於每張都被判失敗。
 * 誤判成 DIRTY 只是多跳一篇（實測三張中一張），誤判成 CLEAN 才會漏圖，
 * 所以這裡寧可保守。
 */
async function verifyBrandedClean(buf: Buffer, sourceUrl = '', box?: Box): Promise<boolean> {
  try {
    const strips = await edgeStrips(buf, box ?? await contentBox(buf))
    if (!strips) return false
    let host = ''
    try { host = new URL(sourceUrl).hostname.replace(/^www\./, '') } catch { host = '' }
    const raw = await askVision(strips, [
      '兩張圖分別是同一張照片的「上緣整條」與「下緣整條」（已拉高對比）。',
      '我們已經在其中一角蓋上白色方塊＋粉紅色扭蛋機的「吉吉比」logo，那是我們自己的，請完全忽略它。',
      `請問在那個白色方塊以外，還看不看得到${host ? ` ${host}` : '原本新聞網站'}壓上去的站標／浮水印？`,
      '商品或包裝上的品牌標誌、玩具廠商 logo、作品 logo、版權與免責聲明都不算。',
      '先用一句話說明，最後單獨一行寫 ANSWER=CLEAN 或 ANSWER=DIRTY，那一行不可以有其他文字。',
    ].join(''))
    return readAnswer(raw, /ANSWER\s*=\s*(CLEAN|DIRTY)/g) === 'CLEAN'
  } catch { return false }
}

// 下載浮水印來源圖 → 壓 GGB logo → 上傳 R2；失敗回 null（呼叫端用預設圖）
/**
 * 內文配圖：把來源文章的 2 張圖插進生成內容的段落之間
 *
 * 圖片來自已經抓下來的文章 HTML，不額外發請求、不做圖片生成，
 * 成本僅為 R2 儲存。轉存 R2 而非直接外連，是因為部分來源站擋 hotlink。
 * 每張圖都會偵測浮水印，偵測到就比照封面蓋上 GGB logo 蓋掉，
 * 沒偵測到就原樣轉存 —— 不會為了保險而在乾淨的圖上亂蓋 logo。
 */
async function injectBodyImages(
  content: string,
  articleHtml: string,
  coverUrl: string,
  pageUrl: string,
  forceBrand = false,
  seen?: Set<string>,
  /** 自訂取圖規則（oneone 只收 images/editor/，見該來源的說明） */
  pickImages?: (html: string, limit: number) => string[],
): Promise<string> {
  if (!content || !articleHtml) return content

  // 取圖也要縮到正文容器，否則抓到的是側欄「相關文章」的縮圖（見 articleScope）
  const candidates = (pickImages ?? extractBodyImages)(articleScope(articleHtml), 6)
    .map(u => resolveImageUrl(u, pageUrl))
    .filter(u => u && u !== coverUrl)
  if (candidates.length === 0) return content

  const hosted: string[] = []
  for (const u of candidates) {
    if (hosted.length >= 2) break
    // 逐張偵測：有浮水印就蓋 logo，沒有就原樣轉存
    const r = await downloadSmartToR2(u, forceBrand, pageUrl, seen, 'body')
    if (r) hosted.push(r)
  }
  if (hosted.length === 0) return content

  // 插在第 1、2 個 </p> 之後；段落不足就接在文末
  const parts = content.split('</p>')
  if (parts.length <= 1) {
    return content + hosted.map(figureHtml).join('')
  }
  let out = ''
  let used = 0
  parts.forEach((seg, i) => {
    out += seg + (i < parts.length - 1 ? '</p>' : '')
    const insertAfter = i === 0 || i === 2
    if (insertAfter && used < hosted.length && i < parts.length - 1) {
      out += figureHtml(hosted[used]); used++
    }
  })
  if (used < hosted.length) out += hosted.slice(used).map(figureHtml).join('')
  return out
}

function figureHtml(url: string): string {
  // 來源圖多半只有 800px，讓它跟著容器寬度拉伸就會糊。
  // max-width 讓它最多顯示到原始尺寸，容器再寬也不放大
  return `<figure style="margin:1.5rem auto;max-width:800px"><img src="${url}" alt="" loading="lazy" style="width:100%;height:auto;border-radius:8px" /></figure>`
}

/**
 * 轉存到 R2，來源會壓浮水印時蓋上 GGB logo
 *
 * 封面圖與內文圖共用同一條路徑。**不分來源，每一張都檢查**（老闆要求：
 * 百分之百不要看到別人的 logo）。原本只查 dengeki，其他來源原樣轉存，
 * 只要哪家開始壓站標就會直接漏出去。
 *
 * 流程（封面）：
 *   1. Claude 視覺看上下緣 → 乾淨就原樣轉存
 *   2. 有浮水印 → 蓋 GGB logo → **再驗一次**，確認蓋完真的看不到了
 *   3. 任何一步不確定（API 失敗、蓋完還看得到、已知會壓浮水印的站卻
 *      回報乾淨）→ 回 null，呼叫端整篇不發
 *
 * 內文配圖走簡化版：**有浮水印就丟掉那張圖**，不蓋也不複驗；
 * 已知會壓浮水印的站連下載都省。內文圖少一兩張不影響文章，
 * 為它多花兩次視覺呼叫不划算（老闆規則）。
 *
 * 第 2 步是關鍵：驗的是「實際成品」而不是「兩個定位方法有沒有共識」，
 * 直接對應我們真正在意的事 —— 成品上還看不看得到別人的浮水印。
 *
 * forceBrand 已無作用（現在一律檢查），保留參數避免動到所有呼叫端。
 */
async function downloadSmartToR2(
  imgUrl: string,
  forceBrand = false,
  sourceUrl = '',
  seen?: Set<string>,
  /**
   * 'cover' = 封面，蓋得掉就蓋，蓋不掉整篇不發
   * 'body'  = 內文配圖，**有浮水印就直接不要這張**，不花力氣蓋也不複驗
   *
   * 老闆規則：難蓋的內文圖就捨棄，網上文章多的是，主圖顧好就行。
   * 這樣一張有浮水印的內文圖從「2 次視覺呼叫 + 蓋圖」變成「1 次呼叫」，
   * 已知一定會壓浮水印的站更是連下載都省。
   */
  role: 'cover' | 'body' = 'cover',
): Promise<string | null> {
  try {
    // 已知一定會壓浮水印的站，內文圖直接放棄 —— 連圖都不用抓、更不用問 Claude
    if (role === 'body' && isWatermarkedSource(sourceUrl, imgUrl)) return null

    // 封面圖在 isUsableCover 已經抓過一次，這裡直接吃快取，不重抓
    const buf = await fetchImageOnce(imgUrl)
    if (!buf) return null

    // 同一張圖只處理一次。
    // 封面的 og:image 常常就是內文的第一張圖，只是網址不同（縮圖變體、帶 query）——
    // 用網址比對抓不到，結果同一張圖被下載、去浮水印、上傳兩次，
    // 而且兩次偵測到的角落可能不一樣，於是同一張圖出現兩個不同位置的 logo。
    // 比對內容雜湊才擋得住。
    if (seen) {
      const h = crypto.createHash('sha1').update(buf).digest('hex')
      if (seen.has(h)) return null
      seen.add(h)
    }

    /*
     * 已知不壓站標的來源：不偵測、不蓋 logo，只縮圖 + 蓋自家網址就上傳。
     * 對這種來源跑偵測只會製造誤判（詳見 NO_SITE_WATERMARK_SOURCES）。
     */
    if (isCleanSource(sourceUrl, imgUrl)) {
      if (role === 'body' && !(await bigEnoughForBody(buf))) return null
      const resized = await sharp(buf).resize(1600, null, { withoutEnlargement: true }).toBuffer()
      const webp = await sharp(await stampUrlWatermark(resized)).webp({ quality: 92 }).toBuffer()
      const key = `news/img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`
      return await r2Upload(key, webp, 'image/webp')
    }

    // 其餘來源不分來源一律檢查
    // 內容區只量原圖這一次，蓋完之後不能重量（白墊會跟留白邊連成一片）
    const box = await contentBox(buf)
    const found = await findWatermarkWithVision(buf, sourceUrl || imgUrl, box)
    if (found === null) return null   // 看不出來 = 不確定 → 不用這張

    const alwaysWatermarked = isWatermarkedSource(sourceUrl, imgUrl)
    if (found === 'none') {
      // 內文圖的尺寸下限：擋掉站方的小廣告橫幅（見 MIN_BODY_W 的說明）
      if (role === 'body' && !(await bigEnoughForBody(buf))) return null
      // 已知一定會壓浮水印的站卻回報乾淨 → 是漏看，不是真的乾淨
      if (alwaysWatermarked) return null
      // 來源圖多半只有 800px 寬（電擊、PR TIMES 都是），quality 82 壓完
      // 220KB → 44KB，放到內文的容器寬度就明顯糊掉。改成 92 並把上限拉到
      // 1600 —— withoutEnlargement 保證不會把小圖硬撐大，只是不再多壓一手
      // 先縮到最終尺寸再蓋浮水印 —— 字級是照圖寬算的，順序反了字會跟著縮
      const resized = await sharp(buf).resize(1600, null, { withoutEnlargement: true }).toBuffer()
      const webp = await sharp(await stampUrlWatermark(resized)).webp({ quality: 92 }).toBuffer()
      const key = `news/img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`
      return await r2Upload(key, webp, 'image/webp')
    }

    // 內文圖有浮水印就丟掉，不蓋也不複驗（省一次視覺呼叫）
    if (role === 'body') return null

    const branded = await brandCoverImage(buf, found)
    if (!branded) return null
    // 蓋完再驗一次：還看得到就是沒蓋乾淨（挑錯角、或浮水印比白墊大）
    if (!await verifyBrandedClean(branded, sourceUrl || imgUrl, box)) return null
    // 複驗過了才蓋自家網址：滿版文字會讓那道視覺複驗整張判成髒的
    const stamped = await sharp(await stampUrlWatermark(branded)).jpeg({ quality: 88 }).toBuffer()
    const key = `news/img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-gg.jpg`
    return await r2Upload(key, stamped, 'image/jpeg')
  } catch { return null }
}


/**
 * 標題分類 —— 比 Claude 的答案優先
 *
 * 「《直到你死去的那一天》一番賞登場！」被標成轉蛋（news id 26078565）：
 * 那篇從電擊ホビー（DIRECT_FEEDS，來源提示 figure）進來，Claude 回 gacha，
 * 而原本的規則是「只要 Claude 回的不是 toy 就照收」，所以沒人攔。
 *
 * 標題直接寫了品類的，那就是最強的訊號，不需要模型判斷 ——
 * 一篇標題有「一番賞」的文章不會是轉蛋新聞。順序照專一性排：
 * 一番賞 > 卡牌 > 轉蛋 > 盒玩（一番賞新聞常同時提到轉蛋與景品，先攔的贏）。
 *
 * 只吃標題、不吃內文：內文順帶提一句「同系列也有一番くじ」很常見，
 * 拿全文比對反而會把轉蛋新聞誤判成一番賞。
 */
function classifyByTitle(title: string): string | null {
  if (!title) return null
  if (/一番賞|一番くじ|ichiban ?kuji/i.test(title)) return 'ichiban'
  if (/ポケモンカード|ポケカ|遊戯王|遊戲王|デュエマ|デュエル・?マスターズ|ヴァイスシュヴァルツ|カードゲーム|トレカ|卡牌|卡包|新弾|新彈|TCG/i.test(title)) return 'tcg'
  if (/ガシャポン|ガチャポン|カプセルトイ|扭蛋|轉蛋/.test(title)) return 'gacha'
  if (/ブラインドボックス|盲盒|盒玩|ポップマート|POP ?MART|食玩/i.test(title)) return 'toy'
  return null
}

// Claude 回 general 時的關鍵字兜底分類
function classifyByKeywords(text: string): string | null {
  if (/一番賞|一番くじ/.test(text)) return 'ichiban'
  if (/ガシャポン|ガチャ|カプセル|扭蛋|轉蛋/.test(text)) return 'gacha'
  if (/ポケモンカード|ポケカ|遊戯王|デュエマ|ヴァイス|カードゲーム|卡牌|TCG|新弾/i.test(text)) return 'tcg'
  if (/景品|プライズ|フィギュア|公仔|手辦|模型|Figuarts|ROBOT魂|ねんどろいど|黏土人/i.test(text)) return 'figure'
  if (/ブラインドボックス|盲盒|盒玩|ポップマート|POP ?MART|食玩|ソフビ|軟膠|周邊|グッズ/i.test(text)) return 'toy'
  return null
}

/**
 * 三條取材路徑共用的最終分類。優先序：
 *   標題明講 > Claude 的判斷（非 toy）> 全文關鍵字 > 來源提示
 */
function pickCategory(
  draft: { category?: string; title?: string; tags?: string[] },
  titles: (string | undefined)[],
  fallback: string,
): string {
  for (const t of titles) {
    const byTitle = classifyByTitle(t ?? '')
    if (byTitle) return byTitle
  }
  if (draft.category && draft.category !== 'toy') return draft.category
  return classifyByKeywords(`${draft.title ?? ''} ${titles.join(' ')} ${(draft.tags ?? []).join(',')}`) ?? fallback
}

const BLOCKED_IMG_DOMAINS = [
  'google.com', 'googleapis.com', 'googleusercontent.com',
  'gstatic.com', 'ggpht.com', 'lh3.google', 'lh4.google',
  'news.google.', 'encrypted-tbn', 'facebook.com/images', 'facebook.com/tr', 'fbcdn.net',
]

function resolveImageUrl(imgUrl: string, pageUrl: string): string {
  if (!imgUrl) return ''
  if (imgUrl.startsWith('data:')) return ''
  if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
    if (BLOCKED_IMG_DOMAINS.some(d => imgUrl.includes(d))) return ''
    return imgUrl
  }
  try { return new URL(imgUrl, pageUrl).href } catch { return '' }
}

// Jina Reader API — 繞過反爬蟲，返回 Markdown（含圖片 URL）
async function fetchViaJina(url: string): Promise<string> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      signal: AbortSignal.timeout(15_000),
      headers: {
        'User-Agent': UA,
        'Accept': 'text/plain',
        'X-Return-Format': 'markdown',
      },
    })
    if (res.ok) return await res.text()
  } catch {
    // fetch 失敗，回傳空字串
  }
  return ''
}

// 從 Jina Markdown 提取第一張有效圖片
function extractImageFromJina(jinaText: string, pageUrl: string): string {
  // 格式: ![alt](url) 或 Image: url
  const patterns = [
    /!\[[^\]]*\]\((https?:\/\/[^)\s]{10,})\)/g,
    /Image:\s*(https?:\/\/\S+)/g,
    /Cover Image:\s*(https?:\/\/\S+)/g,
  ]
  for (const re of patterns) {
    let m: RegExpExecArray | null
    while ((m = re.exec(jinaText)) !== null) {
      const url = m[1].replace(/[)>\s]+$/, '')
      if (!url || BLOCKED_IMG_DOMAINS.some(d => url.includes(d))) continue
      if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(url) || url.includes('img') || url.includes('image') || url.includes('photo')) {
        return resolveImageUrl(url, pageUrl) || url
      }
    }
  }
  return ''
}

// Google News link → 실제 기사 URL（follow redirect）


// ─── 圖片下載至 R2 ───────────────────────────────────────────────────────────

async function downloadImageToR2(imgUrl: string): Promise<string | null> {
  // 嘗試多種 Referer 策略繞過 hotlink 保護
  const origin = (() => { try { return new URL(imgUrl).origin } catch { return '' } })()
  const strategies: Record<string, string>[] = [
    { 'Referer': origin, 'Origin': origin },
    { 'Referer': imgUrl },
    {},
  ]

  for (const extraHeaders of strategies) {
    try {
      const res = await fetch(imgUrl, {
        headers: {
          'User-Agent': UA,
          'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          'Accept-Language': 'ja,zh-TW;q=0.9,en;q=0.7',
          'Cache-Control': 'no-cache',
          ...extraHeaders,
        },
        signal: AbortSignal.timeout(12_000),
        redirect: 'follow',
      })
      if (!res.ok) continue
      const ct = res.headers.get('content-type') ?? ''
      // 接受 image/* 以及未明確 content-type 但確實為圖片的情況
      if (ct && !ct.startsWith('image/') && !ct.startsWith('application/octet-stream')) continue
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 3_000) continue  // 排除 tracking pixel（降至 3KB）
      // 嘗試從 magic bytes 判斷副檔名
      const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8
      const isPng  = buf[0] === 0x89 && buf[1] === 0x50
      const isWebp = buf.slice(8, 12).toString() === 'WEBP'
      const isGif  = buf.slice(0, 3).toString() === 'GIF'
      const ext = isJpeg ? 'jpg' : isPng ? 'png' : isWebp ? 'webp' : isGif ? 'gif' : 'jpg'
      const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`
      const key = `news/img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const uploaded = await r2Upload(key, buf, contentType)
      if (uploaded) return uploaded
    } catch { continue }
  }
  return null
}

// ─── Claude 改寫 ─────────────────────────────────────────────────────────────

interface ArticleDraft {
  title:    string
  summary:  string
  content:  string
  tags:     string[]
  category: string
  /** 主題正規化鍵「作品／角色或型號／商品型態」，見 subjectKey() */
  subject?: string
}

async function rewriteArticle(
  claude: Anthropic,
  rssTitle: string,
  rssDesc: string,
  articleBody: string,
  sourceUrl: string,
  defaultCategory: string,
): Promise<ArticleDraft | null> {
  const combined = [rssTitle, rssDesc, articleBody].filter(Boolean).join('\n').slice(0, 2000)
  if (!combined.trim()) return null

  const resp = await claude.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 1800,
    messages: [{
      role: 'user',
      content: `你是吉吉比（GGB）台灣線上轉蛋平台的內容編輯，負責篩選「商品發售情報」。

原始資訊：
${combined}

來源：${sourceUrl}
預設分類：${defaultCategory}

【嚴格篩選原則】
只接受以下類型，其他一律回傳 null：
✅ 新商品發售消息（轉蛋/一番賞/盒玩/卡牌/扭蛋/公仔景品 新品上市、預售、到貨）
✅ 商品情報曝光（新品圖片首公開、品項公開）
✅ 聯名商品、限定版發售情報
✅ **官方公布的商品內容**：收錄清單（checklist）、卡表、品項一覽、規格與售價說明 ——
   這些是商品情報，**不是**開箱心得。英文的「Set Review and Checklist」屬於這一類

直接 null 的情況（不接受）：
❌ 實體店鋪開幕、搬遷、促銷活動
❌ 公司業績、經營新聞、股價、授權合作消息
❌ 錦標賽、大會、比賽結果（除非是新卡牌發售）
❌ 玩家開箱、抽卡開箱心得（**個人抽到什麼**的心得才算；官方收錄清單不算）
❌ 市場分析、產業報告
❌ 商品已停售、絕版回憶文

【重寫要求 —— 務必遵守】
標題與內文都必須是**你自己重新撰寫的原創文字**，不可整句照抄原文。
來源若已是繁體中文（如玩具人、巴哈 GNN），更要留意：
請用不同的句型與敘述順序重組，不可只改幾個字就當作改寫。
商品名稱、品牌、系列名、發售日期、價格等事實資訊必須忠實保留，
但描述、評論、鋪陳一律用自己的話寫。

【品牌名不可張冠李戴】卡牌品牌各自獨立，**不可以把 A 品牌寫成 B 品牌**。
實際出過的錯：把 BANDAI 自家的「ユニオンアリーナ／UNION ARENA」寫成「遊戲王」——
那是完全不同公司的產品，玩家會被誤導。對照表（左邊出現時，右邊是唯一正確寫法）：
- ユニオンアリーナ／UNION ARENA → **UNION ARENA**（保留英文，不譯、不可叫遊戲王）
- 遊戯王／遊戲王 → 遊戲王
- ポケモンカード／ポケカ → 寶可夢卡牌
- ワンピースカードゲーム → 海賊王卡牌
- ヴァイスシュヴァルツ → Weiss Schwarz（保留英文）
- デュエル・マスターズ／デュエマ → 決鬥大師
不確定是哪個品牌時，**照原文保留，不要猜**。

【英文來源】球員名、隊名、聯盟名一律用**台灣慣用譯名**（Shohei Ohtani→大谷翔平、
Lakers→湖人、NBA／MLB 這種縮寫保留原文）。**產品線與商品名保留英文**
（Topps Chrome、Panini Prizm、Upper Deck —— 玩家就是用英文搜尋與交易的）。

【假名一律不留】標題與內文都不可出現平假名或片假名。台灣讀者看不懂
「ゾイド」「ズゴック」「ムチュート」「デク」這種字，看到只會直接跳過。
處理方式：
- 有台灣官方譯名就用官方譯名（ゾイド→索斯機獸、ズゴック→茲寇克、デク→出久）
- 沒有官方譯名但有官方英文/羅馬字就用英文（萬代的產品線名如 MASTERLISE、
  ichiban kuji 的英文標示等，台灣玩家本來就用英文搜尋）
- 兩者都沒有就音譯成中文
英文與數字可以保留，那不影響閱讀。

通過篩選後，改寫成繁體中文（台灣用語），輸出 JSON，只輸出 JSON 不加說明：
{
  "title": "吸引台灣玩家點擊的標題（繁體中文，25字以內，含商品名）",
  "summary": "一句話摘要，說明什麼商品、何時發售或上市（40字以內）",
  "content": "<h2>小標</h2><p>段落...</p><h2>小標</h2><p>段落...</p>（繁體中文，550-750字，4~5段並用 2~3 個 <h2> 分段，從玩家視角介紹：商品特色與造型細節、系列背景或角色亮點、發售與預購資訊、值得入手的理由；資訊不足處以既有內容延伸描述，不可捏造價格或日期）",
  "tags": ["品牌","系列名","類型"],
  "subject": "這篇在講的『那一件商品』，用半形斜線寫成三段：作品或系列/角色或型號/商品型態。全部繁體中文，**不含**通路名、發售日、價格、尺寸、版本或宣傳詞 —— 同一件商品被不同媒體或不同通路報導時必須產生完全相同的字串。例：無職轉生/艾莉絲/景品公仔、寶可夢卡牌/30週年紀念/抽選、UNION ARENA/BLEACH/新彈、鋼彈/RX-78-2/轉蛋",
  "category": "ichiban|gacha|tcg|figure|toy（figure＝公仔/景品/模型/プライズ；toy＝盒玩/盲盒/食玩/周邊商品/軟膠/展會；分不出來就用 toy。標題或內文寫明「一番賞／一番くじ」一律 ichiban，寫明卡牌／新彈／TCG 一律 tcg —— 這兩類不可退回 figure 或 gacha）"
}

若不符合篩選條件，直接回傳：null`,
    }],
  })

  const text = (resp.content[0] as any)?.text?.trim() ?? ''
  if (text === 'null' || !text) return null
  const m = text.match(/\{[\s\S]+\}/)
  if (!m) return null
  try { return JSON.parse(m[0]) as ArticleDraft }
  catch { return null }
}

/**
 * 把改寫結果台灣化（2026-08-29）
 *
 * 改寫 prompt 明明寫了「繁體中文（台灣用語）」，實跑還是會出簡體 ——
 * 同一個系列，一篇是「《阿卡納迪亞》惡魔型迪亞茲」、另一篇是
 * 「《阿卡那迪亚》露米提亚 1/6 比例手办彩色样品首展」。
 * 跟品牌張冠李戴一樣，**指示只降低機率，擋不住**。
 *
 * 但這件事跟品牌寫錯不一樣：**字體是可以修的，不該把整篇丟掉**
 *（老闆 2026-08-29：「簡體可以發啊，最好翻譯成繁體的，為什麼要不發？」）。
 * 改寫的錢已經付了，為了字形丟掉整篇不划算。
 *
 * 用 `toTaiwanProse()`（長文專用）而**不是**商品名那套 `normalizeToTaiwan()`：
 * 後者用 s2twp，`p` 是詞語轉換，套在繁體長文上會把「設計對象」改成「設計物件」、
 * 「風采」改成「風採」、「高級質感」改成「高階質感」—— 改壞比不改更糟。
 * 長文只換字 + 領域詞典（「手办」→「公仔」），排版一律不動。
 *
 * **在插圖之前跑**：那時 content 還沒有任何 R2 網址，不會誤傷連結。
 */
function taiwanize(draft: ArticleDraft): ArticleDraft {
  return {
    ...draft,
    title:   toTaiwanProse(draft.title),
    summary: toTaiwanProse(draft.summary),
    content: toTaiwanProse(draft.content),
    tags:    (draft.tags ?? []).map(t => toTaiwanProse(t)),
    // subject 是拿來當唯一鍵的，簡繁不統一會算成兩個不同的鍵、去重就失效
    subject: draft.subject ? toTaiwanProse(draft.subject) : undefined,
  }
}

/**
 * 主題正規化鍵 —— 標題相似度與封面雜湊都攔不到的那種重複，靠這個擋
 *
 * 老闆 2026-08-29 回報重複文章。實測那幾組的標題 Jaccard 是 0.29~0.40，
 * 門檻 0.55 全漏；但**不能只把門檻調低** —— 真的不同商品的
 * 「無職轉生/艾莉絲」vs「無職轉生/羅琪西亞」是 0.294，比真重複的
 * 「阿卡納迪亞/巴尼爾」vs「亞爾卡那迪亞/蕾菲爾卡」0.286 還高。
 * 字元 bigram 這個指標分不開「同一件商品」與「同一個系列」，設哪個門檻都會錯。
 * 642 的 cover_hash 也攔不到：官方同一則發表會發多張不同角度的照片。
 *
 * 所以改成問 Claude 要一個結構化的鍵（同一次呼叫多要一個欄位，成本是零），
 * 去掉標點與空白、轉小寫之後直接比對字串 —— 不是猜相似度，是比對同一件商品。
 *
 * 只有一段時回 null（例如模型只寫了「寶可夢」）：那太籠統，
 * 拿它當唯一鍵會把整個系列的新聞全擋掉。寧可漏擋也不要誤殺。
 */
function subjectKey(draft: ArticleDraft): string | null {
  const parts = (draft.subject ?? '')
    .split('/')
    .map(p => p.toLowerCase().replace(/[^0-9a-z\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff]/g, ''))
    .filter(Boolean)
  if (parts.length < 2) return null
  return parts.join('/')
}

// ─── 標題相似度去重 ──────────────────────────────────────────────────────────

const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff]/

/**
 * 標題切詞：拉丁字照空白切，中日文切成**兩字一組**
 *
 * 原本只有「照空白與標點切、留長度 ≥2 的詞」。拉丁語系沒問題，
 * **中文沒有空格，整句會變成一個 token** —— 於是：
 *
 *   「寶可夢卡牌30周年紀念商品追加抽選！御三家9種套組同步開放」
 *   「寶可夢卡牌30週年紀念商品 Yodobashi線上抽選販售」        → 相似度 0.000
 *   「寶可夢卡牌30週年…」vs「鬼滅之刃角色Q版公仔…」（完全無關）→ 相似度 0.000
 *
 * 兩篇講同一件事跟兩篇完全無關**分數一樣是 0**，這個指標對中文毫無鑑別力，
 * 等於中文標題的主題去重從來沒有生效過。
 *
 * 改成中日文取字元 bigram 之後才有分數（同題材 0.26~0.44、無關 0.00）。
 *
 * ⚠️ 但**光靠標題還是分不開「同商品不同通路」與「同系列不同商品」** ——
 * 實測前者 0.256、後者 0.442，要擋的反而比要留的低。
 * 那一類靠 `cover_hash`（封面原圖雜湊）擋，見 migration 642。
 */
function tokenize(title: string): Set<string> {
  const flat = title
    .toLowerCase()
    .replace(/[！？。、，【】「」『』《》〈〉・\-\s]+/g, ' ')

  const out = new Set<string>()
  for (const w of flat.split(' ')) {
    if (w.length >= 2 && !CJK_RE.test(w)) out.add(w)      // 拉丁詞、型號、英文品名
  }
  // 中日文與數字連成一串再切 bigram（去掉空白與標點，「30周年」才不會被切斷）
  const cjk = [...flat].filter(c => CJK_RE.test(c) || /[0-9a-z]/.test(c)).join('')
  for (let i = 0; i + 2 <= cjk.length; i++) out.add(cjk.slice(i, i + 2))
  return out
}

// Jaccard 相似度：兩組 token 交集 / 聯集
function jaccardSim(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  const inter = [...a].filter(t => b.has(t)).length
  const union  = new Set([...a, ...b]).size
  return inter / union
}

// ─── AI 留言生成 + 時間分布植入 ─────────────────────────────────────────────

const CATEGORY_TONE: Record<string, string> = {
  ichiban:  '一番賞景品，語氣可以興奮、期待、或喊衝',
  gacha:    '扭蛋/轉蛋商品，語氣可以可愛、期待、或問哪裡買',
  toy:      '盒玩/盲盒/食玩/周邊商品，語氣可以可愛、驚喜、或分享收藏心情',
  tcg:      '集換式卡牌，語氣可以討論強度、卡圖、或問價格',
  figure:   '公仔景品/模型，語氣可以讚嘆做工、討論比例、或喊要收',
  // 舊分類值保留對照，避免既有文章取不到語氣設定
  blindbox: '盒玩/盲盒商品，語氣可以可愛、驚喜、或分享收藏心情',
  general:  '周邊商品情報，語氣自然，依內容決定',
}

async function generateAndSeedComments(
  supabase: ReturnType<typeof import('@/lib/supabaseAdmin').getSupabaseAdmin>,
  claude: import('@anthropic-ai/sdk').default,
  newsId: string,
  title: string,
  summary: string,
  category: string,
): Promise<void> {
  try {
    // 防止重複種（若已有留言則跳過）
    const { count } = await supabase
      .from('news_comments')
      .select('*', { count: 'exact', head: true })
      .eq('news_id', newsId)
    if (count && count > 0) return

    const tone = CATEGORY_TONE[category] ?? CATEGORY_TONE.general
    const n    = 3 + Math.floor(Math.random() * 3) // 3~5 則
    const negCount = Math.random() < 0.7 ? 1 : 0  // 70% 機率有 1 則負面/酸民留言

    const msg = await claude.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content:
`你是台灣社群上各種類型的用戶混合體。根據以下文章，用台灣網友口吻寫 ${n} 則留言。

規則：
- 繁體中文，可加少量 emoji（最多 1 則加 emoji，其他不要加）
- 文章類型：${tone}
- 字數極短：絕大多數 1~8 個字元（如「好想要」「哇」「先等等」「有點貴」「衝了」「太可愛了」），偶爾 1 則最多 15 字元
- 不要寫完整句子，只寫短感嘆或反應
- 不要直接複製標題文字
- 必須包含 ${negCount} 則負面/酸民留言（如「沒興趣」「普通」「又貴了」「買不起」「太醜了」「早知道」「差評」「騙人的」），其他則正面或中性
- 只回傳 JSON array of strings，不含任何其他說明文字

標題：${title}
摘要：${summary.slice(0, 200)}`
      }]
    })

    const raw      = ((msg.content[0] as { text?: string }).text ?? '').trim()
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return
    const comments: string[] = JSON.parse(jsonMatch[0])
    if (!Array.isArray(comments) || comments.length === 0) return

    // 取隨機 bot 用戶
    const { data: bots } = await supabase
      .from('users')
      .select('id')
      .eq('is_bot', true)
      .limit(30)
    if (!bots?.length) return

    const shuffled = [...bots].sort(() => Math.random() - 0.5)
    const maxHours = 8 * 60 * 60 * 1000 // 8 小時分布

    // 生成並按時間排序（讓留言看起來是陸續出現的）
    const rows = comments
      .slice(0, Math.min(comments.length, shuffled.length))
      .map((content, i) => ({
        news_id:    newsId,
        user_id:    shuffled[i].id,
        content:    String(content).slice(0, 200),
        created_at: new Date(Date.now() - Math.random() * maxHours).toISOString(),
      }))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    await supabase.from('news_comments').insert(rows)
  } catch (err) {
    console.error('[news-agent] AI comment seed error:', err)
  }
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret') ?? ''
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const claude   = createClaude('news-agent', process.env.ANTHROPIC_API_KEY)

  // 已寫入的 source_url 集合（防重複 URL）
  const { data: existingRows } = await supabase
    .from('news')
    .select('source_url, title, created_at, image_url, category, cover_hash, subject_key')
    .not('source_url', 'is', null)
    .gte('created_at', new Date(Date.now() - 30 * 86400_000).toISOString())
  const existing      = new Set((existingRows ?? []).map((r: any) => r.source_url as string))
  /**
   * 近 30 天用過的封面原圖雜湊。同一張官方宣傳圖被兩篇不同來源文章用到，
   * 對玩家就是「同一則新聞出現兩次」（老闆 2026-08-29 回報的寶可夢那兩篇）。
   */
  const usedCoverHashes = new Set(
    (existingRows ?? []).map((r: any) => r.cover_hash as string | null).filter(Boolean) as string[],
  )
  /**
   * 近 14 天用過的主題鍵（migration 643）
   *
   * 標題相似度與封面雜湊都攔不到「同一件商品、不同媒體／不同角度照片」的重複，
   * 見 subjectKey() 的說明。窗口比 cover_hash 的 30 天短 —— 同一件商品隔了兩週
   * 再有新消息（開放預購、發售當天）是合理的續報，不該被自己的舊文擋掉。
   */
  const usedSubjectKeys = new Set(
    (existingRows ?? [])
      .filter((r: any) => new Date(r.created_at ?? 0).getTime() > Date.now() - 14 * 86400_000)
      .map((r: any) => r.subject_key as string | null)
      .filter(Boolean) as string[],
  )
  // 近 7 天標題的 token set，用於主題去重
  const recentTitles  = (existingRows ?? [])
    .filter((r: any) => new Date(r.created_at ?? 0).getTime() > Date.now() - 7 * 86400_000)
    .map((r: any) => tokenize(r.title ?? ''))
  /**
   * 各來源網域最近一篇的發佈時間 —— 給 DIRECT_FEEDS 的 minIntervalHours 用
   *
   * 不另外存狀態：news 表本身就是進度表，跟分類配額用 last24h 是同一個思路。
   */
  const lastPostAtByHost = new Map<string, number>()
  for (const r of (existingRows ?? []) as any[]) {
    let host = ''
    try { host = new URL(r.source_url).hostname.replace(/^www\./, '') } catch { continue }
    const t = new Date(r.created_at ?? 0).getTime()
    if (!host || isNaN(t)) continue
    if (t > (lastPostAtByHost.get(host) ?? 0)) lastPostAtByHost.set(host, t)
  }

  // 歷史上成功抓到圖片的來源域名（優先處理）
  const trustedDomains = new Set(
    (existingRows ?? [])
      .filter((r: any) => r.image_url)
      .map((r: any) => { try { return new URL(r.source_url).hostname } catch { return '' } })
      .filter(Boolean)
  )
  // 本次 session 已寫入的標題也加入比對（防止同一次跑多篇同主題）
  const sessionTitles: Set<string>[] = []

  function isDuplicateTopic(newTitle: string): boolean {
    const tokens = tokenize(newTitle)
    return [...recentTitles, ...sessionTitles].some(t => jaccardSim(tokens, t) >= 0.55)
  }

  /**
   * 改寫「之前」先用來源標題擋掉重複主題
   *
   * 原本只在改寫後比對重寫標題，等於重複文章已經燒掉一次 Claude 呼叫。
   * 來源標題與既有文章高度重疊時直接跳過，不進改寫流程。
   * 門檻放寬到 0.45：來源標題與我方改寫後的標題本就不會完全一致，
   * 太嚴會擋不掉；真的誤擋也還有後面的正式比對兜底。
   */
  function isDuplicateSource(rawTitle: string): boolean {
    if (!rawTitle) return false
    const tokens = tokenize(rawTitle)
    if (tokens.size === 0) return false
    return [...recentTitles, ...sessionTitles].some(t => jaccardSim(tokens, t) >= 0.45)
  }

  const body = await req.json().catch(() => ({}))
  const limitOverride: number | undefined = typeof body?.limit === 'number' ? body.limit : undefined

  const results = { written: 0, skipped: 0, errors: 0, articles: [] as string[], skipReasons: { duplicate: 0, noHtml: 0, noImage: 0, claudeReject: 0, titleDup: 0, insertErr: 0, wmUnsafe: 0, logoCover: 0, catQuota: 0, selfPromo: 0, adLeak: 0, throttled: 0, brandMix: 0, coverDup: 0, subjectDup: 0 } }
  const DEADLINE     = Date.now() + 240_000  // 最多跑 4 分鐘
  /*
   * 每次全局上限（手動觸發可傳 limit 覆寫）
   *
   * 老闆 2026-08-29 從 3 調到 5。**實際產量不是 20 篇/天而是 15** ——
   * 下面的 DAILY_PER_CATEGORY = 3 才是真正的天花板（5 個分類 × 3）。
   * 老闆指定「其他不動」，所以那個維持 3。
   * 實測成本：滿產 12 篇/天約 US$0.30，每篇約 US$0.026 → 15 篇/天約 US$11/月。
   */
  const MAX_TOTAL    = limitOverride ?? 5
  const MAX_PER_QUERY = limitOverride === 1 ? 1 : 2

  /**
   * 分類配額 —— 一番賞與卡牌長期掛零的原因
   *
   * 原本來源是照固定順序跑、寫滿 MAX_TOTAL 就 break，而前面幾組**來源分類全是
   * figure**，一番賞與卡牌只存在於最後一組 —— 前面先把額度用完，後面等於從來沒
   * 跑到。近 14 天實際比例：figure 95、toy 28、gacha 28、ichiban 2、tcg 2。
   * 不是抓不到，是根本沒輪到。
   *
   * 兩件事一起做：
   *   1. 同一分類一次最多 1 篇（3 篇＝三個不同分類），figure 吃不完整場
   *   2. 來源組照「近 7 天誰最少」排序 —— 不寫死輪值表，DB 就是進度表
   */
  const CATEGORIES = ['ichiban', 'tcg', 'gacha', 'figure', 'toy']
  const countSince = (ms: number) => {
    const out: Record<string, number> = {}
    for (const r of (existingRows ?? []) as any[]) {
      if (new Date(r.created_at ?? 0).getTime() < Date.now() - ms) continue
      const c = String(r.category ?? 'toy')
      out[c] = (out[c] ?? 0) + 1
    }
    return out
  }
  const last24h = countSince(86400_000)
  const last7d  = countSince(7 * 86400_000)

  // 排序看近 24 小時（當天輪替），同分再看近 7 天（長期落後的先補）
  const categoryRank = new Map(
    [...CATEGORIES]
      .sort((a, b) =>
        ((last24h[a] ?? 0) - (last24h[b] ?? 0)) || ((last7d[a] ?? 0) - (last7d[b] ?? 0))
      )
      .map((c, i) => [c, i] as const)
  )

  /**
   * 兩層額度（數字以下面的常數為準，這段只解釋為什麼）：
   *   單次 —— 一場最多 MAX_TOTAL 篇，同一分類最多 MAX_PER_CATEGORY 篇
   *           → 5 篇至少橫跨三個分類（2+2+1），figure 吃不完整場
   *   單日 —— 任一分類近 24 小時滿 DAILY_PER_CATEGORY 篇就讓位，
   *           把剩下的場次讓給還沒補到的分類
   *
   * 真正的天花板是**單日那層**：5 分類 × 3 = 15 篇/天，不是 4 場 × 5 = 20 篇。
   * 排程跑滿一天會收斂成各分類 3 篇上下（來源夠的話）。
   */
  /**
   * ⚠️ 這兩個常數在 2026-08-29 改過，改的理由要看懂再動：
   *
   * 老闆當天回報「最新幾篇公仔景品佔多數」。查 PROD 的實際產出，排程自己跑的
   * 那四場（02/08/14/20）分類是有輪的；灌爆的是**手動觸發**的那幾場 ——
   * 15:00 / 16:00 / 17:00 都不是排程時段，16:00 一場就寫了 11 篇 figure。
   *
   * 兩個原因疊在一起：
   *   1. 單日上限原本寫 `limitOverride === undefined && ...`，
   *      **手動帶 limit 時整條被跳過**（本意是「測試時不要一篇都寫不出來」）
   *   2. 單次上限原本是 `ceil(MAX_TOTAL / 3)`，**會跟著 limit 一起放大** ——
   *      limit 傳 18，figure 一場就能拿 6 篇
   * 而 figure 的來源數（HobbyWatch／PRTimes／GNN-TW／ToyPeople 首頁…）本來就
   * 遠多於其他四類，閘門一開就是它灌滿。
   *
   * 改法：手動觸發**放寬**成兩倍而不是解除（測試照樣寫得出東西，但不會灌爆），
   * 單次上限鎖死 2 不跟 limit 走。
   */
  const DAILY_PER_CATEGORY = limitOverride === undefined ? 3 : 6
  const MAX_PER_CATEGORY = 2
  const catWritten: Record<string, number> = {}
  const quotaFull = (c: string) =>
    (catWritten[c] ?? 0) >= MAX_PER_CATEGORY ||
    (last24h[c] ?? 0) + (catWritten[c] ?? 0) >= DAILY_PER_CATEGORY

  const runHtmlSources = async () => {
    for (const src of HTML_SOURCES) {
      if (Date.now() > DEADLINE || results.written >= MAX_TOTAL) break

      const listHtml = await fetchText(src.url, 10_000)
      if (!listHtml) { results.errors++; continue }

      for (const realUrl of src.extract(listHtml).slice(0, 8)) {
        if (Date.now() > DEADLINE || results.written >= MAX_TOTAL) break
        if (existing.has(realUrl)) { results.skipped++; results.skipReasons.duplicate++; continue }

        const articleHtml = await fetchText(realUrl, 10_000)
        if (!articleHtml) { results.skipped++; results.skipReasons.noHtml++; continue }

        // 來源有自訂取圖規則就只認它（Union Arena 的 og:image 是站台通用橫幅，
        // 退回預設等於拿站標當封面）
        const ogImage = src.pickCover
          ? resolveImageUrl(src.pickCover(articleHtml), realUrl)
          : (resolveImageUrl(extractOgImage(articleHtml), realUrl)
             || resolveImageUrl(extractBodyImage(articleHtml), realUrl))
        if (!ogImage) { results.skipped++; results.skipReasons.noImage++; continue }
        // 站方拿自家 logo 當 og:image → 這篇不發，換下一篇（老闆指定）
        if (!(await isUsableCover(ogImage))) { results.skipped++; results.skipReasons.logoCover++; continue }
        // 同一張官方宣傳圖 = 同一則新聞，換個通路寫一次不該再發一篇（migration 642）
        const coverHash = await coverHashOf(ogImage)
        if (coverHash && usedCoverHashes.has(coverHash)) {
          results.skipped++; results.skipReasons.coverDup++; continue
        }

        const title = extractMeta(articleHtml, 'og:title') || ''
        const desc  = extractMeta(articleHtml, 'og:description') || ''
        const bodyText = extractArticleText(articleHtml)

        if (isDuplicateSource(title)) { results.skipped++; results.skipReasons.titleDup++; continue }
        if (quotaFull(classifyByTitle(title) ?? src.category)) { results.skipped++; results.skipReasons.catQuota++; continue }

        let draft = await rewriteArticle(claude, title, desc, bodyText, realUrl, src.category)
        if (!draft) { results.skipped++; results.skipReasons.claudeReject++; continue }
        draft = taiwanize(draft)   // 簡體轉繁 + 台灣用語（見 taiwanize 的說明）
        if (isDuplicateTopic(draft.title)) { results.skipped++; results.skipReasons.titleDup++; continue }
        // 品牌張冠李戴：模型偶爾會把 UNION ARENA 寫成遊戲王，程式層再擋一次
        if (hasBrandMixup(realUrl, draft.title, draft.summary, draft.content)) {
          results.skipped++; results.skipReasons.brandMix++; continue
        }

        // 每張圖都驗浮水印，轉存不成功就整篇不發（老闆規則：百分之百不要
        // 看到別人的 logo）。原本會退回 ogImage hotlink —— 那等於把沒驗過的
        // 原圖直接端到玩家面前，是這條路最後一個漏洞
        const seenImages = new Set<string>()
        const hostedCover = await downloadSmartToR2(ogImage, false, realUrl, seenImages)
        if (!hostedCover) { results.skipped++; results.skipReasons.wmUnsafe++; continue }
        const imageUrl = hostedCover
        // 玩具人是直接解析列表頁抓連結，沒有 RSS 可退，articleHtml 抓不到就沒有內文圖
        const contentWithImages = await injectBodyImages(draft.content, articleHtml, ogImage, realUrl, false, seenImages)
        const finalCategory = pickCategory(draft, [draft.title, title], src.category)
        /* 改寫後才知道**真正**的分類與主題，這裡再擋一次：
           · 分類：quotaFull() 前面是用來源提示與原標題「猜」的，改寫後 pickCategory
             可能判成別的分類 —— 猜成 tcg 過關、寫出來卻是 figure，figure 的配額就漏了
           · 主題：subjectKey 只有改寫後才拿得到（見它的說明）
           兩個都是花完 Claude 呼叫之後才知道，但寧可丟掉一次呼叫也不要讓版面失衡或重複。 */
        if (quotaFull(finalCategory)) { results.skipped++; results.skipReasons.catQuota++; continue }
        const subjKey = subjectKey(draft)
        if (subjKey && usedSubjectKeys.has(subjKey)) { results.skipped++; results.skipReasons.subjectDup++; continue }

        const id = Math.floor(10000000 + Math.random() * 90000000).toString()
        const { error } = await supabase.from('news').insert({
          id, title: draft.title, summary: draft.summary, content: contentWithImages,
          image_url: imageUrl, source_url: realUrl,
          category: finalCategory, tags: draft.tags ?? [], is_active: !!imageUrl, cover_hash: coverHash, subject_key: subjKey,
        })
        if (!error) {
          results.written++
          catWritten[finalCategory] = (catWritten[finalCategory] ?? 0) + 1
          results.articles.push(`[${src.label}] ${draft.title}`)
          existing.add(realUrl)
          if (coverHash) usedCoverHashes.add(coverHash)
          if (subjKey) usedSubjectKeys.add(subjKey)
          sessionTitles.push(tokenize(draft.title))
          await generateAndSeedComments(supabase, claude, id, draft.title, draft.summary, finalCategory)
          void supabase.rpc('seed_bot_engagement_for_article', { p_news_id: id }).then(null, () => {})
          await new Promise(r => setTimeout(r, 300))
        } else {
          results.errors++; results.skipReasons.insertErr++
          console.error('[news-agent] insert error:', error.message)
        }
      }
    }
  }

  /**
   * oneone 宇宙 —— 繁中來源，圖是廠商官方原圖（老闆 2026-08-29 指定）
   *
   * 流程跟其他來源一樣，多了四道只有這個來源需要的關卡（理由見檔案上方
   * ONEONE_FEED 那段的說明）：
   *   1. 標題出現 oneone → 那是他們自家平台公告，不是商品情報
   *   2. 分類掛到 線上抽／集團動態 → 同上
   *   3. 封面**只認 upload/featured/**，og:image 不合就跳過，
   *      不退回掃 <img>（掃到的第一張很可能是紅底商城 banner）
   *   4. 改寫完再比對一次商城字樣，還留著就整篇不發
   */
  const runOneOne = async () => {
    if (Date.now() > DEADLINE || results.written >= MAX_TOTAL) return

    const xml = await fetchText(ONEONE_FEED, 12_000)
    if (!xml) { results.errors++; return }

    for (const item of parseRss(xml).slice(0, ONEONE_SCAN)) {
      if (Date.now() > DEADLINE || results.written >= MAX_TOTAL) break

      const realUrl = item.link
      if (!realUrl || existing.has(realUrl)) { results.skipped++; results.skipReasons.duplicate++; continue }
      // 他們自家平台的公告（「oneone LITE 快抽選開幕」那種）從標題就擋掉，省一趟 fetch
      if (ONEONE_AD_RE.test(item.title)) { results.skipped++; results.skipReasons.selfPromo++; continue }
      if (isDuplicateSource(item.title)) { results.skipped++; results.skipReasons.titleDup++; continue }

      const articleHtml = await fetchText(realUrl, 12_000)
      if (!articleHtml) { results.skipped++; results.skipReasons.noHtml++; continue }
      if (oneOneCategoryIds(articleHtml).some(id => ONEONE_SKIP_CATEGORY.has(id))) {
        results.skipped++; results.skipReasons.selfPromo++; continue
      }

      const ogImage = extractOgImage(articleHtml)
      if (!isOneOneCoverUrl(ogImage)) { results.skipped++; results.skipReasons.noImage++; continue }
      if (!(await isUsableCover(ogImage))) { results.skipped++; results.skipReasons.logoCover++; continue }
      // 同一張官方宣傳圖 = 同一則新聞，換個通路寫一次不該再發一篇（migration 642）
      const coverHash = await coverHashOf(ogImage)
      if (coverHash && usedCoverHashes.has(coverHash)) {
        results.skipped++; results.skipReasons.coverDup++; continue
      }

      const srcCategory = oneOneCategory(articleHtml, 'toy')
      if (quotaFull(classifyByTitle(item.title) ?? srcCategory)) { results.skipped++; results.skipReasons.catQuota++; continue }

      const bodyText = oneOneBodyText(articleHtml)
      let draft = await rewriteArticle(claude, item.title, item.description, bodyText, realUrl, srcCategory)
      if (!draft) { results.skipped++; results.skipReasons.claudeReject++; continue }
      draft = taiwanize(draft)   // 簡體轉繁 + 台灣用語（見 taiwanize 的說明）
      if (isDuplicateTopic(draft.title)) { results.skipped++; results.skipReasons.titleDup++; continue }
      // 品牌張冠李戴：模型偶爾會把 UNION ARENA 寫成遊戲王，程式層再擋一次
      if (hasBrandMixup(realUrl, draft.title, draft.summary, draft.content)) {
        results.skipped++; results.skipReasons.brandMix++; continue
      }
      // 改寫後複驗：對手商城字樣一句都不能漏到我們的情報頁
      if ([draft.title, draft.summary, draft.content].some(t => ONEONE_AD_RE.test(t ?? ''))) {
        results.skipped++; results.skipReasons.adLeak++; continue
      }

      const seenImages = new Set<string>()
      const hostedCover = await downloadSmartToR2(ogImage, false, realUrl, seenImages)
      if (!hostedCover) { results.skipped++; results.skipReasons.wmUnsafe++; continue }
      const contentWithImages = await injectBodyImages(
        draft.content, articleHtml, ogImage, realUrl, false, seenImages, extractOneOneBodyImages,
      )
      const finalCategory = pickCategory(draft, [draft.title, item.title], srcCategory)
      /* 改寫後才知道**真正**的分類與主題，這裡再擋一次：
         · 分類：quotaFull() 前面是用來源提示與原標題「猜」的，改寫後 pickCategory
           可能判成別的分類 —— 猜成 tcg 過關、寫出來卻是 figure，figure 的配額就漏了
         · 主題：subjectKey 只有改寫後才拿得到（見它的說明）
         兩個都是花完 Claude 呼叫之後才知道，但寧可丟掉一次呼叫也不要讓版面失衡或重複。 */
      if (quotaFull(finalCategory)) { results.skipped++; results.skipReasons.catQuota++; continue }
      const subjKey = subjectKey(draft)
      if (subjKey && usedSubjectKeys.has(subjKey)) { results.skipped++; results.skipReasons.subjectDup++; continue }

      const id = Math.floor(10000000 + Math.random() * 90000000).toString()
      const { error } = await supabase.from('news').insert({
        id, title: draft.title, summary: draft.summary, content: contentWithImages,
        image_url: hostedCover, source_url: realUrl,
        category: finalCategory, tags: draft.tags ?? [], is_active: !!hostedCover, cover_hash: coverHash, subject_key: subjKey,
      })
      if (!error) {
        results.written++
        catWritten[finalCategory] = (catWritten[finalCategory] ?? 0) + 1
        results.articles.push(`[oneone] ${draft.title}`)
        existing.add(realUrl)
        if (coverHash) usedCoverHashes.add(coverHash)
        if (subjKey) usedSubjectKeys.add(subjKey)
        sessionTitles.push(tokenize(draft.title))
        await generateAndSeedComments(supabase, claude, id, draft.title, draft.summary, finalCategory)
        void supabase.rpc('seed_bot_engagement_for_article', { p_news_id: id }).then(null, () => {})
        await new Promise(r => setTimeout(r, 300))
      } else {
        results.errors++; results.skipReasons.insertErr++
        console.error('[news-agent] insert error:', error.message)
      }
    }
  }

  const runDirectFeeds = async () => {
    for (const feed of DIRECT_FEEDS) {
      if (Date.now() > DEADLINE || results.written >= MAX_TOTAL) break

      // 節流的來源：距離上一篇還不夠久就整個跳過，連 feed 都不用抓
      if (feed.minIntervalHours) {
        let host = ''
        try { host = new URL(feed.url).hostname.replace(/^www\./, '') } catch { host = '' }
        const last = host ? lastPostAtByHost.get(host) ?? 0 : 0
        if (last && Date.now() - last < feed.minIntervalHours * 3600_000) {
          results.skipped++; results.skipReasons.throttled++
          continue
        }
      }

      const xml = await fetchText(feed.url)
      if (!xml) { results.errors++; continue }

      const rawItems = parseRss(xml)
        .filter(it => isRecent(it.pubDate, feed.maxAgeDays ?? 3))     // 預設只抓 3 天內，低頻來源自訂
        .filter(it => !feed.titleFilter || feed.titleFilter.test(it.title))  // 綜合型 feed 先用標題濾題材
        .filter(it => !feed.titleSkip   || !feed.titleSkip.test(it.title))   // 自家廣告、投資文先擋掉
      const items = rawItems.sort((a, b) => {
        const da = (() => { try { return new URL(a.link).hostname } catch { return '' } })()
        const db = (() => { try { return new URL(b.link).hostname } catch { return '' } })()
        return (trustedDomains.has(db) ? 1 : 0) - (trustedDomains.has(da) ? 1 : 0)
      })
      for (const item of items) {
        if (Date.now() > DEADLINE || results.written >= MAX_TOTAL) break

        const realUrl = item.link
        if (!realUrl || existing.has(realUrl)) { results.skipped++; results.skipReasons.duplicate++; continue }
        // 配額檢查放在抓文章之前 —— RSS 標題就足夠判斷，額度滿了不必付一趟 fetch
        if (quotaFull(classifyByTitle(item.title) ?? feed.category)) { results.skipped++; results.skipReasons.catQuota++; continue }

        const articleHtml = await fetchText(realUrl, 15_000)
        let ogImage = articleHtml
          ? (resolveImageUrl(extractOgImage(articleHtml), realUrl) || resolveImageUrl(extractBodyImage(articleHtml), realUrl))
          : resolveImageUrl(item.rssImage, realUrl)
        let jinaText = ''
        if (!ogImage) {
          jinaText = await fetchViaJina(realUrl)
          if (jinaText) ogImage = extractImageFromJina(jinaText, realUrl)
        }
        // 沒有真實圖片 → 直接跳過，不呼叫 Claude，省 token
        if (!ogImage) { results.skipped++; results.skipReasons.noImage++; continue }
        // 站方拿自家 logo 當 og:image → 這篇不發，換下一篇（老闆指定）
        if (!(await isUsableCover(ogImage))) { results.skipped++; results.skipReasons.logoCover++; continue }
        // 同一張官方宣傳圖 = 同一則新聞，換個通路寫一次不該再發一篇（migration 642）
        const coverHash = await coverHashOf(ogImage)
        if (coverHash && usedCoverHashes.has(coverHash)) {
          results.skipped++; results.skipReasons.coverDup++; continue
        }

        const bodyText = articleHtml
          ? extractArticleText(articleHtml)
          : (jinaText || item.description).slice(0, 1500)

        if (isDuplicateSource(item.title)) { results.skipped++; results.skipReasons.titleDup++; continue }

        let draft = await rewriteArticle(claude, item.title, item.description, bodyText, realUrl, feed.category)
        if (!draft) { results.skipped++; results.skipReasons.claudeReject++; continue }
        draft = taiwanize(draft)   // 簡體轉繁 + 台灣用語（見 taiwanize 的說明）
        if (isDuplicateTopic(draft.title)) { results.skipped++; results.skipReasons.titleDup++; continue }
        // 品牌張冠李戴：模型偶爾會把 UNION ARENA 寫成遊戲王，程式層再擋一次
        if (hasBrandMixup(realUrl, draft.title, draft.summary, draft.content)) {
          results.skipped++; results.skipReasons.brandMix++; continue
        }

        const isWatermarked = WATERMARKED_SOURCES.some(d => realUrl.includes(d) || ogImage.includes(d))
        // 封面與內文圖共用同一條路徑：每張都用 Claude 視覺驗浮水印，
        // 有就蓋 GGB logo 再驗一次確認蓋乾淨了
        // 同一篇文章共用一份已處理清單，封面先進去，內文圖就不會重複處理同一張
        const seenImages = new Set<string>()
        const hostedCover = await downloadSmartToR2(ogImage, isWatermarked, realUrl, seenImages)
        // 轉存不成功 = 沒驗過或沒蓋乾淨 → 整篇不發，不退回原圖 hotlink
        if (!hostedCover) { results.skipped++; results.skipReasons.wmUnsafe++; continue }
        const imageUrl = hostedCover
        const finalCategory = pickCategory(draft, [draft.title, item.title], feed.category)
        /* 改寫後才知道**真正**的分類與主題，這裡再擋一次：
           · 分類：quotaFull() 前面是用來源提示與原標題「猜」的，改寫後 pickCategory
             可能判成別的分類 —— 猜成 tcg 過關、寫出來卻是 figure，figure 的配額就漏了
           · 主題：subjectKey 只有改寫後才拿得到（見它的說明）
           兩個都是花完 Claude 呼叫之後才知道，但寧可丟掉一次呼叫也不要讓版面失衡或重複。 */
        if (quotaFull(finalCategory)) { results.skipped++; results.skipReasons.catQuota++; continue }
        const subjKey = subjectKey(draft)
        if (subjKey && usedSubjectKeys.has(subjKey)) { results.skipped++; results.skipReasons.subjectDup++; continue }
        const id = Math.floor(10000000 + Math.random() * 90000000).toString()
        // 內文配圖。這條路徑（DIRECT_FEEDS：電擊ホビー / PR TIMES / Animate Times）
        // 原本完全沒有這一步 —— 另外兩條有，只有這條漏了。
        // 而 485 篇文章裡有 359 篇是走這條進來的，所以「內文都沒有圖」看起來像
        // 功能沒做，其實是主力來源那條路徑根本沒接上。
        // articleHtml 抓不到就退回 RSS 的 content:encoded，跟 Google News 那條一致。
        const contentWithImages = await injectBodyImages(
          draft.content, articleHtml || item.rssHtml, ogImage, realUrl, isWatermarked, seenImages
        )

        const { error } = await supabase.from('news').insert({
          id, title: draft.title, summary: draft.summary, content: contentWithImages,
          image_url: imageUrl, source_url: realUrl,
          category: finalCategory, tags: draft.tags ?? [], is_active: !!imageUrl, cover_hash: coverHash, subject_key: subjKey,
        })
        if (!error) {
          results.written++
          catWritten[finalCategory] = (catWritten[finalCategory] ?? 0) + 1
          // 讓 minIntervalHours 在同一輪內也生效 —— 少了這步，節流只擋得住
          // 「跨輪」，一輪裡分類名額有幾個它就發幾篇（實測老闆只要兩篇卻發了三篇）
          try {
            const h = new URL(feed.url).hostname.replace(/^www\./, '')
            if (h) lastPostAtByHost.set(h, Date.now())
          } catch { /* 網址壞掉就算了，節流失效比整篇不發好 */ }
          results.articles.push(`[${feed.label}] ${draft.title}`)
          existing.add(realUrl); sessionTitles.push(tokenize(draft.title))
          // 這條路徑原本漏了下面兩行：同一場跑裡第二篇撞到同一張封面／同一個主題時擋不到
          if (coverHash) usedCoverHashes.add(coverHash)
          if (subjKey) usedSubjectKeys.add(subjKey)
          await generateAndSeedComments(supabase, claude, id, draft.title, draft.summary, finalCategory)
          void supabase.rpc('seed_bot_engagement_for_article', { p_news_id: id }).then(null, () => {})
        } else if (error.code === '23505') {
          results.skipped++; results.skipReasons.duplicate++
        } else {
          results.errors++
        }
        await new Promise(r => setTimeout(r, 300))
      }
    }
  }


  /**
   * 來源組的執行順序照「現在最缺哪一類」決定，不是寫死的。
   *
   * 每跑完一組就重排一次：哪一組供得出「目前最落後的分類」，哪一組先上。
   * cats 要照實列，寫了供不出來的分類，那一組會永遠排第一卻交不出東西。
   *
   * Google News 那組已於 2026-08-29 移除（老闆指定），理由見檔案上方的說明。
   * `tcg` 改由 inside-games（多品牌卡牌新聞）＋ Union Arena（萬代官方，單一品牌）
   * 供稿。球員卡目前沒有來源 —— 日本 ACG 媒體幾乎不報，要另找專門來源。
   */
  const groups = [
    // oneone 供得出一番賞／扭蛋／公仔／盒玩四類
    { cats: ['ichiban', 'gacha', 'figure', 'toy'],       run: runOneOne      },
    // 玩具人（繁中）＋ Union Arena（官方卡牌）
    { cats: ['toy', 'figure', 'tcg'],                    run: runHtmlSources },
    // ホビーウォッチ（figure/ichiban/tcg/toy）＋ inside-games（tcg）＋ PRTimes／GNN
    { cats: ['figure', 'ichiban', 'tcg', 'toy'],         run: runDirectFeeds },
  ]
  const groupRank = (g: { cats: string[] }) => {
    const open = g.cats.filter(c => !quotaFull(c)).map(c => categoryRank.get(c) ?? 99)
    return open.length ? Math.min(...open) : 99   // 全滿的組排最後
  }
  while (groups.length > 0 && results.written < MAX_TOTAL && Date.now() < DEADLINE) {
    groups.sort((a, b) => groupRank(a) - groupRank(b))
    await groups.shift()!.run()
  }


  return NextResponse.json({ ok: true, ...results, byCategory: catWritten, last24h })
}
