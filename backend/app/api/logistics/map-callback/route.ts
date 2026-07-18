import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

// 綠界選店地圖 callback：明文 form POST，不需要解密
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const url = new URL(req.url)

    const storeId          = String(formData.get('CVSStoreID')      || '')
    const storeName        = String(formData.get('CVSStoreName')     || '')
    const storeAddress     = String(formData.get('CVSAddress')       || '')
    const logisticsSubType = String(formData.get('LogisticsSubType') || 'UNIMARTC2C')
    const requestId        = url.searchParams.get('request_id') || ''

    console.log('ECPay Map Callback:', { storeId, storeName, storeAddress, logisticsSubType, requestId })

    // If PWA polling flow: save to DB so the PWA can retrieve via polling
    if (requestId && storeId) {
      const supabase = getSupabaseAdmin()
      await supabase.from('cvs_pending_selections').upsert({
        token: requestId,
        store_id: storeId,
        store_name: storeName,
        store_address: storeAddress,
        logistics_subtype: logisticsSubType,
      })
    }

    const frontendUrl = (process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000').replace('127.0.0.1', 'localhost')

    // Redirect to callback page (for Safari / desktop: shows confirmation + postMessage)
    const redirectUrl = new URL(`${frontendUrl}/logistics/cvs-callback`)
    redirectUrl.searchParams.set('store_id', storeId)
    redirectUrl.searchParams.set('store_name', storeName)
    redirectUrl.searchParams.set('store_address', storeAddress)
    redirectUrl.searchParams.set('logistics_subtype', logisticsSubType)
    if (requestId) redirectUrl.searchParams.set('request_id', requestId)

    return NextResponse.redirect(redirectUrl)
  } catch (error) {
    console.error('ECPay Map callback error:', error)
    return NextResponse.redirect(new URL('/profile?error=map_callback_failed', req.url))
  }
}
