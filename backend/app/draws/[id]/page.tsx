'use client'

import AdminLayout from '@/components/AdminLayout'
import Badge from '@/components/ui/Badge'
import CopyableID from '@/components/CopyableID'
import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { formatDateTime } from '@/utils/dateFormat'

interface ProductPrize {
  id: number
  level: string
  name: string
  image_url: string
  probability: number
  total: number
  remaining: number
}

interface Product {
  id: number
  product_code: string
  name: string
  price: number
  image_url: string
  category: string
  product_prizes: ProductPrize[]
}

interface User {
  id: number
  user_id: string
  name: string
  email: string
  phone: string
}

interface Draw {
  id: number
  drawId: string
  userId: string
  userName: string
  productId: number
  productCode: string
  productName: string
  prize: string
  amount: number
  status: 'success' | 'failed'
  time: string
  nonce: number
  ticketNumber?: number
  txidHash?: string
  user?: User
  product?: Product
}

export default function DrawDetailPage() {
  const router = useRouter()
  const params = useParams()
  const drawId = params.id as string
  const drawIdNum = parseInt(drawId)
  
  const [draw, setDraw] = useState<Draw | null>(null)
  const [loading, setLoading] = useState(true)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  
  // 相關資料狀態
  const [userOtherDraws, setUserOtherDraws] = useState<Draw[]>([])
  const [productOtherDraws, setProductOtherDraws] = useState<Draw[]>([])

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        
        // 1. 獲取主要抽獎記錄
        // 注意：這裡假設 URL 中的 id 是 draw_records 的主鍵 id
        // 如果 URL 傳遞的是 order_number 或其他字串，可能需要調整查詢邏輯
        let query = supabase
          .from('draw_records')
          .select(`
            *,
            user:users (*),
            product:products (*, product_prizes(*))
          `)
        
        if (!isNaN(drawIdNum)) {
          query = query.eq('id', drawIdNum)
        } else {
          // 如果 drawId 不是數字，可能是其他格式，這裡暫時假設只能用 ID 查詢
          // 因為 draw_records 沒有類似 order_number 的 unique string id
          console.warn('Invalid draw ID format')
          setLoading(false)
          return
        }

        const { data: drawData, error: drawError } = await query.single()

        if (drawError || !drawData) {
          console.error('Error fetching draw:', drawError)
          setLoading(false)
          return
        }

        // 轉換為前端使用的格式
        const mappedDraw: Draw = {
          id: drawData.id,
          drawId: drawData.id.toString(),
          userId: drawData.user?.user_id || 'Unknown',
          userName: drawData.user?.name || 'Unknown',
          productId: drawData.product_id,
          productCode: drawData.product?.product_code || 'Unknown',
          productName: drawData.product?.name || 'Unknown',
          prize: drawData.prize_level,
          amount: drawData.product?.price || 0,
          status: 'success', // draw_records 存在即視為成功
          time: drawData.created_at,
          nonce: drawData.txid_nonce,
          ticketNumber: drawData.ticket_number,
          txidHash: drawData.txid_hash,
          user: drawData.user,
          product: drawData.product
        }

        setDraw(mappedDraw)

        // 2. 獲取該使用者的其他抽獎記錄
        if (drawData.user_id) {
          const { data: userDrawsData } = await supabase
            .from('draw_records')
            .select(`
              *,
              product:products (product_code, name, price)
            `)
            .eq('user_id', drawData.user_id)
            .neq('id', drawData.id)
            .order('created_at', { ascending: false })
            .limit(5)

          if (userDrawsData) {
            const mappedUserDraws: Draw[] = userDrawsData.map((d: any) => ({
              id: d.id,
              drawId: d.id.toString(),
              userId: drawData.user?.user_id || 'Unknown',
              userName: drawData.user?.name || 'Unknown',
              productId: d.product_id,
              productCode: d.product?.product_code || 'Unknown',
              productName: d.product?.name || 'Unknown',
              prize: d.prize_level,
              amount: d.product?.price || 0,
              status: 'success',
              time: d.created_at,
              nonce: d.txid_nonce,
              ticketNumber: d.ticket_number,
              txidHash: d.txid_hash
            }))
            setUserOtherDraws(mappedUserDraws)
          }
        }

        // 3. 獲取該商品的其他抽獎記錄
        if (drawData.product_id) {
          const { data: productDrawsData } = await supabase
            .from('draw_records')
            .select(`
              *,
              user:users (user_id, name)
            `)
            .eq('product_id', drawData.product_id)
            .neq('id', drawData.id)
            .order('created_at', { ascending: false })
            .limit(5)

          if (productDrawsData) {
            const mappedProductDraws: Draw[] = productDrawsData.map((d: any) => ({
              id: d.id,
              drawId: d.id.toString(),
              userId: d.user?.user_id || 'Unknown',
              userName: d.user?.name || 'Unknown',
              productId: drawData.product_id,
              productCode: drawData.product?.product_code || 'Unknown',
              productName: drawData.product?.name || 'Unknown',
              prize: d.prize_level,
              amount: drawData.product?.price || 0,
              status: 'success',
              time: d.created_at,
              nonce: d.txid_nonce,
              ticketNumber: d.ticket_number,
              txidHash: d.txid_hash
            }))
            setProductOtherDraws(mappedProductDraws)
          }
        }

      } catch (err) {
        console.error('Unexpected error:', err)
      } finally {
        setLoading(false)
      }
    }

    if (drawId) {
      fetchData()
    }
  }, [drawId, drawIdNum])

  const handleCopy = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(fieldName)
      setTimeout(() => setCopiedField(null), 2000)
    } catch (err) {
      console.error('複製失敗:', err)
    }
  }

  // 獲取獎項資訊
  const prizeInfo = useMemo(() => {
    if (!draw || !draw.product || !draw.product.product_prizes) return null
    // 匹配獎項等級，支援 'A賞', 'B賞', 'C賞', 'D賞', '最後賞'
    // 優先精確匹配 level，如果找不到則取第一個匹配該等級的獎項
    const matchedPrize = draw.product.product_prizes.find(p => p.level === draw.prize)
    if (matchedPrize) return matchedPrize
    // 如果找不到精確匹配，返回第一個獎項作為後備（顯示基本資訊）
    return draw.product.product_prizes.length > 0 ? draw.product.product_prizes[0] : null
  }, [draw])

  if (loading) {
    return (
      <AdminLayout 
        pageTitle="抽獎紀錄詳情"
        breadcrumbs={[
          { label: '消費紀錄', href: '/draws' },
          { label: '詳情', href: undefined }
        ]}
      >
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-900"></div>
        </div>
      </AdminLayout>
    )
  }

  if (!draw) {
    return (
      <AdminLayout 
        pageTitle="抽獎紀錄詳情"
        breadcrumbs={[
          { label: '消費紀錄', href: '/draws' },
          { label: '詳情', href: undefined }
        ]}
      >
        <div className="flex items-center justify-center h-64">
          <p className="text-neutral-500">找不到此抽獎記錄</p>
        </div>
      </AdminLayout>
    )
  }

  const getStatusText = (status: string) => {
    return status === 'success' ? '成功' : '失敗'
  }

  const getPrizeColor = (prize: string) => {
    switch (prize) {
      case 'A賞':
        return 'bg-yellow-100 text-yellow-700 border border-yellow-200'
      case 'B賞':
        return 'bg-blue-100 text-primary border border-blue-200'
      case 'C賞':
        return 'bg-green-100 text-green-700 border border-green-200'
      case 'D賞':
        return 'bg-purple-100 text-purple-700 border border-purple-200'
      case '最後賞':
        return 'bg-red-100 text-red-700 border border-red-200'
      default:
        return 'bg-neutral-100 text-neutral-700 border border-neutral-200'
    }
  }

  const { user, product } = draw

  return (
    <AdminLayout 
      pageTitle="抽獎紀錄詳情"
      breadcrumbs={[
        { label: '消費紀錄', href: '/draws' },
        { label: draw.drawId, href: undefined }
      ]}
    >
      <div className="space-y-6">
        {/* 返回按鈕 */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="px-6 py-2.5 bg-white border-2 border-neutral-200 rounded-full hover:border-neutral-300 transition-colors text-sm font-medium shadow-sm hover:shadow-md flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            返回
          </button>
        </div>

        <div className="space-y-6">
          {/* 抽獎基本資訊 */}
          <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6 relative">
            <div className="flex items-start justify-between mb-6">
              <h2 className="text-lg font-bold text-neutral-900">抽獎資訊</h2>
              <Badge status={draw.status} size="lg">{getStatusText(draw.status)}</Badge>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-neutral-500 mb-1">抽獎編號</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-neutral-900 font-mono">{draw.drawId}</p>
                    <button
                      onClick={() => handleCopy(draw.drawId, 'drawId')}
                      className="p-1 hover:bg-neutral-100 rounded transition-colors"
                      title="複製"
                    >
                      {copiedField === 'drawId' ? (
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                
                <div>
                  <p className="text-sm text-neutral-500 mb-1">抽獎時間</p>
                  <p className="font-medium text-neutral-900 font-mono">{formatDateTime(draw.time)}</p>
                </div>
                
                <div>
                  <p className="text-sm text-neutral-500 mb-1">獎項</p>
                  <span className={`px-3 py-1.5 rounded-full text-sm font-medium inline-block ${getPrizeColor(draw.prize)}`}>
                    {draw.prize}
                  </span>
                </div>
                
                <div>
                  <p className="text-sm text-neutral-500 mb-1">消費代幣(G)</p>
                  <p className="font-medium text-neutral-900 font-mono text-lg">{draw.amount.toLocaleString()}</p>
                </div>
                
                <div>
                  <p className="text-sm text-neutral-500 mb-1">籤號</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-neutral-900 font-mono bg-primary px-3 py-1 rounded">
                      {(draw.ticketNumber || draw.nonce).toString().padStart(3, '0')}
                    </p>
                    <button
                      onClick={() => handleCopy((draw.ticketNumber || draw.nonce).toString(), 'ticketNumber')}
                      className="p-1 hover:bg-neutral-100 rounded transition-colors"
                      title="複製"
                    >
                      {copiedField === 'ticketNumber' ? (
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                
                <div>
                  <p className="text-sm text-neutral-500 mb-1">Nonce (抽獎序號)</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-neutral-900 font-mono">{draw.nonce}</p>
                    <button
                      onClick={() => handleCopy(draw.nonce.toString(), 'nonce')}
                      className="p-1 hover:bg-neutral-100 rounded transition-colors"
                      title="複製"
                    >
                      {copiedField === 'nonce' ? (
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
                
                {draw.txidHash && (
                  <div>
                    <p className="text-sm text-neutral-500 mb-1">TXID Hash</p>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-neutral-900 font-mono text-xs break-all">{draw.txidHash}</p>
                      <button
                        onClick={() => handleCopy(draw.txidHash || '', 'txidHash')}
                        className="p-1 hover:bg-neutral-100 rounded transition-colors flex-shrink-0"
                        title="複製"
                      >
                        {copiedField === 'txidHash' ? (
                          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 使用者資訊 */}
          <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-neutral-900">使用者資訊</h2>
              {user && (
                <Link 
                  href={`/users/${user.id}`}
                  className="text-sm text-primary hover:text-primary-dark font-medium flex items-center gap-1 transition-colors"
                >
                  查看詳情
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              )}
            </div>
            {user ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-neutral-500 mb-1">使用者ID</p>
                  <div className="flex items-center gap-2">
                    <CopyableID id={user.user_id} />
                  </div>
                </div>
                
                <div>
                  <p className="text-sm text-neutral-500 mb-1">使用者名稱</p>
                  <p className="font-medium text-neutral-900">{user.name}</p>
                </div>
                
                <div>
                  <p className="text-sm text-neutral-500 mb-1">電子郵件</p>
                  <p className="font-medium text-neutral-900">{user.email}</p>
                </div>
                
                <div>
                  <p className="text-sm text-neutral-500 mb-1">電話</p>
                  <p className="font-medium text-neutral-900 font-mono">{user.phone}</p>
                </div>
              </div>
            ) : (
              <p className="text-neutral-500">找不到使用者資訊</p>
            )}
          </div>

          {/* 獎項資訊 */}
          <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-neutral-900">獎項資訊</h2>
              {product && (
                <Link 
                  href={`/products/${product.id}`}
                  className="text-sm text-primary hover:text-primary-dark font-medium flex items-center gap-1 transition-colors"
                >
                  查看商品詳情
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              )}
            </div>
            {product ? (
              <div className="space-y-6">
                {/* 獎項基本資訊 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-neutral-500 mb-1">獎項等級</p>
                    <span className={`px-3 py-1.5 rounded-full text-sm font-medium inline-block ${getPrizeColor(draw.prize)}`}>
                      {draw.prize}
                    </span>
                  </div>
                  
                  {prizeInfo ? (
                    <>
                      <div>
                        <p className="text-sm text-neutral-500 mb-1">獎項名稱</p>
                        <p className="font-medium text-neutral-900">{prizeInfo.name}</p>
                      </div>
                      
                      <div>
                        <p className="text-sm text-neutral-500 mb-1">剩餘數量</p>
                        <p className="font-medium text-neutral-900 font-mono">{prizeInfo.remaining} / {prizeInfo.total}</p>
                      </div>
                    </>
                  ) : (
                    <div>
                      <p className="text-sm text-neutral-500 mb-1">獎項名稱</p>
                      <p className="font-medium text-neutral-900 text-neutral-400">-</p>
                    </div>
                  )}
                </div>

                {/* 商品資訊 */}
                <div className="pt-4 border-t border-neutral-200">
                  <h3 className="text-sm font-semibold text-neutral-700 mb-4">商品資訊</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-neutral-500 mb-1">商品編號</p>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-neutral-900 font-mono">{product.product_code}</p>
                        <button
                          onClick={() => handleCopy(product.product_code, 'productCode')}
                          className="p-1 hover:bg-neutral-100 rounded transition-colors"
                          title="複製"
                        >
                          {copiedField === 'productCode' ? (
                            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                    
                    <div>
                      <p className="text-sm text-neutral-500 mb-1">商品名稱</p>
                      <p className="font-medium text-neutral-900">{product.name}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm text-neutral-500 mb-1">分類</p>
                      <p className="font-medium text-neutral-900">{product.category}</p>
                    </div>
                    
                    <div>
                      <p className="text-sm text-neutral-500 mb-1">價格(G)</p>
                      <p className="font-medium text-neutral-900 font-mono">{product.price.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-neutral-500">找不到獎項資訊</p>
            )}
          </div>

          {/* 相關記錄 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 該使用者的其他抽獎記錄 */}
            <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-neutral-900">該使用者的其他抽獎</h2>
                <Link 
                  href={`/draws?userId=${draw.userId}`}
                  className="text-sm text-primary hover:text-primary-dark font-medium flex items-center gap-1 transition-colors"
                >
                  查看全部
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
              {userOtherDraws.length > 0 ? (
                <div className="space-y-3">
                  {userOtherDraws.map((otherDraw) => (
                    <Link
                      key={otherDraw.id}
                      href={`/draws/${otherDraw.id}`}
                      className="block p-4 bg-neutral-50 rounded-lg hover:bg-neutral-100 border border-neutral-200 hover:border-primary/30 transition-all duration-200 hover:shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-neutral-900 font-mono text-sm">{otherDraw.drawId}</p>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPrizeColor(otherDraw.prize)}`}>
                              {otherDraw.prize}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-neutral-500">
                            <span className="font-mono">{formatDateTime(otherDraw.time)}</span>
                            <span className="font-mono">{otherDraw.amount.toLocaleString()} 代幣</span>
                            {(otherDraw.ticketNumber || otherDraw.nonce) && (
                              <span className="font-mono text-xs bg-primary px-2 py-0.5 rounded">
                                籤號：{((otherDraw.ticketNumber || otherDraw.nonce)).toString().padStart(3, '0')}
                              </span>
                            )}
                          </div>
                        </div>
                        <svg className="w-5 h-5 text-neutral-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-neutral-500 text-sm">暫無其他抽獎記錄</p>
                </div>
              )}
            </div>

            {/* 該商品的其他抽獎記錄 */}
            <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-neutral-900">該商品的其他抽獎</h2>
                <Link 
                  href={`/draws?productId=${draw.productId}`}
                  className="text-sm text-primary hover:text-primary-dark font-medium flex items-center gap-1 transition-colors"
                >
                  查看全部
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
              {productOtherDraws.length > 0 ? (
                <div className="space-y-3">
                  {productOtherDraws.map((otherDraw) => (
                    <Link
                      key={otherDraw.id}
                      href={`/draws/${otherDraw.id}`}
                      className="block p-4 bg-neutral-50 rounded-lg hover:bg-neutral-100 border border-neutral-200 hover:border-primary/30 transition-all duration-200 hover:shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-neutral-900 text-sm">{otherDraw.userName}</p>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPrizeColor(otherDraw.prize)}`}>
                              {otherDraw.prize}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-neutral-500">
                            <span className="font-mono">{formatDateTime(otherDraw.time)}</span>
                            <span className="font-mono">{otherDraw.amount.toLocaleString()} 代幣</span>
                            {(otherDraw.ticketNumber || otherDraw.nonce) && (
                              <span className="font-mono text-xs bg-primary px-2 py-0.5 rounded">
                                籤號：{((otherDraw.ticketNumber || otherDraw.nonce)).toString().padStart(3, '0')}
                              </span>
                            )}
                          </div>
                        </div>
                        <svg className="w-5 h-5 text-neutral-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-neutral-500 text-sm">暫無其他抽獎記錄</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
