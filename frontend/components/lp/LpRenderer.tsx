'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Share2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import ProductCard from '@/components/ProductCard'
import { scheduleState } from '@/lib/schedule'
import { TopFadeBlur } from '@/components/ui/TopFadeBlur'
import { useStatusBarText } from '@/components/native/StatusBarStyle'
import { asset } from '@/lib/asset';

const LP_LOADING_CHARS = [
  asset('/loading/1.webp'), asset('/loading/2.webp'), asset('/loading/3.webp'), asset('/loading/4.webp'),
  asset('/loading/5.webp'), asset('/loading/6.webp'), asset('/loading/7.webp'), asset('/loading/8.webp'),
]

function LpLoadingScreen({ bg }: { bg?: string }) {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % LP_LOADING_CHARS.length), 400)
    return () => clearInterval(t)
  }, [])
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: bg || '#0a0610', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <div style={{ width: 80, height: 90, position: 'relative' }}>
        <AnimatePresence mode="wait">
          <motion.div key={idx} style={{ position: 'absolute', inset: 0 }}
            initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.1, ease: 'easeOut' }}>
            <motion.img src={LP_LOADING_CHARS[idx]} width={80} height={90} alt=""
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              animate={{ y: [0, -10, 0] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }} />
          </motion.div>
        </AnimatePresence>
      </div>
      <motion.span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.15em', color: 'rgba(255,255,255,.4)' }}
        animate={{ y: [0, -6, 0] }} transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}>
        載入中
      </motion.span>
    </div>
  )
}

interface EventData {
  id: string; slug: string; title: string
  bg_color: string; accent_color: string
  is_active: boolean; start_at: string | null; end_at: string | null
  linked_category_id: string | null
  theme_mode: 'dark' | 'light'
  /** 首屏配色：dark 固定深色（預設）／light 固定淺色／follow 跟隨 theme_mode */
  hero_mode?: 'dark' | 'light' | 'follow'
}
interface Prize { id: number; level: string; name: string; image_url: string | null; total: number; remaining: number; probability: number; recycle_value: number | null }
interface Section {
  id: string; type: string; sort_order: number
  content: Record<string, unknown>
  resolved?: { product: { id: number; name: string; type?: string } | null; prizes: Prize[] }
}

/**
 * 把 preset 補成跟 API 回傳一樣的形狀。
 *
 * 下游有幾處拿 `section.id` 當 React key、`event.id` 做分享網址，
 * 少了會是 undefined key（同型別區塊重複時 React 會警告並可能錯位重用 DOM）。
 * 這裡用 slug + 索引補齊，preset 是靜態的，值穩定不會跳動。
 */
function normalizePreset(p: LpPreset): { event: EventData; sections: Section[] } {
  return {
    event: { ...p.event, id: p.event.id ?? `preset-${p.event.slug}` } as EventData,
    sections: p.sections.map((s, i) => ({
      ...s,
      id: s.id ?? `${p.event.slug}-${i}`,
      sort_order: s.sort_order ?? i,
    })) as Section[],
  }
}

const str = (v: unknown): string => (v as string) ?? ''
const bool = (v: unknown): boolean => !!(v)

/**
 * 內文的重點標記：`**這幾個字**` 會上主題色並加粗。
 *
 * 長段落全是同一種灰字時，玩家會整段跳過。與其把整段改亮（那等於沒有重點），
 * 不如讓後台在文案裡自己標 —— 標哪裡是文案的事，不該寫死在元件裡。
 */
/**
 * `**強調**` → 主題色（.lpv-em）；`!!警示!!` → 紅色（.lpv-warn）
 *
 * 兩種標記都只是「這幾個字要有顏色」，沒有其他語意。紅色那組是後來加的：
 * 公平性頁要把「驗證不通過」標紅，主題色那組全部是同一個綠，分不出正反。
 */
function emphasize(text: string): React.ReactNode {
  if (!text.includes('**') && !text.includes('!!')) return text
  return text.split(/\*\*(.+?)\*\*|!!(.+?)!!/g).map((part, i) => {
    if (part === undefined) return null
    // split 帶兩個捕獲組：每 3 個一組 → 0 是純文字、1 是 **、2 是 !!
    const kind = i % 3
    if (kind === 1) return <b key={i} className="lpv-em">{part}</b>
    if (kind === 2) return <b key={i} className="lpv-warn">{part}</b>
    return part
  })
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
}
const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)))

