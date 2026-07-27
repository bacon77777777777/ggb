'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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

function css(vars: { bg: string; accent: string }) {
  return `
    .lpv{--bg:${vars.bg};--accent:${vars.accent};--accent20:${vars.accent}33;--accent50:${vars.accent}80;
      background:var(--bg);color:#fff;min-height:100svh;overflow-x:hidden;font-family:'Noto Sans JP',system-ui,sans-serif;}
    .lpv-back{position:fixed;top:14px;left:14px;z-index:60;display:flex;align-items:center;gap:6px;
      padding:8px 14px;border-radius:999px;background:rgba(0,0,0,.5);backdrop-filter:blur(8px);
      color:rgba(255,255,255,.85);font-size:13px;font-weight:700;border:1px solid rgba(255,255,255,.15);
      cursor:pointer;text-decoration:none;transition:opacity .15s;}
    .lpv-back:hover{opacity:.8;}
    .lpv-hero{position:relative;min-height:100svh;display:flex;flex-direction:column;align-items:center;
      justify-content:center;text-align:center;padding:80px 24px 40px;overflow:hidden;}
    .lpv-hero .h-bg{position:absolute;inset:0;
      background:radial-gradient(115% 75% at 50% 16%,var(--accent20),transparent 56%),
                 radial-gradient(90% 60% at 50% 0%,var(--accent20),transparent 60%);}
    .lpv-hero .h-beam{position:absolute;top:-18%;left:50%;transform:translateX(-50%);
      width:120%;height:52%;background:radial-gradient(closest-side,var(--accent20),transparent);filter:blur(30px);}
    .lpv-hero .h-veil{position:absolute;inset:0;
      background:radial-gradient(120% 92% at 50% 34%,transparent,rgba(10,6,16,.6) 58%,var(--bg) 92%);}
    .lpv-eyebrow{position:relative;z-index:1;font-size:11px;letter-spacing:7px;color:var(--accent);
      opacity:.8;font-weight:800;margin-bottom:14px;text-transform:uppercase;}
    .lpv-title{position:relative;z-index:1;font-weight:900;line-height:.95;letter-spacing:2px;
      font-size:clamp(44px,13vw,88px);
      background:linear-gradient(180deg,#fff 30%,var(--accent) 100%);
      -webkit-background-clip:text;background-clip:text;color:transparent;
      filter:drop-shadow(0 5px 26px var(--accent50));}
    .lpv-gems{position:relative;z-index:1;display:flex;gap:9px;justify-content:center;margin-top:18px;}
    .lpv-gems i{width:13px;height:13px;border-radius:999px;display:block;box-shadow:0 0 12px currentColor;}
    .lpv-sub{position:relative;z-index:1;margin-top:18px;font-size:clamp(14px,4vw,18px);
      font-weight:700;color:rgba(255,255,255,.75);max-width:520px;line-height:1.7;}
    .lpv-highlight{position:relative;z-index:1;margin-top:20px;display:inline-block;
      padding:10px 22px;border-radius:10px;font-weight:900;font-size:clamp(13px,3.4vw,15px);
      color:rgba(255,255,255,.9);background:rgba(255,255,255,.08);border:1.5px solid var(--accent50);
      box-shadow:0 0 20px var(--accent20);letter-spacing:.5px;}
    .lpv-badge{position:relative;z-index:1;margin-top:14px;font-size:11px;
      color:rgba(255,255,255,.4);font-weight:700;letter-spacing:1px;}
    .lpv-cta-btn{display:inline-flex;align-items:center;gap:8px;margin-top:24px;
      padding:16px 44px;border-radius:999px;font-weight:900;font-size:18px;
      color:#1a1208;background:linear-gradient(180deg,#fff8e0,var(--accent) 46%,color-mix(in srgb,var(--accent) 60%,#000) 64%,var(--accent));
      box-shadow:0 10px 34px var(--accent50);position:relative;z-index:1;text-decoration:none;transition:transform .15s;}
    .lpv-cta-btn:active{transform:scale(.97);}
    .lpv-scroll{position:absolute;bottom:18px;left:0;right:0;z-index:1;font-size:11px;
      letter-spacing:3px;color:rgba(255,255,255,.3);animation:lpvBob 1.8s ease-in-out infinite;text-align:center;}
    @keyframes lpvBob{0%,100%{transform:translateY(0);opacity:.5}50%{transform:translateY(6px);opacity:.9}}
    .lpv-sec{padding:52px 18px;max-width:840px;margin:0 auto;}
    .lpv-h2{text-align:center;font-weight:900;font-size:clamp(24px,6.5vw,40px);letter-spacing:1px;
      background:linear-gradient(180deg,#fff,var(--accent));-webkit-background-clip:text;background-clip:text;color:transparent;}
    .lpv-h2s{text-align:center;color:rgba(255,255,255,.4);font-size:13px;margin-top:8px;margin-bottom:28px;
      font-weight:600;letter-spacing:.5px;line-height:1.7;}
    .lpv-body{font-size:15px;color:rgba(255,255,255,.75);line-height:1.85;white-space:pre-wrap;}
    .lpv-flow{display:flex;flex-direction:column;gap:10px;max-width:600px;margin:0 auto;}
    .lpv-flowrow{display:flex;align-items:flex-start;gap:14px;padding:15px 16px;border-radius:14px;
      border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);}
    .lpv-flowno{font-weight:900;font-size:16px;color:#1a1208;width:30px;height:30px;flex:none;
      border-radius:999px;display:grid;place-items:center;
      background:linear-gradient(180deg,#fff8e0,var(--accent));}
    .lpv-ft{font-weight:900;font-size:15px;}
    .lpv-fd{font-size:12px;color:rgba(255,255,255,.45);font-weight:600;margin-top:3px;line-height:1.6;}
    .lpv-cards{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;}
    @media(max-width:520px){.lpv-cards{grid-template-columns:1fr;}}
    .lpv-card{border-radius:18px;padding:22px 18px;text-align:center;overflow:hidden;}
    .lpv-card.star{border:1.5px solid rgba(255,255,255,.2);background:rgba(255,255,255,.05);}
    .lpv-card.grand{border:2px solid var(--accent50);background:linear-gradient(180deg,var(--accent20),rgba(0,0,0,.3));
      box-shadow:0 0 30px var(--accent20);}
    .lpv-card-tag{display:inline-block;font-size:10px;font-weight:900;letter-spacing:1px;
      padding:3px 12px;border-radius:999px;margin-bottom:10px;background:rgba(255,255,255,.1);color:rgba(255,255,255,.7);}
    .lpv-card.grand .lpv-card-tag{background:var(--accent20);color:var(--accent);}
    .lpv-card-title{font-weight:900;font-size:17px;}
    .lpv-card-sub{font-size:11px;color:rgba(255,255,255,.45);margin-top:4px;}
    .lpv-card-num{font-weight:900;font-size:clamp(28px,8vw,42px);line-height:1.05;margin-top:10px;
      background:linear-gradient(180deg,#fff,var(--accent));-webkit-background-clip:text;background-clip:text;color:transparent;}
    .lpv-card-unit{font-size:14px;font-weight:900;}
    .lpv-card-extras{margin-top:8px;font-size:12px;color:rgba(255,255,255,.5);font-weight:600;line-height:1.6;}
    .lpv-note{text-align:center;color:rgba(255,255,255,.3);font-size:11px;margin-top:14px;line-height:1.7;}
    .lpv-highlight-box{border-radius:16px;border:1px solid var(--accent50);
      background:linear-gradient(180deg,var(--accent20),rgba(0,0,0,.4));padding:24px 18px;
      text-align:center;max-width:600px;margin:0 auto;}
    .lpv-highlight-box .ht{font-weight:900;font-size:clamp(17px,5vw,24px);
      background:linear-gradient(180deg,#fff,var(--accent));-webkit-background-clip:text;background-clip:text;color:transparent;}
    .lpv-highlight-box .hb{margin:12px auto 0;color:rgba(255,255,255,.65);font-size:14px;line-height:1.85;font-weight:600;max-width:500px;}
    .lpv-highlight-box .hf{margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.1);
      font-size:13px;color:rgba(255,255,255,.4);font-weight:600;}
    .lpv-prizes{display:flex;flex-direction:column;gap:8px;max-width:600px;margin:0 auto;}
    .lpv-prize-row{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;
      border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);}
    .lpv-prize-img{width:44px;height:44px;border-radius:8px;object-fit:cover;background:rgba(255,255,255,.08);flex:none;}
    .lpv-prize-img-placeholder{width:44px;height:44px;border-radius:8px;background:rgba(255,255,255,.08);flex:none;
      display:flex;align-items:center;justify-content:center;font-size:18px;}
    .lpv-prize-level{font-weight:900;font-size:13px;color:var(--accent);min-width:32px;}
    .lpv-prize-name{font-size:14px;font-weight:700;flex:1;}
    .lpv-prize-meta{font-size:11px;color:rgba(255,255,255,.4);text-align:right;font-weight:600;}
    .lpv-footer{padding:0 18px 64px;max-width:600px;margin:0 auto;}
    .lpv-footer-btn{display:block;text-align:center;border-radius:999px;padding:17px;font-weight:900;
      font-size:17px;color:#1a1208;text-decoration:none;
      background:linear-gradient(180deg,#fff8e0,var(--accent) 46%,color-mix(in srgb,var(--accent) 60%,#000) 64%,var(--accent));
      box-shadow:0 10px 30px var(--accent50);}
  `
}

