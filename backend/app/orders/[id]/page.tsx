'use client'

import AdminLayout from '@/components/AdminLayout'
import CopyableID from '@/components/CopyableID'
import ShippingProgress from '@/components/ShippingProgress'
import { formatDateTime } from '@/utils/dateFormat'
import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect } from 'react'

export default function OrderDetailPage() {
  const router = useRouter()
  const params = useParams()
  const idParam = params.id as string

  type ShipmentStatus = 'submitted' | 'processing' | 'picked_up' | 'shipping' | 'delivered' | 'cancelled'
  
  interface OrderItem {
    product: string
    prize: string
    imageUrl: string
  }

  interface Shipment {
    id: number
    orderId: string
    status: ShipmentStatus
    submittedAt?: string
    shippedAt?: string | null
    date: string
    days: number
    trackingNumber?: string
    userId: string
    user: string
    userName: string
    recipientName: string
    recipientPhone: string
    address: string
    items: OrderItem[]
  }

  const [shipment, setShipment] = useState<Shipment | null>(null)
  const [loading, setLoading] = useState(true)
  const [shippingMethod, setShippingMethod] = useState('宅配')
  const [notes, setNotes] = useState('')
  const [copiedField, setCopiedField] = useState<string | null>(null)

  useEffect(() => {
    const fetchOrder = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/orders/${idParam}`, { method: 'GET' })
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          console.error('Error fetching order:', data?.error || res.statusText)
          setLoading(false)
          return
        }
        const order = await res.json()

        if (order) {
          // Calculate days since submission
          let diffDays = 0
          if (order.submitted_at) {
            const submittedDate = new Date(order.submitted_at)
            const now = new Date()
            const diffTime = now.getTime() - submittedDate.getTime()
            diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
          }

          const mappedShipment: Shipment = {
            id: order.id,
            orderId: order.order_number,
            status: order.status as ShipmentStatus,
            submittedAt: order.submitted_at,
            shippedAt: order.shipped_at,
            date: order.submitted_at || order.created_at,
            days: diffDays,
            trackingNumber: order.tracking_number,
            userId: order.user_id || 'Unknown',
            user: order.user?.email || 'Unknown',
            userName: order.user?.name || '',
            recipientName: order.recipient_name,
            recipientPhone: order.recipient_phone,
            address: order.address,
            items: (order.items || []).map((item: any) => ({
              product: item.products?.name || 'Unknown Product',
              prize: item.product_prizes ? `${item.product_prizes.level}賞 ${item.product_prizes.name}` : 'Unknown Prize',
              imageUrl: item.product_prizes?.image_url || item.products?.image_url || 'https://placehold.co/100'
            }))
          }
          
          setShipment(mappedShipment)
          setNotes(order.tracking_number ? '已生成配送單' : '')
        }
      } catch (err) {
        console.error('Unexpected error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchOrder()
  }, [idParam])

  const updateStatus = async (newStatus: ShipmentStatus) => {
    if (!shipment) return

    try {
      const res = await fetch(`/api/admin/orders/${shipment.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || '更新狀態失敗')
      }

      setShipment({ ...shipment, status: newStatus })
    } catch (err) {
      console.error('Error updating status:', err)
      alert('更新狀態失敗')
    }
  }

  const handleCopy = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(fieldName)
      setTimeout(() => setCopiedField(null), 2000)
    } catch (err) {
      console.error('複製失敗:', err)
    }
  }

  const generateTrackingNumber = (orderId: string) => {
    // 使用確定性的追蹤號碼生成，避免 hydration 錯誤
    // 基於訂單ID生成確定性的追蹤號碼
    // 訂單ID格式：20260126A039 -> 提取數字部分生成唯一追蹤號
    const numericPart = orderId.replace(/\D/g, '') // 移除非數字字符
    const orderIdNum = parseInt(numericPart) || Date.now()
    return `SF${String(orderIdNum).slice(-10).padStart(10, '0')}`
  }

  if (loading) {
    return (
      <AdminLayout 
        pageTitle="配送詳情"
        breadcrumbs={[
          { label: '配送管理', href: '/orders' },
          { label: '載入中...', href: undefined }
        ]}
      >
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </AdminLayout>
    )
  }

  if (!shipment) {
    return (
      <AdminLayout 
        pageTitle="配送詳情"
        breadcrumbs={[
          { label: '配送管理', href: '/orders' },
          { label: '詳情', href: undefined }
        ]}
      >
        <div className="flex items-center justify-center h-64">
          <p className="text-neutral-500">找不到此訂單</p>
        </div>
      </AdminLayout>
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'submitted':
        return 'bg-yellow-100 text-yellow-700'
      case 'processing':
        return 'bg-blue-100 text-blue-700'
      case 'picked_up':
        return 'bg-blue-100 text-blue-700'
      case 'shipping':
        return 'bg-blue-100 text-blue-700'
      case 'delivered':
        return 'bg-green-100 text-green-700'
      case 'cancelled':
        return 'bg-gray-100 text-gray-700'
      default:
        return 'bg-neutral-100 text-neutral-700'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'submitted':
        return '已提交'
      case 'processing':
        return '處理中'
      case 'picked_up':
        return '物流已收取'
      case 'shipping':
        return '配送中'
      case 'delivered':
        return '已送達'
      case 'cancelled':
        return '已取消'
      default:
        return status
    }
  }


  if (!shipment) {
    return (
      <AdminLayout pageTitle="配送詳情" breadcrumbs={[{ label: '配送管理', href: '/orders' }, { label: '詳情', href: undefined }]}>
        <div className="flex items-center justify-center h-64">
          <p className="text-neutral-500">找不到此訂單</p>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout 
      pageTitle="配送詳情"
      breadcrumbs={[
        { label: '配送管理', href: '/orders' },
        { label: shipment.orderId, href: undefined },
        { label: '詳情', href: undefined }
      ]}
    >
      <div className="space-y-6">
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
          
          {/* 狀態切換下拉選單 */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-neutral-500">切換狀態：</span>
            <div className="relative">
              <select
                value={shipment.status}
                onChange={(e) => {
                  const newStatus = e.target.value as typeof shipment.status
                  if (confirm(`確定要將狀態從「${getStatusText(shipment.status)}」改為「${getStatusText(newStatus)}」嗎？`)) {
                    updateStatus(newStatus)
                  }
                }}
                className="px-4 py-2.5 pr-10 bg-white border-2 border-neutral-200 rounded-full text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all hover:border-neutral-300 shadow-sm hover:shadow-md appearance-none cursor-pointer"
              >
                <option value="submitted">已提交</option>
                <option value="processing">處理中</option>
                <option value="picked_up">物流已收取</option>
                <option value="shipping">配送中</option>
                <option value="delivered">已送達</option>
                <option value="cancelled">已取消</option>
              </select>
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* 配送進度 */}
        <ShippingProgress 
          status={shipment.status as 'submitted' | 'processing' | 'picked_up' | 'shipping' | 'delivered' | 'cancelled'}
          submittedAt={shipment.submittedAt || shipment.date}
          shippedAt={shipment.shippedAt}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左側：配送資訊、獎品資訊、物流資訊 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 配送資訊 */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-bold text-neutral-900 mb-6">配送資訊</h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500">訂單編號</span>
                  <span className="font-medium text-neutral-900">{shipment.orderId}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500">配送狀態</span>
                  <span className={`px-3 py-1 rounded-full text-sm ${getStatusColor(shipment.status)}`}>
                    {getStatusText(shipment.status)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500">建立時間</span>
                  <span className="text-neutral-900 font-mono">{formatDateTime(shipment.date)}</span>
                </div>
                {((shipment.status as string) === 'submitted' || (shipment.status as string) === 'processing') && (
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500">待配送天數</span>
                    <span className={shipment.days > 3 ? 'text-red-500 font-semibold' : 'text-neutral-900'}>
                      {shipment.days} 天
                    </span>
                  </div>
                )}
                {shipment.trackingNumber && (
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500">物流單號</span>
                    <span className="font-medium text-neutral-900">{shipment.trackingNumber}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 獎品資訊 */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-bold text-neutral-900 mb-6">獎品資訊</h2>
              <div className="space-y-3">
                {shipment.items.map((item, idx) => (
                  <div key={idx} className="p-4 bg-neutral-50 rounded-lg">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-mono text-neutral-400 w-8 flex-shrink-0">#{String(idx + 1).padStart(2, '0')}</span>
                      <img src={item.imageUrl} alt={item.product} className="w-[60px] h-[60px] object-cover rounded-lg flex-shrink-0" />
                      <div className="flex-1 flex items-center justify-between">
                        <p className="font-semibold text-neutral-900">{item.product}</p>
                        <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-700">
                          {item.prize}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 物流資訊 */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-bold text-neutral-900 mb-6">物流資訊</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    物流單號
                  </label>
                  <input
                    type="text"
                    value={shipment.trackingNumber || ''}
                    readOnly
                    className="w-full px-4 py-2 border border-neutral-300 rounded-lg bg-neutral-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    配送方式
                  </label>
                  <select 
                    value={shippingMethod}
                    onChange={(e) => setShippingMethod(e.target.value)}
                    className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option>宅配</option>
                    <option>超商取貨</option>
                    <option>門市自取</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    備註
                  </label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="配送備註..."
                    className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="flex items-center gap-3 pt-2">
                  {/* 已提交 或 處理中/已攬收但無物流單號：生成配送單 */}
                  {((shipment.status as string) === 'submitted' ||
                    (!shipment.trackingNumber && ((shipment.status as string) === 'processing' || (shipment.status as string) === 'picked_up'))) && (
                    <button
                      onClick={async () => {
                        if (confirm('確定要建立物流單嗎？將會向物流服務發送請求。')) {
                          try {
                            const response = await fetch('/api/logistics/create', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json'
                              },
                              body: JSON.stringify({ orderId: shipment.id })
                            });

                            const result = await response.json();

                            if (!response.ok) {
                              throw new Error(result.error || '建立物流單失敗');
                            }

                            alert('物流單建立成功！');
                            // Refresh order data
                            window.location.reload();
                            
                          } catch (err: any) {
                            console.error('Error creating logistics order:', err);
                            alert(`建立物流單失敗: ${err.message}`);
                          }
                        }
                      }}
                      className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      生成配送單
                    </button>
                  )}
                  
                  {/* 非已提交、非已送達、非已取消狀態：列印物流單 */}
                  {(shipment.status as string) !== 'submitted' && 
                   (shipment.status as string) !== 'delivered' && 
                   (shipment.status as string) !== 'cancelled' && (
                    <button
                      onClick={() => {
                        console.log('列印物流單:', shipment.orderId)
                        window.print()
                      }}
                      className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                      </svg>
                      列印物流單
                    </button>
                  )}
                  
                  {/* 已送達狀態：也可以列印 */}
                  {(shipment.status as string) === 'delivered' && (
                    <button
                      onClick={() => {
                        console.log('列印物流單:', shipment.orderId)
                        window.print()
                      }}
                      className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                      </svg>
                      列印物流單
                    </button>
                  )}
                  
                  {/* 非已送達、非已取消狀態：取消 */}
                  {(shipment.status as string) !== 'delivered' && 
                   (shipment.status as string) !== 'cancelled' && (
                    <button
                      onClick={async () => {
                        if (confirm('確定要取消此訂單嗎？取消後無法恢復。')) {
                          try {
                            const res = await fetch(`/api/admin/orders/${shipment.id}`, {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ status: 'cancelled' }),
                            })
                            if (!res.ok) {
                              const data = await res.json().catch(() => null)
                              throw new Error(data?.error || '取消訂單失敗')
                            }

                            setShipment({ ...shipment, status: 'cancelled' })
                          } catch (err) {
                            console.error('Error cancelling order:', err)
                            alert('取消訂單失敗')
                          }
                        }
                      }}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      取消
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 右側：使用者資訊、收件人資訊 */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-bold text-neutral-900 mb-6">使用者資訊</h2>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-neutral-500 mb-1">使用者ID</p>
                  <div className="flex items-center gap-2">
                    <CopyableID id={shipment.userId} />
                  </div>
                </div>
                <div>
                  <p className="text-sm text-neutral-500 mb-1">暱稱</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-neutral-900">{shipment.userName || '-'}</p>
                    {!!shipment.userName && (
                      <button
                        onClick={() => handleCopy(shipment.userName, 'userName')}
                        className="p-1 hover:bg-neutral-100 rounded transition-colors"
                        title="複製"
                      >
                        {copiedField === 'userName' ? (
                          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm text-neutral-500 mb-1">電子郵件</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-neutral-900">{shipment.user}</p>
                    <button
                      onClick={() => handleCopy(shipment.user, 'user')}
                      className="p-1 hover:bg-neutral-100 rounded transition-colors"
                      title="複製"
                    >
                      {copiedField === 'user' ? (
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
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-bold text-neutral-900 mb-6">收件人資訊</h2>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-neutral-500 mb-1">收件人姓名</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-neutral-900">{shipment.recipientName}</p>
                    <button
                      onClick={() => handleCopy(shipment.recipientName, 'recipientName')}
                      className="p-1 hover:bg-neutral-100 rounded transition-colors"
                      title="複製"
                    >
                      {copiedField === 'recipientName' ? (
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
                  <p className="text-sm text-neutral-500 mb-1">聯絡電話</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-neutral-900">{shipment.recipientPhone}</p>
                    <button
                      onClick={() => handleCopy(shipment.recipientPhone, 'recipientPhone')}
                      className="p-1 hover:bg-neutral-100 rounded transition-colors"
                      title="複製"
                    >
                      {copiedField === 'recipientPhone' ? (
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
                  <p className="text-sm text-neutral-500 mb-1">配送地址</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-neutral-900">{shipment.address}</p>
                    <button
                      onClick={() => handleCopy(shipment.address, 'address')}
                      className="p-1 hover:bg-neutral-100 rounded transition-colors"
                      title="複製"
                    >
                      {copiedField === 'address' ? (
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
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