function css(vars: { bg: string; accent: string; theme?: 'dark' | 'light'; hero?: string }) {
  const isDark = (vars.theme ?? 'dark') === 'dark'
  // 首屏可以獨立於內容區設定深淺：'內容淺色但首屏深色' 是合理的組合，
  // 綁死的話管理員切到淺色會看到最上面一大塊還是黑的，以為沒生效
  const heroDark = (vars.hero ?? 'dark') === 'follow' ? isDark : (vars.hero ?? 'dark') === 'dark'
  const [ar,ag,ab] = hexRgb(vars.accent)
  const [br,bg_,bb] = hexRgb(vars.bg)
  const a = `${ar},${ag},${ab}`

  // Card surfaces — lift for dark, darken for light
  const c1r = isDark ? clamp(br+8+ar*0.04)   : clamp(br-28+ar*0.14)
  const c1g = isDark ? clamp(bg_+8+ag*0.04)  : clamp(bg_-28+ag*0.09)
  const c1b = isDark ? clamp(bb+8+ab*0.04)   : clamp(bb-28+ab*0.14)
  const c2r = isDark ? clamp(br+3+ar*0.02)   : clamp(br-38+ar*0.18)
  const c2g = isDark ? clamp(bg_+3+ag*0.02)  : clamp(bg_-38+ag*0.11)
  const c2b = isDark ? clamp(bb+3+ab*0.02)   : clamp(bb-38+ab*0.18)
  const e1r = isDark ? clamp(br+28+ar*0.08)  : clamp(br-58+ar*0.22)
  const e1g = isDark ? clamp(bg_+18+ag*0.08) : clamp(bg_-48+ag*0.14)
  const e1b = isDark ? clamp(bb+28+ab*0.08)  : clamp(bb-58+ab*0.22)
  const e2r = isDark ? clamp(br+48+ar*0.14)  : clamp(br-76+ar*0.28)
  const e2g = isDark ? clamp(bg_+32+ag*0.14) : clamp(bg_-62+ag*0.18)
  const e2b = isDark ? clamp(bb+48+ab*0.14)  : clamp(bb-76+ab*0.28)
  const cardDark   = `rgb(${c1r},${c1g},${c1b})`
  const cardDarker = `rgb(${c2r},${c2g},${c2b})`
  const borderMid    = `rgb(${e1r},${e1g},${e1b})`
  const borderStrong = `rgb(${e2r},${e2g},${e2b})`

  // Accent variants
  const accentLight = isDark
    ? `rgb(${clamp(ar+(255-ar)*.50)},${clamp(ag+(255-ag)*.32)},${clamp(ab+(255-ab)*.18)})`
    : vars.accent
  const subtitleColor = isDark
    ? `rgb(${clamp(ar+(255-ar)*.03)},${clamp(ag+(255-ag)*.55)},${clamp(ab+(255-ab)*.01)})`
    : `rgb(${clamp(ar*.65)},${clamp(ag*.55)},${clamp(ab*.65)})`
  // 卡片內小字：深色主題往白色混，純提高不透明度會變成刺眼的高飽和色
  const bodyMuted = isDark
    ? `rgb(${clamp(ar+(255-ar)*.72)},${clamp(ag+(255-ag)*.72)},${clamp(ab+(255-ab)*.72)})`
    : `rgba(${a},.82)`

  // rgba glows / shadows
  const glow40 = `rgba(${a},0.40)`
  const glow20 = `rgba(${a},0.20)`
  const glow08 = `rgba(${a},0.08)`

  // Title gradient — always dark/vibrant (hero is always dark)
  const tL = `rgb(${clamp(ar+(255-ar)*.75)},${clamp(ag+(255-ag)*.75)},${clamp(ab+(255-ab)*.75)})`
  const tB = `rgb(${clamp(ar+(255-ar)*.28)},${clamp(ag+(255-ag)*.28)},${clamp(ab+(255-ab)*.28)})`
  const tD = `rgb(${clamp(ar*.60)},${clamp(ag*.60)},${clamp(ab*.60)})`
  const titleGrad = `linear-gradient(180deg,${tL},${tB} 46%,${tD} 64%,${vars.accent})`
  // Section title gradient — darker in light mode so text stays readable on white bg
  const stL = isDark ? tL : `rgb(${clamp(ar*.55)},${clamp(ag*.40)},${clamp(ab*.55)})`
  const stM = isDark ? tB : vars.accent
  const stD = isDark ? tD : `rgb(${clamp(ar*.78)},${clamp(ag*.62)},${clamp(ab*.78)})`
  const sectionTitleGrad = isDark ? titleGrad : `linear-gradient(180deg,${stL},${stM} 50%,${stD})`
  // Shadow for gradient text in light mode (filter:drop-shadow works with background-clip:text)
  const gradTextShadow = isDark ? '' : 'filter:drop-shadow(0 1px 2px rgba(0,0,0,.22));'

  // Theme-sensitive text / surface tokens
  const textColor      = isDark ? '#fff' : '#111'
  const textBody       = isDark ? 'rgba(255,255,255,.72)' : 'rgba(0,0,0,.82)'
  const textFaint45    = isDark ? 'rgba(255,255,255,.45)' : 'rgba(0,0,0,.58)'
  const textFaint38    = isDark ? 'rgba(255,255,255,.38)' : 'rgba(0,0,0,.52)'
  const textFaint28    = isDark ? 'rgba(255,255,255,.28)' : 'rgba(0,0,0,.45)'
  const textSemi65     = isDark ? 'rgba(255,255,255,.65)' : 'rgba(0,0,0,.72)'
  const textSemi85     = isDark ? 'rgba(255,255,255,.85)' : 'rgba(0,0,0,.88)'
  const textSemi68     = isDark ? 'rgba(255,255,255,.68)' : 'rgba(0,0,0,.78)'
  const textSemi42     = isDark ? 'rgba(255,255,255,.42)' : 'rgba(0,0,0,.55)'
  const overlayFaint   = isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)'
  // 首屏配色。深色是原本的電影感版本，淺色是為了讓「整頁淺色」真的整頁淺色
  const heroBg         = heroDark ? (isDark ? 'transparent' : '#0a0610') : '#ffffff'
  const heroCardDarker = heroDark
    ? `rgb(${clamp(13+ar*0.02)},${clamp(9+ag*0.02)},${clamp(19+ab*0.02)})`
    : `rgb(${clamp(246-ar*0.02)},${clamp(246-ag*0.02)},${clamp(248-ab*0.02)})`
  // veil 是為了讓四周壓暗、中間透出主視覺；淺色時要反過來壓亮
  const heroVeilStop   = heroDark ? 'rgba(10,6,16,.65)' : 'rgba(255,255,255,.55)'
  const heroVeilEdge   = heroDark ? '#0a0610' : '#ffffff'
  const heroSubColor   = heroDark ? '#ecd8f0' : `rgb(${clamp(ar*.55)},${clamp(ag*.45)},${clamp(ab*.55)})`
  const arasaColor     = heroDark ? '#f3e0ff' : `rgb(${clamp(ar*.60)},${clamp(ag*.50)},${clamp(ab*.60)})`
  const scrollColor    = heroDark ? 'rgba(255,255,255,.3)' : 'rgba(0,0,0,.35)'
  // 主標的漸層在淺色底上要夠深才讀得到，深色底則沿用原本的亮色漸層
  const heroTitleGrad  = heroDark ? titleGrad : sectionTitleGrad
  const heroEndedColor = heroDark ? '#fff' : '#111'
  const heroBeamOpacity = heroDark ? 1 : 0.35
  const calloutBg      = isDark ? 'rgba(0,0,0,.25)' : 'rgba(0,0,0,.05)'
  const calloutColor   = isDark ? 'rgba(255,255,255,.78)' : 'rgba(0,0,0,.75)'
  const highlightBg    = isDark ? `linear-gradient(180deg,${cardDark},rgba(0,0,0,.5))` : `linear-gradient(180deg,${cardDark},rgba(255,255,255,.5))`
  const hlTitleGrad    = isDark ? `linear-gradient(180deg,#fff,${vars.accent})` : `linear-gradient(180deg,#111,${vars.accent})`
  const hlFooterBorder = isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.10)'
  const hlFooterColor  = isDark ? 'rgba(255,255,255,.38)' : 'rgba(0,0,0,.38)'
  const cardNumGrad    = isDark ? `linear-gradient(180deg,#fff 20%,${vars.accent})` : `linear-gradient(180deg,#111 20%,${vars.accent})`
  const chipBg         = isDark ? 'rgba(0,0,0,.3)' : 'rgba(0,0,0,.06)'
  const chipColor      = isDark ? '#ffd24a' : '#7a4e00'
  const chipBorder     = isDark ? '#6a4a1e' : '#c47a10'
  const ffb2Color      = isDark ? '#ffd24a' : '#8a5500'
  const relValueColor  = isDark ? '#ffd24a' : '#8a5500'
  const fukuroBg       = isDark
    ? `linear-gradient(180deg,rgba(255,160,80,.09),rgba(${br},${bg_},${bb},.65))`
    : `linear-gradient(180deg,rgba(255,140,60,.14),rgba(255,220,190,.35))`
  const fukuroAccentBg = isDark
    ? `linear-gradient(180deg,rgba(${a},.12),rgba(${br},${bg_},${bb},.65))`
    : `linear-gradient(180deg,rgba(${a},.18),rgba(${ar},${ag},${ab},.06))`
  const stickyBg       = isDark ? 'linear-gradient(180deg,transparent,rgba(0,0,0,.88) 28%)' : 'linear-gradient(180deg,transparent,rgba(255,255,255,.92) 28%)'
  const imgPlaceholder = isDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)'

  // Gold — fixed
  const GOLD = 'linear-gradient(180deg,#fffbe6,#ffd24a 46%,#a9760c 62%,#ffcf5a)'
  const GOLD_SHADOW = 'rgba(255,210,74,0.5)'

  return `
    .lpv{background:${vars.bg};color:${textColor};min-height:100svh;overflow-x:hidden;
      /* 關掉這個內層捲動區自己的橡皮筋：原生殼的下拉更新會對 .lpv 下 transform，
         iOS 的過捲再疊上去就是兩段位移，放手時 hero 停不回頂邊（老闆 2026-08-22）。
         PwaPullToRefresh 在 touchstart 也會關，這裡是保險。 */
      overscroll-behavior-y:none;
      font-family:'Noto Sans JP',system-ui,sans-serif;}
    .lpv-topbar{position:fixed;top:0;left:0;right:0;z-index:60;display:flex;align-items:center;
      justify-content:space-between;padding:env(safe-area-inset-top) 0 0;pointer-events:none;}
    .lpv-topbtn{pointer-events:auto;margin:10px;width:38px;height:38px;border-radius:999px;
      background:rgba(8,4,14,.82);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
      display:flex;align-items:center;justify-content:center;color:#fff;
      border:none;cursor:pointer;transition:opacity .15s;text-decoration:none;}
    .lpv-topbtn:hover{opacity:.75;}

    /* ── HERO ── */
    .lpv-hero{position:relative;min-height:100svh;display:flex;flex-direction:column;align-items:center;
      justify-content:center;text-align:center;padding:80px 24px 60px;
      background-color:${heroBg};}
    .lpv-hero .h-vid{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.5;clip-path:inset(0);}
    .lpv-hero .h-bgimg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;clip-path:inset(0);
      opacity:.5;filter:brightness(.42) saturate(1.15);}

    /* ── 純圖首屏（hero.bare）──
       文案已經畫在圖裡，只留背景圖與 CTA。
       高度由圖片比例決定而不是 100svh：海報型的圖用 cover 撐滿視窗，
       在桌機（橫向）會把上下裁掉，切到的正好是標題。 */
    .lpv-hero.bare{min-height:0;padding:0;display:block;}
    .lpv-hero.bare .h-bgimg{position:relative;inset:auto;height:auto;
      opacity:1;filter:none;display:block;}
    /* CTA 疊在圖片下緣。位置用百分比，換圖或換螢幕寬度都不用重調 */
    .lpv-hero.bare .lpv-cta-btn{position:absolute;left:50%;bottom:6%;margin:0;z-index:3;
      padding:12px 28px;white-space:nowrap;
      /* 呼吸放大。位移寫進 keyframes 而不是留在 transform：
         同一個屬性只能有一份值，分開寫會互相蓋掉、按鈕跑去右邊 */
      animation:lpvCtaPulse 1.6s ease-in-out infinite;}
    @keyframes lpvCtaPulse{
      0%,100%{transform:translateX(-50%) scale(1);}
      50%    {transform:translateX(-50%) scale(1.06);}
    }
    .lpv-hero.bare .lpv-cta-btn:active{animation:none;transform:translateX(-50%) scale(.97);}
    .lpv-hero.bare .lpv-scroll{display:none;}
    /* 首屏與下一個區塊之間不留空隙：圖本身下緣已經有留白，再加間距會斷開 */
    .lpv-hero.bare{margin-bottom:0;}
    /* 散景裝飾層：置於暗罩之上、文字之下（文字為 z-index:1），靠模糊與透明度退到背景 */
    .lpv-hero .h-scatter{position:absolute;inset:0;z-index:2;pointer-events:none;}
    .lpv-hero .h-ended{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;
      background:rgba(0,0,0,.68);backdrop-filter:blur(2px);}
    .lpv-hero .h-ended span{color:${heroEndedColor};font-weight:900;letter-spacing:2px;
      font-size:clamp(20px,5.5vw,34px);text-shadow:0 2px 12px ${heroDark ? 'rgba(0,0,0,.6)' : 'rgba(0,0,0,.18)'};}
    .lpv-hero .h-scatter img{position:absolute;display:block;will-change:transform;}
    .lpv-hero .h-bg{position:absolute;inset:0;
      background:radial-gradient(72% 42% at 50% 8%,${borderStrong},transparent 46%),
                 radial-gradient(50% 28% at 50% 0%,${borderMid},transparent 52%);}
    .lpv-hero .h-beam{position:absolute;top:-14%;left:50%;transform:translateX(-50%);
      width:76%;height:32%;background:radial-gradient(closest-side,${glow20},transparent);filter:blur(30px);
      opacity:${heroBeamOpacity};}
    .lpv-hero .h-veil{position:absolute;inset:0;
      background:radial-gradient(120% 92% at 50% 34%,transparent,${heroVeilStop} 55%,${heroVeilEdge} 92%);}
    .lpv-eyebrow{position:relative;z-index:3;font-size:12px;letter-spacing:7px;color:${accentLight};
      font-weight:800;margin-bottom:16px;text-transform:uppercase;opacity:.9;}
    /* line-height 需 >=1.1：中文字身高於行框，而 background-clip:text 只在
       元素框內上色，行框太矮會讓超出的字身變透明，看起來像被裁掉。
       padding-block 再留一點餘裕給 drop-shadow 與較高的字型。 */
    .lpv-title{position:relative;z-index:3;font-family:'Arial Black','Noto Sans JP',sans-serif;
      font-weight:900;line-height:1.12;padding-block:.04em;letter-spacing:2px;font-size:clamp(34px,9.5vw,78px);
      background:${heroTitleGrad};
      -webkit-background-clip:text;background-clip:text;color:transparent;
      filter:drop-shadow(0 4px 26px ${glow40});}
    .lpv-gems{position:relative;z-index:3;display:flex;gap:10px;justify-content:center;margin-top:18px;}
    .lpv-gems i{width:14px;height:14px;border-radius:999px;display:block;
      box-shadow:0 0 14px currentColor,0 0 28px currentColor;}
    .lpv-sub{position:relative;z-index:3;margin-top:18px;font-size:clamp(14px,4vw,19px);
      font-weight:700;color:${heroSubColor};max-width:580px;line-height:1.7;}
    .lpv-sub-b{background:${titleGrad};-webkit-background-clip:text;background-clip:text;
      color:transparent;font-weight:900;font-size:1.15em;}
    .lpv-arasa{position:relative;z-index:3;margin-top:22px;display:inline-block;
      padding:9px 22px;border-radius:8px;font-weight:900;font-size:clamp(13px,3.6vw,16px);
      color:${arasaColor};background:${heroCardDarker};
      border:2px dashed ${vars.accent};
      box-shadow:0 0 18px rgba(${a},0.4);letter-spacing:1px;}
    .lpv-badge{position:relative;z-index:3;margin-top:16px;font-size:11px;letter-spacing:3px;
      color:${vars.accent};font-weight:800;opacity:.8;
      animation:lpvPulse 2.4s ease-in-out infinite;}
    @keyframes lpvPulse{0%,100%{opacity:.6}50%{opacity:1}}
    .lpv-cta-btn{display:inline-flex;align-items:center;gap:8px;margin-top:30px;
      padding:16px 40px;border-radius:999px;font-weight:900;font-size:18px;
      color:#3a2c08;background:${GOLD};
      box-shadow:0 8px 30px ${GOLD_SHADOW};position:relative;z-index:3;text-decoration:none;
      transition:transform .15s;}
    .lpv-cta-btn:active{transform:scale(.97);}
    .lpv-scroll{position:absolute;bottom:18px;left:0;right:0;z-index:3;font-size:11px;
      letter-spacing:3px;color:${scrollColor};animation:lpvBob 1.8s ease-in-out infinite;text-align:center;}
    @keyframes lpvBob{0%,100%{transform:translateY(0)}50%{transform:translateY(6px)}}

    /* ── SECTIONS ── */
    .lpv-sec{padding:64px 18px;max-width:1000px;margin:0 auto;}
    /* 標題的下間距原本完全靠副標的 margin-bottom 撐；沒有副標的區塊（例：公平驗證頁的
       「三步驟」「在哪裡看」）標題就直接貼著內容。標題自己要有下間距，有副標時才收窄。
       line-height 也要蓋掉全域 h1~h6 的 1 —— 中文字在 44px 下會擠成一團。 */
    .lpv-h2{text-align:center;font-weight:900;font-size:clamp(26px,7vw,44px);letter-spacing:1px;
      line-height:1.25;margin-bottom:34px;color:${textColor};}
    .lpv-h2:has(+ .lpv-h2s){margin-bottom:8px;}
    .lpv-h2s{text-align:center;font-size:13px;margin-top:0;margin-bottom:34px;
      font-weight:700;letter-spacing:.5px;line-height:1.7;color:${subtitleColor};}
    .lpv-pp{background:${sectionTitleGrad};-webkit-background-clip:text;background-clip:text;color:transparent;${gradTextShadow}}
    .lpv-gold{background:${GOLD};-webkit-background-clip:text;background-clip:text;color:transparent;${gradTextShadow}}
    .lpv-body{font-size:15px;color:${textBody};line-height:1.9;white-space:pre-wrap;}
    /* 內文重點（星號標記）。用 accentLight 而非原始 accent：
       深色底上原始色偏濁，淺一階才讀得出來。
       註：這段字串是 template literal，註解裡不能出現反引號或 ** 以外的跳脫字元 */
    .lpv-em{color:${accentLight};font-weight:900;}
    .lpv-warn{color:#ff6b6b;font-weight:900;}

    /* ── STEPS ── */
    .lpv-flow{display:flex;flex-direction:column;gap:0;max-width:560px;margin:0 auto;}
    .lpv-flowrow{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:12px;
      border:1px solid ${borderMid};
      background:linear-gradient(180deg,${cardDark},${cardDarker});}
    .lpv-flowno{font-family:'Arial Black',sans-serif;font-weight:900;font-size:22px;
      color:${accentLight};width:30px;text-align:center;flex:none;}
    .lpv-ft{font-weight:900;font-size:15px;}
    .lpv-fd{font-size:11px;color:${textFaint38};font-weight:600;margin-top:2px;line-height:1.5;white-space:pre-line;}
    .lpv-flowarr{text-align:center;color:rgba(${a},0.35);font-size:14px;line-height:1.2;padding:3px 0;}

    /* ── CARDS ── */
    .lpv-cards{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;}
    @media(max-width:520px){.lpv-cards{grid-template-columns:1fr;}}
    .lpv-card{border-radius:18px;padding:24px 18px;text-align:center;overflow:hidden;}
    .lpv-card.star{border:1px solid ${borderMid};
      background:linear-gradient(180deg,${cardDark},${cardDarker});}
    .lpv-card.grand{border:2px solid ${borderStrong};
      background:linear-gradient(180deg,rgba(${a},0.22),${cardDarker});
      box-shadow:0 0 40px ${glow20},0 0 80px ${glow08};}
    .lpv-card-img{width:100%;height:120px;object-fit:cover;border-radius:10px;margin-bottom:12px;}
    .lpv-cards.sq{grid-template-columns:repeat(3,1fr);}
    @media(max-width:520px){.lpv-cards.sq{grid-template-columns:1fr;}}
    .lpv-cards.sq .lpv-card,.lpv-cards.sq .lpv-card.grand{
      border:none;background:none;box-shadow:none;padding:0;}
    @media(max-width:520px){.lpv-cards.sq{gap:40px;}}
    .lpv-cards.sq .lpv-card-img{height:auto;aspect-ratio:1/1;}
    .lpv-cards.sq .lpv-card-img,.lpv-cards.sq .lpv-card-ph{
      width:50%;margin-left:auto;margin-right:auto;}
    .lpv-card-ph{width:100%;aspect-ratio:1/1;border-radius:10px;margin-bottom:12px;
      background:${overlayFaint};}
    .lpv-card-tag{display:inline-block;font-size:10px;font-weight:900;letter-spacing:1.5px;
      padding:3px 12px;border-radius:999px;margin-bottom:12px;
      background:${overlayFaint};color:${textSemi65};}
    .lpv-card.grand .lpv-card-tag{background:${cardDark};color:${vars.accent};}
    .lpv-card-title{font-weight:900;font-size:17px;}
    .lpv-card-sub{font-size:11px;color:${textSemi42};margin-top:4px;}
    .lpv-card-num{font-weight:900;font-size:clamp(28px,8vw,42px);line-height:1.15;margin-top:10px;
      background:${cardNumGrad};
      -webkit-background-clip:text;background-clip:text;color:transparent;}
    .lpv-card-unit{font-size:14px;font-weight:900;}
    .lpv-card-extras{margin-top:8px;font-size:12px;color:${textFaint45};font-weight:600;line-height:1.6;}
    .lpv-note{text-align:center;color:${textFaint28};font-size:11px;margin-top:12px;line-height:1.7;}

    /* ── HIGHLIGHT BOX ── */
    .lpv-highlight-box{border-radius:16px;border:1px solid ${borderStrong};
      background:${highlightBg};
      padding:28px 20px;text-align:center;max-width:640px;margin:0 auto;
      box-shadow:0 0 40px ${glow08};}
    .lpv-highlight-box .ht{font-weight:900;font-size:clamp(18px,5vw,26px);
      background:${hlTitleGrad};
      -webkit-background-clip:text;background-clip:text;color:transparent;}
    .lpv-highlight-box .hb{margin:14px auto 0;color:${textSemi68};
      font-size:14px;line-height:1.9;font-weight:600;max-width:520px;white-space:pre-wrap;}
    .lpv-highlight-box .hf{margin-top:16px;padding-top:14px;border-top:1px solid ${hlFooterBorder};
      font-size:12px;color:${hlFooterColor};font-weight:600;}

    /* ── CTA FOOTER ── */
    .lpv-footer{padding:80px 18px 80px;max-width:600px;margin:0 auto;text-align:center;
      background:radial-gradient(120% 80% at 50% 0%,${glow20},transparent 60%);}
    .lpv-footer-btn{display:inline-block;text-align:center;border-radius:999px;padding:17px 52px;
      font-weight:900;font-size:17px;color:#3a2c08;text-decoration:none;
      background:${GOLD};
      box-shadow:0 12px 36px ${GOLD_SHADOW};transition:transform .15s;}
    .lpv-footer-btn:active{transform:scale(.97);}

    /* ── STATS ── */
    .lpv-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;}
    @media(min-width:600px){.lpv-stats{grid-template-columns:repeat(4,1fr);}}
    .lpv-stat{border-radius:14px;border:1px solid ${borderMid};
      background:linear-gradient(180deg,${cardDark},${cardDarker});
      padding:22px 14px;text-align:center;}
    .lpv-stat .sv{font-family:'Arial Black','Noto Sans JP',sans-serif;font-weight:900;
      font-size:clamp(20px,5.6vw,30px);}
    .lpv-stat .sl{font-size:11px;color:${bodyMuted};font-weight:700;margin-top:6px;letter-spacing:.3px;}

    /* ── FUKURO ── default gold/warm; .accent overrides to theme colour */
    .lpv-fukuro-wrap{border-radius:16px;border:1px solid #6a3a1e;
      background:${fukuroBg};
      padding:26px 18px;text-align:center;max-width:680px;margin:0 auto;}
    .lpv-fukuro-wrap.accent{border-color:${borderMid};
      background:${fukuroAccentBg};}
    .lpv-fukuro-wrap .fft{font-weight:900;font-size:clamp(19px,5.2vw,28px);}
    .lpv-fukuro-wrap .ffb{margin:12px auto 0;color:${calloutColor};font-size:13px;
      line-height:1.85;font-weight:600;max-width:580px;white-space:pre-wrap;}
    .lpv-fukuro-wrap .ffb2{margin-top:10px;color:${ffb2Color};font-size:13px;font-weight:800;}
    .lpv-chips{margin-top:14px;display:flex;flex-wrap:wrap;justify-content:center;gap:0;}
    .lpv-chip{display:inline-block;margin:4px;padding:6px 14px;border-radius:999px;font-size:11px;font-weight:800;
      color:${chipColor};border:1px solid ${chipBorder};background:${chipBg};}
    .lpv-callout{max-width:680px;margin:22px auto 0;padding:14px 16px;border-radius:12px;
      border:1px dashed rgb(${e1r},${Math.round(e1g*.7)},${e1b});background:${calloutBg};
      color:${calloutColor};font-size:12.5px;font-weight:700;line-height:1.85;text-align:left;}

    /* ── REL ── */
    .lpv-rel{display:flex;flex-direction:column;gap:8px;max-width:620px;margin:0 auto;}
    .lpv-relrow{display:grid;grid-template-columns:90px 1fr;align-items:center;gap:10px;
      padding:12px 14px;border-radius:12px;border:1px solid ${borderMid};
      background:linear-gradient(180deg,${cardDark},${cardDarker});}
    .lpv-relrow .rnm{font-weight:900;font-size:15px;}
    .lpv-relrow .rst{font-size:15px;letter-spacing:1px;color:${relValueColor};}
    .lpv-relrow .rds{font-size:11px;color:${bodyMuted};font-weight:600;margin-top:2px;}

    /* ── RULE ── */
    .lpv-rule{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;max-width:680px;margin:0 auto;}
    .lpv-rc{border-radius:12px;border:1px solid ${borderMid};
      background:linear-gradient(180deg,${cardDark},${cardDarker});padding:16px 14px;}
    .lpv-rc .rt{font-weight:900;font-size:16px;}
    .lpv-rc .rd{font-size:11px;color:${bodyMuted};font-weight:600;margin-top:5px;line-height:1.6;}

    /* ── TABLE ── */
    .lpv-tblwrap{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 -4px;}
    .lpv-tbl{width:100%;min-width:400px;border-collapse:collapse;font-size:clamp(10px,2.6vw,13px);}
    .lpv-tbl th,.lpv-tbl td{padding:9px 6px;text-align:center;border:1px solid ${borderMid};}
    .lpv-tbl thead th{background:${cardDark};color:${accentLight};font-weight:800;}
    .lpv-tbl tbody th{background:${cardDarker};color:${textSemi65};font-weight:800;
      text-align:left;padding-left:10px;white-space:nowrap;}
    .lpv-tbl td{color:${textSemi85};font-weight:700;font-variant-numeric:tabular-nums;}
    .lpv-tbl .hi{background:rgba(${a},.10);color:${accentLight};font-weight:900;}
    .lpv-tbl thead th.hi{color:${vars.accent};}

    /* ── GALLERY ── */
    /* 一律三欄。兩欄時第三張會自己落到下一行、右邊空一格，看起來像漏了東西 */
    .lpv-gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
    /* 高度自適應：原本寫死 aspect-ratio 9/11，正方形素材會被裁掉上下。
       改成讓圖片自己的比例決定高度，換素材就不用回頭調 CSS。
       影片沒有 intrinsic size 可依靠，仍給一個比例避免載入前塌成 0 高。 */
    .lpv-gitem{position:relative;border-radius:14px;overflow:hidden;border:1px solid ${borderMid};
      background:${cardDarker};}
    .lpv-gitem img{display:block;width:100%;height:auto;}
    .lpv-gitem video{display:block;width:100%;height:100%;object-fit:cover;}
    .lpv-gitem:has(video){aspect-ratio:9/11;}
    .lpv-gcap{position:absolute;left:0;right:0;bottom:0;padding:10px 12px;
      background:linear-gradient(180deg,transparent,rgba(0,0,0,.85));}
    /* 圖說疊在 lpv-gcap 的黑色漸層上，固定白字。
       不設 color 會繼承主題文字色 —— 淺色主題下就是深字疊深底，讀不到 */
    .lpv-gcn{font-weight:900;font-size:15px;color:#fff;
      text-shadow:0 1px 3px rgba(0,0,0,.5);}
    .lpv-gbadge{position:absolute;top:8px;left:8px;font-size:9px;font-weight:900;
      letter-spacing:1px;padding:3px 8px;border-radius:999px;
      background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.18);}

    /* ── FEATURES ── */
    .lpv-features{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;max-width:720px;margin:0 auto;}
    @media(min-width:600px){.lpv-features{grid-template-columns:repeat(4,1fr);}}
    .lpv-feat{border-radius:14px;border:1px solid ${borderMid};
      background:linear-gradient(180deg,${cardDark},${cardDarker});padding:22px 14px;text-align:center;}
    .lpv-feat-icon{font-size:32px;margin-bottom:10px;line-height:1;}
    .lpv-feat-icon img{width:40px;height:40px;object-fit:contain;margin:0 auto;}
    .lpv-feat-title{font-weight:900;font-size:15px;margin-bottom:6px;}
    .lpv-feat-desc{font-size:11px;color:${bodyMuted};font-weight:600;line-height:1.6;}

    /* ── COUNTDOWN ── */
    .lpv-countdown{display:flex;justify-content:center;align-items:flex-start;gap:6px;margin:20px 0;}
    .lpv-cd-unit{text-align:center;min-width:52px;}
    .lpv-cd-num{font-family:'Arial Black',sans-serif;font-weight:900;
      font-size:clamp(32px,9vw,58px);color:${vars.accent};line-height:1;
      font-variant-numeric:tabular-nums;}
    .lpv-cd-label{font-size:10px;font-weight:800;letter-spacing:2px;
      color:${textFaint38};margin-top:4px;}
    .lpv-cd-sep{font-size:clamp(26px,7vw,46px);font-weight:900;color:rgba(${a},.35);
      padding-top:4px;line-height:1;}
    .lpv-cd-expired{text-align:center;font-size:16px;font-weight:800;
      color:${textFaint45};padding:20px 0;}

    /* ── STICKY CTA ── */
    .lpv-sticky{position:fixed;bottom:0;left:0;right:0;z-index:55;pointer-events:none;
      padding:10px 16px calc(10px + env(safe-area-inset-bottom));
      background:${stickyBg};}
    .lpv-sticky-inner{pointer-events:auto;display:flex;flex-direction:column;
      align-items:center;gap:4px;max-width:480px;margin:0 auto;}
    .lpv-sticky-btn{display:flex;align-items:center;justify-content:center;width:100%;
      border-radius:999px;padding:14px 32px;font-weight:900;font-size:17px;
      color:#3a2c08;background:${GOLD};box-shadow:0 8px 28px ${GOLD_SHADOW};
      text-decoration:none;border:none;cursor:pointer;transition:transform .15s;}
    .lpv-sticky-btn:active{transform:scale(.97);}
    .lpv-sticky-sub{font-size:11px;font-weight:700;color:${textFaint38};text-align:center;}

    /* ── PRODUCT PRIZES ── */
    .lpv-prizes{display:flex;flex-direction:column;gap:8px;max-width:640px;margin:0 auto;}
    .lpv-prize-row{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;
      border:1px solid ${borderMid};background:linear-gradient(180deg,${cardDark},${cardDarker});}
    .lpv-prize-img{width:44px;height:44px;border-radius:8px;object-fit:cover;background:${imgPlaceholder};flex:none;}
    .lpv-prize-img-placeholder{width:44px;height:44px;border-radius:8px;background:${imgPlaceholder};flex:none;
      display:flex;align-items:center;justify-content:center;font-size:18px;}
    .lpv-prize-level{font-weight:900;font-size:13px;color:${vars.accent};min-width:32px;}
    .lpv-prize-name{font-size:14px;font-weight:700;flex:1;}
    .lpv-prize-meta{font-size:11px;color:${textFaint38};text-align:right;font-weight:600;}
  `
}

