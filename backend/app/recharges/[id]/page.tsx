'use client'

import AdminLayout from '@/components/AdminLayout'
import CopyableID from '@/components/CopyableID'
import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { formatDateTime } from '@/utils/dateFormat'

interface Recharge {
  id: number
  orderId: string
  userId: string
  userName: string
  amount: number
  bonus: number
  total: number
  status: '成功' | '處理中' | '失敗'
  time: string
}

export default function RechargeDetailPage() {
  const router = useRouter()
  const params = useParams()
  const rechargeId = params.id as string
  const [recharge, setRecharge] = useState<Recharge | null>(null)
  const [user, setUser] = useState<any>(null)
  const [userOtherRecharges, setUserOtherRecharges] = useState<Recharge[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        // 1. Fetch current recharge
        const { data: rechargeData, error: rechargeError } = await supabase
          .from('recharge_records')
          .select(`
            *,
            user:users (*)
          `)
          .or(`id.eq.${isNaN(parseInt(rechargeId)) ? -1 : rechargeId},order_number.eq.${rechargeId}`)
          .single()

        if (rechargeError || !rechargeData) {
          console.error('Error fetching recharge:', rechargeError)
          setLoading(false)
          return
        }

        const statusMap: Record<string, '成功' | '處理中' | '失敗'> = {
          'success': '成功',
          'pending': '處理中',
          'failed': '失敗'
        }

        const currentRecharge: Recharge = {
          id: rechargeData.id,
          orderId: rechargeData.order_number,
          userId: rechargeData.user?.id || 'Unknown',
          userName: rechargeData.user?.name || 'Unknown',
          amount: rechargeData.amount,
          bonus: rechargeData.bonus || 0,
          total: rechargeData.amount + (rechargeData.bonus || 0),
          status: statusMap[rechargeData.status] || '處理中',
          time: formatDateTime(rechargeData.created_at)
        }
        setRecharge(currentRecharge)
        setUser(rechargeData.user)

        // 2. Fetch other recharges for this user
        if (rechargeData.user_id) {
          const { data: othersData, error: othersError } = await supabase
            .from('recharge_records')
            .select(`
              *,
              user:users (user_id, name)
            `)
            .eq('user_id', rechargeData.user_id)
            .neq('id', rechargeData.id)
            .order('created_at', { ascending: false })
            .limit(5)

          if (othersData) {
            const mappedOthers: Recharge[] = othersData.map(r => ({
              id: r.id,
              orderId: r.order_number,
              userId: r.user?.user_id || 'Unknown',
              userName: r.user?.name || 'Unknown',
              amount: r.amount,
              bonus: r.bonus || 0,
              total: r.amount + (r.bonus || 0),
              status: statusMap[r.status] || '處理中',
              time: formatDateTime(r.created_at)
            }))
            setUserOtherRecharges(mappedOthers)
          }
        }
      } catch (err) {
        console.error('Error:', err)
      } finally {
        setLoading(false)
      }
    }

    if (rechargeId) {
      fetchData()
    }
  }, [rechargeId])

  const handleCopy = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(fieldName)
      setTimeout(() => setCopiedField(null), 2000)
    } catch (err) {
      console.error('複製失敗:', err)
    }
  }

  if (loading) {
    return (
      <AdminLayout 
        pageTitle="儲值紀錄詳情"
        breadcrumbs={[
          { label: '儲值紀錄', href: '/recharges' },
          { label: '詳情', href: undefined }
        ]}
      >
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    )
  }

  if (!recharge) {
    return (
      <AdminLayout 
        pageTitle="儲值紀錄詳情"
        breadcrumbs={[
          { label: '儲值紀錄', href: '/recharges' },
          { label: '詳情', href: undefined }
        ]}
      >
        <div className="flex items-center justify-center h-64">
          <p className="text-neutral-500">找不到此儲值記錄</p>
        </div>
      </AdminLayout>
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case '成功':
        return 'bg-green-100 text-green-700 border border-green-200'
      case '處理中':
        return 'bg-yellow-100 text-yellow-700 border border-yellow-200'
      case '失敗':
        return 'bg-red-100 text-red-700 border border-red-200'
      default:
        return 'bg-neutral-100 text-neutral-700 border border-neutral-200'
    }
  }

  return (
    <AdminLayout 
      pageTitle="儲值紀錄詳情"
      breadcrumbs={[
        { label: '儲值紀錄', href: '/recharges' },
        { label: '詳情', href: undefined }
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左側主要資訊 */}
          <div className="lg:col-span-2 space-y-6">
            {/* 儲值資訊 */}
            <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-neutral-900">儲值資訊</h2>
                <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${getStatusColor(recharge.status)}`}>
                  {recharge.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-neutral-500 mb-1">訂單編號</p>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-neutral-900 font-mono">{recharge.orderId}</p>
                    <button
                      onClick={() => handleCopy(recharge.orderId, 'orderId')}
                      className="p-1 hover:bg-neutral-100 rounded transition-colors"
                      title="複製"
                    >
                      {copiedField === 'orderId' ? (
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
                  <p className="text-sm text-neutral-500 mb-1">儲值時間</p>
                  <p className="font-medium text-neutral-900 font-mono">{recharge.time}</p>
                </div>
                
                <div>
                  <p className="text-sm text-neutral-500 mb-1">儲值金額(TWD)</p>
                  <p className="font-medium text-neutral-900 font-mono text-lg">{recharge.amount.toLocaleString()}</p>
                </div>
                
                <div>
                  <p className="text-sm text-neutral-500 mb-1">贈送代幣(G)</p>
                  <p className="font-medium text-green-600 font-mono text-lg">+{recharge.bonus.toLocaleString()}</p>
                </div>
                
                <div className="col-span-2">
                  <p className="text-sm text-neutral-500 mb-1">總計(G)</p>
                  <p className="font-bold text-neutral-900 font-mono text-xl">{(recharge.amount + recharge.bonus).toLocaleString()}</p>
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
                    查看使用者詳情
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                )}
              </div>
              {user ? (
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-sm text-neutral-500 mb-1">使用者ID</p>
                    <div className="flex items-center gap-2">
                      <CopyableID id={user.userId} />
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
                  
                  <div>
                    <p className="text-sm text-neutral-500 mb-1">代幣餘額(G)</p>
                    <p className="font-medium text-neutral-900 font-mono">{user.tokens.toLocaleString()}</p>
                  </div>
                  
                  <div>
                    <p className="text-sm text-neutral-500 mb-1">註冊時間</p>
                    <p className="font-medium text-neutral-900 font-mono text-sm">{user.registerDate}</p>
                  </div>
                </div>
              ) : (
                <p className="text-neutral-500">找不到使用者資訊</p>
              )}
            </div>
          </div>

          {/* 右側相關記錄 */}
          <div className="space-y-6">
            {/* 該使用者的其他儲值記錄 */}
            <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-neutral-900">該使用者的其他儲值</h2>
                <Link 
                  href={`/recharges?userId=${recharge.userId}`}
                  className="text-sm text-primary hover:text-primary-dark font-medium flex items-center gap-1 transition-colors"
                >
                  查看全部
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
              {userOtherRecharges.length > 0 ? (
                <div className="space-y-3">
                  {userOtherRecharges.map((otherRecharge) => (
                    <Link
                      key={otherRecharge.id}
                      href={`/recharges/${otherRecharge.id}`}
                      className="block p-4 bg-neutral-50 rounded-lg hover:bg-neutral-100 border border-neutral-200 hover:border-primary/30 transition-all duration-200 hover:shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-neutral-900 font-mono text-sm">{otherRecharge.orderId}</p>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(otherRecharge.status)}`}>
                              {otherRecharge.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-neutral-500">
                            <span className="font-mono">{otherRecharge.time}</span>
                            <span className="font-mono">{otherRecharge.amount.toLocaleString()} (TWD)</span>
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
                  <p className="text-neutral-500 text-sm">暫無其他儲值記錄</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
