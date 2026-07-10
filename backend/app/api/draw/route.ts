import { NextRequest, NextResponse } from 'next/server'
import { executeDraw, executeBatchDraw, type DrawRequest, type BatchDrawRequest } from '@/utils/drawLogic'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAdminSession } from '@/lib/requireAdmin'

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getSupabaseAdmin()
    const body = await request.json()
    
    // 1. 驗證必要參數
    if (!body.userId || !body.productId) {
      return NextResponse.json({ error: '缺少必要參數' }, { status: 400 })
    }

    // 2. 獲取使用者資訊 (驗證 UUID)
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', body.userId)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: '找不到使用者' }, { status: 404 })
    }

    // 3. 獲取商品資訊 (Seed, 狀態, 庫存)
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*')
      .eq('id', body.productId)
      .single()

    if (productError || !product) {
      return NextResponse.json({ error: '找不到商品' }, { status: 404 })
    }

    if (product.remaining <= 0 || product.status !== 'active') {
      return NextResponse.json({ error: '商品已售完或未上架' }, { status: 400 })
    }

    // 4. 獲取獎項配置
    const { data: prizesData, error: prizesError } = await supabase
      .from('product_prizes')
      .select('*')
      .eq('product_id', body.productId)
      .order('probability', { ascending: true })

    if (prizesError || !prizesData || prizesData.length === 0) {
      return NextResponse.json({ error: '找不到獎項配置' }, { status: 404 })
    }

    // 轉換獎項格式供邏輯使用
    const prizesForLogic = prizesData.map(p => ({
      level: p.level,
      name: p.name,
      originalProbability: p.probability
    }))

    // 盒玩（blindbox）與轉蛋（gacha）不套用殺率，其餘類型（ichiban/card/custom）套用
    const skipProfitRate = product.type === 'gacha' || product.type === 'blindbox'

    const rawProfitRate = (product as any).profit_rate
    let profitRate = 1.0
    if (!skipProfitRate) {
      if (typeof rawProfitRate === 'number') {
        profitRate = rawProfitRate
      } else if (typeof rawProfitRate === 'string' && rawProfitRate.trim() !== '') {
        const parsed = parseFloat(rawProfitRate)
        if (!Number.isNaN(parsed)) {
          profitRate = parsed
        }
      }
      if (!Number.isFinite(profitRate) || profitRate <= 0) {
        profitRate = 1.0
      }
    }

    // 5. 執行抽獎
    // 檢查是否為批量抽獎請求（包含 ticketNumbers 數組）
    if (body.ticketNumbers && Array.isArray(body.ticketNumbers)) {
      // 批量抽獎
      const ticketNumbers = body.ticketNumbers

      // 檢查庫存
      if (ticketNumbers.length > product.remaining) {
        return NextResponse.json({ error: `庫存不足，剩餘 ${product.remaining} 抽` }, { status: 400 })
      }

      const batchRequest: BatchDrawRequest = {
        userId: body.userId,
        productId: body.productId,
        seed: product.seed || body.seed, // 優先使用商品設定的 Seed
        ticketNumbers: ticketNumbers
      }
      
      // 執行批量抽獎
      const results = await executeBatchDraw(batchRequest, prizesForLogic, profitRate)
      
      // 6. 保存結果到資料庫
      // 6.1 插入抽獎紀錄
      const recordsToInsert = results.map((result, index) => ({
        user_id: user.id,
        product_id: product.id,
        ticket_number: ticketNumbers[index],
        prize_level: result.prizeLevel,
        prize_name: result.prizeName,
        txid_seed: result.txid.seed,
        txid_nonce: result.txid.nonce,
        txid_hash: result.txidHash,
        random_value: result.randomValue,
        profit_rate: profitRate
      }))

      const { error: insertError } = await supabase
        .from('draw_records')
        .insert(recordsToInsert)

      if (insertError) throw insertError

      // 6.2 更新商品庫存與銷量
      const { error: updateProductError } = await supabase
        .from('products')
        .update({
          remaining: Math.max(0, product.remaining - results.length),
          sales: (product.sales || 0) + results.length
        })
        .eq('id', product.id)
      
      if (updateProductError) console.error('更新商品庫存失敗:', updateProductError)

      // 6.3 更新獎項庫存
      // 統計各獎項消耗數量
      const prizeCounts: { [key: string]: number } = {}
      results.forEach(r => {
        // 找到對應的獎項 ID
        const prize = prizesData.find(p => p.level === r.prizeLevel)
        if (prize) {
          prizeCounts[prize.id] = (prizeCounts[prize.id] || 0) + 1
        }
      })

      // 並行更新各獎項庫存
      await Promise.all(Object.keys(prizeCounts).map(async (prizeId) => {
        const count = prizeCounts[prizeId]
        const currentPrize = prizesData.find(p => p.id.toString() === prizeId)
        if (currentPrize) {
          await supabase
            .from('product_prizes')
            .update({
              remaining: Math.max(0, currentPrize.remaining - count)
            })
            .eq('id', prizeId)
        }
      }))
      
      return NextResponse.json({
        success: true,
        data: results.map((result, index) => ({
          ticketNumber: ticketNumbers[index],
          txid: result.txid,
          randomValue: result.randomValue,
          prizeLevel: result.prizeLevel,
          prizeName: result.prizeName,
          txidHash: result.txidHash
        }))
      })
    } else {
      // 單次抽獎
      const ticketNumber = body.ticketNumber || body.nonce
      
      // 檢查庫存
      if (product.remaining < 1) {
        return NextResponse.json({ error: '庫存不足' }, { status: 400 })
      }

      const drawRequest: DrawRequest = {
        userId: body.userId,
        productId: body.productId,
        seed: product.seed || body.seed,
        nonce: ticketNumber,
        ticketNumber: ticketNumber
      }
      
      // 執行抽獎
      const result = await executeDraw(drawRequest, prizesForLogic, profitRate)
      
      // 6. 保存結果到資料庫
      // 6.1 插入抽獎紀錄
      const { error: insertError } = await supabase
        .from('draw_records')
        .insert({
          user_id: user.id,
          product_id: product.id,
          ticket_number: ticketNumber,
          prize_level: result.prizeLevel,
          prize_name: result.prizeName,
          txid_seed: result.txid.seed,
          txid_nonce: result.txid.nonce,
          txid_hash: result.txidHash,
          random_value: result.randomValue,
          profit_rate: profitRate
        })

      if (insertError) throw insertError

      // 6.2 更新商品庫存與銷量
      await supabase
        .from('products')
        .update({
          remaining: Math.max(0, product.remaining - 1),
          sales: (product.sales || 0) + 1
        })
        .eq('id', product.id)

      // 6.3 更新獎項庫存
      const prize = prizesData.find(p => p.level === result.prizeLevel)
      if (prize) {
        await supabase
          .from('product_prizes')
          .update({
            remaining: Math.max(0, prize.remaining - 1)
          })
          .eq('id', prize.id)
      }
      
      return NextResponse.json({
        success: true,
        data: {
          ticketNumber: ticketNumber,
          txid: result.txid,
          randomValue: result.randomValue,
          prizeLevel: result.prizeLevel,
          prizeName: result.prizeName,
          txidHash: result.txidHash
        }
      })
    }
  } catch (error) {
    console.error('抽獎錯誤:', error)
    return NextResponse.json(
      { error: '抽獎失敗', details: error instanceof Error ? error.message : '未知錯誤' },
      { status: 500 }
    )
  }
}