// ─── Section Components ────────────────────────────────────────────────────────

function H2({ c }: { c: Record<string, unknown> }) {
  if (!bool(c.h2)) return null
  const t = c.h2 as string
  if (c.h2_type === 'pp') return <h2 className="lpv-h2"><span className="lpv-pp">{t}</span></h2>
  if (c.h2_type === 'gold') return <h2 className="lpv-h2"><span className="lpv-gold">{t}</span></h2>
  const hl = c.h2_highlight as { text: string; type: 'pp' | 'gold' } | undefined
  if (hl) {
    const idx = t.indexOf(hl.text)
    if (idx >= 0) {
      const before = t.slice(0, idx)
      const after = t.slice(idx + hl.text.length)
      const cls = hl.type === 'gold' ? 'lpv-gold' : 'lpv-pp'
      return <h2 className="lpv-h2">{before}<span className={cls}>{hl.text}</span>{after}</h2>
    }
  }
  return <h2 className="lpv-h2">{t}</h2>
}

function HeroSection({ c, ended }: { c: Record<string, unknown>; ended?: boolean }) {
  const gems = (c.gems as { color: string }[]) || []
  const scatter = (c.scatter as {
    url: string; top?: string; left?: string; right?: string; bottom?: string
    size?: string; rotate?: number; blur?: number; opacity?: number
  }[]) || []
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = true
    v.play().catch(() => {})
  }, [])
  const subRaw = str(c.subtitle)
  const [subHi, subRest] = subRaw.includes('\n') ? subRaw.split('\n') : [null, subRaw]
  /**
   * 純圖模式：文案已經畫在圖裡，只留背景圖與 CTA。
   * 不壓暗、不蓋遮罩，高度由圖片比例決定（不裁切）—— 海報型的圖一裁就切到字。
   */
  const bare = bool(c.bare)
  return (
    <section className={`lpv-hero${bare ? ' bare' : ''}`}>
      {ended && (
        <div className="h-ended" aria-label="活動已結束">
          <span>活動已結束</span>
        </div>
      )}
      {bool(c.bg_video_url) && (
        <video ref={videoRef} src={c.bg_video_url as string} poster={(c.bg_poster_url as string) || undefined}
          autoPlay muted loop playsInline className="h-vid" />
      )}
      {!bool(c.bg_video_url) && bool(c.bg_image_url) && (
        <img src={c.bg_image_url as string} alt="" className="h-bgimg" />
      )}
      {!bare && <><div className="h-bg" /><div className="h-beam" /><div className="h-veil" /></>}
      {scatter.length > 0 && (
        <div className="h-scatter" aria-hidden="true">
          {scatter.map((s, i) => (
            <img key={i} src={s.url} alt="" style={{
              top: s.top, left: s.left, right: s.right, bottom: s.bottom,
              width: s.size,
              transform: `rotate(${s.rotate ?? 0}deg)`,
              filter: `blur(${s.blur ?? 0}px)`,
              opacity: s.opacity ?? 1,
            }} />
          ))}
        </div>
      )}
      {!bare && bool(c.eyebrow) && <div className="lpv-eyebrow">{c.eyebrow as string}</div>}
      {!bare && bool(c.title) && <h1 className="lpv-title">{c.title as string}</h1>}
      {!bare && gems.length > 0 && (
        <div className="lpv-gems">
          {gems.map((g, i) => <i key={i} style={{ background: g.color, color: g.color }} />)}
        </div>
      )}
      {!bare && bool(subRaw) && (
        <p className="lpv-sub">
          {subHi && <b className="lpv-sub-b">{subHi}</b>}
          {subHi && subRest && <br />}
          {subRest}
        </p>
      )}
      {!bare && bool(c.highlight_text) && <div className="lpv-arasa">{c.highlight_text as string}</div>}
      {!bare && bool(c.badge_text) && <div className="lpv-badge">● {c.badge_text as string}</div>}
      {bool(c.cta_url) && (
        <Link href={c.cta_url as string} className="lpv-cta-btn">
          ▶ {(c.cta_text as string) || '立即參加'}
        </Link>
      )}
      <div className="lpv-scroll">▼ SCROLL</div>
    </section>
  )
}

