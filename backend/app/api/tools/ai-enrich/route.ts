import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'

type Prize = { name: string; level: string; quantity: number }

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const { name, typeGuess, prizes, sourceHost } = body || {}

    if (!name) return NextResponse.json({ error: '缺少商品名稱' }, { status: 400 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: '未設定 ANTHROPIC_API_KEY' }, { status: 500 })

    const client = new Anthropic({ apiKey })

    const prizeList = (prizes as Prize[] || [])
      .slice(0, 10)
      .map(p => `${p.level} ${p.name} x${p.quantity}`)
      .join('、')

    const typeMap: Record<string, string> = {
      ichiban: '一番賞', blindbox: '盲盒/盒玩', gacha: '轉蛋', card: '抽卡', custom: '自製賞',
    }

    const prompt = `你是台灣一番賞/轉蛋商品資料補齊工具。根據商品資訊推斷缺失欄位。

商品名稱：${name}
商品類型：${typeMap[typeGuess] || typeGuess || '未知'}
來源網站：${sourceHost || '未知'}
獎項清單：${prizeList || '無'}

請以 JSON 回覆以下欄位（無法推斷填 null）：
{
  "supplier": "IP/廠商名稱（如 BANDAI、BANPRESTO、景品廠商、或常見台灣代理，不確定填 null）",
  "rarity": 數字1-5（1=普通，3=一般，5=超稀有），
  "isHot": true或false（知名IP/話題商品為 true）
}
只回覆 JSON，不要說明文字。`

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = msg.content.find(b => b.type === 'text')?.text || ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('AI 回傳格式不正確')

    const parsed = JSON.parse(jsonMatch[0])
    const aiFilledFields: string[] = []
    if (parsed.supplier != null) aiFilledFields.push('supplier')
    if (parsed.rarity != null) aiFilledFields.push('rarity')
    if (parsed.isHot != null) aiFilledFields.push('isHot')

    return NextResponse.json({
      data: {
        supplier: typeof parsed.supplier === 'string' ? parsed.supplier : null,
        rarity: typeof parsed.rarity === 'number' ? Math.min(5, Math.max(1, Math.round(parsed.rarity))) : 3,
        isHot: typeof parsed.isHot === 'boolean' ? parsed.isHot : false,
        aiFilledFields,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'AI 補齊失敗' }, { status: 500 })
  }
}
