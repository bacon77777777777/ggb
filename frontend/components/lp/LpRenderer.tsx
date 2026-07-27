'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Share2 } from 'lucide-react'

interface EventData {
  id: string; slug: string; title: string
  bg_color: string; accent_color: string
  is_active: boolean; start_at: string | null; end_at: string | null
}
interface Prize { id: number; level: string; name: string; image_url: string | null; total: number; remaining: number; probability: number; recycle_value: number | null }
interface Section {
  id: string; type: string; sort_order: number
  content: Record<string, unknown>
  resolved?: { product: { id: number; name: string } | null; prizes: Prize[] }
}

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
}
const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)))

function css(vars: { bg: string; accent: string }) {
  const [ar,ag,ab] = hexRgb(vars.accent)
  const [br,bg_,bb] = hexRgb(vars.bg)
  const a = `${ar},${ag},${ab}`

  // Solid card colours — computed like zetcho's hardcoded #180a1e / #0c0610 / #3a2042
  // bg lifted slightly + small accent tint → produces dark tinted surface
  const c1r = clamp(br+8+ar*0.04), c1g = clamp(bg_+8+ag*0.04), c1b = clamp(bb+8+ab*0.04)
  const c2r = clamp(br+3+ar*0.02), c2g = clamp(bg_+3+ag*0.02), c2b = clamp(bb+3+ab*0.02)
  const e1r = clamp(br+28+ar*0.08), e1g = clamp(bg_+18+ag*0.08), e1b = clamp(bb+28+ab*0.08)
  const e2r = clamp(br+48+ar*0.14), e2g = clamp(bg_+32+ag*0.14), e2b = clamp(bb+48+ab*0.14)
  const cardBg1   = `rgb(${c1r},${c1g},${c1b})`   // like #180a1e
  const cardBg2   = `rgb(${c2r},${c2g},${c2b})`   // like #0c0610
  const cardDark   = cardBg1
  const cardDarker = cardBg2
  const borderMid    = `rgb(${e1r},${e1g},${e1b})` // like #3a2042
  const borderStrong = `rgb(${e2r},${e2g},${e2b})` // brighter border

  // Lightened accent (like zetcho's #e879f9 vs base #c026d3 — used for numbers, eyebrow)
  const accentLight = `rgb(${clamp(ar+(255-ar)*.50)},${clamp(ag+(255-ag)*.32)},${clamp(ab+(255-ab)*.18)})`

  // rgba for glows / shadows (these DO need transparency)
  const glow40 = `rgba(${a},0.40)`
  const glow20 = `rgba(${a},0.20)`
  const glow08 = `rgba(${a},0.08)`

  // 4-stop title gradient (zetcho --pp pattern): pale→bright→dark→base
  const tL = `rgb(${clamp(ar+(255-ar)*.75)},${clamp(ag+(255-ag)*.75)},${clamp(ab+(255-ab)*.75)})`
  const tB = `rgb(${clamp(ar+(255-ar)*.28)},${clamp(ag+(255-ag)*.28)},${clamp(ab+(255-ab)*.28)})`
  const tD = `rgb(${clamp(ar*.60)},${clamp(ag*.60)},${clamp(ab*.60)})`
  const titleGrad = `linear-gradient(180deg,${tL},${tB} 46%,${tD} 64%,${vars.accent})`

  // Gold — always fixed like zetcho's --gold
  const GOLD = 'linear-gradient(180deg,#fffbe6,#ffd24a 46%,#a9760c 62%,#ffcf5a)'
  const GOLD_SHADOW = 'rgba(255,210,74,0.5)'

  return `
    .lpv{background:${vars.bg};color:#fff;min-height:100svh;overflow-x:hidden;
      font-family:'Noto Sans JP',system-ui,sans-serif;}
    .lpv-topbar{position:fixed;top:0;left:0;right:0;z-index:60;display:flex;align-items:center;
      justify-content:space-between;padding:env(safe-area-inset-top) 0 0;pointer-events:none;}
    .lpv-topbtn{pointer-events:auto;margin:8px;width:36px;height:36px;border-radius:999px;
      background:rgba(0,0,0,.3);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
      display:flex;align-items:center;justify-content:center;color:#fff;
      border:none;cursor:pointer;transition:opacity .15s;text-decoration:none;}
    .lpv-topbtn:hover{opacity:.75;}

    /* ── HERO ── */
    .lpv-hero{position:relative;min-height:100svh;display:flex;flex-direction:column;align-items:center;
      justify-content:center;text-align:center;padding:80px 24px 60px;overflow:hidden;}
    .lpv-hero .h-bg{position:absolute;inset:0;
      background:radial-gradient(110% 70% at 50% 14%,${borderStrong},transparent 52%),
                 radial-gradient(80% 50% at 50% 0%,${borderMid},transparent 55%);}
    .lpv-hero .h-beam{position:absolute;top:-22%;left:50%;transform:translateX(-50%);
      width:130%;height:56%;background:radial-gradient(closest-side,${glow20},transparent);filter:blur(36px);}
    .lpv-hero .h-veil{position:absolute;inset:0;
      background:radial-gradient(120% 92% at 50% 34%,transparent,rgba(10,6,16,.65) 55%,${vars.bg} 92%);}
    .lpv-eyebrow{position:relative;z-index:1;font-size:12px;letter-spacing:7px;color:${accentLight};
      font-weight:800;margin-bottom:16px;text-transform:uppercase;opacity:.9;}
    .lpv-title{position:relative;z-index:1;font-family:'Arial Black','Noto Sans JP',sans-serif;
      font-weight:900;line-height:.9;letter-spacing:2px;font-size:clamp(34px,9.5vw,78px);
      background:${titleGrad};
      -webkit-background-clip:text;background-clip:text;color:transparent;
      filter:drop-shadow(0 4px 26px ${glow40});}
    .lpv-gems{position:relative;z-index:1;display:flex;gap:10px;justify-content:center;margin-top:18px;}
    .lpv-gems i{width:14px;height:14px;border-radius:999px;display:block;
      box-shadow:0 0 14px currentColor,0 0 28px currentColor;}
    .lpv-sub{position:relative;z-index:1;margin-top:18px;font-size:clamp(14px,4vw,19px);
      font-weight:700;color:rgba(255,255,255,.78);max-width:560px;line-height:1.7;}
    .lpv-arasa{position:relative;z-index:1;margin-top:22px;display:inline-block;
      padding:9px 22px;border-radius:8px;font-weight:900;font-size:clamp(13px,3.6vw,16px);
      color:rgba(255,255,255,.92);background:rgba(0,0,0,.4);
      border:2px dashed ${borderStrong};
      box-shadow:0 0 18px ${glow20};letter-spacing:.5px;}
    .lpv-badge{position:relative;z-index:1;margin-top:16px;font-size:11px;letter-spacing:3px;
      color:${vars.accent};font-weight:800;opacity:.8;
      animation:lpvPulse 2.4s ease-in-out infinite;}
    @keyframes lpvPulse{0%,100%{opacity:.6}50%{opacity:1}}
    .lpv-cta-btn{display:inline-flex;align-items:center;gap:8px;margin-top:30px;
      padding:16px 40px;border-radius:999px;font-weight:900;font-size:18px;
      color:#3a2c08;background:${GOLD};
      box-shadow:0 8px 30px ${GOLD_SHADOW};position:relative;z-index:1;text-decoration:none;
      transition:transform .15s;}
    .lpv-cta-btn:active{transform:scale(.97);}
    .lpv-scroll{position:absolute;bottom:18px;left:0;right:0;z-index:1;font-size:11px;
      letter-spacing:3px;color:rgba(255,255,255,.3);animation:lpvBob 1.8s ease-in-out infinite;text-align:center;}
    @keyframes lpvBob{0%,100%{transform:translateY(0)}50%{transform:translateY(6px)}}

    /* ── SECTIONS ── */
    .lpv-sec{padding:64px 18px;max-width:1000px;margin:0 auto;}
    .lpv-h2{text-align:center;font-weight:900;font-size:clamp(26px,7vw,44px);letter-spacing:1px;color:#fff;}
    .lpv-h2-accent{color:${vars.accent};}
    .lpv-h2s{text-align:center;font-size:13px;margin-top:8px;margin-bottom:34px;
      font-weight:700;letter-spacing:.5px;line-height:1.7;color:rgba(${a},0.75);}
    .lpv-body{font-size:15px;color:rgba(255,255,255,.72);line-height:1.9;white-space:pre-wrap;}

    /* ── STEPS (flow) ── */
    .lpv-flow{display:flex;flex-direction:column;gap:0;max-width:560px;margin:0 auto;}
    .lpv-flowrow{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:12px;
      border:1px solid ${borderMid};
      background:linear-gradient(180deg,${cardDark},${cardDarker});}
    .lpv-flowno{font-family:'Arial Black',sans-serif;font-weight:900;font-size:22px;
      color:${accentLight};width:30px;text-align:center;flex:none;}
    .lpv-ft{font-weight:900;font-size:15px;}
    .lpv-fd{font-size:11px;color:rgba(255,255,255,.45);font-weight:600;margin-top:2px;line-height:1.5;}
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
    .lpv-card-tag{display:inline-block;font-size:10px;font-weight:900;letter-spacing:1.5px;
      padding:3px 12px;border-radius:999px;margin-bottom:12px;
      background:rgba(255,255,255,.08);color:rgba(255,255,255,.65);}
    .lpv-card.grand .lpv-card-tag{background:${cardDark};color:${vars.accent};}
    .lpv-card-title{font-weight:900;font-size:17px;}
    .lpv-card-sub{font-size:11px;color:rgba(255,255,255,.42);margin-top:4px;}
    .lpv-card-num{font-weight:900;font-size:clamp(28px,8vw,42px);line-height:1.05;margin-top:10px;
      background:linear-gradient(180deg,#fff 20%,${vars.accent});
      -webkit-background-clip:text;background-clip:text;color:transparent;}
    .lpv-card-unit{font-size:14px;font-weight:900;}
    .lpv-card-extras{margin-top:8px;font-size:12px;color:rgba(255,255,255,.45);font-weight:600;line-height:1.6;}
    .lpv-note{text-align:center;color:rgba(255,255,255,.28);font-size:11px;margin-top:12px;line-height:1.7;}

    /* ── HIGHLIGHT BOX ── */
    .lpv-highlight-box{border-radius:16px;border:1px solid ${borderStrong};
      background:linear-gradient(180deg,${cardDark},rgba(0,0,0,.5));
      padding:28px 20px;text-align:center;max-width:640px;margin:0 auto;
      box-shadow:0 0 40px ${glow08};}
    .lpv-highlight-box .ht{font-weight:900;font-size:clamp(18px,5vw,26px);
      background:linear-gradient(180deg,#fff,${vars.accent});
      -webkit-background-clip:text;background-clip:text;color:transparent;}
    .lpv-highlight-box .hb{margin:14px auto 0;color:rgba(255,255,255,.68);
      font-size:14px;line-height:1.9;font-weight:600;max-width:520px;white-space:pre-wrap;}
    .lpv-highlight-box .hf{margin-top:16px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08);
      font-size:12px;color:rgba(255,255,255,.38);font-weight:600;}

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
    .lpv-stat .sl{font-size:11px;color:rgba(${a},0.65);font-weight:700;margin-top:6px;letter-spacing:.3px;}

    /* ── FUKURO ── */
    .lpv-fukuro-wrap{border-radius:16px;border:1px solid ${borderStrong};
      background:linear-gradient(180deg,${cardDark},rgba(0,0,0,.5));
      padding:26px 18px;text-align:center;max-width:680px;margin:0 auto;}
    .lpv-fukuro-wrap .fft{font-weight:900;font-size:clamp(19px,5.2vw,28px);}
    .lpv-fukuro-wrap .ffb{margin:12px auto 0;color:rgba(255,255,255,.7);font-size:13px;
      line-height:1.85;font-weight:600;max-width:580px;white-space:pre-wrap;}
    .lpv-fukuro-wrap .ffb2{margin-top:10px;color:${vars.accent};font-size:13px;font-weight:800;}
    .lpv-chips{margin-top:14px;display:flex;flex-wrap:wrap;justify-content:center;gap:4px;}
    .lpv-chip{display:inline-block;margin:4px;padding:6px 14px;border-radius:999px;font-size:11px;font-weight:800;
      color:${vars.accent};border:1px solid rgba(${a},0.40);background:rgba(0,0,0,.3);}
    .lpv-callout{max-width:680px;margin:22px auto 0;padding:14px 16px;border-radius:12px;
      border:1px dashed rgba(${a},0.40);background:rgba(0,0,0,.25);
      color:rgba(255,255,255,.72);font-size:12.5px;font-weight:700;line-height:1.85;text-align:left;}

    /* ── PRODUCT PRIZES ── */
    .lpv-prizes{display:flex;flex-direction:column;gap:8px;max-width:640px;margin:0 auto;}
    .lpv-prize-row{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;
      border:1px solid ${borderMid};background:linear-gradient(180deg,${cardDark},${cardDarker});}
    .lpv-prize-img{width:44px;height:44px;border-radius:8px;object-fit:cover;background:rgba(255,255,255,.08);flex:none;}
    .lpv-prize-img-placeholder{width:44px;height:44px;border-radius:8px;background:rgba(255,255,255,.08);flex:none;
      display:flex;align-items:center;justify-content:center;font-size:18px;}
    .lpv-prize-level{font-weight:900;font-size:13px;color:${vars.accent};min-width:32px;}
    .lpv-prize-name{font-size:14px;font-weight:700;flex:1;}
    .lpv-prize-meta{font-size:11px;color:rgba(255,255,255,.38);text-align:right;font-weight:600;}
  `
}

