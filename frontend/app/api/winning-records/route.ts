import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type WinningRecord = {
  id: number
  user_id?: string | null
  user_name: string
  product_name: string
  prize_level: string
  prize_name: string
}

// Mock gacha winning records shown when real data is sparse
const MOCK_GACHA_RECORDS: WinningRecord[] = [
  { id: -1,  user_name: '小葉**',  product_name: '轉蛋', prize_level: 'A', prize_name: '限定景品 全套組' },
  { id: -2,  user_name: '阿哲**',  product_name: '轉蛋', prize_level: 'B', prize_name: '特大布偶' },
  { id: -3,  user_name: '梁小**',  product_name: '轉蛋', prize_level: 'A', prize_name: '限定景品 全套組' },
  { id: -4,  user_name: '志明**',  product_name: '轉蛋', prize_level: 'C', prize_name: '色紙 附親筆簽名' },
  { id: -5,  user_name: '春嬌**',  product_name: '轉蛋', prize_level: 'B', prize_name: '特大布偶' },
  { id: -6,  user_name: '阿凱**',  product_name: '轉蛋', prize_level: 'A', prize_name: '限定景品 全套組' },
  { id: -7,  user_name: '依婷**',  product_name: '轉蛋', prize_level: 'D', prize_name: '迷你公仔 盲盒版' },
  { id: -8,  user_name: '豪哥**',  product_name: '轉蛋', prize_level: 'B', prize_name: '特大布偶' },
  { id: -9,  user_name: '小芸**',  product_name: '轉蛋', prize_level: 'C', prize_name: '色紙 附親筆簽名' },
  { id: -10, user_name: '承翰**',  product_name: '轉蛋', prize_level: 'A', prize_name: '限定景品 全套組' },
  { id: -11, user_name: '欣怡**',  product_name: '轉蛋', prize_level: 'B', prize_name: '特大布偶' },
  { id: -12, user_name: '阿龍**',  product_name: '轉蛋', prize_level: 'D', prize_name: '迷你公仔 盲盒版' },
  { id: -13, user_name: '宜蓁**',  product_name: '轉蛋', prize_level: 'A', prize_name: '限定景品 全套組' },
  { id: -14, user_name: '皓宇**',  product_name: '轉蛋', prize_level: 'C', prize_name: '色紙 附親筆簽名' },
  { id: -15, user_name: '怡君**',  product_name: '轉蛋', prize_level: 'B', prize_name: '特大布偶' },
]

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr]
  let s = seed
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    const j = Math.abs(s) % (i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  let realRecords: WinningRecord[] = []

  if (url && anonKey) {
    const supabase = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data } = await supabase.rpc('get_winning_records', { p_limit: 30 })
    if (Array.isArray(data)) {
      realRecords = (data as WinningRecord[]).slice(0, 10)
    }
  }

  // Supplement with shuffled mock records when real data is sparse
  const FILL_TARGET = 10
  let records: WinningRecord[]
  if (realRecords.length >= FILL_TARGET) {
    records = realRecords
  } else {
    // Use hour-based seed so the order changes each hour but stays stable within a session
    const seed = Math.floor(Date.now() / (1000 * 60 * 60))
    const shuffledMock = seededShuffle(MOCK_GACHA_RECORDS, seed)
    const needed = FILL_TARGET - realRecords.length
    records = [...realRecords, ...shuffledMock.slice(0, needed)]
  }

  return NextResponse.json(
    { records },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  )
}
