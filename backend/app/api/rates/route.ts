/**
 * 殺率管理 API 路由
 * 
 * GET /api/rates/:productId - 獲取商品殺率設定
 * PUT /api/rates/:productId - 更新商品殺率設定
 */

import { NextRequest, NextResponse } from 'next/server'

/**
 * 獲取商品殺率設定
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const productIdParam = searchParams.get('productId')
    
    if (!productIdParam) {
      return NextResponse.json(
        { error: '缺少商品ID參數' },
        { status: 400 }
      )
    }

    const productId = parseInt(productIdParam)
    
    if (isNaN(productId)) {
      return NextResponse.json(
        { error: '無效的商品ID' },
        { status: 400 }
      )
    }
    
    // TODO: 從資料庫讀取殺率設定
    // SELECT current_profit_rate, updated_at, updated_by 
    // FROM product_settings WHERE product_id = ?
    
    // 概念性實現
    return NextResponse.json({
      success: true,
      data: {
        productId,
        currentProfitRate: 1.0,  // 預設值
        updatedAt: new Date().toISOString(),
        updatedBy: 'admin'
      }
    })
  } catch (error) {
    console.error('獲取殺率設定錯誤:', error)
    return NextResponse.json(
      { error: '獲取失敗', details: error instanceof Error ? error.message : '未知錯誤' },
      { status: 500 }
    )
  }
}

/**
 * 更新商品殺率設定
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { productId: bodyProductId, profitRate } = body
    
    // 優先使用 body 中的 productId，如果沒有則嘗試從 query string 獲取（雖然 PUT 通常在 body）
    let productId = bodyProductId
    if (!productId) {
      const searchParams = request.nextUrl.searchParams
      const queryProductId = searchParams.get('productId')
      if (queryProductId) productId = parseInt(queryProductId)
    }

    if (!productId || isNaN(productId)) {
      return NextResponse.json(
        { error: '無效的商品ID' },
        { status: 400 }
      )
    }
    
    if (profitRate === undefined || profitRate < 0) {
      return NextResponse.json(
        { error: '無效的殺率參數' },
        { status: 400 }
      )
    }
    
    // TODO: 更新資料庫
    // UPDATE product_settings 
    // SET current_profit_rate = ?, updated_at = NOW(), updated_by = ?
    // WHERE product_id = ?
    // 
    // 如果不存在，則 INSERT
    
    // 概念性實現
    return NextResponse.json({
      success: true,
      data: {
        productId,
        currentProfitRate: profitRate,
        updatedAt: new Date().toISOString(),
        updatedBy: 'admin'  // 實際應從 session 獲取
      }
    })
  } catch (error) {
    console.error('更新殺率設定錯誤:', error)
    return NextResponse.json(
      { error: '更新失敗', details: error instanceof Error ? error.message : '未知錯誤' },
      { status: 500 }
    )
  }
}
