'use client'

import AdminLayout from '@/components/AdminLayout'
import Modal from '@/components/Modal'
import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { formatDateTime } from '@/utils/dateFormat'

// Define interfaces for local state
interface User {
  id: string // UUID
  userId: string
  inviteCode: string | null
  name: string
  email: string
  phone: string
  tokens: number
  registerDate: string
  lastLoginDate: string
  status: 'active' | 'inactive'
  totalOrders: number
  totalSpent: number
  totalDraws: number
  address?: string
  recipientName?: string
  recipientPhone?: string
}

interface OrderItem {
  id: number
  product_name: string
  prize_name: string
  prize_level: string
  quantity: number
  product_id: number
}

interface Order {
  id: number
  orderId: string
  status: string
  submittedAt: string
  items: OrderItem[]
  date: string // fallback for sort
}

interface Draw {
  id: number
  drawId: string
  date: string
  product: string
  prize: string
  amount: number
  ticketNumber: number
  product_id: number
}

interface Recharge {
  id: number
  orderId: string
  amount: number
  bonus: number
  totalTokens: number
  tokenDenomination: number
  status: string
  time: string
}

interface WarehouseItem {
  id: number
  product: string
  prize: string
  drawDate: string
  count: number
}

export default function UserDetailPage() {
  const router = useRouter()
  const params = useParams()
  const userId = params.id as string
  
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [userStatus, setUserStatus] = useState<'active' | 'inactive'>('active')
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [resetPasswordMode, setResetPasswordMode] = useState<'manual' | 'auto'>('manual')
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'orders' | 'draws' | 'recharges' | 'warehouse' | 'dismantled'>('orders')
  const [userDismantled, setUserDismantled] = useState<any[]>([])

  // Data states
  const [userOrders, setUserOrders] = useState<Order[]>([])
  const [userDraws, setUserDraws] = useState<Draw[]>([])
  const [userRecharges, setUserRecharges] = useState<Recharge[]>([])
  const [userWarehouse, setUserWarehouse] = useState<WarehouseItem[]>([])

  // 代幣帳本
  const [ledger, setLedger] = useState<any[]>([])
  const [ledgerTotal, setLedgerTotal] = useState(0)
  const [ledgerPage, setLedgerPage] = useState(1)
  const [ledgerPages, setLedgerPages] = useState(1)
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [ledgerLoaded, setLedgerLoaded] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/users/${userId}`, { method: 'GET' })
        if (!res.ok) {
          const err = await res.json().catch(() => null)
          console.error('Error fetching user:', err?.error || res.statusText)
          setLoading(false)
          return
        }
        const payload = (await res.json()) as { user: any; orders: any[]; draws: any[]; recharges: any[] }
        const userData = payload.user
        const ordersData = payload.orders
        const drawsData = payload.draws
        const rechargesData = payload.recharges

        const mappedUser: User = {
          id: userData.id,
          userId: userData.user_id ? `M${String(1000000 + userData.user_id)}` : userData.id,
          inviteCode: userData.invite_code,
          name: userData.name,
          email: userData.email,
          phone: userData.phone || '',
          tokens: userData.tokens,
          registerDate: formatDateTime(userData.created_at),
          lastLoginDate: userData.last_login_at ? formatDateTime(userData.last_login_at) : '',
          status: userData.status,
          totalOrders: userData.orders?.[0]?.count || 0,
          totalSpent: userData.total_spent,
          totalDraws: userData.total_draws,
          address: userData.address,
          recipientName: userData.recipient_name,
          recipientPhone: userData.recipient_phone
        }
        setUser(mappedUser)
        setUserStatus(mappedUser.status)

        let mappedOrders: Order[] = []
        if (ordersData) {
          mappedOrders = ordersData.map((o: any) => ({
            id: o.id,
            orderId: o.order_number,
            status: o.status,
            submittedAt: formatDateTime(o.submitted_at || o.created_at),
            date: o.created_at,
            items: o.items || []
          }))
          setUserOrders(mappedOrders)
        }

        let mappedDraws: Draw[] = []
        if (drawsData) {
          mappedDraws = drawsData.map((d: any) => {
            let drawIdStr = d.id.toString()
            try {
              const dateStr = d.created_at
              const dateObj = new Date(dateStr)
              const year = dateObj.getFullYear().toString().slice(-2)
              const month = String(dateObj.getMonth() + 1).padStart(2, '0')
              const day = String(dateObj.getDate()).padStart(2, '0')
              const suffix = ((d.id * 1367) % 10000).toString().padStart(4, '0')
              drawIdStr = `TX${year}${month}${day}${suffix}`
            } catch (e) {
              console.error('Error formatting draw ID:', e)
            }
            
            return {
              id: d.id,
              drawId: drawIdStr,
              date: formatDateTime(d.created_at),
              product: d.product?.name || 'Unknown Product',
              prize: d.prize_level,
              amount: d.product?.price || 0,
              ticketNumber: d.ticket_number,
              product_id: d.product_id
            }
          })
          setUserDraws(mappedDraws)

          // 分解紀錄
          const dismantled = drawsData
            .filter((d: any) => d.status === 'dismantled')
            .map((d: any) => ({
              id: d.id,
              product: d.product?.name || '—',
              prize: d.prize_level || '—',
              date: formatDateTime(d.created_at),
            }))
          setUserDismantled(dismantled)
        }

        if (rechargesData) {
          const statusMap: Record<string, string> = {
            'success': '成功',
            'pending': '處理中',
            'failed': '失敗'
          }
          
          const mappedRecharges: Recharge[] = rechargesData.map((r: any) => ({
            id: r.id,
            orderId: r.order_number,
            amount: r.amount,
            bonus: r.bonus || 0,
            totalTokens: r.amount + (r.bonus || 0), // Assuming 1:1 + bonus
            tokenDenomination: r.amount,
            status: statusMap[r.status] || r.status,
            time: formatDateTime(r.created_at)
          }))
          setUserRecharges(mappedRecharges)
        }

        // 5. Calculate Warehouse (Unclaimed Prizes)
        // Count submitted items
        const submittedItemsCount = new Map<string, number>()
        mappedOrders.forEach(order => {
          if (['submitted', 'processing', 'picked_up', 'shipping', 'delivered'].includes(order.status)) {
            order.items.forEach(item => {
              // Key: product_id-prize_level. Fallback to name if id missing (legacy compat)
              const key = item.product_id ? `${item.product_id}-${item.prize_level}` : `${item.product_name}-${item.prize_level}`
              submittedItemsCount.set(key, (submittedItemsCount.get(key) || 0) + (item.quantity || 1))
            })
          }
        })

        // Count owned items from draws
        const drawItemsMap = new Map<string, { product: string, prize: string, drawDate: string, count: number }>()
        
        // We use the raw drawsData for accurate timestamp comparison if needed, but mappedDraws is fine
        // Using mappedDraws which has formatted date string, might need raw date for sort. 
        // Let's use the index or just formatted date string for now.
        
        mappedDraws.forEach(draw => {
          const key = draw.product_id ? `${draw.product_id}-${draw.prize}` : `${draw.product}-${draw.prize}`
          
          if (!drawItemsMap.has(key)) {
            drawItemsMap.set(key, {
              product: draw.product,
              prize: draw.prize,
              drawDate: draw.date,
              count: 0
            })
          }
          const item = drawItemsMap.get(key)!
          item.count += 1
          // Keep the latest date
          if (draw.date > item.drawDate) { 
             // Note: String comparison of formatted dates might be wrong if format is not ISO.
             // formatDateTime usually returns readable string. 
             // Ideally we should use raw timestamp. But for display it's ok.
             item.drawDate = draw.date 
          }
        })

        const warehouseItems: WarehouseItem[] = []
        let idCounter = 1
        
        drawItemsMap.forEach((item, key) => {
          const submitted = submittedItemsCount.get(key) || 0
          const remaining = item.count - submitted
          
          if (remaining > 0) {
            warehouseItems.push({
              id: idCounter++,
              product: item.product,
              prize: item.prize,
              drawDate: item.drawDate,
              count: remaining
            })
          }
        })

        // Sort by date desc (approximation with formatted string)
        warehouseItems.sort((a, b) => b.drawDate.localeCompare(a.drawDate))
        setUserWarehouse(warehouseItems)

      } catch (err) {
        console.error('Error fetching data:', err)
      } finally {
        setLoading(false)
      }
    }

    if (userId) {
      fetchData()
    }
  }, [userId])

  const fetchLedger = async (page = 1) => {
    if (!userId) return
    setLedgerLoading(true)
    const res = await fetch(`/api/admin/token-ledger?userId=${userId}&page=${page}`)
    const data = await res.json()
    setLedger(data.ledger ?? [])
    setLedgerTotal(data.total ?? 0)
    setLedgerPage(page)
    setLedgerPages(data.pages ?? 1)
    setLedgerLoading(false)
    setLedgerLoaded(true)
  }

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab)
    if (tab === 'recharges' && !ledgerLoaded) fetchLedger(1)
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

  const getStatusColor = (status: string) => {
    return status === 'active' 
      ? 'bg-green-100 text-green-700 border border-green-200' 
      : 'bg-gray-100 text-gray-700 border border-gray-200'
  }

  const getStatusText = (status: string) => {
    return status === 'active' ? '啟用' : '停用'
  }

  // 更新使用者狀態
  const handleStatusUpdate = async (newStatus: 'active' | 'inactive') => {
    setUserStatus(newStatus)
    if (user) {
      setUser({ ...user, status: newStatus })
      
      try {
        const res = await fetch(`/api/admin/users/${user.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => null)
          console.error('Error updating status:', err?.error || res.statusText)
          // Revert
          setUserStatus(user.status)
          setUser({ ...user, status: user.status })
        }
      } catch (err) {
        console.error('Error:', err)
      }
    }
  }

  if (loading) {
    return (
      <AdminLayout 
        pageTitle="會員詳情"
        breadcrumbs={[
        { label: '會員管理', href: '/users' },
        { label: '詳情', href: undefined }
      ]}
      >
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    )
  }

  if (!user) {
    return (
      <AdminLayout 
        pageTitle="會員詳情"
        breadcrumbs={[
          { label: '會員管理', href: '/users' },
          { label: '詳情', href: undefined }
        ]}
      >
        <div className="flex items-center justify-center h-64">
          <p className="text-neutral-500">找不到此會員</p>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout 
      pageTitle="會員詳情"
      breadcrumbs={[
          { label: '會員管理', href: '/users' },
          { label: `${user.name} (${user.inviteCode || '-'})`, href: undefined }
      ]}
    >
      <div className="space-y-6">
        {/* 返回按鈕和操作按鈕 */}
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
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const newStatus = userStatus === 'active' ? 'inactive' : 'active'
                if (confirm(`確定要${userStatus === 'active' ? '停用' : '啟用'}此會員嗎？`)) {
                  handleStatusUpdate(newStatus)
                }
              }}
              className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 shadow-sm hover:shadow-md ${
                userStatus === 'active'
                  ? 'bg-red-50 text-red-700 border-2 border-red-200 hover:bg-red-100 hover:border-red-300'
                  : 'bg-green-50 text-green-700 border-2 border-green-200 hover:bg-green-100 hover:border-green-300'
              }`}
            >
              {userStatus === 'active' ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  停用會員
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  啟用會員
                </>
              )}
            </button>
            <button
              onClick={() => {
                setNewPassword('')
                setGeneratedPassword(null)
                setResetPasswordMode('manual')
                setIsResetPasswordModalOpen(true)
              }}
              className="px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark transition-all duration-200 text-sm font-medium flex items-center gap-2 shadow-sm hover:shadow-md"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              重置密碼
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {/* 會員資訊、統計資料 */}
          <div className="space-y-6">
            {/* 會員基本資訊 */}
            <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6 relative">
              <div className="flex items-start justify-between mb-6">
                <h2 className="text-lg font-bold text-neutral-900">會員資訊</h2>
                <span className={`px-4 py-1.5 rounded-full text-base font-medium ${getStatusColor(userStatus)}`}>
                  {getStatusText(userStatus)}
                </span>
              </div>
              <div className="space-y-4">
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-neutral-900">{user.name}</h3>
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-neutral-500 mb-1">邀請碼</p>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-neutral-900 font-mono text-lg">{user.inviteCode || '-'}</p>
                      {user.inviteCode && (
                        <button
                          onClick={() => handleCopy(user.inviteCode!, 'inviteCode')}
                          className="p-1 hover:bg-neutral-100 rounded transition-colors"
                          title="複製"
                        >
                          {copiedField === 'inviteCode' ? (
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
                    <p className="text-sm text-neutral-500 mb-1">用戶ID</p>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-neutral-900 font-mono">{user.userId}</p>
                      <button
                        onClick={() => handleCopy(user.userId, 'userId')}
                        className="p-1 hover:bg-neutral-100 rounded transition-colors"
                        title="複製"
                      >
                        {copiedField === 'userId' ? (
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
                    <p className="text-sm text-neutral-500 mb-1">電子郵件</p>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-neutral-900 truncate" title={user.email}>{user.email}</p>
                      <button
                        onClick={() => handleCopy(user.email, 'email')}
                        className="p-1 hover:bg-neutral-100 rounded transition-colors flex-shrink-0"
                        title="複製"
                      >
                        {copiedField === 'email' ? (
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
                    <p className="text-sm text-neutral-500 mb-1">電話</p>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-neutral-900 font-mono">{user.phone}</p>
                      <button
                        onClick={() => handleCopy(user.phone, 'phone')}
                        className="p-1 hover:bg-neutral-100 rounded transition-colors"
                        title="複製"
                      >
                        {copiedField === 'phone' ? (
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
                    <p className="text-sm text-neutral-500 mb-1">註冊時間</p>
                    <p className="font-medium text-neutral-900">{user.registerDate}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-neutral-500 mb-1">最後登入</p>
                    <p className="font-medium text-neutral-900">{user.lastLoginDate}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 收件資訊 */}
            <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6 relative">
              <div className="flex items-start justify-between mb-6">
                <h2 className="text-lg font-bold text-neutral-900">收件資訊</h2>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-neutral-500 mb-1">收件人</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-neutral-900">{user.recipientName || '-'}</p>
                    {user.recipientName && (
                      <button
                        onClick={() => handleCopy(user.recipientName!, 'recipientName')}
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
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-sm text-neutral-500 mb-1">收件人電話</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-neutral-900 font-mono">{user.recipientPhone || '-'}</p>
                    {user.recipientPhone && (
                      <button
                        onClick={() => handleCopy(user.recipientPhone!, 'recipientPhone')}
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
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-sm text-neutral-500 mb-1">收件地址</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-neutral-900 truncate" title={user.address}>{user.address || '-'}</p>
                    {user.address && (
                      <button
                        onClick={() => handleCopy(user.address!, 'address')}
                        className="p-1 hover:bg-neutral-100 rounded transition-colors flex-shrink-0"
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
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 統計資料 */}
            <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
              <h2 className="text-lg font-bold text-neutral-900 mb-6">統計數據</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-5 bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-lg border border-blue-200/50 hover:shadow-md transition-shadow">
                  <p className="text-sm text-neutral-600 mb-2 font-medium">代幣餘額<span className="text-neutral-500">(G)</span></p>
                  <p className="text-2xl font-bold text-neutral-900 font-mono">{user.tokens.toLocaleString()}</p>
                </div>
                <div className="text-center p-5 bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-lg border border-purple-200/50 hover:shadow-md transition-shadow">
                  <p className="text-sm text-neutral-600 mb-2 font-medium">訂單數<span className="text-neutral-500">(筆)</span></p>
                  <p className="text-2xl font-bold text-neutral-900 font-mono">{userOrders.length}</p>
                </div>
                <div className="text-center p-5 bg-gradient-to-br from-green-50 to-green-100/50 rounded-lg border border-green-200/50 hover:shadow-md transition-shadow">
                  <p className="text-sm text-neutral-600 mb-2 font-medium">總消費<span className="text-neutral-500">(TWD)</span></p>
                  <p className="text-2xl font-bold text-neutral-900 font-mono">{user.totalSpent.toLocaleString()}</p>
                </div>
                <div className="text-center p-5 bg-gradient-to-br from-orange-50 to-orange-100/50 rounded-lg border border-orange-200/50 hover:shadow-md transition-shadow">
                  <p className="text-sm text-neutral-600 mb-2 font-medium">抽獎次數<span className="text-neutral-500">(次)</span></p>
                  <p className="text-2xl font-bold text-neutral-900 font-mono">{userDraws.length}</p>
                </div>
              </div>
            </div>

            {/* 記錄卡片（訂單、抽獎、儲值） */}
            <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
              {/* Tab 切換 */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2 border-b border-neutral-200">
                  <button
                    onClick={() => handleTabChange('orders')}
                    className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                      activeTab === 'orders'
                        ? 'text-primary border-b-2 border-primary'
                        : 'text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    訂單記錄
                    {userOrders.length > 0 && (
                      <span className="ml-2 px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded text-xs">
                        {userOrders.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => handleTabChange('draws')}
                    className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                      activeTab === 'draws'
                        ? 'text-primary border-b-2 border-primary'
                        : 'text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    抽獎記錄
                    {userDraws.length > 0 && (
                      <span className="ml-2 px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded text-xs">
                        {userDraws.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => handleTabChange('recharges')}
                    className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                      activeTab === 'recharges'
                        ? 'text-primary border-b-2 border-primary'
                        : 'text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    儲值記錄
                    {userRecharges.length > 0 && (
                      <span className="ml-2 px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded text-xs">
                        {userRecharges.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => handleTabChange('warehouse')}
                    className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                      activeTab === 'warehouse'
                        ? 'text-primary border-b-2 border-primary'
                        : 'text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    會員倉庫
                    {userWarehouse.length > 0 && (
                      <span className="ml-2 px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded text-xs">
                        {userWarehouse.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => handleTabChange('dismantled')}
                    className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                      activeTab === 'dismantled'
                        ? 'text-red-500 border-b-2 border-red-500'
                        : 'text-neutral-500 hover:text-neutral-700'
                    }`}
                  >
                    分解紀錄
                    {userDismantled.length > 0 && (
                      <span className="ml-2 px-1.5 py-0.5 bg-red-50 text-red-500 rounded text-xs">
                        {userDismantled.length}
                      </span>
                    )}
                  </button>
                </div>
                {activeTab !== 'warehouse' && activeTab !== 'dismantled' && activeTab !== 'recharges' && (
                  <Link 
                    href={
                      activeTab === 'orders' ? '/orders' :
                      activeTab === 'draws' ? '/draws' :
                      '/recharges'
                    }
                    className="text-sm text-primary hover:text-primary-dark font-medium flex items-center gap-1 transition-colors"
                  >
                    查看全部
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                )}
              </div>

              {/* 訂單記錄內容 */}
              {activeTab === 'orders' && (
                <>
                  {userOrders.length > 0 ? (
                    <div className="space-y-3">
                      {userOrders.slice(0, 30).map((order) => (
                        <Link
                          key={order.id}
                          href={`/orders/${order.id}`}
                          className="block p-4 bg-neutral-50 rounded-lg hover:bg-neutral-100 border border-neutral-200 hover:border-primary/30 transition-all duration-200 hover:shadow-sm"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-semibold text-neutral-900 font-mono">{order.orderId}</p>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  order.status === 'submitted' ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' :
                                  order.status === 'delivered' ? 'bg-green-100 text-green-700 border border-green-200' :
                                  order.status === 'processing' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                                  order.status === 'shipping' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                                  'bg-gray-100 text-gray-700 border border-gray-200'
                                }`}>
                                  {order.status === 'submitted' ? '已提交' :
                                   order.status === 'delivered' ? '已送達' :
                                   order.status === 'processing' ? '處理中' :
                                   order.status === 'shipping' ? '配送中' : order.status}
                                </span>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-neutral-500">
                                <span className="font-mono">{order.submittedAt}</span>
                                <span>{order.items.length} 件商品</span>
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
                    <div className="text-center py-12">
                      <svg className="w-12 h-12 text-neutral-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-neutral-500">暫無訂單記錄</p>
                    </div>
                  )}
                </>
              )}

              {/* 抽獎記錄內容 */}
              {activeTab === 'draws' && (
                <>
                  {userDraws.length > 0 ? (
                    <div className="space-y-3">
                      {userDraws.slice(0, 30).map((draw) => (
                        <div key={draw.id} className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 hover:bg-neutral-100 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-semibold text-neutral-900">{draw.product}</p>
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 border border-purple-200">
                                  {draw.prize}
                                </span>
                                {draw.ticketNumber && (
                                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200 font-mono">
                                    籤號：{(draw.ticketNumber).toString().padStart(3, '0')}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-4 text-sm text-neutral-500">
                                <span className="font-mono">{draw.date}</span>
                                <span className="font-mono text-neutral-700">{draw.amount} (G)</span>
                                {draw.drawId && (
                                  <span className="font-mono text-neutral-400 text-xs">{draw.drawId}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <svg className="w-12 h-12 text-neutral-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                      </svg>
                      <p className="text-neutral-500">暫無抽獎記錄</p>
                    </div>
                  )}
                </>
              )}

              {/* 儲值記錄＋代幣異動明細（帳本表格） */}
              {activeTab === 'recharges' && (
                <div>
                  {ledgerLoading ? (
                    <p className="text-sm text-neutral-400 py-8 text-center">載入中...</p>
                  ) : ledger.length === 0 ? (
                    <div className="text-center py-12">
                      <svg className="w-12 h-12 text-neutral-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <p className="text-neutral-500">無代幣異動紀錄</p>
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-neutral-50 border-b border-neutral-200">
                            <tr>
                              <th className="text-left px-3 py-2 text-xs font-medium text-neutral-500">時間</th>
                              <th className="text-left px-3 py-2 text-xs font-medium text-neutral-500">類型</th>
                              <th className="text-left px-3 py-2 text-xs font-medium text-neutral-500">說明</th>
                              <th className="text-right px-3 py-2 text-xs font-medium text-neutral-500">面額</th>
                              <th className="text-right px-3 py-2 text-xs font-medium text-neutral-500">贈送</th>
                              <th className="text-right px-3 py-2 text-xs font-medium text-neutral-500">異動 (G)</th>
                              <th className="text-right px-3 py-2 text-xs font-medium text-neutral-500">累計餘額</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ledger.map((row: any, i: number) => {
                              const isPos = row.delta > 0
                              const isPending = row.type === 'recharge' && row.status !== 'success'
                              const typeMap: Record<string, { label: string; cls: string }> = {
                                recharge:  { label: '儲值',   cls: 'bg-emerald-50 text-emerald-700' },
                                draw:      { label: '抽獎',   cls: 'bg-rose-50 text-rose-700' },
                                dismantle: { label: '拆解退', cls: 'bg-amber-50 text-amber-700' },
                              }
                              const statusMap: Record<string, string> = { pending: '處理中', failed: '失敗', success: '' }
                              const meta = typeMap[row.type] ?? { label: row.type, cls: 'bg-neutral-100 text-neutral-600' }
                              return (
                                <tr key={i} className={`border-b border-neutral-100 hover:bg-neutral-50 ${isPending ? 'opacity-60' : ''}`}>
                                  <td className="px-3 py-2 text-neutral-500 whitespace-nowrap font-mono text-xs">
                                    {new Date(row.created_at).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                  </td>
                                  <td className="px-3 py-2">
                                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                                    {isPending && (
                                      <span className="ml-1 inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-50 text-yellow-700">{statusMap[row.status] ?? row.status}</span>
                                    )}
                                    {row.status === 'failed' && (
                                      <span className="ml-1 inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-red-50 text-red-600">失敗</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-neutral-700 max-w-[180px] truncate">{row.description}</td>
                                  <td className="px-3 py-2 text-right font-mono text-neutral-600 text-xs">
                                    {row.recharge_amount != null ? Number(row.recharge_amount).toLocaleString() : '—'}
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono text-neutral-600 text-xs">
                                    {row.recharge_bonus != null && row.recharge_bonus > 0 ? `+${Number(row.recharge_bonus).toLocaleString()}` : row.recharge_bonus != null ? '—' : '—'}
                                  </td>
                                  <td className={`px-3 py-2 text-right font-semibold font-mono ${isPending ? 'text-neutral-400' : isPos ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {isPending ? '—' : `${isPos ? '+' : ''}${Number(row.delta).toLocaleString()}`}
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono text-neutral-700">
                                    {!isPending && row.balance_after !== null ? Number(row.balance_after).toLocaleString() : '—'}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex items-center justify-between pt-3 text-sm text-neutral-500">
                        <span>共 {ledgerTotal.toLocaleString()} 筆</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => fetchLedger(ledgerPage - 1)} disabled={ledgerPage <= 1} className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-neutral-50">上一頁</button>
                          <span>{ledgerPage} / {ledgerPages}</span>
                          <button onClick={() => fetchLedger(ledgerPage + 1)} disabled={ledgerPage >= ledgerPages} className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-neutral-50">下一頁</button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 分解紀錄 */}
              {activeTab === 'dismantled' && (
                <>
                  {userDismantled.length > 0 ? (
                    <div className="space-y-2">
                      {userDismantled.map((item) => (
                        <div key={item.id} className="flex items-center gap-3 p-3 bg-red-50 rounded-lg border border-red-100">
                          <div className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="font-medium text-neutral-800 text-sm">{item.product}</span>
                            <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-600">{item.prize}</span>
                          </div>
                          <span className="text-xs text-neutral-400 font-mono flex-shrink-0">{item.date}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-neutral-500">暫無分解紀錄</p>
                    </div>
                  )}
                </>
              )}

              {/* 使用者倉庫內容 */}
              {activeTab === 'warehouse' && (
                <>
                  {userWarehouse.length > 0 ? (
                    <div className="space-y-3">
                      {userWarehouse.map((item) => (
                        <div key={item.id} className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 hover:bg-neutral-100 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-semibold text-neutral-900">{item.product}</p>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  item.prize === 'A賞' ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' :
                                  item.prize === 'B賞' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                                  item.prize === 'C賞' ? 'bg-green-100 text-green-700 border border-green-200' :
                                  item.prize === 'D賞' ? 'bg-purple-100 text-purple-700 border border-purple-200' :
                                  'bg-red-100 text-red-700 border border-red-200'
                                }`}>
                                  {item.prize}
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200">
                                  未提交配送
                                </span>
                                {item.count > 1 && (
                                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700 border border-neutral-200">
                                    x{item.count}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-4 text-sm text-neutral-500">
                                {item.drawDate && (
                                  <span className="font-mono">獲得時間: {item.drawDate}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <svg className="w-12 h-12 text-neutral-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                      <p className="text-neutral-500">暫無未提交配送的商品</p>
                    </div>
                  )}
                </>
              )}

            </div>
          </div>
        </div>
      </div>

      {/* 重置密碼 Modal */}
      <Modal
        isOpen={isResetPasswordModalOpen}
        onClose={() => {
          setIsResetPasswordModalOpen(false)
          setNewPassword('')
          setGeneratedPassword(null)
          setResetPasswordMode('manual')
        }}
        title="重置密碼"
        footer={
          generatedPassword ? (
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setIsResetPasswordModalOpen(false)
                  setNewPassword('')
                  setGeneratedPassword(null)
                  setResetPasswordMode('manual')
                }}
                className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors"
              >
                關閉
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setIsResetPasswordModalOpen(false)
                  setNewPassword('')
                  setGeneratedPassword(null)
                  setResetPasswordMode('manual')
                }}
                className="px-4 py-2 text-sm text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  if (resetPasswordMode === 'manual' && !newPassword.trim()) {
                    alert('請輸入新密碼')
                    return
                  }

                  try {
                    const body =
                      resetPasswordMode === 'auto'
                        ? { generatePassword: true }
                        : { password: newPassword }

                    const res = await fetch(`/api/admin/users/${user.id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(body),
                    })
                    const payload = await res.json().catch(() => null)
                    if (!res.ok) throw new Error(payload?.error || '重置密碼失敗')

                    const tempPassword = payload?.tempPassword
                    if (typeof tempPassword === 'string' && tempPassword) {
                      setGeneratedPassword(tempPassword)
                      setNewPassword('')
                      return
                    }
                    setGeneratedPassword(newPassword.trim())
                    setNewPassword('')
                    return
                  } catch (err) {
                    console.error('Error resetting password:', err)
                    alert('重置密碼失敗，請稍後再試')
                  }
                }}
                className="px-4 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors"
              >
                {resetPasswordMode === 'auto' ? '產生並重置' : '確定'}
              </button>
            </div>
          )
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              用戶ID
            </label>
            <input
              type="text"
              value={user.userId}
              disabled
              className="w-full px-4 py-2 bg-neutral-100 border border-neutral-300 rounded-lg text-neutral-500"
            />
          </div>

          {generatedPassword ? (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-neutral-700">
                新密碼（僅顯示一次）
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-4 py-2 bg-neutral-50 border border-neutral-300 rounded-lg font-mono text-neutral-900">
                  {generatedPassword}
                </div>
                <button
                  onClick={() => handleCopy(generatedPassword, 'generatedPassword')}
                  className="px-3 py-2 text-sm text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
                >
                  {copiedField === 'generatedPassword' ? '已複製' : '複製'}
                </button>
              </div>
              <div className="text-xs text-neutral-500">
                建議立即提供用戶並提醒登入後自行更改。
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-neutral-700">
                  重置方式
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setResetPasswordMode('manual')}
                    className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                      resetPasswordMode === 'manual'
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
                    }`}
                  >
                    手動輸入
                  </button>
                  <button
                    onClick={() => {
                      setResetPasswordMode('auto')
                      setNewPassword('')
                    }}
                    className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                      resetPasswordMode === 'auto'
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
                    }`}
                  >
                    自動產生
                  </button>
                </div>
                <div className="text-xs text-neutral-500">
                  Supabase 密碼無法被讀取與顯示，只能重置。自動產生會在成功後顯示一次可複製的新密碼。
                </div>
              </div>

              {resetPasswordMode === 'manual' ? (
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    新密碼
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="請輸入新密碼"
                    className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
              ) : (
                <div className="text-sm text-neutral-700 bg-neutral-50 border border-neutral-200 rounded-lg px-4 py-3">
                  系統會自動產生一組新密碼並立即生效。
                </div>
              )}
            </>
          )}
        </div>
      </Modal>
    </AdminLayout>
  )
}