function TextSection({ c }: { c: Record<string, unknown> }) {
  return (
    <section className="lpv-sec">
      <H2 c={c} />
      {bool(c.subtitle) && <p className="lpv-h2s">{c.subtitle as string}</p>}
      {bool(c.body) && <p className="lpv-body">{emphasize(c.body as string)}</p>}
    </section>
  )
}

function StepsSection({ c }: { c: Record<string, unknown> }) {
  const steps = (c.steps as { title: string; description: string }[]) || []
  return (
    <section className="lpv-sec" style={{ paddingTop: 0 }}>
      <H2 c={c} />
      {bool(c.subtitle) && <p className="lpv-h2s">{c.subtitle as string}</p>}
      <div className="lpv-flow">
        {steps.map((s, i) => (
          <div key={i}>
            <div className="lpv-flowrow">
              <div className="lpv-flowno">{i + 1}</div>
              <div style={{ minWidth: 0 }}>
                <div className="lpv-ft">{s.title}</div>
                {s.description && <div className="lpv-fd">{emphasize(s.description)}</div>}
              </div>
            </div>
            {i < steps.length - 1 && <div className="lpv-flowarr">▼</div>}
          </div>
        ))}
      </div>
    </section>
  )
}

function CardsSection({ c }: { c: Record<string, unknown> }) {
  type CardItem = { tag: string; variant: string; title: string; subtitle: string; value: string; unit: string; extras: string[]; image_url?: string }
  const cards = (c.cards as CardItem[]) || []
  const square = c.layout === 'square'
  return (
    <section className="lpv-sec" style={{ paddingTop: 0 }}>
      <H2 c={c} />
      {bool(c.subtitle) && <p className="lpv-h2s">{c.subtitle as string}</p>}
      <div className={`lpv-cards${square ? ' sq' : ''}`}>
        {cards.map((card, i) => (
          <div key={i} className={`lpv-card ${card.variant === 'grand' ? 'grand' : 'star'}`}>
            {card.image_url
              ? <img src={card.image_url} alt={card.title || ''} className="lpv-card-img" />
              : square && <div className="lpv-card-ph" />}
            {card.tag && <span className="lpv-card-tag">{card.tag}</span>}
            {card.title && <div className="lpv-card-title">{card.title}</div>}
            {card.subtitle && <div className="lpv-card-sub">{card.subtitle}</div>}
            {card.value && (
              <div className="lpv-card-num">
                {card.value}<span className="lpv-card-unit">{card.unit}</span>
              </div>
            )}
            {card.extras?.filter(Boolean).map((e, j) => (
              <div key={j} className="lpv-card-extras">{e}</div>
            ))}
          </div>
        ))}
      </div>
      {bool(c.note) && <p className="lpv-note">{c.note as string}</p>}
    </section>
  )
}

