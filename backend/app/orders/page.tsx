'use client'

import { AdminLayout, StatsCard, PageCard, SearchToolbar, FilterTags, Modal, SortableTableHeader, CopyableID } from '@/components'
import Badge from '@/components/ui/Badge'
import DateRangePicker from '@/components/DateRangePicker'
import { useLog } from '@/contexts/LogContext'
import { formatDateTime } from '@/utils/dateFormat'
import Link from 'next/link'
import { useState, useMemo, useEffect, useRef, Fragment } from 'react'
import { useTablePrefs } from '@/hooks/useTablePrefs'
import { useShipment, Shipment, ShipmentItem } from '@/contexts/ShipmentContext'

export default function OrdersPage() {
  const { setShipments, highlightedOrderId, setHighlightedOrderId } = useShipment()
  const { addLog } = useLog()
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [selectedOrders, setSelectedOrders] = useState<Set<number>>(new Set())
  const [expandedOrders, setExpandedOrders] = useState<Set<number>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<string>('submittedAt')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [displayCount, setDisplayCount] = useState(20)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const observerTarget = useRef<HTMLDivElement>(null)
  const highlightedRowRef = useRef<HTMLTableRowElement>(null)
  const [localShipments, setLocalShipments] = useState<Shipment[]>([])
  
  const [imageModal, setImageModal] = useState<{ isOpen: boolean; imageUrl: string; productName: string; prizeName: string }>({
    isOpen: false,
    imageUrl: '',
    productName: '',
    prizeName: ''
  })
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    title: string
    content: React.ReactNode
    onConfirm: () => void
    onCancel?: () => void
    confirmText?: string
    cancelText?: string
    showMergeOption?: boolean
    mergeOrders?: Array<{ orderId: string, items: number }>
  }>({
    isOpen: false,
    title: '',
    content: null,
    onConfirm: () => {},
    confirmText: '確定',
    cancelText: '取消'
  })

  // 表格工具列狀態
  const { tableDensity, setTableDensity, visibleColumns, setVisibleColumns } = useTablePrefs('orders', 'compact', {
    orderId: true, submittedAt: true, status: true, userName: true, userId: true,
    quantity: true, recipientName: true, trackingNumber: true, shippingFee: true, shippedAt: true, operations: true
  })
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [filterShipStartDate, setFilterShipStartDate] = useState('')
  const [filterShipEndDate, setFilterShipEndDate] = useState('')
  const [filterUrgentOnly, setFilterUrgentOnly] = useState(false)

  const [shipModal, setShipModal] = useState<{
    isOpen: boolean
    orderId: number | null
    orderNumber: string
    trackingNumber: string
  }>({
    isOpen: false,
    orderId: null,
    orderNumber: '',
    trackingNumber: ''
  })

  const fetchOrders = async () => {
    try {
      const res = await fetch('/api/admin/orders', { method: 'GET' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        console.error('Error fetching orders:', data?.error || res.statusText)
        return
      }
      const data = (await res.json()) as any[]

      if (data) {
        const mappedShipments = data.map((order: any) => ({
          id: order.id,
          orderId: order.order_number,
          userId: order.user_id.toString(),
          user: order.user?.email || 'Unknown',
          userName: order.user?.name || 'Unknown',
          recipientName: order.recipient_name,
          recipientPhone: order.recipient_phone,
          address: order.address,
          trackingNumber: order.tracking_number || '',
          shippingFee: order.total_amount || 0,
          logisticsType: order.logistics_type || 'HOME',
          date: order.submitted_at?.split('T')[0] || '',
          submittedAt: order.submitted_at ? formatDateTime(order.submitted_at) : '',
          shippedAt: order.shipped_at ? formatDateTime(order.shipped_at) : null,
          days: order.submitted_at ? calculateDaysSinceSubmission(order.submitted_at) : 0,
          status: order.status,
          items: (order.items || []).map((item: any) => ({
            product: item.products?.name || 'Unknown Product',
            prize: item.product_prizes ? `${item.product_prizes.level}賞 ${item.product_prizes.name}` : 'Unknown Prize',
            imageUrl: item.product_prizes?.image_url || item.products?.image_url || 'https://placehold.co/100'
          }))
        }))
        setLocalShipments(mappedShipments)
      }
    } catch (error) {
      console.error('Error in fetchOrders:', error)
    }
  }

  const handleShipOrder = async () => {
    if (!shipModal.orderId) return

    try {
      const shippedAt = new Date().toISOString()
      const res = await fetch(`/api/admin/orders/${shipModal.orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'shipping',
          tracking_number: shipModal.trackingNumber,
          shipped_at: shippedAt,
          notification_title: '訂單已出貨',
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || '出貨失敗')
      }

      const targetOrder = localShipments.find(s => s.id === shipModal.orderId) || null

      const now = formatDateTime(new Date().toISOString())
      setLocalShipments(prev =>
        prev.map(s =>
          s.id === shipModal.orderId
            ? {
                ...s,
                status: 'shipping' as const,
                trackingNumber: shipModal.trackingNumber,
                shippedAt: now,
              }
            : s
        )
      )

      addLog('訂單出貨', '配送管理', `訂單 ${shipModal.orderNumber} 已出貨，物流單號：${shipModal.trackingNumber}`, 'success')
      setShipModal({ isOpen: false, orderId: null, orderNumber: '', trackingNumber: '' })
    } catch (error) {
      console.error('Error shipping order:', error)
      alert('出貨失敗')
    }
  }

  useEffect(() => {
    fetchOrders()
  }, [])

  // 檢查是否有相同配送資料的待配送訂單
  const findSameDeliveryInfo = (orderId: string, recipientName: string, recipientPhone: string, address: string) => {
    return localShipments.filter(s => 
      (s.status === 'submitted' || s.status === 'processing') && 
      s.orderId !== orderId &&
      s.recipientName === recipientName &&
      s.recipientPhone === recipientPhone &&
      s.address === address
    )
  }

  // 處理排序
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const toggleOrderExpand = (orderId: number) => {
    const newExpanded = new Set(expandedOrders)
    if (newExpanded.has(orderId)) {
      newExpanded.delete(orderId)
    } else {
      newExpanded.add(orderId)
    }
    setExpandedOrders(newExpanded)
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

  // 根據狀態生成配送進度
  // 計算從提交時間到現在的天數（以台灣時間為準）
  const calculateDaysSinceSubmission = (submittedAt: string): number => {
    try {
      // 解析提交時間（格式：YYYY-MM-DD HH:MM:SS）
      const [datePart, timePart] = submittedAt.split(' ')
      const [year, month, day] = datePart.split('-').map(Number)
      
      // 創建台灣時間的提交日期（只考慮日期部分，時間設為 00:00:00）
      const submittedDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
      
      // 獲取當前台灣時間（只考慮日期部分）
      const now = new Date()
      const taiwanNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }))
      const todayOnly = new Date(taiwanNow.getFullYear(), taiwanNow.getMonth(), taiwanNow.getDate())
      
      // 將提交日期轉換為本地時間（只考慮日期部分）
      const submittedDateOnly = new Date(year, month - 1, day)
      
      // 計算天數差異
      const diffTime = todayOnly.getTime() - submittedDateOnly.getTime()
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
      
      return diffDays
    } catch (error) {
      // 如果解析失敗，返回 0
      return 0
    }
  }

  const filteredShipments = useMemo(() => {
    let result = localShipments
    
    // 狀態過濾
    if (selectedStatus !== 'all') {
      result = result.filter(s => s.status === selectedStatus)
    }
    
    // 提交時間範圍過濾
    if (filterStartDate) {
      result = result.filter(s => {
        const submittedDate = s.submittedAt.split(' ')[0] // 取得日期部分 YYYY-MM-DD
        return submittedDate >= filterStartDate
      })
    }
    if (filterEndDate) {
      result = result.filter(s => {
        const submittedDate = s.submittedAt.split(' ')[0]
        return submittedDate <= filterEndDate
      })
    }
    
    // 出貨時間範圍過濾
    if (filterShipStartDate) {
      result = result.filter(s => {
        if (!s.shippedAt) return false
        const shippedDate = s.shippedAt.split(' ')[0]
        return shippedDate >= filterShipStartDate
      })
    }
    if (filterShipEndDate) {
      result = result.filter(s => {
        if (!s.shippedAt) return false
        const shippedDate = s.shippedAt.split(' ')[0]
        return shippedDate <= filterShipEndDate
      })
    }
    
    // 僅顯示超過3天的緊急訂單（只有已提交狀態）
    if (filterUrgentOnly) {
      result = result.filter(s => 
        s.status === 'submitted' && 
        calculateDaysSinceSubmission(s.submittedAt) > 3
      )
    }
    
    // 搜索過濾
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(s => 
        s.orderId.toLowerCase().includes(query) ||
        s.userName.toLowerCase().includes(query) ||
        s.userId.toLowerCase().includes(query) ||
        s.user.toLowerCase().includes(query) ||
        s.recipientName.toLowerCase().includes(query) ||
        s.recipientPhone.includes(query) ||
        s.address.toLowerCase().includes(query) ||
        s.items.some(item => item.product.toLowerCase().includes(query) || item.prize.toLowerCase().includes(query))
      )
    }
    
    // 狀態優先級順序：已提交 > 處理中 > 物流已收取 > 配送中 > 已送達 > 取消
    const getStatusPriority = (status: string) => {
      switch (status) {
        case 'submitted': return 1
        case 'processing': return 2
        case 'picked_up': return 3
        case 'shipping': return 4
        case 'delivered': return 5
        case 'cancelled': return 6
        default: return 7
      }
    }
    
    // 排序
    result = [...result].sort((a, b) => {
      let aValue: any
      let bValue: any
      
      switch (sortField) {
        case 'orderId':
          aValue = a.orderId
          bValue = b.orderId
          break
        case 'userName':
          aValue = a.userName
          bValue = b.userName
          break
        case 'userId':
          aValue = a.userId
          bValue = b.userId
          break
        case 'quantity':
          aValue = a.items.length
          bValue = b.items.length
          break
        case 'recipientName':
          aValue = a.recipientName
          bValue = b.recipientName
          break
        case 'status':
          aValue = getStatusPriority(a.status)
          bValue = getStatusPriority(b.status)
          break
        case 'trackingNumber':
          aValue = a.trackingNumber || ''
          bValue = b.trackingNumber || ''
          break
        case 'shippingFee':
          aValue = a.shippingFee ?? 0
          bValue = b.shippingFee ?? 0
          break
        case 'date':
          aValue = new Date(a.date).getTime()
          bValue = new Date(b.date).getTime()
          break
        case 'submittedAt':
          // 確保最新提交的單子排在第一筆（降序）
          aValue = new Date(a.submittedAt).getTime()
          bValue = new Date(b.submittedAt).getTime()
          break
        case 'shippedAt':
          aValue = a.shippedAt ? new Date(a.shippedAt).getTime() : 0
          bValue = b.shippedAt ? new Date(b.shippedAt).getTime() : 0
          break
        default:
          // 默認按訂單編號降序排序（最新在上）
          aValue = a.orderId
          bValue = b.orderId
      }
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
    
    return result
  }, [localShipments, selectedStatus, searchQuery, sortField, sortDirection, filterStartDate, filterEndDate, filterShipStartDate, filterShipEndDate, filterUrgentOnly])

  // 同步數據到 context
  useEffect(() => {
    setShipments(localShipments)
  }, [localShipments, setShipments])

  // 高亮效果處理
  useEffect(() => {
    if (highlightedOrderId) {
      // 設置狀態為 submitted 以便顯示該訂單
      setSelectedStatus('submitted')
      
      // 延遲一下確保 DOM 已更新
      setTimeout(() => {
        if (highlightedRowRef.current) {
          // 滾動到高亮行
          highlightedRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)
      
      // 3秒後清除高亮
      const timer = setTimeout(() => {
        setHighlightedOrderId(null)
      }, 3000)

      return () => clearTimeout(timer)
    }
  }, [highlightedOrderId, setHighlightedOrderId, setSelectedStatus])

  // 無限滾動處理
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && displayCount < filteredShipments.length) {
          setIsLoadingMore(true)
          setTimeout(() => {
            setDisplayCount(prev => Math.min(prev + 10, filteredShipments.length))
            setIsLoadingMore(false)
          }, 300)
        }
      },
      { threshold: 0.1 }
    )

    if (observerTarget.current) {
      observer.observe(observerTarget.current)
    }

    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current)
      }
    }
  }, [displayCount, filteredShipments.length, isLoadingMore])

  // 當篩選條件改變時，重置顯示數量
  useEffect(() => {
    setDisplayCount(20)
  }, [selectedStatus, searchQuery, sortField, sortDirection])

  // 匯出CSV功能
  const handleExportCSV = () => {
    const visibleColumnsList = [
      { key: 'orderId', label: '訂單編號' },
      { key: 'submittedAt', label: '提交時間' },
      { key: 'status', label: '狀態' },
      { key: 'userName', label: '暱稱' },
      { key: 'userId', label: '使用者ID' },
      { key: 'quantity', label: '數量' },
      { key: 'recipientName', label: '收件資訊' },
      { key: 'trackingNumber', label: '物流單號' },
      { key: 'shippingFee', label: '運費(TWD)' },
      { key: 'shippedAt', label: '出貨時間' }
    ].filter(col => visibleColumns[col.key as keyof typeof visibleColumns])
    
    const headers = visibleColumnsList.map(col => col.label)
    
    const csvData = filteredShipments.map(shipment => {
      return visibleColumnsList.map(col => {
        switch (col.key) {
          case 'orderId': return shipment.orderId
          case 'submittedAt': return formatDateTime(shipment.submittedAt)
          case 'status': {
            const statusMap: Record<string, string> = {
              'submitted': '已提交',
              'processing': '處理中',
              'picked_up': '物流已收取',
              'shipping': '配送中',
              'delivered': '已送達',
              'cancelled': '已取消'
            }
            return statusMap[shipment.status] || shipment.status
          }
          case 'userId': return shipment.userId
          case 'userName': return shipment.userName
          case 'quantity': return shipment.items.length.toString()
          case 'recipientName': return `${shipment.recipientName} | ${shipment.recipientPhone} | ${shipment.address}`
          case 'trackingNumber': return shipment.trackingNumber || ''
          case 'shippingFee': return String(shipment.shippingFee ?? 0)
          case 'shippedAt': return formatDateTime(shipment.shippedAt)
          default: return ''
        }
      })
    })
    
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')
    
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `訂單管理_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // 待配送 = 已提交的訂單
  const pendingCount = localShipments.filter(s => s.status === 'submitted').length
  // 需配送（超過3天）= 超過3天的已提交訂單
  const urgentCount = localShipments.filter(s => s.status === 'submitted' && calculateDaysSinceSubmission(s.submittedAt) > 3).length

  const generateTrackingNumber = (orderId: string) => {
    // 使用確定性的追蹤號碼生成，避免 hydration 錯誤
    // 基於訂單ID生成確定性的追蹤號碼
    // 訂單ID格式：20260126A039 -> 提取數字部分生成唯一追蹤號
    const numericPart = orderId.replace(/\D/g, '') // 移除非數字字符
    const orderIdNum = parseInt(numericPart) || Date.now()
    return `SF${String(orderIdNum).slice(-10).padStart(10, '0')}`
  }

  const handleGenerateShippingLabel = (orderIds: number[]) => {
    if (orderIds.length === 0) return
    
    const orders = localShipments.filter(s => orderIds.includes(s.id))
    const orderNumbers = orders.map(o => o.orderId)
    
    // 檢查是否有相同配送資料的待配送訂單
    const firstOrder = orders[0]
    const sameDeliveryOrders = findSameDeliveryInfo(
      firstOrder.orderId,
      firstOrder.recipientName,
      firstOrder.recipientPhone,
      firstOrder.address
    )
    
    // 準備合併選項的訂單資訊
    const mergeOrders = sameDeliveryOrders.map(o => ({
      orderId: o.orderId,
      items: o.items.length
    }))
    
    // 顯示確認彈窗（一次性顯示所有資訊）
    setConfirmModal({
      isOpen: true,
      title: '生成配送單確認',
      showMergeOption: sameDeliveryOrders.length > 0,
      mergeOrders: mergeOrders,
      content: (
        <div className="space-y-4">
          <div>
            <p className="text-sm text-neutral-600 mb-2">以下訂單將生成配送單：</p>
            <div className="bg-neutral-50 rounded-lg p-3 space-y-1">
              {orders.map((order, idx) => (
                <div key={order.id} className="flex items-center justify-between text-sm">
                  <span className="text-neutral-700">{order.orderId}</span>
                  <span className="text-neutral-500">{order.items.length} 個商品</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-neutral-500 mt-2">共 {orderIds.length} 筆訂單</p>
          </div>
          
          {sameDeliveryOrders.length > 0 && (
            <div className="border-t border-neutral-200 pt-4">
              <div className="flex items-start gap-2 mb-3">
                <svg className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-neutral-900 mb-1">發現相同配送資料的訂單</p>
                  <p className="text-xs text-neutral-600 mb-2">以下訂單的配送資料與選中訂單相同，可合併配送：</p>
                  <div className="bg-primary rounded-lg p-2 space-y-1">
                    {sameDeliveryOrders.map((order) => (
                      <div key={order.id} className="flex items-center justify-between text-xs">
                        <span className="text-primary font-medium">{order.orderId}</span>
                        <span className="text-primary">{order.items.length} 個商品</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="mergeOrders"
                      defaultChecked={true}
                      className="w-4 h-4 text-primary focus:ring-primary rounded"
                    />
                    <label htmlFor="mergeOrders" className="text-sm text-neutral-700 cursor-pointer">
                      合併生成相同配送單（共 {sameDeliveryOrders.length + orderIds.length} 筆訂單）
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div className="bg-gradient-to-r from-primary to-indigo-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-neutral-900 mb-1">注意</h3>
                <p className="text-sm text-neutral-600">
                  生成配送單後，系統將自動發送出貨通知郵件至用戶信箱
                </p>
              </div>
            </div>
          </div>
        </div>
      ),
      confirmText: '生成配送單',
      cancelText: '取消',
      onConfirm: async () => {
        const mergeCheckbox = document.getElementById('mergeOrders') as HTMLInputElement
        const shouldMerge = mergeCheckbox?.checked && sameDeliveryOrders.length > 0
        
        try {
          // Helper to call NewebPay Logistics API
          const createLogistics = async (orderId: number) => {
             const res = await fetch('/api/logistics/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ orderId })
             });
             
             if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Failed to create logistics order');
             }
             return res.json();
          };

          let generatedTrackingNumbers: string[] = [];
          let successOrderIds: number[] = [];

          if (shouldMerge) {
            const mergeOrderIds = [...orderIds, ...sameDeliveryOrders.map(o => o.id)]
            const mainOrder = orders[0]
            
            // Call API for the main order
            const apiRes = await createLogistics(mainOrder.id)
            
            // Use tracking number from API or fallback to generated one
            const trackingNumber = apiRes.trackingNumber ||
                                   generateTrackingNumber(mainOrder.orderId)
            
            generatedTrackingNumbers = [trackingNumber]
            successOrderIds = mergeOrderIds

            const batchRes = await fetch('/api/admin/orders/batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ids: mergeOrderIds,
                patch: { status: 'processing', tracking_number: trackingNumber },
              }),
            })
            if (!batchRes.ok) {
              const err = await batchRes.json().catch(() => null)
              throw new Error(err?.error || 'Failed to update merged orders')
            }

            setLocalShipments(prev => prev.map(s => {
              if (mergeOrderIds.includes(s.id) && s.status === 'submitted') {
                return {
                  ...s,
                  trackingNumber,
                  status: 'processing' as const
                }
              }
              return s
            }))
          } else {
            // Loop through each order and call API
            const updates = await Promise.all(orderIds.map(async (id) => {
              const shipment = localShipments.find(s => s.id === id)
              if (!shipment) return null
              
              const apiRes = await createLogistics(id)
              const trackingNumber = apiRes.trackingNumber ||
                                     generateTrackingNumber(shipment.orderId)
              
              return {
                id,
                trackingNumber
              }
            }))

            const validUpdates = updates.filter(Boolean) as { id: number, trackingNumber: string }[]
            generatedTrackingNumbers = validUpdates.map(u => u.trackingNumber)
            successOrderIds = validUpdates.map(u => u.id)

            setLocalShipments(prev => prev.map(s => {
              const update = validUpdates.find(u => u.id === s.id)
              if (update && s.status === 'submitted') {
                return {
                  ...s,
                  trackingNumber: update.trackingNumber,
                  status: 'processing' as const
                }
              }
              return s
            }))
          }
        
          const allOrders = localShipments.filter(s => successOrderIds.includes(s.id))
          
          // Log
          if (shouldMerge) {
            addLog('合併生成配送單', '配送管理', `為 ${successOrderIds.length} 筆相同收件人的訂單合併生成物流單號`, 'success')
          } else {
            addLog('批量生成配送單', '配送管理', `為 ${successOrderIds.length} 筆訂單生成物流單號`, 'success')
          }
          
          // Show Success Modal
          setConfirmModal({
            isOpen: true,
            title: '配送單生成成功',
            content: (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-neutral-900">配送單已成功生成</p>
                    {generatedTrackingNumbers.length === 1 ? (
                      <p className="text-sm text-neutral-600">物流單號：{generatedTrackingNumbers[0]}</p>
                    ) : (
                      <p className="text-sm text-neutral-600">已生成 {generatedTrackingNumbers.length} 個物流單號</p>
                    )}
                  </div>
                </div>
                <div className="bg-neutral-50 rounded-lg p-3">
                  <p className="text-sm text-neutral-700">
                    共 <span className="font-medium">{successOrderIds.length}</span> 筆訂單
                  </p>
                  <p className="text-sm text-neutral-700">
                    已發送通知至 <span className="font-medium">{allOrders.length}</span> 位用戶信箱
                  </p>
                </div>
              </div>
            ),
            onConfirm: () => {
              setConfirmModal({ ...confirmModal, isOpen: false })
              setSelectedOrders(new Set())
            },
            confirmText: '確定',
            cancelText: undefined
          })
        } catch (error: any) {
          console.error('Error generating shipping labels:', error)
          alert(`生成配送單失敗: ${error.message}`)
        }
      },
      onCancel: () => {
        setConfirmModal({ ...confirmModal, isOpen: false })
      }
    })
  }

  const handleBatchGenerate = () => {
    const selectedOrdersList = Array.from(selectedOrders)
    if (selectedOrdersList.length === 0) {
      alert('請先選擇要生成配送單的訂單')
      return
    }
    
    // 處理已提交、以及處理中/已攬收但無物流單號的訂單
    const submittedOrders = selectedOrdersList.filter(id => {
      const shipment = localShipments.find(s => s.id === id)
      if (!shipment) return false
      return shipment.status === 'submitted' ||
        (!shipment.trackingNumber && (shipment.status === 'processing' || shipment.status === 'picked_up'))
    })

    if (submittedOrders.length === 0) {
      alert('選中的訂單中沒有可生成配送單的訂單')
      return
    }
    
    handleGenerateShippingLabel(submittedOrders)
  }

  const handleBatchPrint = () => {
    const selectedOrdersList = Array.from(selectedOrders)
    if (selectedOrdersList.length === 0) {
      alert('請先選擇要列印的訂單')
      return
    }
    
    // 只處理非已提交、非已取消狀態的訂單
    const printableOrders = selectedOrdersList.filter(id => {
      const shipment = localShipments.find(s => s.id === id)
      return shipment && shipment.status !== 'submitted' && shipment.status !== 'cancelled'
    })
    
    if (printableOrders.length === 0) {
      alert('選中的訂單中沒有可列印的訂單')
      return
    }
    
    const orderIds = printableOrders.map(id => localShipments.find(s => s.id === id)?.orderId).filter(Boolean)
    console.log('批量列印物流單:', orderIds)
    addLog('批量列印物流單', '配送管理', `批量列印 ${printableOrders.length} 筆訂單的物流單`, 'success')
    window.print()
    setSelectedOrders(new Set())
  }

  const handleBatchCancel = () => {
    const selectedOrdersList = Array.from(selectedOrders)
    if (selectedOrdersList.length === 0) {
      alert('請先選擇要取消的訂單')
      return
    }
    
    // 只處理非已送達、非已取消狀態的訂單
    const cancellableOrders = selectedOrdersList.filter(id => {
      const shipment = localShipments.find(s => s.id === id)
      return shipment && shipment.status !== 'delivered' && shipment.status !== 'cancelled'
    })
    
    if (cancellableOrders.length === 0) {
      alert('選中的訂單中沒有可取消的訂單')
      return
    }
    
    setConfirmModal({
      isOpen: true,
      title: '批量取消訂單確認',
      content: (
        <div className="space-y-3">
          <p className="text-neutral-700">
            確定要取消 <span className="font-medium text-red-500">{cancellableOrders.length}</span> 筆訂單嗎？
          </p>
          <div className="bg-gradient-to-r from-primary to-indigo-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-neutral-900 mb-1">注意</h3>
                <p className="text-sm text-neutral-600">
                  取消後將無法恢復，請確認操作。
                </p>
              </div>
            </div>
          </div>
        </div>
      ),
      onConfirm: async () => {
        try {
          const res = await fetch('/api/admin/orders/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: cancellableOrders, patch: { status: 'cancelled' } }),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => null)
            throw new Error(data?.error || '取消訂單失敗')
          }

          setLocalShipments(prev => prev.map(s => 
            cancellableOrders.includes(s.id) ? { ...s, status: 'cancelled' as const } : s
          ))
          addLog('批量取消', '配送管理', `批量取消 ${cancellableOrders.length} 筆訂單`, 'success')
          setConfirmModal({ ...confirmModal, isOpen: false })
          setSelectedOrders(new Set())
        } catch (error) {
          console.error('Error cancelling orders:', error)
          alert('取消訂單失敗')
        }
      },
      confirmText: '確定取消',
      cancelText: '返回'
    })
  }

  // 計算選中訂單的狀態統計
  const getSelectedOrdersStats = () => {
    const stats = {
      submitted: 0,
      printable: 0, // 非submitted且非cancelled
      cancellable: 0 // 非delivered且非cancelled
    }
    selectedOrders.forEach(id => {
      const shipment = localShipments.find(s => s.id === id)
      if (shipment) {
        if (shipment.status === 'submitted') stats.submitted++
        if (shipment.status !== 'submitted' && shipment.status !== 'cancelled') stats.printable++
        if (shipment.status !== 'delivered' && shipment.status !== 'cancelled') stats.cancellable++
      }
    })
    return stats
  }

  const toggleOrderSelection = (orderId: number) => {
    const newSelected = new Set(selectedOrders)
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId)
    } else {
      newSelected.add(orderId)
    }
    setSelectedOrders(newSelected)
  }
  
  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      // 全選當前顯示的訂單（排除已取消的）
      const selectableIds = filteredShipments
        .slice(0, displayCount)
        .filter(s => s.status !== 'cancelled')
        .map(s => s.id)
      setSelectedOrders(new Set(selectableIds))
    } else {
      setSelectedOrders(new Set())
    }
  }

  // 密度樣式
  const getDensityClasses = () => {
    switch (tableDensity) {
      case 'compact': return 'py-2 px-2'
      case 'normal': return 'py-3 px-4'
      case 'comfortable': return 'py-4 px-6'
    }
  }

  return (
    <AdminLayout pageTitle="配送管理">
      {/* 出貨彈窗 */}
      <Modal
        isOpen={shipModal.isOpen}
        onClose={() => setShipModal({ isOpen: false, orderId: null, orderNumber: '', trackingNumber: '' })}
        title={`訂單出貨 - ${shipModal.orderNumber}`}
        size="md"
        footer={
          <>
            <button
              onClick={() => setShipModal({ isOpen: false, orderId: null, orderNumber: '', trackingNumber: '' })}
              className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleShipOrder}
              disabled={!shipModal.trackingNumber}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              確認出貨
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              物流單號
            </label>
            <input
              type="text"
              value={shipModal.trackingNumber}
              onChange={(e) => setShipModal({ ...shipModal, trackingNumber: e.target.value })}
              placeholder="請輸入物流單號"
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent"
              autoFocus
            />
          </div>
          <p className="text-sm text-neutral-500">
            輸入物流單號並確認後，訂單狀態將更新為「配送中」，並記錄出貨時間。
          </p>
        </div>
      </Modal>

      {/* 圖片彈窗 */}
      <Modal
        isOpen={imageModal.isOpen}
        onClose={() => setImageModal({ isOpen: false, imageUrl: '', productName: '', prizeName: '' })}
        title={imageModal.productName}
        size="lg"
      >
        <div className="space-y-3">
          <div className="text-base font-semibold text-neutral-900">{imageModal.prizeName}</div>
          <div className="flex justify-center">
            <img 
              src={imageModal.imageUrl} 
              alt={imageModal.prizeName || imageModal.productName}
              className="max-w-full h-auto rounded-lg"
            />
          </div>
        </div>
      </Modal>

      {/* 確認彈窗 */}
      <Modal
        isOpen={confirmModal.isOpen}
        onClose={() => {
          if (confirmModal.onCancel) {
            confirmModal.onCancel()
          } else {
            setConfirmModal({ ...confirmModal, isOpen: false })
          }
        }}
        title={confirmModal.title}
        size="md"
        footer={
          <>
            {confirmModal.cancelText && (
              <button
                onClick={() => {
                  if (confirmModal.onCancel) {
                    confirmModal.onCancel()
                  } else {
                    setConfirmModal({ ...confirmModal, isOpen: false })
                  }
                }}
                className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors"
              >
                {confirmModal.cancelText}
              </button>
            )}
            <button
              onClick={confirmModal.onConfirm}
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors"
            >
              {confirmModal.confirmText}
            </button>
          </>
        }
      >
        {confirmModal.content}
      </Modal>


      <div className="space-y-6">
        {/* 統計卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            title="超過三日待配送"
            value={urgentCount}
            onClick={() => {
              setSelectedStatus('submitted')
              setSearchQuery('')
              setFilterUrgentOnly(true)
            }}
            isActive={filterUrgentOnly}
            activeColor="primary"
          />
          <StatsCard
            title="待配送"
            value={pendingCount}
            onClick={() => {
              setSelectedStatus('submitted')
              setSearchQuery('')
              setFilterUrgentOnly(false)
            }}
            isActive={selectedStatus === 'submitted' && !filterUrgentOnly}
            activeColor="primary"
          />
          <StatsCard
            title="已完成"
            value={localShipments.filter(s => s.status === 'delivered').length}
            onClick={() => {
              setSelectedStatus('delivered')
              setSearchQuery('')
              setFilterUrgentOnly(false)
            }}
            isActive={selectedStatus === 'delivered'}
            activeColor="primary"
          />
        </div>

        <PageCard>
          <SearchToolbar
            searchPlaceholder="搜尋訂單編號、使用者ID、收件人、電話或商品..."
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            showExportCSV={true}
            onExportCSV={handleExportCSV}
            showDensity={true}
            density={tableDensity}
            onDensityChange={setTableDensity}
            showFilter={true}
            filterOptions={[
              {
                key: 'status',
                label: '狀態',
                type: 'select',
                value: selectedStatus,
                onChange: setSelectedStatus,
                options: [
                  { value: 'all', label: '全部狀態' },
                  { value: 'submitted', label: '已提交' },
                  { value: 'processing', label: '處理中' },
                  { value: 'picked_up', label: '物流已收取' },
                  { value: 'shipping', label: '配送中' },
                  { value: 'delivered', label: '已送達' },
                  { value: 'cancelled', label: '已取消' }
                ]
              },
              {
                key: 'submitDate',
                label: '提交時間',
                type: 'date-range',
                startDate: filterStartDate,
                endDate: filterEndDate,
                render: () => (
                  <DateRangePicker
                    startDate={filterStartDate}
                    endDate={filterEndDate}
                    onStartDateChange={setFilterStartDate}
                    onEndDateChange={setFilterEndDate}
                    placeholder="選擇提交時間範圍"
                  />
                )
              },
              {
                key: 'shipDate',
                label: '出貨時間',
                type: 'date-range',
                startDate: filterShipStartDate,
                endDate: filterShipEndDate,
                render: () => (
                  <DateRangePicker
                    startDate={filterShipStartDate}
                    endDate={filterShipEndDate}
                    onStartDateChange={setFilterShipStartDate}
                    onEndDateChange={setFilterShipEndDate}
                    placeholder="選擇出貨時間範圍"
                  />
                )
              }
            ]}
            showColumnToggle={true}
            columns={[
              { key: 'orderId', label: '訂單編號', visible: visibleColumns.orderId },
              { key: 'submittedAt', label: '提交時間', visible: visibleColumns.submittedAt },
              { key: 'status', label: '狀態', visible: visibleColumns.status },
              { key: 'userName', label: '暱稱', visible: visibleColumns.userName },
              { key: 'userId', label: '使用者ID', visible: visibleColumns.userId },
              { key: 'quantity', label: '數量', visible: visibleColumns.quantity },
              { key: 'recipientName', label: '收件資訊', visible: visibleColumns.recipientName },
              { key: 'trackingNumber', label: '物流單號', visible: visibleColumns.trackingNumber },
              { key: 'shippingFee', label: '運費(TWD)', visible: visibleColumns.shippingFee },
              { key: 'shippedAt', label: '出貨時間', visible: visibleColumns.shippedAt }
            ]}
            onColumnToggle={(key, visible) => setVisibleColumns(prev => ({ ...prev, [key]: visible }))}
            selectedCount={selectedOrders.size}
            batchActions={[
              ...(selectedStatus === 'submitted' && getSelectedOrdersStats().submitted > 0 ? [{
                label: '批量生成配送單',
                onClick: handleBatchGenerate,
                variant: 'primary' as const,
                count: getSelectedOrdersStats().submitted
              }] : []),
              ...((selectedStatus === 'processing' || selectedStatus === 'picked_up' || selectedStatus === 'shipping' || selectedStatus === 'delivered') && getSelectedOrdersStats().printable > 0 ? [{
                label: '批量列印物流單',
                onClick: handleBatchPrint,
                variant: 'secondary' as const,
                count: getSelectedOrdersStats().printable
              }] : []),
              ...(selectedStatus === 'all' && getSelectedOrdersStats().submitted > 0 && getSelectedOrdersStats().printable === 0 ? [{
                label: '批量生成配送單',
                onClick: handleBatchGenerate,
                variant: 'primary' as const,
                count: getSelectedOrdersStats().submitted
              }] : []),
              ...(selectedStatus === 'all' && getSelectedOrdersStats().printable > 0 && getSelectedOrdersStats().submitted === 0 ? [{
                label: '批量列印物流單',
                onClick: handleBatchPrint,
                variant: 'secondary' as const,
                count: getSelectedOrdersStats().printable
              }] : []),
              ...(selectedStatus !== 'delivered' && selectedStatus !== 'cancelled' && getSelectedOrdersStats().cancellable > 0 ? [{
                label: '批量取消',
                onClick: handleBatchCancel,
                variant: 'danger' as const,
                count: getSelectedOrdersStats().cancellable
              }] : [])
            ]}
            onClearSelection={() => setSelectedOrders(new Set())}
          />

          {/* 篩選條件 Tags */}
          <FilterTags
            tags={[
              ...(selectedStatus !== 'all' ? [{
                key: 'status',
                label: '狀態',
                value: selectedStatus === 'submitted' ? '已提交' :
                  selectedStatus === 'processing' ? '處理中' :
                  selectedStatus === 'picked_up' ? '物流已收取' :
                  selectedStatus === 'shipping' ? '配送中' :
                  selectedStatus === 'delivered' ? '已送達' :
                  selectedStatus === 'cancelled' ? '已取消' : '',
                color: 'primary' as const,
                onRemove: () => { setSelectedStatus('all'); setFilterUrgentOnly(false); }
              }] : []),
              ...(filterUrgentOnly ? [{
                key: 'urgent',
                label: '緊急',
                value: '超過3天',
                color: 'red' as const,
                onRemove: () => setFilterUrgentOnly(false)
              }] : []),
              ...((filterStartDate || filterEndDate) ? [{
                key: 'submitDate',
                label: '提交時間',
                value: `${filterStartDate ? filterStartDate.slice(5).replace('-', '/') : '?'} - ${filterEndDate ? filterEndDate.slice(5).replace('-', '/') : '?'}`,
                color: 'blue' as const,
                onRemove: () => { setFilterStartDate(''); setFilterEndDate(''); }
              }] : []),
              ...((filterShipStartDate || filterShipEndDate) ? [{
                key: 'shipDate',
                label: '出貨時間',
                value: `${filterShipStartDate ? filterShipStartDate.slice(5).replace('-', '/') : '?'} - ${filterShipEndDate ? filterShipEndDate.slice(5).replace('-', '/') : '?'}`,
                color: 'green' as const,
                onRemove: () => { setFilterShipStartDate(''); setFilterShipEndDate(''); }
              }] : [])
            ]}
            onClearAll={() => {
              setSelectedStatus('all')
              setFilterStartDate('')
              setFilterEndDate('')
              setFilterShipStartDate('')
              setFilterShipEndDate('')
              setFilterUrgentOnly(false)
            }}
          />

          <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-neutral-200">
                    <th className={`text-left ${getDensityClasses()} text-sm font-semibold text-neutral-700 w-12`}>
                      <input
                        type="checkbox"
                        checked={filteredShipments.slice(0, displayCount).filter(s => s.status !== 'cancelled').length > 0 && 
                                 filteredShipments.slice(0, displayCount).filter(s => s.status !== 'cancelled').every(s => selectedOrders.has(s.id))}
                        onChange={(e) => toggleSelectAll(e.target.checked)}
                        className="w-4 h-4 text-primary focus:ring-primary rounded"
                      />
                    </th>
                    {visibleColumns.orderId && (
                      <SortableTableHeader
                        sortKey="orderId"
                        currentSortField={sortField}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                        className={getDensityClasses()}
                      >
                        訂單編號
                      </SortableTableHeader>
                    )}
                    {visibleColumns.submittedAt && (
                      <SortableTableHeader
                        sortKey="submittedAt"
                        currentSortField={sortField}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                        className={getDensityClasses()}
                      >
                        提交時間
                      </SortableTableHeader>
                    )}
                    {visibleColumns.status && (
                      <SortableTableHeader
                        sortKey="status"
                        currentSortField={sortField}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                        className={getDensityClasses()}
                      >
                        狀態
                      </SortableTableHeader>
                    )}
                    {visibleColumns.userName && (
                      <SortableTableHeader
                        sortKey="userName"
                        currentSortField={sortField}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                        className={getDensityClasses()}
                      >
                        暱稱
                      </SortableTableHeader>
                    )}
                    {visibleColumns.userId && (
                      <SortableTableHeader
                        sortKey="userId"
                        currentSortField={sortField}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                        className={getDensityClasses()}
                      >
                        使用者ID
                      </SortableTableHeader>
                    )}
                    {visibleColumns.quantity && (
                      <SortableTableHeader
                        sortKey="quantity"
                        currentSortField={sortField}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                        className={`whitespace-nowrap ${getDensityClasses()}`}
                      >
                        數量
                      </SortableTableHeader>
                    )}
                    {visibleColumns.recipientName && (
                      <SortableTableHeader
                        sortKey="recipientName"
                        currentSortField={sortField}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                        className={getDensityClasses()}
                      >
                        收件資訊
                      </SortableTableHeader>
                    )}
                    {visibleColumns.trackingNumber && (
                      <SortableTableHeader
                        sortKey="trackingNumber"
                        currentSortField={sortField}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                        className={getDensityClasses()}
                      >
                        物流單號
                      </SortableTableHeader>
                    )}
                    {visibleColumns.shippingFee && (
                      <SortableTableHeader
                        sortKey="shippingFee"
                        currentSortField={sortField}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                        className={getDensityClasses()}
                      >
                        運費(TWD)
                      </SortableTableHeader>
                    )}
                    {visibleColumns.shippedAt && (
                      <SortableTableHeader
                        sortKey="shippedAt"
                        currentSortField={sortField}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                        className={getDensityClasses()}
                      >
                        出貨時間
                      </SortableTableHeader>
                    )}
                    <th className={`text-left ${getDensityClasses()} text-sm font-semibold text-neutral-700 sticky right-0 bg-white z-20 border-l border-neutral-200`}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredShipments.length === 0 ? (
                    <tr>
                      <td colSpan={2 + Object.values(visibleColumns).filter(Boolean).length} className="py-12 text-center text-neutral-500">
                        沒有找到符合條件的訂單
                      </td>
                    </tr>
                  ) : (
                    filteredShipments.slice(0, displayCount).map((shipment, index) => {
                      const isHighlighted = highlightedOrderId === shipment.orderId
                    return (
                      <Fragment key={shipment.id}>
                        <tr 
                          key={shipment.id} 
                          ref={isHighlighted ? highlightedRowRef : null}
                          onClick={() => toggleOrderExpand(shipment.id)}
                          className={`group border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer transition-all duration-300 ${
                            isHighlighted 
                              ? 'bg-yellow-200 border-yellow-400 border-2 shadow-lg ring-4 ring-yellow-300 ring-opacity-50 animate-highlight-flash' 
                              : expandedOrders.has(shipment.id) 
                                ? 'bg-neutral-50' 
                                : shipment.status === 'submitted' && calculateDaysSinceSubmission(shipment.submittedAt) > 3 
                                  ? 'bg-red-50' 
                                  : ''
                          }`}
                        >
                        <td className={`${getDensityClasses()}`} onClick={(e) => e.stopPropagation()}>
                          {shipment.status !== 'cancelled' ? (
                            <input
                              type="checkbox"
                              checked={selectedOrders.has(shipment.id)}
                              onChange={() => toggleOrderSelection(shipment.id)}
                              className="w-4 h-4 text-primary focus:ring-primary rounded cursor-pointer"
                            />
                          ) : (
                            <span className="w-4 h-4 block"></span>
                          )}
                        </td>
                        {visibleColumns.orderId && (
                          <td className={`${getDensityClasses()} text-sm text-neutral-700 font-medium whitespace-nowrap`}>
                            <div className="flex items-center gap-2">
                              <svg 
                                className={`w-4 h-4 transition-transform flex-shrink-0 ${expandedOrders.has(shipment.id) ? 'rotate-180 text-primary' : 'text-neutral-400'}`}
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                              <span className="font-mono whitespace-nowrap">{shipment.orderId}</span>
                            </div>
                          </td>
                        )}
                        {visibleColumns.submittedAt && (
                          <td className={`${getDensityClasses()} text-sm text-neutral-700 whitespace-nowrap`}>
                            <span className="font-mono whitespace-nowrap">{formatDateTime(shipment.submittedAt)}</span>
                          </td>
                        )}
                        {visibleColumns.status && (
                          <td className={`${getDensityClasses()} whitespace-nowrap`}>
                            <Badge status={shipment.status}>{getStatusText(shipment.status)}</Badge>
                          </td>
                        )}
                        {visibleColumns.userName && (
                          <td className={`${getDensityClasses()} text-sm text-neutral-700 whitespace-nowrap`}>
                            <span className="whitespace-nowrap">{shipment.userName || '-'}</span>
                          </td>
                        )}
                        {visibleColumns.userId && (
                          <td className={`${getDensityClasses()} text-sm text-neutral-700 whitespace-nowrap`}>
                            <span className="whitespace-nowrap"><CopyableID id={shipment.userId} /></span>
                          </td>
                        )}
                        {visibleColumns.quantity && (
                          <td className={`${getDensityClasses()} text-sm text-neutral-700 whitespace-nowrap`}>
                            <span className="font-mono whitespace-nowrap">{shipment.items.length}</span>
                          </td>
                        )}
                        {visibleColumns.recipientName && (
                          <td className={`${getDensityClasses()} whitespace-nowrap`}>
                            <div className="space-y-0 leading-tight">
                              <p className="text-sm text-neutral-700 whitespace-nowrap">{shipment.recipientName}</p>
                              <p className="text-xs text-neutral-400 whitespace-nowrap font-mono">{shipment.recipientPhone}</p>
                              <p className="text-xs text-neutral-400 whitespace-nowrap">{shipment.address}</p>
                            </div>
                          </td>
                        )}
                        {visibleColumns.trackingNumber && (
                          <td className={`${getDensityClasses()} text-sm text-neutral-700 whitespace-nowrap`}>
                            <span className="font-mono whitespace-nowrap">{shipment.trackingNumber || '-'}</span>
                          </td>
                        )}
                        {visibleColumns.shippingFee && (
                          <td className={`${getDensityClasses()} text-sm text-neutral-700 whitespace-nowrap`}>
                            <span className="font-mono">{shipment.shippingFee > 0 ? `$${shipment.shippingFee}` : '—'}</span>
                          </td>
                        )}
                        {visibleColumns.shippedAt && (
                          <td className={`${getDensityClasses()} text-sm text-neutral-700 whitespace-nowrap`}>
                            <span className="font-mono whitespace-nowrap">
                              {formatDateTime(shipment.shippedAt)}
                            </span>
                          </td>
                        )}
                        <td
                          className={`${getDensityClasses()} whitespace-nowrap sticky right-0 z-20 border-l border-neutral-200 transition-colors duration-300 ${
                            isHighlighted 
                              ? 'bg-yellow-200' 
                              : expandedOrders.has(shipment.id) 
                                ? 'bg-neutral-50' 
                                : shipment.status === 'submitted' && calculateDaysSinceSubmission(shipment.submittedAt) > 3 
                                  ? 'bg-red-50' 
                                  : 'bg-white group-hover:bg-neutral-50'
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center gap-2 flex-nowrap">
                            {/* 詳情 - 所有狀態都有 */}
                            <Link 
                              href={`/orders/${shipment.orderId}`}
                              className="text-primary hover:text-primary text-sm font-medium whitespace-nowrap flex-shrink-0"
                            >
                              詳情
                            </Link>
                            
                            {/* 手動出貨按鈕 - 顯示在已提交或處理中 */}
                            {(shipment.status === 'submitted' || shipment.status === 'processing') && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setShipModal({
                                    isOpen: true,
                                    orderId: shipment.id,
                                    orderNumber: shipment.orderId,
                                    trackingNumber: shipment.trackingNumber || ''
                                  })
                                }}
                                className="text-green-600 hover:text-green-800 text-sm font-medium whitespace-nowrap flex-shrink-0"
                              >
                                手動出貨
                              </button>
                            )}

                            {/* 已提交 或 處理中/已攬收但無物流單號：生成配送單 */}
                            {(shipment.status === 'submitted' ||
                              (!shipment.trackingNumber && (shipment.status === 'processing' || shipment.status === 'picked_up'))) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleGenerateShippingLabel([shipment.id])
                                }}
                                className="text-primary hover:text-primary text-sm font-medium whitespace-nowrap flex-shrink-0"
                            >
                              生成配送單
                            </button>
                            )}
                            
                            {/* 其他狀態（非已提交、非已取消）：列印物流單單 */}
                            {shipment.status !== 'submitted' && shipment.status !== 'cancelled' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  window.print()
                                }}
                                className="text-primary hover:text-primary text-sm font-medium whitespace-nowrap flex-shrink-0"
                              >
                                列印物流單
                              </button>
                            )}
                            
                            {/* 配送中：確認送達 */}
                            {shipment.status === 'shipping' && (
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation()
                                  if (!confirm(`確定將訂單 ${shipment.orderId} 標記為「已送達」？`)) return
                                  const res = await fetch(`/api/admin/orders/${shipment.id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ status: 'delivered', notification_title: '訂單已送達' }),
                                  })
                                  if (res.ok) {
                                    setLocalShipments(prev => prev.map(s =>
                                      s.id === shipment.id ? { ...s, status: 'delivered' as const } : s
                                    ))
                                    addLog('確認送達', '配送管理', `訂單 ${shipment.orderId} 已標記為送達`, 'success')
                                  }
                                }}
                                className="text-green-600 hover:text-green-800 text-sm font-medium whitespace-nowrap flex-shrink-0"
                              >
                                確認送達
                              </button>
                            )}

                            {/* 非已送達、非已取消：取消 */}
                            {shipment.status !== 'delivered' && shipment.status !== 'cancelled' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setConfirmModal({
                                    isOpen: true,
                                    title: '取消確認',
                                    content: (
                                      <div className="space-y-3">
                                        <p className="text-sm text-neutral-600">
                                          確定要取消 <span className="font-medium text-neutral-900">{shipment.orderId}</span> 嗎？
                                        </p>
                                        <div className="bg-gradient-to-r from-primary to-indigo-50 border border-blue-200 rounded-lg p-4">
                                          <div className="flex items-start gap-3">
                                            <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                                              <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                              </svg>
                                            </div>
                                            <div className="flex-1">
                                              <h3 className="text-base font-semibold text-neutral-900 mb-1">注意</h3>
                                              <p className="text-sm text-neutral-600">
                                                取消後將無法恢復，請確認操作。
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ),
                                    confirmText: '確定取消',
                                    cancelText: '取消',
                                    onConfirm: async () => {
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

                                        setLocalShipments(prev => prev.map(s => 
                                          s.id === shipment.id ? { ...s, status: 'cancelled' as const } : s
                                        ))
                                        addLog('取消訂單', '配送管理', `取消訂單 ${shipment.orderId}`, 'success')
                                        setConfirmModal({ ...confirmModal, isOpen: false })
                                      } catch (error) {
                                        console.error('Error cancelling order:', error)
                                        alert('取消訂單失敗')
                                      }
                                    },
                                    onCancel: () => {
                                      setConfirmModal({ ...confirmModal, isOpen: false })
                                    }
                                  })
                                }}
                                className="text-red-500 hover:text-red-700 text-sm whitespace-nowrap flex-shrink-0"
                              >
                                取消
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {expandedOrders.has(shipment.id) && (
                        <tr className="bg-neutral-50">
                          <td colSpan={2 + Object.values(visibleColumns).filter(Boolean).length} className="py-4 px-4">
                            <div className="pl-8">
                              <div className="space-y-2">
                                {(() => {
                                  // 計算所有賞項中最長的文本，用於統一寬度
                                  const maxPrizeLength = Math.max(...shipment.items.map(item => item.prize.length), 0)
                                  // 根據字符長度估算寬度（每個中文字符約 14px，加上 padding 20px），最小 140px
                                  const prizeWidth = Math.max(140, maxPrizeLength * 14 + 20)
                                  
                                  return (
                                    <div className="space-y-2">
                                      {shipment.items.map((item, idx) => (
                                        <div key={idx} className="flex items-center gap-3 text-sm flex-nowrap">
                                          <span className="text-neutral-500 font-mono text-xs whitespace-nowrap min-w-[80px] flex-shrink-0">
                                            #{String(idx + 1).padStart(2, '0')}
                                          </span>
                                          <span className="text-neutral-700 whitespace-nowrap w-[240px] flex-shrink-0 overflow-hidden text-ellipsis">
                                            {item.product}
                                          </span>
                                          <span 
                                            className="px-2 py-1 text-sm rounded-full bg-purple-100 text-purple-700 whitespace-nowrap inline-flex items-center justify-center flex-shrink-0"
                                            style={{ width: `${prizeWidth}px`, minWidth: `${prizeWidth}px` }}
                                          >
                                            {item.prize}
                                          </span>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              setImageModal({
                                                isOpen: true,
                                                imageUrl: item.imageUrl,
                                                productName: item.product,
                                                prizeName: item.prize
                                              })
                                            }}
                                            className="text-primary hover:text-primary text-sm whitespace-nowrap w-20 text-left flex-shrink-0"
                                          >
                                            查看商品
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )
                                })()}
                              </div>
                            </div>
                        </td>
                      </tr>
                    )}
                      </Fragment>
                    )
                  }))}
                </tbody>
              </table>
              {displayCount < filteredShipments.length && (
                <div ref={observerTarget} className="py-8 text-center">
                  {isLoadingMore ? (
                    <div className="flex items-center justify-center gap-2 text-neutral-500">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                      <span className="text-sm">載入中...</span>
                    </div>
                  ) : (
                    <div className="h-4"></div>
                  )}
                </div>
              )}
            </div>
        </PageCard>
      </div>
    </AdminLayout>
  )
}