function HeroSection({ c }: { c: Record<string, unknown> }) {
  const gems = (c.gems as { color: string }[]) || []
  return (
    <section className="lpv-hero">
      <div className="h-bg" /><div className="h-beam" /><div className="h-veil" />
      {c.eyebrow && <div className="lpv-eyebrow">{c.eyebrow as string}</div>}
      {c.title && <h1 className="lpv-title">{c.title as string}</h1>}
      {gems.length > 0 && (
        <div className="lpv-gems">
          {gems.map((g, i) => <i key={i} style={{ background: g.color, color: g.color }} />)}
        </div>
      )}
      {c.subtitle && <p className="lpv-sub">{c.subtitle as string}</p>}
      {c.highlight_text && <div className="lpv-arasa">{c.highlight_text as string}</div>}
      {c.badge_text && <div className="lpv-badge">● {c.badge_text as string}</div>}
      {c.cta_url && (
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
      {c.h2 && <h2 className="lpv-h2">{c.h2 as string}</h2>}
      {c.subtitle && <p className="lpv-h2s">{c.subtitle as string}</p>}
      {c.body && <p className="lpv-body">{c.body as string}</p>}
    </section>
  )
}

function StepsSection({ c }: { c: Record<string, unknown> }) {
  const steps = (c.steps as { title: string; description: string }[]) || []
  return (
    <section className="lpv-sec" style={{ paddingTop: 0 }}>
      {c.h2 && <h2 className="lpv-h2">{c.h2 as string}</h2>}
      {c.subtitle && <p className="lpv-h2s">{c.subtitle as string}</p>}
      <div className="lpv-flow" style={{ gap: 0 }}>
        {steps.map((s, i) => (
          <div key={i}>
            <div className="lpv-flowrow">
              <div className="lpv-flowno">{i + 1}</div>
              <div style={{ minWidth: 0 }}>
                <div className="lpv-ft">{s.title}</div>
                {s.description && <div className="lpv-fd">{s.description}</div>}
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
  type CardItem = { tag: string; variant: string; title: string; subtitle: string; value: string; unit: string; extras: string[] }
  const cards = (c.cards as CardItem[]) || []
  return (
    <section className="lpv-sec" style={{ paddingTop: 0 }}>
      {c.h2 && <h2 className="lpv-h2">{c.h2 as string}</h2>}
      {c.subtitle && <p className="lpv-h2s">{c.subtitle as string}</p>}
      <div className="lpv-cards">
        {cards.map((card, i) => (
          <div key={i} className={`lpv-card ${card.variant === 'grand' ? 'grand' : 'star'}`}>
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
      {c.note && <p className="lpv-note">{c.note as string}</p>}
    </section>
  )
}

function HighlightSection({ c }: { c: Record<string, unknown> }) {
  return (
    <section className="lpv-sec" style={{ paddingTop: 0 }}>
      <div className="lpv-highlight-box">
        {c.title && <div className="ht">{c.title as string}</div>}
        {c.body && <div className="hb">{c.body as string}</div>}
        {c.footer && <div className="hf">{c.footer as string}</div>}
      </div>
    </section>
  )
}

function CtaSection({ c }: { c: Record<string, unknown> }) {
  return (
    <div className="lpv-footer">
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
      {c.h2 && <h2 className="lpv-h2">{c.h2 as string}</h2>}
      {c.subtitle && <p className="lpv-h2s">{c.subtitle as string}</p>}
      <div className="lpv-stats">
        {stats.map((s, i) => (
          <div key={i} className="lpv-stat">
            <div className="sv" style={{ color: s.color || 'var(--accent)' }}>{s.v}</div>
            <div className="sl">{s.l}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function FukuroSection({ c }: { c: Record<string, unknown> }) {
  const chips = (c.chips as string[]) || []
  return (
    <section className="lpv-sec" style={{ paddingTop: 0 }}>
      {c.h2 && <h2 className="lpv-h2">{c.h2 as string}</h2>}
      {c.subtitle && <p className="lpv-h2s">{c.subtitle as string}</p>}
      <div className="lpv-fukuro-wrap">
        {c.ft && <div className="fft">{c.ft as string}</div>}
        {c.fb && <div className="ffb">{c.fb as string}</div>}
        {c.fb2 && <div className="ffb2">{c.fb2 as string}</div>}
        {chips.length > 0 && (
          <div className="lpv-chips">
            {chips.map((chip, i) => <span key={i} className="lpv-chip">{chip}</span>)}
          </div>
        )}
      </div>
      {c.callout && <div className="lpv-callout">{c.callout as string}</div>}
    </section>
  )
}

function ProductRefSection({ c, resolved }: { c: Record<string, unknown>; resolved?: Section['resolved'] }) {
  const prizes = resolved?.prizes || []
  return (
    <section className="lpv-sec" style={{ paddingTop: 0 }}>
      {c.h2 && <h2 className="lpv-h2">{c.h2 as string}</h2>}
      {c.subtitle && <p className="lpv-h2s">{c.subtitle as string}</p>}
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
              {prize.remaining}/{prize.total}<br />
              <span style={{ fontSize: 10 }}>{(prize.probability * 100).toFixed(2)}%</span>
            </div>
          </div>
        ))}
        {prizes.length === 0 && <p className="lpv-note">尚未設定獎品</p>}
      </div>
    </section>
  )
}

export default function LpRenderer({ slug }: { slug: string }) {
  const router = useRouter()
  const [data, setData] = useState<{ event: EventData; sections: Section[] } | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    fetch(`/api/events/${slug}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => setData(d))
      .catch(() => setNotFound(true))
  }, [slug])

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

  if (!data) return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#0a0610', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,.15)', borderTopColor: '#ffd24a', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const { event, sections } = data

  return (
    <div className="lpv" style={{ position: 'fixed', inset: 0, zIndex: 50, overflowY: 'auto', background: event.bg_color }}>
      <style>{css({ bg: event.bg_color, accent: event.accent_color })}</style>
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
          case 'hero':        return <HeroSection       key={sec.id} c={sec.content} />
          case 'text':        return <TextSection        key={sec.id} c={sec.content} />
          case 'steps':       return <StepsSection       key={sec.id} c={sec.content} />
          case 'cards':       return <CardsSection       key={sec.id} c={sec.content} />
          case 'stats':       return <StatsSection        key={sec.id} c={sec.content} />
          case 'fukuro':      return <FukuroSection       key={sec.id} c={sec.content} />
          case 'highlight':   return <HighlightSection   key={sec.id} c={sec.content} />
          case 'cta':         return <CtaSection         key={sec.id} c={sec.content} />
          case 'product_ref': return <ProductRefSection  key={sec.id} c={sec.content} resolved={sec.resolved} />
          default:            return null
        }
      })}
    </div>
  )
}