function HighlightSection({ c }: { c: Record<string, unknown> }) {
  return (
    <section className="lpv-sec" style={{ paddingTop: 0 }}>
      <div className="lpv-highlight-box">
        {bool(c.title) && <div className="ht">{c.title as string}</div>}
        {bool(c.body) && <div className="hb">{c.body as string}</div>}
        {bool(c.footer) && <div className="hf">{c.footer as string}</div>}
      </div>
    </section>
  )
}

function CtaSection({ c }: { c: Record<string, unknown> }) {
  return (
    <div className="lpv-footer">
      <H2 c={c} />
      {bool(c.subtitle) && <p className="lpv-h2s">{c.subtitle as string}</p>}
      {c.url
        ? <Link href={c.url as string} className="lpv-footer-btn">▶ {(c.text as string) || '立即參加'}</Link>
        : <div className="lpv-footer-btn">▶ {(c.text as string) || '立即參加'}</div>}
    </div>
  )
}

function StatsSection({ c }: { c: Record<string, unknown> }) {
  const stats = (c.stats as { v: string; l: string; color?: string }[]) || []
  return (
    <section className="lpv-sec" style={{ paddingTop: 0 }}>
      <H2 c={c} />
      {bool(c.subtitle) && <p className="lpv-h2s">{c.subtitle as string}</p>}
      <div className="lpv-stats">
        {stats.map((s, i) => (
          <div key={i} className="lpv-stat">
            <div className="sv" style={{ color: s.color || undefined }}>{s.v}</div>
            <div className="sl">{s.l}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function FukuroSection({ c }: { c: Record<string, unknown> }) {
  const chips = (c.chips as string[]) || []
  const isAccent = c.variant === 'accent'
  const ftCls = c.ft_type === 'pp' ? 'fft lpv-pp' : c.ft_type === 'gold' ? 'fft lpv-gold' : 'fft'
  return (
    <section className="lpv-sec" style={{ paddingTop: 0 }}>
      <H2 c={c} />
      {bool(c.subtitle) && <p className="lpv-h2s">{c.subtitle as string}</p>}
      <div className={`lpv-fukuro-wrap${isAccent ? ' accent' : ''}`}>
        {bool(c.ft) && <div className={ftCls}>{c.ft as string}</div>}
        {bool(c.fb) && <div className="ffb">{c.fb as string}</div>}
        {bool(c.fb2) && <div className="ffb2">{c.fb2 as string}</div>}
        {chips.length > 0 && (
          <div className="lpv-chips">
            {chips.map((chip, i) => <span key={i} className="lpv-chip">{chip}</span>)}
          </div>
        )}
      </div>
      {bool(c.callout) && <div className="lpv-callout">{emphasize(c.callout as string)}</div>}
    </section>
  )
}

function RelSection({ c }: { c: Record<string, unknown> }) {
  type RelRow = { name: string; name_color?: string; value: string; desc?: string }
  const rows = (c.rows as RelRow[]) || []
  return (
    <section className="lpv-sec" style={{ paddingTop: 0 }}>
      <H2 c={c} />
      {bool(c.subtitle) && <p className="lpv-h2s">{c.subtitle as string}</p>}
      <div className="lpv-rel">
        {rows.map((row, i) => (
          <div key={i} className="lpv-relrow">
            <span className="rnm" style={{ color: row.name_color || undefined }}>{row.name}</span>
            <span>
              <span className="rst">{row.value}</span>
              {row.desc && <div className="rds">{row.desc}</div>}
            </span>
          </div>
        ))}
      </div>
      {bool(c.callout) && <div className="lpv-callout">{emphasize(c.callout as string)}</div>}
    </section>
  )
}

function RuleSection({ c }: { c: Record<string, unknown> }) {
  type RuleItem = { title: string; title_color?: string; desc: string }
  const rules = (c.rules as RuleItem[]) || []
  return (
    <section className="lpv-sec" style={{ paddingTop: 0 }}>
      <H2 c={c} />
      {bool(c.subtitle) && <p className="lpv-h2s">{c.subtitle as string}</p>}
      <div className="lpv-rule">
        {rules.map((rule, i) => (
          <div key={i} className="lpv-rc">
            <div className="rt" style={{ color: rule.title_color || undefined }}>{rule.title}</div>
            <div className="rd">{rule.desc}</div>
          </div>
        ))}
      </div>
      {bool(c.callout) && <div className="lpv-callout">{emphasize(c.callout as string)}</div>}
    </section>
  )
}

function TableSection({ c }: { c: Record<string, unknown> }) {
  const columns = (c.columns as string[]) || []
  const rows = (c.rows as string[][]) || []
  const hi = c.highlight_col as number | undefined
  return (
    <section className="lpv-sec" style={{ paddingTop: 0 }}>
      <H2 c={c} />
      {bool(c.subtitle) && <p className="lpv-h2s">{c.subtitle as string}</p>}
      <div className="lpv-tblwrap">
        <table className="lpv-tbl">
          {columns.length > 0 && (
            <thead><tr>
              {columns.map((col, i) => (
                <th key={i} className={hi !== undefined && hi === i ? 'hi' : ''}>{col}</th>
              ))}
            </tr></thead>
          )}
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  ci === 0
                    ? <th key={ci}>{cell}</th>
                    : <td key={ci} className={hi !== undefined && hi === ci ? 'hi' : ''}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {bool(c.note) && <p className="lpv-note" style={{ marginTop: 14 }}>{c.note as string}</p>}
    </section>
  )
}

function GallerySection({ c }: { c: Record<string, unknown> }) {
  type GItem = { media_type: 'image' | 'video'; url: string; poster?: string; caption?: string; badge?: string; color?: string }
  const items = (c.items as GItem[]) || []
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([])
  useEffect(() => {
    videoRefs.current.forEach(v => v?.play().catch(() => {}))
  }, [])
  const calloutBorder = c.callout_border as string | undefined
  return (
    <section className="lpv-sec" style={{ paddingTop: 0 }}>
      <H2 c={c} />
      {bool(c.subtitle) && <p className="lpv-h2s">{c.subtitle as string}</p>}
      <div className="lpv-gallery">
        {items.map((item, i) => (
          <div key={i} className="lpv-gitem">
            {item.media_type === 'video'
              ? <video ref={el => { videoRefs.current[i] = el }} src={item.url}
                  poster={item.poster || undefined} autoPlay muted loop playsInline preload="auto" />
              : <img src={item.url} alt={item.caption || ''} loading="lazy" />}
            {item.badge && (
              <span className="lpv-gbadge" style={{ color: item.color || undefined }}>{item.badge}</span>
            )}
            {item.caption && (
              <div className="lpv-gcap">
                <div className="lpv-gcn" style={{ color: item.color || undefined }}>{item.caption}</div>
              </div>
            )}
          </div>
        ))}
      </div>
      {bool(c.callout) && (
        <div className="lpv-callout" style={calloutBorder ? { borderColor: calloutBorder } : undefined}>
          {c.callout as string}
        </div>
      )}
    </section>
  )
}

function FeaturesSection({ c }: { c: Record<string, unknown> }) {
  type FItem = { icon: string; title: string; desc: string }
  const items = (c.items as FItem[]) || []
  return (
    <section className="lpv-sec" style={{ paddingTop: 0 }}>
      <H2 c={c} />
      {bool(c.subtitle) && <p className="lpv-h2s">{c.subtitle as string}</p>}
      <div className="lpv-features">
        {items.map((item, i) => (
          <div key={i} className="lpv-feat">
            {item.icon && (
              (item.icon.startsWith('http') || item.icon.startsWith('/'))
                ? <div className="lpv-feat-icon"><img src={item.icon} alt="" /></div>
                : <div className="lpv-feat-icon">{item.icon}</div>
            )}
            {item.title && <div className="lpv-feat-title">{item.title}</div>}
            {item.desc && <div className="lpv-feat-desc">{item.desc}</div>}
          </div>
        ))}
      </div>
    </section>
  )
}

function CountdownSection({ c }: { c: Record<string, unknown> }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const targetAt = c.target_at as string
  if (!targetAt) return null

  const diff = new Date(targetAt).getTime() - now
  const expired = diff <= 0
  const days  = expired ? 0 : Math.floor(diff / 86400000)
  const hours = expired ? 0 : Math.floor((diff % 86400000) / 3600000)
  const mins  = expired ? 0 : Math.floor((diff % 3600000) / 60000)
  const secs  = expired ? 0 : Math.floor((diff % 60000) / 1000)
  const pad   = (n: number) => String(n).padStart(2, '0')

  return (
    <section className="lpv-sec" style={{ paddingTop: 0 }}>
      <H2 c={c} />
      {bool(c.subtitle) && <p className="lpv-h2s">{c.subtitle as string}</p>}
      {expired ? (
        <p className="lpv-cd-expired">{(c.expired_text as string) || '活動已結束'}</p>
      ) : (
        <div className="lpv-countdown">
          <div className="lpv-cd-unit"><div className="lpv-cd-num">{pad(days)}</div><div className="lpv-cd-label">天</div></div>
          <div className="lpv-cd-sep">:</div>
          <div className="lpv-cd-unit"><div className="lpv-cd-num">{pad(hours)}</div><div className="lpv-cd-label">時</div></div>
          <div className="lpv-cd-sep">:</div>
          <div className="lpv-cd-unit"><div className="lpv-cd-num">{pad(mins)}</div><div className="lpv-cd-label">分</div></div>
          <div className="lpv-cd-sep">:</div>
          <div className="lpv-cd-unit"><div className="lpv-cd-num">{pad(secs)}</div><div className="lpv-cd-label">秒</div></div>
        </div>
      )}
      {!expired && bool(c.cta_url) && (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <Link href={c.cta_url as string} className="lpv-cta-btn">
            ▶ {(c.cta_text as string) || '立即參加'}
          </Link>
        </div>
      )}
    </section>
  )
}

function StickyCtaSection({ c }: { c: Record<string, unknown> }) {
  return (
    <div className="lpv-sticky">
      <div className="lpv-sticky-inner">
        {c.url
          ? <Link href={c.url as string} className="lpv-sticky-btn">▶ {(c.text as string) || '立即參加'}</Link>
          : <button className="lpv-sticky-btn">▶ {(c.text as string) || '立即參加'}</button>}
        {bool(c.sub_text) && <div className="lpv-sticky-sub">{c.sub_text as string}</div>}
      </div>
    </div>
  )
}

const SEALED_TYPES = ['ichiban', 'card', 'custom']

function ProductRefSection({ c, resolved }: { c: Record<string, unknown>; resolved?: Section['resolved'] }) {
  const prizes = resolved?.prizes || []
  // 一番賞／抽卡／自製賞的獎項在開賣前就排定，probability 跟實際結果無關，
  // 顯示出來只會誤導；轉蛋、盒玩是當下獨立隨機，那裡的數字是真的
  const showProbability = !SEALED_TYPES.includes(resolved?.product?.type ?? '')
  return (
    <section className="lpv-sec" style={{ paddingTop: 0 }}>
      {bool(c.h2) && <h2 className="lpv-h2">{c.h2 as string}</h2>}
      {bool(c.subtitle) && <p className="lpv-h2s">{c.subtitle as string}</p>}
      {resolved?.product && (
        <p className="lpv-h2s" style={{ marginTop: 0, marginBottom: 16, opacity: 0.45 }}>
          {resolved.product.name}
        </p>
      )}
      <div className="lpv-prizes">
        {prizes.map(prize => (
          <div key={prize.id} className="lpv-prize-row">
            {prize.image_url
              ? <img src={prize.image_url} alt={prize.name} className="lpv-prize-img" />
              : <div className="lpv-prize-img-placeholder">🎁</div>}
            <div className="lpv-prize-level">{prize.level}</div>
            <div className="lpv-prize-name">{prize.name}</div>
            <div className="lpv-prize-meta">
              {prize.remaining}/{prize.total}
              {showProbability && (
                <><br /><span style={{ fontSize: 10 }}>{(prize.probability * 100).toFixed(2)}%</span></>
              )}
            </div>
          </div>
        ))}
        {prizes.length === 0 && <p className="lpv-note">尚未設定獎品</p>}
      </div>
    </section>
  )
}

// ─── Related Products ──────────────────────────────────────────────────────────

interface RelProduct { id: number; name: string; image_url: string | null; type: string; remaining: number; price: number; special_price: number | null }

function RelatedProductsSection({ products }: { products: RelProduct[] }) {
  if (!products.length) return null
  return (
    <section className="lpv-sec" style={{ paddingTop: 40, paddingBottom: 60 }}>
      <h2 className="lpv-h2" style={{ marginBottom: 20 }}>相關商品</h2>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <div className="grid grid-cols-2 gap-3">
          {products.map(p => (
            <ProductCard
              key={p.id}
              id={p.id}
              name={p.name}
              image={p.image_url || ''}
              price={p.special_price ?? p.price}
              remaining={p.remaining}
              type={p.type as 'ichiban' | 'blindbox' | 'gacha' | 'card' | 'custom'}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Main ────────────────────────────────────────────────────────────────────

/** 從程式碼直接餵進來的頁面資料，給常駐頁用（見下方 `preset`） */
export type LpPreset = {
  event: Omit<EventData, 'id'> & { id?: string }
  sections: Array<Omit<Section, 'id'> & { id?: string }>
}

/**
 * 活動頁渲染器。
 *
 * 兩種資料來源：
 *   - `slug`：從 `/api/events/<slug>` 讀，後台「活動頁管理」建的檔期活動走這條
 *   - `preset`：直接把內容寫在程式碼裡，**常駐頁走這條**（例：抽獎公平性頁）
 *
 * 常駐頁為什麼不放後台：它不是檔期活動，不會下架，內容是對玩家的公平性承諾。
 * 放在 CMS 裡要另外做「不可刪除」的特例（後端 403 + 列表隱藏刪除鍵），
 * 清資料腳本也得為它開一個 `WHERE slug <> 'fairness'` 的例外 —— 為了一頁永遠不會
 * 被編輯的內容，在三個地方留特例。寫成程式碼就沒有這些事，改動也留在 git 裡。
 */
export default function LpRenderer({ slug, preset }: { slug?: string; preset?: LpPreset }) {
  const router = useRouter()
  const [data, setData] = useState<{ event: EventData; sections: Section[] } | null>(
    preset ? normalizePreset(preset) : null
  )
  const [notFound, setNotFound] = useState(false)
  const [showSticky, setShowSticky] = useState(false)
  const [relProducts, setRelProducts] = useState<RelProduct[]>([])
  const containerRef = useRef<HTMLDivElement>(null)

  /* 動態島文字：動態島底下是首屏（.lpv-hero），它的深淺由 hero_mode 決定
     （follow ＝ 跟著 theme_mode）。跟 css() 裡算 heroDark 是同一條規則 ——
     那邊算的是 heroBg，這邊算的是狀態列，改配色時兩個要一起看。
     還在載入時 data 是 null，LpLoadingScreen 的底也是深色，預設深色剛好對上。 */
  const lpHeroMode = data?.event.hero_mode ?? 'dark'
  const lpHeroDark = lpHeroMode === 'follow'
    ? (data?.event.theme_mode ?? 'dark') === 'dark'
    : lpHeroMode === 'dark'
  useStatusBarText(lpHeroDark ? 'white' : 'black')

  useEffect(() => {
    if (preset || !slug) return
    fetch(`/api/events/${slug}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => {
        setData(d)
        if (d.event?.linked_category_id) {
          fetch(`/api/events/${slug}/products`)
            .then(r => r.ok ? r.json() : [])
            .then(setRelProducts)
            .catch(() => {})
        }
      })
      .catch(() => setNotFound(true))
  }, [slug, preset])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onScroll = () => setShowSticky(el.scrollTop > el.clientHeight * 0.75)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const handleShare = async (title?: string) => {
    const url = window.location.href
    const isMobile = /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent) && window.matchMedia('(pointer: coarse)').matches
    if (navigator.share && isMobile) {
      try { await navigator.share({ title: title ?? 'GGB 活動', url }) } catch { /* cancelled */ }
    } else {
      try { await navigator.clipboard.writeText(url) } catch {
        const el = document.createElement('textarea')
        el.value = url; document.body.appendChild(el); el.select()
        document.execCommand('copy'); document.body.removeChild(el)
      }
    }
  }

  if (notFound) return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#0a0610', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
      <h1 style={{ fontWeight: 900, fontSize: 20, marginBottom: 8 }}>找不到此活動</h1>
      <button onClick={() => router.back()} style={{ color: 'rgba(255,255,255,.4)', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', marginTop: 8 }}>← 返回</button>
    </div>
  )

  if (!data) return <LpLoadingScreen />

  const { event, sections } = data
  // 檔期結束後頁面仍可開啟，僅版頭蓋黑遮罩；要完全隱藏請於後台取消上架
  const eventEnded = scheduleState(event.start_at, event.end_at) === 'ended'
  const stickySection = sections.find(s => s.type === 'sticky_cta')

  return (
    /* data-ptr-strip="#ffffff"：下拉的空隙露白底，跟邀請頁一致（老闆 2026-08-22）。
       這個容器帶 fixed 頂列，PwaPullToRefresh 會在容器裡塞一塊白色填色層（見 gapFill） */
    <div ref={containerRef} className="lpv" style={{ position: 'fixed', inset: 0, zIndex: 50, overflowY: 'auto', background: event.bg_color, paddingBottom: stickySection ? 90 : 0 }} data-ptr-strip="#ffffff">
      <style>{css({ bg: event.bg_color, accent: event.accent_color, theme: event.theme_mode, hero: event.hero_mode })}</style>
      {/* 動態島底下的漸層毛玻璃（老闆 2026-08-22）：深色活動頁帶黑、淺色帶白。
          是 .lpv 的 fixed 子節點：下拉更新拖的是流內子節點，它不會被拖走 */}
      <TopFadeBlur />
      <div className="lpv-topbar">
        <button onClick={() => router.back()} className="lpv-topbtn" aria-label="返回">
          <ChevronLeft size={20} strokeWidth={2.5} />
        </button>
        <button onClick={() => handleShare(event.title)} className="lpv-topbtn" aria-label="分享">
          <Share2 size={16} />
        </button>
      </div>
      {sections.map(sec => {
        switch (sec.type) {
          case 'hero':        return <HeroSection       key={sec.id} c={sec.content} ended={eventEnded} />
          case 'text':        return <TextSection        key={sec.id} c={sec.content} />
          case 'steps':       return <StepsSection       key={sec.id} c={sec.content} />
          case 'cards':       return <CardsSection       key={sec.id} c={sec.content} />
          case 'stats':       return <StatsSection       key={sec.id} c={sec.content} />
          case 'fukuro':      return <FukuroSection      key={sec.id} c={sec.content} />
          case 'rel':         return <RelSection         key={sec.id} c={sec.content} />
          case 'rule':        return <RuleSection        key={sec.id} c={sec.content} />
          case 'table':       return <TableSection       key={sec.id} c={sec.content} />
          case 'gallery':     return <GallerySection     key={sec.id} c={sec.content} />
          case 'features':    return <FeaturesSection    key={sec.id} c={sec.content} />
          case 'countdown':   return <CountdownSection   key={sec.id} c={sec.content} />
          case 'sticky_cta':  return null  // rendered separately below
          case 'highlight':   return <HighlightSection   key={sec.id} c={sec.content} />
          case 'cta':         return <CtaSection         key={sec.id} c={sec.content} />
          case 'product_ref': return <ProductRefSection  key={sec.id} c={sec.content} resolved={sec.resolved} />
          default:            return null
        }
      })}
      {relProducts.length > 0 && (
        <RelatedProductsSection products={relProducts} />
      )}
      {stickySection && showSticky && <StickyCtaSection c={stickySection.content} />}
    </div>
  )
}
