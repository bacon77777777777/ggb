/**
 * 驗證 API 路由
 * POST /api/verify
 * 
 * 用戶輸入 Seed 後，只回傳：
 * - 該次抽獎生成的隨機數 (Random Value)
 * - 雜湊比對結果 (Hash Match)
 * 
 * 不顯示判斷區間或機率公式
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyDraw } from '@/utils/drawLogic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { seed, nonce, expectedHash } = body
    
    // 驗證請求參數
    if (!seed || nonce === undefined || !expectedHash) {
      return NextResponse.json(
        { error: '缺少必要參數：seed, nonce, expectedHash' },
        { status: 400 }
      )
    }
    
    // 執行驗證
    const result = verifyDraw(seed, nonce, expectedHash)
    
    // 只返回用戶需要的資訊（不包含機率公式或判斷區間）
    return NextResponse.json({
      success: true,
      data: {
        randomValue: result.randomValue,      // 該次抽獎生成的隨機數
        hashMatch: result.hashMatch,          // 雜湊比對結果
        txidHash: result.txidHash            // 計算出的哈希值（供參考）
      }
    })
  } catch (error) {
    console.error('驗證錯誤:', error)
    return NextResponse.json(
      { error: '驗證失敗', details: error instanceof Error ? error.message : '未知錯誤' },
      { status: 500 }
    )
  }
}
