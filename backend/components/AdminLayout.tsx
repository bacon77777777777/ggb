'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAdmin } from '@/contexts/AdminContext'
import { useShipment } from '@/contexts/ShipmentContext'
import { useLog } from '@/contexts/LogContext'
import { useProduct } from '@/contexts/ProductContext'
import { supabase } from '@/lib/supabaseClient'
import { Product } from '@/types/product'

interface Breadcrumb {
  label: string
  href?: string
}

interface AdminLayoutProps {
  children: React.ReactNode
  pageTitle?: string
  pageSubtitle?: string
  breadcrumbs?: Breadcrumb[]
}

export default function AdminLayout({ children, pageTitle, pageSubtitle, breadcrumbs }: AdminLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { isAuthenticated, logout, user } = useAdmin()
  const { shipments, setHighlightedOrderId } = useShipment()
  const { setHighlightedProductId } = useProduct()
  const { addLog } = useLog()
  const [isMounted, setIsMounted] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return true
    const last = localStorage.getItem('sidebarOpen_last')
    return last === null ? true : last === 'true'
  })
  const [sidebarTransitionReady, setSidebarTransitionReady] = useState(false)
  const [groupOpenMap, setGroupOpenMap] = useState<Record<string, boolean>>({})
  const [isGroupInitialized, setIsGroupInitialized] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [pendingOrders, setPendingOrders] = useState<any[]>([])
  const [isAlertOpen, setIsAlertOpen] = useState(false)
  const [isShipmentOpen, setIsShipmentOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [latestVersion, setLatestVersion] = useState<string>('v1.7.6')

  // 從 localStorage 讀取初始值（依帳號）
  // 先套用正確值，等兩個 rAF 再開 transition，避免刷新時出現先收起再展開的動畫
  useEffect(() => {
    if (!user?.username) return
    const saved = localStorage.getItem(`sidebarOpen_${user.username}`)
    if (saved !== null) setIsSidebarOpen(saved === 'true')
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setSidebarTransitionReady(true)
      })
    })
  }, [user?.username])

  // 保存側邊欄展開狀態（依帳號 + 通用 key 供初始化用）
  useEffect(() => {
    if (!sidebarTransitionReady || !user?.username) return
    localStorage.setItem(`sidebarOpen_${user.username}`, String(isSidebarOpen))
    localStorage.setItem('sidebarOpen_last', String(isSidebarOpen))
  }, [isSidebarOpen, sidebarTransitionReady, user?.username])

  // Fetch products and pending orders
  useEffect(() => {
    const fetchData = async () => {
      // Fetch Products
      const { data: productsData } = await supabase
        .from('products')
        .select('*, prizes:product_prizes(*)')
      
      if (productsData) {
        const mappedProducts: Product[] = productsData.map((p: any) => ({
          id: p.id,
          productCode: p.product_code,
          name: p.name,
          category: p.category,
          type: p.type,
          price: p.price,
          remaining: p.remaining,
          status: p.status,
          sales: p.sales,
          isHot: p.is_hot,
          createdAt: p.created_at,
          imageUrl: p.image_url,
          prizes: p.prizes.map((pz: any) => ({
            name: pz.name,
            level: pz.level,
            imageUrl: pz.image_url,
            total: pz.total,
            remaining: pz.remaining,
            probability: pz.probability
          })),
          totalCount: p.total_count,
          releaseYear: p.release_year,
          releaseMonth: p.release_month,
          distributor: p.distributor,
          rarity: p.rarity,
          majorPrizes: p.major_prizes
        }))
        setProducts(mappedProducts)
      }

      // Fetch latest version from dev-logs
      const logsRes = await fetch('/api/admin/dev-logs')
      if (logsRes.ok) {
        const logs: { version: string | null }[] = await logsRes.json()
        const versions = logs
          .map(l => l.version)
          .filter((v): v is string => !!v && v !== '擴展計畫')
          .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
        if (versions[0]) setLatestVersion(versions[0])
      }

      // Fetch Pending Orders (submitted status)
      const { data: ordersData } = await supabase
        .from('orders')
        .select('*, items:order_items(*), user:users(name, email)')
        .eq('shipping_status', 'submitted')
        .order('submitted_at', { ascending: true })

      if (ordersData) {
        setPendingOrders(ordersData)
      }
    }

    fetchData()
  }, [])

  // 從實際商品數據計算系統警示
  const alerts = useMemo(() => {
    const alertList: Array<{
      type: 'high-rate' | 'low-stock'
      product: string
      productId: number
      level?: string
      rate?: number
      threshold?: number
      remaining?: number
      severity: 'high' | 'medium'
    }> = []

    // 遍歷所有商品
    products.forEach(product => {
      // 檢查低庫存警示（剩餘數量 < 5）
      if (product.status === 'active' && product.remaining > 0 && product.remaining < 5) {
        alertList.push({
          type: 'low-stock',
          product: product.name,
          productId: product.id,
          remaining: product.remaining,
          threshold: 5,
          severity: product.remaining < 3 ? 'high' : 'medium'
        })
      }

      // 轉蛋商品不需賞率警示（品項無賞等意義），只看庫存
      if (product.type !== 'gacha') {
        // 檢查高配率警示（實際配率超過設定值）
        product.prizes.forEach(prize => {
          const soldCount = prize.total - prize.remaining
          if (product.sales > 0 && soldCount > 0) {
            const actualRate = (soldCount / product.sales) * 100
            const threshold = prize.probability * 1.3
            if (actualRate > threshold && prize.probability > 0) {
              alertList.push({
                type: 'high-rate',
                product: product.name,
                productId: product.id,
                level: prize.level,
                rate: Number(actualRate.toFixed(2)),
                threshold: Number(threshold.toFixed(2)),
                severity: actualRate > prize.probability * 1.8 ? 'high' : 'medium'
              })
            }
          }
        })
      }
    })

    // 按嚴重程度排序（高優先級在前）
    return alertList.sort((a, b) => {
      if (a.severity === 'high' && b.severity !== 'high') return -1
      if (a.severity !== 'high' && b.severity === 'high') return 1
      return 0
    })
  }, [products])

  // 從實際訂單數據獲取待配送訂單（與配送管理頁面一致：只包括 submitted 狀態）
  const pendingShipments = useMemo(() => {
    // 計算天數的輔助函數
    const calculateDays = (submittedAt: string): number => {
      try {
        const [datePart] = (submittedAt).split(' ')
        const [year, month, day] = datePart.split('-').map(Number)
        const submittedDate = new Date(year, month - 1, day)
        const today = new Date()
        const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        const submittedDateOnly = new Date(year, month - 1, day)
        const diffTime = todayOnly.getTime() - submittedDateOnly.getTime()
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
        // 未滿一天都顯示1天，不會有0天
        return Math.max(1, diffDays)
      } catch (error) {
        return 1
      }
    }
    
    // 與配送管理頁面保持一致：待配送 = 已提交的訂單（status === 'submitted'）
    return pendingOrders
      .map((order: any) => ({
        id: order.id,
        orderId: order.order_number,
        userId: order.user_id || '',
        user: order.user?.email || '',
        userName: order.user?.name || '',
        recipientName: order.recipient_name || '',
        recipientPhone: order.recipient_phone || '',
        address: order.address || '',
        submittedAt: order.submitted_at,
        date: order.created_at,
        days: order.submitted_at ? calculateDays(order.submitted_at) : 0,
        items: order.items || [],
        quantity: order.items?.length || 0
      }))
      .sort((a: any, b: any) => {
        // 按未處理天數降序排列（天數多的在前，5天的在最上面）
        return b.days - a.days
      })
  }, [pendingOrders])
  
  // 計算待配送總數（與配送管理頁面一致）
  const totalPendingCount = pendingShipments.length

  const alertCount = alerts.length
  const shipmentCount = pendingShipments.length

  // 處理點擊待配送項目
  const handleShipmentClick = (orderId: string) => {
    setHighlightedOrderId(orderId)
    router.push('/orders')
    setIsShipmentOpen(false)
    
    // 3秒後清除高亮
    setTimeout(() => {
      setHighlightedOrderId(null)
    }, 3000)
  }

  // 權限身份映射
  const getRoleName = (role: string | undefined): string => {
    const roleMap: { [key: string]: string } = {
      'super_admin': '超級管理員',
      'warehouse_staff': '貨物專員',
      'operation_staff': '營運專員',
      'marketing_staff': '行銷專員',
      'admin': '管理員',
    }
    return roleMap[role || ''] || '管理員'
  }

  useEffect(() => {
    setIsMounted(true)
  }, [])

  useEffect(() => {
    // 只在非登入頁面且未登入時才重定向
    if (pathname !== '/login' && !isAuthenticated) {
      const token = localStorage.getItem('adminToken')
      const loginDate = localStorage.getItem('adminLoginDate')
      
      // 檢查 token 和登入日期是否有效
      if (!token || !loginDate) {
        router.push('/login')
        return
      }

      // 檢查登入是否在當天有效（00:00 前有效）
      const today = new Date()
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      
      if (loginDate !== todayStr) {
        // 登入已過期，清除並重定向到登入頁
        localStorage.removeItem('adminToken')
        localStorage.removeItem('adminLoginDate')
        router.push('/login')
      }
    }
  }, [isAuthenticated, router, pathname])

  const handleLogout = () => {
    addLog('登出', '系統', '管理員登出後台系統', 'success')
    logout()
    router.push('/login')
  }

  // 線條圖標組件
  const IconDashboard = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
  const IconProducts = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  )
  const IconCategories = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  )
  const IconOrders = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  )
  const IconUsers = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  )
  const IconDraws = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
  const IconRecharges = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
  const IconSettings = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
  const IconAnalytics = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  )
  const IconLogs = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
  const IconVerify = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  )

  const IconBanners = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
  const IconNews = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
    </svg>
  )
  const IconCoupons = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m-3 10a2 2 0 110-4 2 2 0 010 4z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 7h14a2 2 0 012 2v2.5a1.5 1.5 0 010 3V17a2 2 0 01-2 2H5a2 2 0 01-2-2v-2.5a1.5 1.5 0 010-3V9a2 2 0 012-2z" />
    </svg>
  )
  const IconMarketplace = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9l1-4h16l1 4M5 9h14v11H5z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6" />
    </svg>
  )
  const IconExchange = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h11l-2-2m2 2l-2 2" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17H6l2 2m-2-2l2-2" />
    </svg>
  )
  const IconLedger = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10H9m3-3H9m9-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
  const IconTools = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 2l-2 2m-3.5 3.5L10 13l-1 4 4-1 5.5-5.5M7 7l3 3m-5 7h6m-6 4h14" />
    </svg>
  )
  const IconReports = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
  const IconSuppliers = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  )

  const handleNavScroll = () => {
    if (!navRef.current || !user?.username) return
    const top = navRef.current.scrollTop
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current)
    scrollTimerRef.current = setTimeout(() => {
      localStorage.setItem(`sidebarScroll_${user.username}`, String(top))
    }, 200)
  }

  const menuGroups = useMemo(
    () => [
      {
        id: 'home',
        title: '營運總覽',
        items: [
          { name: '儀表板', path: '/dashboard', icon: IconDashboard },
          { name: '轉換分析', path: '/reports/overview', icon: IconReports },
          { name: '點擊分析', path: '/reports/behavior', icon: IconReports },
        ],
      },
      {
        id: 'reports',
        title: '對帳報表',
        items: [
          { name: '儲值明細', path: '/recharges', icon: IconRecharges },
          { name: '物流明細', path: '/reports/logistics', icon: IconReports },
          { name: '折價券明細', path: '/reports/coupons', icon: IconReports },
          { name: '消費明細', path: '/reports/products', icon: IconReports },
          { name: '分解明細', path: '/reports/dismantled', icon: IconReports },
          { name: '廠商結算', path: '/reports/settlement', icon: IconReports },
          { name: '月結管理', path: '/settlement-snapshots', icon: IconLedger },
        ],
      },
      {
        id: 'lottery',
        title: '抽獎管理',
        items: [
          { name: '商品管理', path: '/products', icon: IconProducts },
          { name: '消費紀錄', path: '/draws', icon: IconDraws },
          { name: '配送管理', path: '/orders', icon: IconOrders },
          { name: '折價券管理', path: '/coupons', icon: IconCoupons },
          { name: '運費設定', path: '/settings/shipping', icon: IconSettings },
        ],
      },
      {
        id: 'system',
        title: '系統設定',
        items: [
          { name: '會員管理', path: '/users', icon: IconUsers },
          { name: '廠商管理', path: '/suppliers', icon: IconSuppliers },
          { name: '輪播圖管理', path: '/banners', icon: IconBanners },
          { name: '文章管理', path: '/news', icon: IconNews },
          { name: '分類清單', path: '/categories', icon: IconCategories },
          { name: '抽獎模組設定', path: '/settings/modules', icon: IconSettings },
          { name: '功能開關', path: '/settings/features', icon: IconSettings },
          { name: '管理員清單', path: '/analytics', icon: IconAnalytics },
          { name: '管理員權限', path: '/permissions', icon: IconSettings },
          { name: '操作記錄', path: '/logs', icon: IconLogs },
          { name: '開發紀錄', path: '/dev-logs', icon: IconLogs },
        ],
      },
      {
        id: 'marketplace',
        title: '交易所',
        items: [
          { name: '交易所商品管理', path: '/marketplace', icon: IconMarketplace },
        ],
      },
      {
        id: 'sell',
        title: '商品買賣',
        items: [
          { name: '販售商品管理', path: '/sell', icon: IconMarketplace },
          { name: '販售訂單', path: '/sell-orders', icon: IconOrders },
        ],
      },
      {
        id: 'exchange',
        title: '卡牌交換',
        items: [
          { name: '交換商品管理', path: '/exchange', icon: IconExchange },
          { name: '交換紀錄', path: '/exchange-orders', icon: IconExchange },
        ],
      },
      {
        id: 'marketing',
        title: '行銷工具',
        items: [
          { name: 'AI 文案草稿', path: '/content-drafts', icon: IconNews },
        ],
      },
      {
        id: 'blacktech',
        title: '其他黑科技',
        items: [
          { name: '工具', path: '/tools', icon: IconTools },
          { name: '殺率調整', path: '/settings/rates', icon: IconSettings },
        ],
      },
    ],
    []
  )

  const flatMenuItems = useMemo(() => menuGroups.flatMap((g) => g.items), [menuGroups])

  // 讀取群組展開狀態（依帳號）
  useEffect(() => {
    if (!user?.username) return
    const next: Record<string, boolean> = {}
    try {
      const raw = localStorage.getItem(`sidebarGroupOpen_${user.username}`)
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>
        for (const g of menuGroups) {
          next[g.id] = g.id in parsed ? Boolean((parsed as any)[g.id]) : true
        }
        setGroupOpenMap(next)
        setIsGroupInitialized(true)
        return
      }
    } catch {
      void 0
    }
    for (const g of menuGroups) next[g.id] = true
    setGroupOpenMap(next)
    setIsGroupInitialized(true)
  }, [menuGroups, user?.username])

  // 保存群組展開狀態（依帳號）
  useEffect(() => {
    if (!isGroupInitialized || !user?.username) return
    try {
      localStorage.setItem(`sidebarGroupOpen_${user.username}`, JSON.stringify(groupOpenMap))
    } catch {
      void 0
    }
  }, [groupOpenMap, isGroupInitialized, user?.username])

  // 恢復捲動位置（等群組狀態初始化完後）
  useEffect(() => {
    if (!isGroupInitialized || !user?.username || !navRef.current) return
    const saved = localStorage.getItem(`sidebarScroll_${user.username}`)
    if (saved) navRef.current.scrollTop = parseInt(saved) || 0
  }, [isGroupInitialized, user?.username])

  if (pathname === '/login') {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* 側邊欄 */}
      <aside
        className={`fixed left-0 top-0 h-full bg-white border-r border-neutral-200 z-40 flex flex-col ${
          sidebarTransitionReady ? 'transition-all duration-300 ease-in-out' : ''
        } ${isSidebarOpen ? 'w-52' : 'w-16'}`}
      >
        {/* 展開/收起按鈕 - 固定在側邊欄右邊線上 */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute -right-3 top-6 w-6 h-6 bg-white border border-neutral-200 rounded-full shadow-md hover:shadow-lg hover:border-primary transition-all duration-200 flex items-center justify-center z-50 group"
        >
          <svg 
            className={`w-3.5 h-3.5 text-neutral-400 group-hover:text-primary transition-all duration-300 ${isSidebarOpen ? '' : 'rotate-180'}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* LOGO 區域 */}
        <div className={`h-[72px] px-3 border-b border-neutral-200 transition-all duration-300 flex items-center ${isSidebarOpen ? '' : 'justify-center'}`}>
          <div className={`flex items-center ${isSidebarOpen ? 'gap-2' : 'justify-center'}`}>
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <h1 className={`text-lg font-bold text-primary whitespace-nowrap overflow-hidden transition-all duration-300 ${isSidebarOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0'}`}>
              管理後台
            </h1>
          </div>
        </div>

        <nav ref={navRef} onScroll={handleNavScroll} className={`px-2 py-2 space-y-1 transition-all duration-300 flex-1 overflow-y-auto overflow-x-hidden`}>
          {!isSidebarOpen
            ? flatMenuItems.map((item) => {
                const IconComponent = item.icon
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    title={item.name}
                    className={`flex items-center rounded-lg transition-all duration-200 ${
                      pathname === item.path
                        ? 'bg-primary text-white font-semibold shadow-sm'
                        : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                    } justify-center p-2.5`}
                  >
                    <span className="flex-shrink-0 flex items-center justify-center w-5 h-5">
                      <IconComponent />
                    </span>
                  </Link>
                )
              })
            : menuGroups.map((group) => {
                const isOpen = groupOpenMap[group.id] !== false
                return (
                  <div key={group.id} className="pt-1">
                    <button
                      type="button"
                      onClick={() => setGroupOpenMap((prev) => ({ ...prev, [group.id]: !isOpen }))}
                      className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-bold text-neutral-400 hover:text-neutral-600 transition-colors"
                    >
                      <span className="truncate">{group.title}</span>
                      <svg
                        className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {isOpen && (
                      <div className="space-y-1">
                        {group.items.map((item) => {
                          const IconComponent = item.icon
                          return (
                            <Link
                              key={item.path}
                              href={item.path}
                              className={`flex items-center rounded-lg transition-all duration-200 ${
                                pathname === item.path
                                  ? 'bg-primary text-white font-semibold shadow-sm'
                                  : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                              } gap-3 px-3 py-2.5`}
                            >
                              <span className="flex-shrink-0 flex items-center justify-center w-5 h-5">
                                <IconComponent />
                              </span>
                              <span className="whitespace-nowrap text-sm">{item.name}</span>
                            </Link>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
        </nav>

        <div className={`p-2 border-t border-neutral-200 bg-neutral-50 transition-all duration-300 flex-shrink-0`}>
          <div className="flex flex-col items-center justify-center">
            <p className="text-xs text-neutral-400 whitespace-nowrap">{latestVersion}</p>
          </div>
        </div>
      </aside>

      {/* 主內容區 */}
      <div className={`${sidebarTransitionReady ? 'transition-all duration-300 ease-in-out' : ''} ${isSidebarOpen ? 'ml-52' : 'ml-16'}`}>
        <header className="bg-white border-b border-neutral-200 sticky top-0 z-30 h-[72px]">
          <div className="px-6 h-full flex items-center w-full">
            <div className="flex items-center justify-between w-full">
              <div>
                {/* 優先使用側邊欄菜單中的名稱，確保與側邊欄同步 */}
                <h1 className="text-xl font-bold text-neutral-900">
                  {flatMenuItems.find((item) => {
                    // 精確匹配路徑
                    if (item.path === pathname) return true
                    // 處理動態路由，例如 /users/[id] 應該匹配 /users
                    if (pathname.startsWith(item.path + '/')) return true
                    return false
                  })?.name || pageTitle || '後台管理'}
                </h1>
                {pageSubtitle && (
                  <p className="text-xs text-neutral-600 mt-0.5">{pageSubtitle}</p>
                )}
                {/* 麵包屑導航 */}
                {breadcrumbs && breadcrumbs.length > 0 && (
                  <nav className="flex items-center gap-2 text-xs text-neutral-600 mt-1">
                    {breadcrumbs.map((crumb, index) => (
                      <div key={index} className="flex items-center gap-2">
                        {index > 0 && (
                          <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                        {crumb.href ? (
                          <Link href={crumb.href} className="hover:text-primary transition-colors">
                            {crumb.label}
                          </Link>
                        ) : (
                          <span className="text-neutral-900 font-medium">{crumb.label}</span>
                        )}
                      </div>
                    ))}
                  </nav>
                )}
              </div>
              <div className="flex items-center gap-4">
                {/* 警示圖標 */}
                <div className="relative">
                  <button
                    onClick={() => setIsAlertOpen(!isAlertOpen)}
                    className="relative p-2 hover:bg-neutral-100 rounded-lg transition-colors"
                  >
                    <svg className="w-6 h-6 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    {alertCount > 0 && (
                      <span className="absolute top-0 right-0 flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-red-500 rounded-full">
                        {alertCount > 9 ? '9+' : alertCount}
                      </span>
                    )}
                  </button>

                  {/* 警示下拉面板 */}
                  {isAlertOpen && (
                    <>
                      {/* 背景遮罩，點擊關閉 */}
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsAlertOpen(false)}
                      ></div>
                      <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-lg border border-neutral-200 z-50 max-h-[600px] overflow-hidden flex flex-col">
                        {/* 標題 */}
                        <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
                          <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                            <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            系統警示
                            {alertCount > 0 && (
                              <span className="px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-700 rounded-full">
                                {alertCount}
                              </span>
                            )}
                          </h3>
                          <button
                            onClick={() => setIsAlertOpen(false)}
                            className="p-1 hover:bg-neutral-200 rounded transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>

                        {/* 警示列表 */}
                        <div className="overflow-y-auto flex-1">
                          {alerts.length > 0 ? (
                            <div className="p-4 space-y-3">
                              {alerts.map((alert, index) => (
                                <button
                                  key={index}
                                  onClick={() => {
                                    setHighlightedProductId(alert.productId)
                                    router.push('/products')
                                    setIsAlertOpen(false)
                                  }}
                                  className={`w-full text-left p-3 rounded-lg border-l-4 transition-all hover:shadow-md ${
                                    alert.severity === 'high'
                                      ? 'bg-red-50 border-red-500 hover:bg-red-100'
                                      : 'bg-yellow-50 border-yellow-500 hover:bg-yellow-100'
                                  }`}
                                >
                                  {alert.type === 'high-rate' ? (
                                    <div>
                                      <div className="flex items-start justify-between mb-1">
                                        <span className="font-semibold text-neutral-900 text-sm">{alert.product}</span>
                                        <span className={`px-2 py-0.5 text-xs rounded-full flex-shrink-0 ml-2 ${
                                          alert.severity === 'high' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                        }`}>
                                          {alert.severity === 'high' ? '高' : '中'}
                                        </span>
                                      </div>
                                      <p className="text-xs text-neutral-600">
                                        {alert.level}賞率 <span className="font-semibold text-red-600">{alert.rate}%</span> 超過設定值 <span className="font-semibold">{alert.threshold}%</span>
                                      </p>
                                    </div>
                                  ) : (
                                    <div>
                                      <div className="flex items-start justify-between mb-1">
                                        <span className="font-semibold text-neutral-900 text-sm">{alert.product}</span>
                                        <span className={`px-2 py-0.5 text-xs rounded-full flex-shrink-0 ml-2 ${
                                          alert.severity === 'high' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                        }`}>
                                          {alert.severity === 'high' ? '高' : '中'}
                                        </span>
                                      </div>
                                      <p className="text-xs text-neutral-600">
                                        剩餘數量 <span className="font-semibold text-red-600">{alert.remaining}</span> 件，低於警示值 <span className="font-semibold">{alert.threshold}</span> 件
                                      </p>
                                    </div>
                                  )}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="p-8 text-center text-neutral-500">
                              <svg className="w-12 h-12 mx-auto mb-3 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <p className="text-sm">目前沒有警示</p>
                            </div>
                          )}
                        </div>

                        {/* 底部操作 */}
                        {alerts.length > 0 && (
                          <div className="px-4 py-3 border-t border-neutral-200 bg-neutral-50">
                            <button
                              onClick={() => {
                                // 處理全部已讀或跳轉到相關頁面
                                setIsAlertOpen(false)
                              }}
                              className="w-full px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors"
                            >
                              查看全部
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* 配送圖標 */}
                <div className="relative">
                  <button
                    onClick={() => setIsShipmentOpen(!isShipmentOpen)}
                    className="relative p-2 hover:bg-neutral-100 rounded-lg transition-colors"
                  >
                    <svg className="w-6 h-6 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    {totalPendingCount > 0 && (
                      <span className="absolute top-0 right-0 flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-blue-500 rounded-full">
                        {totalPendingCount > 9 ? '9+' : totalPendingCount}
                      </span>
                    )}
                  </button>

                  {/* 配送下拉面板 */}
                  {isShipmentOpen && (
                    <>
                      {/* 背景遮罩，點擊關閉 */}
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsShipmentOpen(false)}
                      ></div>
                      <div className="absolute right-0 mt-2 w-[500px] bg-white rounded-lg shadow-lg border border-neutral-200 z-50 max-h-[700px] overflow-hidden flex flex-col">
                        {/* 標題 */}
                        <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
                          <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                            <svg className="w-5 h-5 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                            待配送訂單
                            {totalPendingCount > 0 && (
                              <span className="px-2 py-0.5 text-xs font-semibold bg-blue-100 text-blue-700 rounded-full">
                                {totalPendingCount}
                              </span>
                            )}
                          </h3>
                          <button
                            onClick={() => setIsShipmentOpen(false)}
                            className="p-1 hover:bg-neutral-200 rounded transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>

                        {/* 訂單列表 */}
                        <div className="overflow-y-auto flex-1">
                          {pendingShipments.length > 0 ? (
                            <div className="p-4 space-y-3">
                              {pendingShipments.map((order, index) => (
                                <button
                                  key={order.id || index}
                                  onClick={() => handleShipmentClick(order.orderId)}
                                  className="w-full text-left p-3 bg-neutral-50 rounded-lg hover:bg-neutral-100 hover:shadow-md transition-all duration-200 border border-neutral-200 hover:border-primary/50 active:scale-[0.98]"
                                >
                                  {/* 訂單編號和天數 */}
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-semibold text-neutral-900 font-mono">{order.orderId}</span>
                                    <span className={`px-2 py-1 text-xs rounded-full flex-shrink-0 ml-2 ${
                                      order.days > 3 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                                    }`}>
                                      {order.days} 天
                                    </span>
                                  </div>
                                  
                                  {/* 商品列表 */}
                                  <div className="mb-2">
                                    <p className="text-xs text-neutral-600 mb-1">商品 ({order.quantity} 件)：</p>
                                    <div className="space-y-0.5">
                                      {order.items.slice(0, 2).map((item: any, idx: number) => (
                                        <p key={idx} className="text-xs text-neutral-700">
                                          • {item.product} - {item.prize}
                                        </p>
                                      ))}
                                      {order.items.length > 2 && (
                                        <p className="text-xs text-neutral-500">... 還有 {order.items.length - 2} 件商品</p>
                                      )}
                                    </div>
                                  </div>
                                  
                                  {/* 提交時間 */}
                                  <div className="flex items-center justify-between text-xs text-neutral-500 mt-2 pt-2 border-t border-neutral-200">
                                    <span>提交時間：{order.submittedAt?.split(' ')[0] || order.date}</span>
                                    {order.submittedAt?.includes(' ') && (
                                      <span>{order.submittedAt.split(' ')[1]?.substring(0, 5)}</span>
                                    )}
                                  </div>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="p-8 text-center text-neutral-500">
                              <svg className="w-12 h-12 mx-auto mb-3 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                              </svg>
                              <p className="text-sm">目前沒有待配送訂單</p>
                            </div>
                          )}
                        </div>

                        {/* 底部操作 */}
                        {pendingShipments.length > 0 && (
                          <div className="px-4 py-3 border-t border-neutral-200 bg-neutral-50">
                            <button
                              onClick={() => {
                                // 跳轉到訂單管理頁面
                                router.push('/orders')
                                setIsShipmentOpen(false)
                              }}
                              className="w-full px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors"
                            >
                              查看全部訂單
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* 用戶帳戶資訊 */}
                <div className="relative">
                  <button
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    className="flex items-center space-x-3 bg-white border-2 border-neutral-200 rounded-full pl-1 pr-4 py-1 hover:border-primary transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white font-bold text-sm shadow-md">
                      {(user?.nickname || user?.username || 'A').charAt(0).toUpperCase()}
                    </div>
                    <span className="text-neutral-700 font-medium hidden lg:block" suppressHydrationWarning>{user?.nickname || user?.username || '管理員'}</span>
                    <svg className={`w-4 h-4 text-neutral-400 transition-transform duration-200 ${isUserMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* 用戶下拉菜單 */}
                  {isUserMenuOpen && (
                    <>
                      {/* 背景遮罩，點擊關閉 */}
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsUserMenuOpen(false)}
                      ></div>
                      <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-neutral-200 py-2 z-50">
                        {/* 用戶資訊 */}
                        <div className="px-4 py-3 border-b border-neutral-200">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white font-bold text-lg shadow-md" suppressHydrationWarning>
                              {(user?.nickname || user?.username || 'A').charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-neutral-900 truncate" suppressHydrationWarning>{user?.nickname || user?.username || '管理員'}</p>
                              <p className="text-xs text-neutral-500 truncate" suppressHydrationWarning>{getRoleName(user?.role)}</p>
                            </div>
                          </div>
                        </div>

                        {/* 登出按鈕 */}
                        <button
                          onClick={() => {
                            handleLogout()
                            setIsUserMenuOpen(false)
                          }}
                          className="w-full text-left px-4 py-2 text-neutral-700 hover:bg-neutral-100 transition-colors flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                          登出
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}
