/**
 * 灌籃SLAM DUNK 獎池卡片產生器
 *
 * 來源：NBA 官方公開的球員去背照 CDN
 *   https://cdn.nba.com/headshots/nba/latest/1040x760/{playerId}.png
 *   無需金鑰、無反爬機制。（130point 等卡片站皆有 Cloudflare Turnstile，
 *   那是站方刻意的存取控制，不繞過；且其圖為 eBay 賣家照片，商用風險高。）
 *
 * 產出：由我方合成的卡面（自家卡框＋球員照＋名字＋稀有度），非直接轉貼他站商品圖。
 *
 * ⚠️ 這是把機台先跑起來用的素材。正式販售時應改用廠商實拍圖，
 *    讓獎池圖片與實際會寄出的卡片一致。
 *
 * 用法：npx tsx scripts/build_nba_cards.ts
 */
import sharp from 'sharp'
import { r2Upload } from '../lib/r2'

const CARD_W = 640
const CARD_H = 880

type Tier = 'god' | 'legend' | 'star' | 'core'

interface Player { id: number; name: string; team: string; tier: Tier }

/** 稀有度 → 卡框配色與回收價（回收價對齊現有機台獎池區間） */
const TIER: Record<Tier, { label: string; c1: string; c2: string; glow: string; value: number; level: string }> = {
  god:    { label: 'GOD',    c1: '#ffd24a', c2: '#b8860b', glow: '#fff3b0', value: 1200, level: '一等獎' },
  legend: { label: 'LEGEND', c1: '#e879f9', c2: '#6d28d9', glow: '#f5d0fe', value: 780,  level: '二等獎' },
  star:   { label: 'STAR',   c1: '#38bdf8', c2: '#1d4ed8', glow: '#bae6fd', value: 560,  level: '三等獎' },
  core:   { label: 'CORE',   c1: '#fb923c', c2: '#c2410c', glow: '#fed7aa', value: 420,  level: '三等獎' },
}

const PLAYERS: Player[] = [
  { id: 2544,    name: 'LeBron James',          team: 'LAL', tier: 'god' },
  { id: 201939,  name: 'Stephen Curry',         team: 'GSW', tier: 'god' },
  { id: 203999,  name: 'Nikola Jokic',          team: 'DEN', tier: 'god' },
  { id: 1629029, name: 'Luka Doncic',           team: 'LAL', tier: 'legend' },
  { id: 1628369, name: 'Jayson Tatum',          team: 'BOS', tier: 'legend' },
  { id: 203507,  name: 'Giannis Antetokounmpo', team: 'MIL', tier: 'legend' },
  { id: 1628983, name: 'Shai Gilgeous-Alexander', team: 'OKC', tier: 'legend' },
  { id: 201142,  name: 'Kevin Durant',          team: 'PHX', tier: 'star' },
  { id: 1627759, name: 'Jaylen Brown',          team: 'BOS', tier: 'star' },
  { id: 1630162, name: 'Anthony Edwards',       team: 'MIN', tier: 'star' },
  { id: 1628378, name: 'Donovan Mitchell',      team: 'CLE', tier: 'star' },
  { id: 1629627, name: 'Zion Williamson',       team: 'NOP', tier: 'star' },
  { id: 203954,  name: 'Joel Embiid',           team: 'PHI', tier: 'star' },
  { id: 1630224, name: 'Tyrese Haliburton',     team: 'IND', tier: 'core' },
  { id: 1629630, name: 'Ja Morant',             team: 'MEM', tier: 'core' },
  { id: 1628973, name: 'Jalen Brunson',         team: 'NYK', tier: 'core' },
  { id: 1631094, name: 'Paolo Banchero',        team: 'ORL', tier: 'core' },
  { id: 1630173, name: 'Desmond Bane',          team: 'ORL', tier: 'core' },
  { id: 1626164, name: 'Devin Booker',          team: 'PHX', tier: 'core' },
  { id: 1627783, name: 'Pascal Siakam',         team: 'IND', tier: 'core' },
]

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function frameSvg(p: Player) {
  const t = TIER[p.tier]
  return Buffer.from(`
<svg width="${CARD_W}" height="${CARD_H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${t.c1}"/><stop offset="55%" stop-color="${t.c2}"/><stop offset="100%" stop-color="#0b0b12"/>
    </linearGradient>
    <radialGradient id="halo" cx="50%" cy="38%" r="52%">
      <stop offset="0%" stop-color="${t.glow}" stop-opacity="0.55"/><stop offset="100%" stop-color="${t.glow}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${CARD_W}" height="${CARD_H}" rx="34" fill="#07070c"/>
  <rect x="10" y="10" width="${CARD_W - 20}" height="${CARD_H - 20}" rx="28" fill="url(#bg)"/>
  <ellipse cx="${CARD_W / 2}" cy="${CARD_H * 0.38}" rx="${CARD_W * 0.52}" ry="${CARD_H * 0.34}" fill="url(#halo)"/>
  <rect x="10" y="10" width="${CARD_W - 20}" height="${CARD_H - 20}" rx="28" fill="none" stroke="${t.c1}" stroke-width="5"/>
  <rect x="26" y="26" width="${CARD_W - 52}" height="${CARD_H - 52}" rx="20" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="2"/>
</svg>`)
}

