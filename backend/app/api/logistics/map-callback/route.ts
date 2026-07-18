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

    const frontendUrl = (process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000').replace('127.0.0.1', 'localhost')

    // Redirect to a lightweight callback page that sends postMessage back to the PWA opener
    const redirectUrl = new URL(`${frontendUrl}/logistics/cvs-callback`)
    redirectUrl.searchParams.set('store_id', storeId)
    redirectUrl.searchParams.set('store_name', storeName)
    redirectUrl.searchParams.set('store_address', storeAddress)
    redirectUrl.searchParams.set('logistics_subtype', logisticsSubType)

    return NextResponse.redirect(redirectUrl)
  } catch (error) {
    console.error('ECPay Map callback error:', error)
    return NextResponse.redirect(new URL('/profile?error=map_callback_failed', req.url))
  }
}
