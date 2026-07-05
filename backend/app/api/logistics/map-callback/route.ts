import { NextRequest, NextResponse } from 'next/server'

// 綠界選店地圖 callback：明文 form POST，不需要解密
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()

    const storeId        = String(formData.get('CVSStoreID')      || '')
    const storeName      = String(formData.get('CVSStoreName')     || '')
    const storeAddress   = String(formData.get('CVSAddress')       || '')
    const logisticsSubType = String(formData.get('LogisticsSubType') || 'UNIMARTC2C')

    console.log('ECPay Map Callback:', { storeId, storeName, storeAddress, logisticsSubType })

    let frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL
    if (!frontendUrl) {
      try {
        const url = new URL(req.url)
        frontendUrl = url.origin
      } catch {
        frontendUrl = 'http://localhost:3000'
      }
    }
    frontendUrl = frontendUrl.replace('127.0.0.1', 'localhost')

    const redirectUrl = new URL(`${frontendUrl}/profile`)
    redirectUrl.searchParams.set('tab', 'delivery')
    redirectUrl.searchParams.set('store_id', storeId)
    redirectUrl.searchParams.set('store_name', storeName)
    redirectUrl.searchParams.set('store_address', storeAddress)
    redirectUrl.searchParams.set('logistics_subtype', logisticsSubType)
    redirectUrl.searchParams.set('action', 'open_delivery_modal')

    return NextResponse.redirect(redirectUrl)
  } catch (error) {
    console.error('ECPay Map callback error:', error)
    return NextResponse.redirect(new URL('/profile?error=map_callback_failed', req.url))
  }
}