function labelSvg(p: Player) {
  const t = TIER[p.tier]
  return Buffer.from(`
<svg width="${CARD_W}" height="${CARD_H}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="${CARD_H - 210}" width="${CARD_W}" height="210" fill="#000000" opacity="0.55"/>
  <text x="${CARD_W / 2}" y="${CARD_H - 128}" text-anchor="middle"
        font-family="Arial Black, Arial, sans-serif" font-size="46" font-weight="900" fill="#ffffff">${esc(p.name)}</text>
  <text x="${CARD_W / 2}" y="${CARD_H - 78}" text-anchor="middle"
        font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#ffffff" opacity="0.75">${esc(p.team)}</text>
  <rect x="${CARD_W / 2 - 92}" y="${CARD_H - 58}" width="184" height="38" rx="19" fill="${t.c1}"/>
  <text x="${CARD_W / 2}" y="${CARD_H - 31}" text-anchor="middle"
        font-family="Arial Black, Arial, sans-serif" font-size="24" font-weight="900" fill="#1a1205">${t.label}</text>
</svg>`)
}

async function build(p: Player) {
  const url = `https://cdn.nba.com/headshots/nba/latest/1040x760/${p.id}.png`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`headshot ${p.id} → ${res.status}`)
  const shot = Buffer.from(await res.arrayBuffer())

  // NBA 原圖在肩膀處硬切，故放大並下移，讓切邊藏進下方文字帶，再疊一道漸層過渡
  const person = await sharp(shot)
    .resize({ width: Math.round(CARD_W * 0.98), fit: 'inside' })
    .toBuffer()
  const meta = await sharp(person).metadata()
  const pw = meta.width ?? CARD_W
  const ph = meta.height ?? 0
  const personTop = CARD_H - 180 - ph   // 底邊壓在文字帶之下

  const fade = Buffer.from(`
<svg width="${CARD_W}" height="${CARD_H}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#000" stop-opacity="0"/>
    <stop offset="100%" stop-color="#000" stop-opacity="0.85"/>
  </linearGradient></defs>
  <rect x="0" y="${CARD_H - 300}" width="${CARD_W}" height="130" fill="url(#f)"/>
</svg>`)

  const card = await sharp(frameSvg(p))
    .composite([
      { input: person, left: Math.round((CARD_W - pw) / 2), top: personTop },
      { input: fade, left: 0, top: 0 },
      { input: labelSvg(p), left: 0, top: 0 },
    ])
    .webp({ quality: 88 })
    .toBuffer()

  const key = `products/slot/nba/${p.id}.webp`
  const publicUrl = await r2Upload(key, card, 'image/webp')
  return { player: p, url: publicUrl, bytes: card.length }
}

async function main() {
  const out: { name: string; team: string; tier: Tier; level: string; value: number; url: string }[] = []
  for (const p of PLAYERS) {
    try {
      const r = await build(p)
      out.push({ name: p.name, team: p.team, tier: p.tier, level: TIER[p.tier].level, value: TIER[p.tier].value, url: r.url })
      console.log(`✓ ${p.name.padEnd(24)} ${(r.bytes / 1024).toFixed(0)}KB  ${r.url}`)
    } catch (e) {
      console.log(`✗ ${p.name}: ${(e as Error).message}`)
    }
  }
  console.log(`\n完成 ${out.length}/${PLAYERS.length}`)
  const fs = await import('fs')
  fs.writeFileSync('/tmp/nba_cards.json', JSON.stringify(out, null, 2))
  console.log('清單已寫入 /tmp/nba_cards.json')
}

main()
