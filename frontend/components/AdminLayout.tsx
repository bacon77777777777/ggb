'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAdmin } from '@/contexts/AdminContext'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui'
import { Database } from '@/types/database.types'

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
  const [isMounted, setIsMounted] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebarOpen')
      return saved === 'true'
    }
    return false
  })
  const [isAlertOpen, setIsAlertOpen] = useState(false)
  
  // Supabase for data fetching
  const [supabase] = useState(() => createClient())
  const [products, setProducts] = useState<(Database['public']['Tables']['products']['Row'] & { prizes: Database['public']['Tables']['prizes']['Row'][] })[]>([])

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Check authentication
  useEffect(() => {
    if (isMounted && !isAuthenticated && pathname !== '/login') {
      // router.push('/login') // Let the page handle redirect or AuthGuard
    }
  }, [isMounted, isAuthenticated, pathname, router])

  // Save sidebar state
  useEffect(() => {
    localStorage.setItem('sidebarOpen', String(isSidebarOpen))
  }, [isSidebarOpen])

  // Fetch products for alerts
  useEffect(() => {
    if (!isAuthenticated) return

    const fetchProducts = async () => {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          prizes (*)
        `)
      
      if (!error && data) {
        setProducts(data as unknown as (Database['public']['Tables']['products']['Row'] & { prizes: Database['public']['Tables']['prizes']['Row'][] })[])
      }
    }

    fetchProducts()
  }, [isAuthenticated, supabase])

  // Calculate alerts
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

    products.forEach(product => {
      // Low stock alert (remaining < 5)
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

      // High rate alert logic (simplified as we don't have sales history easily available in one go without complex query)
      // For now, we skip high rate alert or implement it if we fetch draw history.
      // Keeping it simple to avoid performance issues.
    })

    return alertList.sort((a, b) => {
      if (a.severity === 'high' && b.severity !== 'high') return -1
      if (a.severity !== 'high' && b.severity === 'high') return 1
      return 0
    })
  }, [products])

  const alertCount = alerts.length

  const getRoleName = (role: string | undefined): string => {
    const roleMap: { [key: string]: string } = {
      'super_admin': '超級管理員',
      'warehouse_staff': '貨物專員',
      'operation_staff': '營運專員',
      'marketing_staff': '行銷專員',
      'admin': '管理員',
      'user': '會員'
    }
    return roleMap[role || ''] || '管理員'
  }

  if (!isMounted) return null

  // Navigation Items
  const navItems = [
    { label: '儀表板', href: '/dashboard', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    )},
    { label: '商品管理', href: '/products', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    )},
    { label: '訂單管理', href: '/orders', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    )},
    { label: '配送管理', href: '/shipments', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
      </svg>
    )},
    { label: '會員管理', href: '/users', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    )},
    { label: '系統日誌', href: '/logs', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )},
  ]

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex transition-colors">
      {/* Sidebar */}
      <aside 
        className={`fixed inset-y-0 left-0 z-50 bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 transition-all duration-300 flex flex-col
          ${isSidebarOpen ? 'w-64' : 'w-20'}
        `}
      >
        {/* Logo Area */}
        <div className="h-16 flex items-center justify-center border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-neutral-900 dark:bg-white rounded-lg flex items-center justify-center text-white dark:text-neutral-900 font-bold text-xl">
              1
            </div>
            {isSidebarOpen && (
              <span className="text-xl font-bold text-neutral-900 dark:text-white">一番賞後台</span>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg transition-colors group relative
                  ${isActive 
                    ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900' 
                    : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white'
                  }
                `}
                title={!isSidebarOpen ? item.label : undefined}
              >
                <div className={`${isActive ? 'text-white dark:text-neutral-900' : 'text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-900 dark:group-hover:text-white'}`}>
                  {item.icon}
                </div>
                {isSidebarOpen && (
                  <span className="font-medium whitespace-nowrap">{item.label}</span>
                )}
                {!isSidebarOpen && isActive && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-neutral-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                    {item.label}
                  </div>
                )}
              </Link>
            )
          })}
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t border-neutral-200 dark:border-neutral-800">
          <div className={`flex items-center gap-3 ${!isSidebarOpen && 'justify-center'}`}>
            <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-500 dark:text-neutral-400 font-medium overflow-hidden">
              {user?.username?.charAt(0).toUpperCase() || 'A'}
            </div>
            {isSidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-900 dark:text-white truncate">{user?.username || 'Admin'}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{getRoleName(user?.role)}</p>
              </div>
            )}
          </div>
        </div>

        {/* Collapse Toggle */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute -right-3 top-20 w-6 h-6 bg-white border border-neutral-200 rounded-full flex items-center justify-center text-neutral-500 hover:text-neutral-900 shadow-sm"
        >
          <svg 
            className={`w-3 h-3 transition-transform ${isSidebarOpen ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </aside>

      {/* Main Content */}
      <div className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-20'}`}>
        {/* Header */}
        <header className="h-16 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between px-8 sticky top-0 z-40">
          <div className="flex items-center gap-4">
            {/* Breadcrumbs */}
            {breadcrumbs && breadcrumbs.length > 0 && (
              <nav className="flex items-center text-sm text-neutral-500 dark:text-neutral-400">
                {breadcrumbs.map((crumb, index) => (
                  <div key={index} className="flex items-center">
                    {index > 0 && (
                      <svg className="w-4 h-4 mx-2 text-neutral-400 dark:text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                    {crumb.href ? (
                      <Link href={crumb.href} className="hover:text-neutral-900 dark:hover:text-white transition-colors">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="font-medium text-neutral-900 dark:text-white">{crumb.label}</span>
                    )}
                  </div>
                ))}
              </nav>
            )}
          </div>

          <div className="flex items-center gap-4">
            {/* Notifications */}
            <div className="relative">
              <button 
                className="p-2 text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors relative"
                onClick={() => {
                  setIsAlertOpen(!isAlertOpen)
                }}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {alertCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white dark:border-neutral-900"></span>
                )}
              </button>

              {/* Alert Dropdown */}
              {isAlertOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-neutral-900 rounded-lg shadow-lg border border-neutral-200 dark:border-neutral-800 py-2 z-50">
                  <div className="px-4 py-2 border-b border-neutral-100 dark:border-neutral-800 flex justify-between items-center">
                    <h3 className="font-medium text-neutral-900 dark:text-white">系統通知</h3>
                    <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">{alertCount}</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {alerts.length > 0 ? (
                      alerts.map((alert, index) => (
                        <div key={index} className="px-4 py-3 hover:bg-neutral-50 dark:hover:bg-neutral-800 border-b border-neutral-100 dark:border-neutral-800 last:border-0 cursor-pointer">
                          <div className="flex items-start gap-3">
                            <div className={`mt-1 w-2 h-2 rounded-full ${alert.severity === 'high' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                            <div>
                              <p className="text-sm font-medium text-neutral-900 dark:text-white">{alert.product}</p>
                              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                                {alert.type === 'low-stock' 
                                  ? <span>庫存量低於警示值 (<span className="font-amount">{alert.remaining?.toLocaleString()}</span>/<span className="font-amount">{alert.threshold?.toLocaleString()}</span>)</span>
                                  : <span>{alert.level}賞 配率異常 (<span className="font-amount">{alert.rate?.toLocaleString()}</span>% &gt; <span className="font-amount">{alert.threshold?.toLocaleString()}</span>%)</span>
                                }
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-8 text-center text-neutral-500 dark:text-neutral-400 text-sm">
                        暫無通知
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Logout */}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => logout()}
            >
              登出
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Page Header */}
            {(pageTitle || pageSubtitle) && (
              <div>
                {pageTitle && <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">{pageTitle}</h1>}
                {pageSubtitle && <p className="mt-1 text-neutral-500 dark:text-neutral-400">{pageSubtitle}</p>}
              </div>
            )}

            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