function HeroSection({ c }: { c: Record<string, unknown> }) {
  const gems = (c.gems as { color: string }[]) || []
  return (
    <section className="lpv-hero">
      <div className="h-bg" /><div className="h-beam" /><div className="h-veil" />
      {c.eyebrow && <div className="lpv-eyebrow">{c.eyebrow as string}</div>}
      {c.title && <h1 className="lpv-title">{c.title as string}</h1>}
      {gems.length > 0 && <div className="lpv-gems">{gems.map((g, i) => <i key={i} style={{ background: g.color, color: g.color }} />)}</div>}
      {c.subtitle && <p className="lpv-sub">{c.subtitle as string}</p>}
      {c.highlight_text && <div className="lpv-highlight">{c.highlight_text as string}</div>}
      {c.badge_text && <div className="lpv-badge">{c.badge_text as string}</div>}
      {c.cta_url && <Link href={c.cta_url as string} className="lpv-cta-btn">▶ {(c.cta_text as string) || '立即參加'}</Link>}
      <div className="lpv-scroll">▽ SCROLL</div>
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
      <div className="lpv-flow">
        {steps.map((s, i) => (
          <div key={i} className="lpv-flowrow">
            <div className="lpv-flowno">{i + 1}</div>
            <div style={{ minWidth: 0 }}>
              <div className="lpv-ft">{s.title}</div>
              {s.description && <div className="lpv-fd">{s.description}</div>}
            </div>
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
            {card.value && <div className="lpv-card-num">{card.value}<span className="lpv-card-unit">{card.unit}</span></div>}
            {card.extras?.filter(Boolean).map((e, j) => <div key={j} className="lpv-card-extras">{e}</div>)}
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
        ? <Link href={c.url as string} className="lpv-footer-btn">{(c.text as string) || '立即參加'} →</Link>
        : <div className="lpv-footer-btn">{(c.text as string) || '立即參加'} →</div>}
    </div>
  )
}

function ProductRefSection({ c, resolved }: { c: Record<string, unknown>; resolved?: Section['resolved'] }) {
  const prizes = resolved?.prizes || []
  return (
    <section className="lpv-sec" style={{ paddingTop: 0 }}>
      {c.h2 && <h2 className="lpv-h2">{c.h2 as string}</h2>}
      {c.subtitle && <p className="lpv-h2s">{c.subtitle as string}</p>}
      {resolved?.product && <p className="lpv-h2s" style={{ marginTop: 0, marginBottom: 16, opacity: 0.5 }}>{resolved.product.name}</p>}
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

  if (notFound) return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#0a0610', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
      <h1 style={{ fontWeight: 900, fontSize: 20, marginBottom: 8 }}>找不到此活動</h1>
      <button onClick={() => router.back()} style={{ color: 'rgba(255,255,255,.5)', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', marginTop: 8 }}>← 返回</button>
    </div>
  )

  if (!data) return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#0a0610', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,.2)', borderTopColor: '#ffd24a', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const { event, sections } = data

  return (
    <div className="lpv" style={{ position: 'fixed', inset: 0, zIndex: 50, overflowY: 'auto', background: event.bg_color }}>
      <style>{css({ bg: event.bg_color, accent: event.accent_color })}</style>
      <button onClick={() => router.back()} className="lpv-back">← 返回</button>
      {sections.map(sec => {
        switch (sec.type) {
          case 'hero': return <HeroSection key={sec.id} c={sec.content} />
          case 'text': return <TextSection key={sec.id} c={sec.content} />
          case 'steps': return <StepsSection key={sec.id} c={sec.content} />
          case 'cards': return <CardsSection key={sec.id} c={sec.content} />
          case 'highlight': return <HighlightSection key={sec.id} c={sec.content} />
          case 'cta': return <CtaSection key={sec.id} c={sec.content} />
          case 'product_ref': return <ProductRefSection key={sec.id} c={sec.content} resolved={sec.resolved} />
          default: return null
        }
      })}
    </div>
  )
}
