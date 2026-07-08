'use client'

import { AdminLayout, StatsCard, PageCard, SearchToolbar, FilterTags, SortableTableHeader, Modal, FileInput } from '@/components'
import { useLog } from '@/contexts/LogContext'
import { useProduct } from '@/contexts/ProductContext'
import { type Product } from '@/types/product'
import { formatDateTime } from '@/utils/dateFormat'
import { normalizePrizeLevels } from '@/utils/normalizePrizes'
import CsvImportWizard from '@/components/CsvImportWizard'
import XlsxImportWizard from '@/components/XlsxImportWizard'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect, useRef, Fragment } from 'react'
import { useTablePrefs } from '@/hooks/useTablePrefs'
import { supabase } from '@/lib/supabaseClient'

export default function ProductsPage() {
  const router = useRouter()
  const { addLog } = useLog()
  const { highlightedProductId, setHighlightedProductId } = useProduct()
  const highlightedRowRef = useRef<HTMLTableRowElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  
  const [products, setProducts] = useState<Product[]>([])
  const [isBulkOpen, setIsBulkOpen] = useState(false)
  const [isXlsxOpen, setIsXlsxOpen] = useState(false)
  const [zipUploading, setZipUploading] = useState(false)
  const [zipResult, setZipResult] = useState<{ uploaded: number; failed: number } | null>(null)
  const zipRef = useRef<HTMLInputElement>(null)

  const getDisplayCode = (product: Product): string => {
    return product.productCode || ''
  }

  const fetchProducts = async () => {
    try {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('products')
        .select('*, prizes:product_prizes(*)')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching products:', error)
        return
      }

      if (data) {
        const mappedProducts: Product[] = data.map((p: any) => ({
          id: p.id,
          productCode: p.product_code,
          name: p.name,
          category: p.category,
          type: p.type,
          price: p.price,
          cost: p.cost ?? undefined,
          remaining: p.remaining,
          status: p.status,
          sales: p.sales,
          isHot: p.is_hot,
          createdAt: p.created_at,
          startedAt: p.started_at,
          endedAt: p.ended_at,
          txidHash: p.txid_hash,
          seed: p.seed,
          imageUrl: p.image_url,
          totalCount: p.total_count,
          releaseYear: p.release_year,
          releaseMonth: p.release_month,
          distributor: p.distributor,
          rarity: p.rarity,
          majorPrizes: p.major_prizes,
          prizes: p.prizes ? p.prizes.map((prize: any) => ({
            id: prize.id,
            name: prize.name,
            level: prize.level,
            imageUrl: prize.image_url,
            total: prize.total,
            remaining: prize.remaining,
            probability: prize.probability
          })) : []
        }))
        setProducts(mappedProducts)
        
        // Update visibility map based on status
        const visibilityMap: { [key: number]: boolean } = {}
        mappedProducts.forEach(p => {
          visibilityMap[p.id] = p.status !== 'pending'
        })
        setProductVisibility(visibilityMap)
      }
    } catch (error) {
      console.error('Error in fetchProducts:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    // 還原排序狀態
    try {
      const raw = localStorage.getItem('products_sort')
      if (raw) {
        const obj = JSON.parse(raw)
        if (obj.field) setSortField(obj.field)
        if (obj.dir) setSortDirection(obj.dir)
      }
    } catch (err) {
      console.error('Failed to restore products sort state', err)
    }
    fetchProducts()
    
    // Fetch small items count
    const fetchSmallItemsCount = async () => {
      const { count, error } = await supabase
        .from('small_items')
        .select('*', { count: 'exact', head: true })
      
      if (!error && count !== null) {
        setSmallItemsCount(count)
      }
    }
    fetchSmallItemsCount()

    // Fetch dismantled items count
    const fetchDismantledCount = async () => {
      const { count, error } = await supabase
        .from('draw_records')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'dismantled')
      
      if (!error && count !== null) {
        setDismantledCount(count)
      }
    }
    fetchDismantledCount()
  }, [])

  const [expandedProducts, setExpandedProducts] = useState<Set<number>>(new Set())
  const [expandedPrizes, setExpandedPrizes] = useState<Set<number>>(new Set())
  const [prizeDraws, setPrizeDraws] = useState<Map<number, { rows: any[]; total: number; hasMore: boolean }>>(new Map())
  const [loadingPrizes, setLoadingPrizes] = useState<Set<number>>(new Set())
  const [loadingMorePrizes, setLoadingMorePrizes] = useState<Set<number>>(new Set())

  const prizeStatusLabel = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      success:          { label: '未申請', cls: 'bg-neutral-100 text-neutral-500' },
      in_warehouse:     { label: '倉庫中', cls: 'bg-blue-100 text-blue-600' },
      pending_delivery: { label: '待出貨', cls: 'bg-yellow-100 text-yellow-700' },
      shipped:          { label: '已出貨', cls: 'bg-green-100 text-green-700' },
      dismantled:       { label: '已拆解', cls: 'bg-red-100 text-red-500' },
      exchanged:        { label: '已兌換', cls: 'bg-purple-100 text-purple-600' },
      listing:          { label: '市場上架', cls: 'bg-orange-100 text-orange-600' },
      cancelled:        { label: '已取消', cls: 'bg-neutral-100 text-neutral-400' },
    }
    return map[status] || { label: status, cls: 'bg-neutral-100 text-neutral-500' }
  }

  const fetchPrizeDraws = async (prizeId: number, offset = 0) => {
    const isFirst = offset === 0
    if (isFirst && loadingPrizes.has(prizeId)) return
    if (!isFirst && loadingMorePrizes.has(prizeId)) return

    if (isFirst) setLoadingPrizes(prev => new Set(prev).add(prizeId))
    else setLoadingMorePrizes(prev => new Set(prev).add(prizeId))

    try {
      const res = await fetch(`/api/prize-draws/${prizeId}?offset=${offset}&limit=10`)
      const data = await res.json()
      const { rows = [], total = 0 } = data
      setPrizeDraws(prev => {
        const existing = isFirst ? [] : (prev.get(prizeId)?.rows || [])
        const allRows = [...existing, ...rows]
        return new Map(prev).set(prizeId, { rows: allRows, total, hasMore: allRows.length < total })
      })
    } catch {
      if (isFirst) setPrizeDraws(prev => new Map(prev).set(prizeId, { rows: [], total: 0, hasMore: false }))
    }

    if (isFirst) setLoadingPrizes(prev => { const s = new Set(prev); s.delete(prizeId); return s })
    else setLoadingMorePrizes(prev => { const s = new Set(prev); s.delete(prizeId); return s })
  }

  const togglePrize = (prizeId: number, drawn: number) => {
    setExpandedPrizes(prev => {
      const next = new Set(prev)
      if (next.has(prizeId)) { next.delete(prizeId) } else {
        next.add(prizeId)
        if (drawn > 0 && !prizeDraws.has(prizeId)) fetchPrizeDraws(prizeId, 0)
      }
      return next
    })
  }
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [categories, setCategories] = useState<string[]>([])

  useEffect(() => {
    const fetchCategories = async () => {
      const { data } = await supabase
        .from('categories')
        .select('name')
        .order('sort_order')
      
      if (data) {
        setCategories(data.map(c => c.name))
      }
    }
    fetchCategories()
  }, [])
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [selectedType, setSelectedType] = useState<'all' | 'ichiban' | 'blindbox' | 'gacha' | 'custom'>('all')
  const [selectedLowStock, setSelectedLowStock] = useState(false)  // 是否只顯示低庫存
  const [selectedHot, setSelectedHot] = useState(false)  // 是否只顯示熱門商品
  const [sortField, setSortField] = useState<string>('productCode')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [displayCount, setDisplayCount] = useState(20)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set())
  const [smallItemsCount, setSmallItemsCount] = useState(0)
  const [dismantledCount, setDismantledCount] = useState(0)
  const observerTarget = useRef<HTMLDivElement>(null)
  
  const { tableDensity, setTableDensity, visibleColumns, setVisibleColumns } = useTablePrefs('products', 'compact', {
    productCode: true, name: true, type: true, price: true, cost: true,
    stockAndSales: true, majorStatus: true, visibility: true, createdAt: true,
    startedAt: true, endedAt: true, operations: true
  })
  
  const [selectedMajorStatus, setSelectedMajorStatus] = useState<'all' | 'normal' | 'depleted'>('all')
  
  const normalizePrizeLevel = (level: string | null | undefined) => {
    if (!level) return ''
    const trimmed = level.trim()
    if (trimmed === 'Last One') return 'Last One'
    if (trimmed.endsWith('賞')) return trimmed.slice(0, -1)
    return trimmed
  }

  const isLastOneLevel = (level: string | null | undefined) => {
    if (!level) return false
    const l = level.toLowerCase()
    return l.includes('last one') || level.includes('最後賞')
  }
  
  const HIGH_TIER_LEVELS = ['SP', 'A', 'B', 'C']
  
  const isMajorDepleted = (product: Product): boolean => {
    const majorRemaining = product.prizes
      .filter(prize => HIGH_TIER_LEVELS.includes(normalizePrizeLevel(prize.level)))
      .reduce((sum, prize) => sum + prize.remaining, 0)
    return majorRemaining === 0
  }
  
  const [productVisibility, setProductVisibility] = useState<{ [key: number]: boolean }>({})

  // 高亮效果處理
  useEffect(() => {
    if (highlightedProductId) {
      // 延遲一下確保 DOM 已更新
      setTimeout(() => {
        if (highlightedRowRef.current) {
          highlightedRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 100)
      
      // 3秒後清除高亮
      const timer = setTimeout(() => {
        setHighlightedProductId(null)
      }, 3000)

      return () => clearTimeout(timer)
    }
  }, [highlightedProductId, setHighlightedProductId])

  // 匯出CSV功能
  const handleExportCSV = () => {
    const headers = ['編號', '商品名稱', '分類', '種類', '價格(G)', '成本', '庫存/銷量', '大獎狀態', '上架', '建立時間', '開賣時間', '完抽時間']
    const csvData = sortedProducts.map(product => {
      const normalPrizes = product.prizes.filter(p => !isLastOneLevel(p.level))
      const totalCount = normalPrizes.reduce((sum, s) => sum + s.total, 0)
      const fallbackRemaining = normalPrizes.reduce((sum, s) => sum + s.remaining, 0)
      const remaining = typeof product.remaining === 'number' ? product.remaining : fallbackRemaining
      const calculatedSales = product.sales
      const stockAndSales = `庫存：${remaining}/${totalCount} 銷量：${calculatedSales}`
      const majorStatus = isMajorDepleted(product) ? '廢套' : '正常'
      
      // 轉換種類名稱
      const typeMap: Record<string, string> = {
        ichiban: '一番賞',
        blindbox: '盲盒',
        gacha: '轉蛋',
        card: '抽卡',
        custom: '自製'
      }
      const typeName = typeMap[product.type || 'ichiban'] || '一番賞'

      return [
        getDisplayCode(product),
        product.name,
        product.category,
        typeName,
        product.price.toString(),
        product.cost != null ? product.cost.toString() : '',
        stockAndSales,
        majorStatus,
        productVisibility[product.id] ? '是' : '否',
        formatDateTime(product.createdAt),
        formatDateTime(product.startedAt),
        formatDateTime(product.endedAt)
      ]
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
    link.setAttribute('download', `商品管理_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // 圖片壓縮檔批量上傳
  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setZipUploading(true)
    setZipResult(null)
    try {
      const fd = new FormData()
      fd.append('zip', file)
      const res = await fetch('/api/admin/products/upload-images', { method: 'POST', body: fd })
      const json = await res.json()
      setZipResult({ uploaded: json.uploaded ?? 0, failed: json.failed ?? 0 })
    } catch {
      setZipResult({ uploaded: 0, failed: 1 })
    } finally {
      setZipUploading(false)
    }
  }

  // 確認 Modal 狀態
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
    variant: 'primary' | 'danger'
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'primary'
  })

  // 成功提示 Modal
  const [successModal, setSuccessModal] = useState<{
    isOpen: boolean
    title: string
    message: string
  }>({
    isOpen: false,
    title: '',
    message: ''
  })

  // 批量上架
  const handleBatchShow = () => {
    if (selectedProducts.size === 0) return
    setConfirmModal({
      isOpen: true,
      title: '批量上架',
      message: `確定要將選中的 ${selectedProducts.size} 個商品上架嗎？`,
      variant: 'primary',
      onConfirm: async () => {
        try {
          const ids = Array.from(selectedProducts)
          const res = await fetch('/api/admin/products/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update_status', ids, status: 'active', autoGenerateTxid: true }),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => null)
            throw new Error(data?.error || '批量上架失敗')
          }
          const data = (await res.json()) as { products?: Array<{ id: number; seed?: string | null; txid_hash?: string | null; started_at?: string | null }> }
          const updatedMap = new Map((data.products || []).map(p => [p.id, p]))

          const newVisibility = { ...productVisibility }
          ids.forEach(id => {
            newVisibility[id] = true
          })
          setProductVisibility(newVisibility)
          setProducts(prev => prev.map(p => {
            if (!ids.includes(p.id)) return p
            const u = updatedMap.get(p.id)
            return {
              ...p,
              status: 'active',
              seed: u?.seed ?? p.seed,
              txidHash: u?.txid_hash ?? p.txidHash,
              startedAt: u?.started_at ?? p.startedAt,
            }
          }))

          addLog('批量上架', '商品管理', `批量上架 ${selectedProducts.size} 個商品`, 'success')
          setConfirmModal(prev => ({ ...prev, isOpen: false }))
          setSuccessModal({
            isOpen: true,
            title: '上架成功',
            message: `已成功上架 ${selectedProducts.size} 個商品`
          })
          setSelectedProducts(new Set())
        } catch (e) {
          console.error('Error batch updating products:', e)
          alert('批量上架失敗')
        }
      }
    })
  }

  // 批量下架
  const handleBatchHide = () => {
    if (selectedProducts.size === 0) return
    setConfirmModal({
      isOpen: true,
      title: '批量下架',
      message: `確定要將選中的 ${selectedProducts.size} 個商品下架嗎？`,
      variant: 'danger',
      onConfirm: async () => {
        try {
          const ids = Array.from(selectedProducts)
          const res = await fetch('/api/admin/products/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'update_status', ids, status: 'pending' }),
          })
          if (!res.ok) {
            const data = await res.json().catch(() => null)
            throw new Error(data?.error || '批量下架失敗')
          }

          const newVisibility = { ...productVisibility }
          ids.forEach(id => {
            newVisibility[id] = false
          })
          setProductVisibility(newVisibility)
          setProducts(prev => prev.map(p => ids.includes(p.id) ? { ...p, status: 'pending' } : p))

          addLog('批量下架', '商品管理', `批量下架 ${selectedProducts.size} 個商品`, 'success')
          setConfirmModal(prev => ({ ...prev, isOpen: false }))
          setSuccessModal({
            isOpen: true,
            title: '下架成功',
            message: `已成功下架 ${selectedProducts.size} 個商品`
          })
          setSelectedProducts(new Set())
        } catch (e) {
          console.error('Error batch updating products:', e)
          alert('批量下架失敗')
        }
      }
    })
  }

  // 刪除商品
  const handleDelete = (product: Product) => {
    setConfirmModal({
      isOpen: true,
      title: '刪除商品',
      message: `確定要刪除商品「${product.name}」嗎？此動作無法復原。`,
      variant: 'danger',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/admin/products/${product.id}`, { method: 'DELETE' })
          if (!res.ok) {
            const data = await res.json().catch(() => null)
            throw new Error(data?.error || '刪除商品失敗')
          }

          setProducts(prev => prev.filter(p => p.id !== product.id))
          // 更新 visibility
          const newVisibility = { ...productVisibility }
          delete newVisibility[product.id]
          setProductVisibility(newVisibility)
          
          addLog('刪除商品', '商品管理', `刪除商品「${product.name}」`, 'success')
          setConfirmModal(prev => ({ ...prev, isOpen: false }))
          setSuccessModal({
            isOpen: true,
            title: '刪除成功',
            message: `商品「${product.name}」已成功刪除`
          })
        } catch (e) {
          console.error('Error deleting product:', e)
          alert('刪除商品失敗')
        }
      }
    })
  }

  const toggleProductExpand = (productId: number) => {
    const newExpanded = new Set(expandedProducts)
    if (newExpanded.has(productId)) {
      newExpanded.delete(productId)
    } else {
      newExpanded.add(productId)
    }
    setExpandedProducts(newExpanded)
  }

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  useEffect(() => {
    try {
      localStorage.setItem('products_sort', JSON.stringify({ field: sortField, dir: sortDirection }))
    } catch (err) {
      console.error('Failed to persist products sort state', err)
    }
  }, [sortField, sortDirection])

  const filteredProducts = products.filter(product => {
    const matchSearch = !searchQuery || 
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      getDisplayCode(product).includes(searchQuery) ||
      product.prizes.some(prize => prize.name.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchCategory = selectedCategory === 'all' || product.category === selectedCategory
    const matchStatus = selectedStatus === 'all' || product.status === selectedStatus
    const matchType = selectedType === 'all' || (product.type || 'ichiban') === selectedType
    const matchMajorStatus = selectedMajorStatus === 'all' || 
      (selectedMajorStatus === 'depleted' && isMajorDepleted(product)) ||
      (selectedMajorStatus === 'normal' && !isMajorDepleted(product))
    // 低庫存篩選
    const matchLowStock = !selectedLowStock || (() => {
      const calculatedRemaining = product.prizes.reduce((sum, prize) => sum + prize.remaining, 0)
      return calculatedRemaining < 10 && product.status === 'active'
    })()
    // 熱門商品篩選
    const matchHot = !selectedHot || product.isHot
    return matchSearch && matchCategory && matchStatus && matchType && matchMajorStatus && matchLowStock && matchHot
  })

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    let aValue: any, bValue: any
    switch (sortField) {
      case 'name': aValue = a.name; bValue = b.name; break
      case 'productCode': 
        // 以顯示編號的數字部分排序
        aValue = parseInt(getDisplayCode(a).replace(/\D/g, '')) || 0
        bValue = parseInt(getDisplayCode(b).replace(/\D/g, '')) || 0
        break
      case 'category': aValue = a.category; bValue = b.category; break
      case 'type': aValue = a.type || 'ichiban'; bValue = b.type || 'ichiban'; break
      case 'price': aValue = a.price; bValue = b.price; break
      case 'cost': aValue = a.cost ?? -1; bValue = b.cost ?? -1; break
      case 'stockAndSales': 
        // 根據庫存排序（庫存 = 所有獎項剩餘數量總和）
        aValue = a.prizes.reduce((sum, prize) => sum + prize.remaining, 0)
        bValue = b.prizes.reduce((sum, prize) => sum + prize.remaining, 0)
        break
      case 'majorStatus':
        // 根據大獎狀態排序（廢套排在後面）
        aValue = isMajorDepleted(a) ? 1 : 0
        bValue = isMajorDepleted(b) ? 1 : 0
        break
      case 'visibility': aValue = productVisibility[a.id] ? 1 : 0; bValue = productVisibility[b.id] ? 1 : 0; break
      case 'createdAt': aValue = a.createdAt; bValue = b.createdAt; break
      case 'startedAt':
        // 開賣時間排序，沒有開賣時間的排在後面
        aValue = a.startedAt || ''
        bValue = b.startedAt || ''
        break
      case 'endedAt': 
        // 完抽時間排序，沒有完抽時間的排在後面
        aValue = a.endedAt || ''
        bValue = b.endedAt || ''
        break
      default: aValue = a.name; bValue = b.name
    }
    if (typeof aValue === 'string') {
      return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
    }
    return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
  })

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && displayCount < sortedProducts.length) {
          setIsLoadingMore(true)
          setTimeout(() => {
            setDisplayCount(prev => Math.min(prev + 10, sortedProducts.length))
            setIsLoadingMore(false)
          }, 300)
        }
      },
      { threshold: 0.1 }
    )
    if (observerTarget.current) observer.observe(observerTarget.current)
    return () => { if (observerTarget.current) observer.unobserve(observerTarget.current) }
  }, [displayCount, sortedProducts.length, isLoadingMore])

  useEffect(() => {
    setDisplayCount(20)
  }, [searchQuery, selectedCategory, selectedStatus, selectedType, selectedMajorStatus, selectedLowStock, selectedHot, sortField, sortDirection])

  // 統計資料
  const totalProducts = products.length
  const activeProducts = products.filter(p => p.status === 'active').length
  // 低庫存商品：根據實際抽獎記錄計算剩餘數量
  const lowStockProducts = products.filter(p => {
    const calculatedRemaining = p.prizes.reduce((sum, s) => sum + s.remaining, 0)
    return calculatedRemaining < 10 && p.status === 'active'
  }).length
  // 廢套商品數量
  const depletedProducts = products.filter(p => isMajorDepleted(p)).length
  const hotProducts = products.filter(p => p.isHot).length
  const totalSmallItems = smallItemsCount

  // 密度樣式
  const getDensityClasses = () => {
    switch (tableDensity) {
      case 'compact': return 'py-2 px-2'
      case 'normal': return 'py-3 px-4'
      case 'comfortable': return 'py-4 px-6'
    }
  }

  // 切換全選
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = sortedProducts.slice(0, displayCount).map(p => p.id)
      setSelectedProducts(new Set(allIds))
    } else {
      setSelectedProducts(new Set())
    }
  }

  // 切換單選
  const handleSelectProduct = (productId: number) => {
    const newSelected = new Set(selectedProducts)
    if (newSelected.has(productId)) {
      newSelected.delete(productId)
    } else {
      newSelected.add(productId)
    }
    setSelectedProducts(newSelected)
  }

  return (
    <AdminLayout pageTitle="商品管理" breadcrumbs={[{ label: '商品管理', href: '/products' }]}>
      <div className="space-y-6">
        {/* 統計卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <StatsCard
            title="進行中 / 總商品數"
            value={`${activeProducts} / ${totalProducts}`}
            onClick={() => { 
              setSelectedStatus('all')
              setSelectedCategory('all')
              setSelectedMajorStatus('all')
              setSelectedLowStock(false)
              setSelectedHot(false)
              setSearchQuery('')
            }}
          />
          <StatsCard
            title="小物數量"
            value={totalSmallItems}
            onClick={() => router.push('/small-items')}
            isActive={false}
          />
          <StatsCard
            title="低庫存（<10）"
            value={lowStockProducts}
            onClick={() => { 
              setSelectedStatus('active')
              setSelectedCategory('all')
              setSelectedMajorStatus('all')
              setSelectedLowStock(true)
              setSelectedHot(false)
              setSearchQuery('')
            }}
            isActive={selectedLowStock}
            activeColor="primary"
          />
          <StatsCard
            title="廢套商品"
            value={depletedProducts}
            onClick={() => { 
              setSelectedStatus('all')
              setSelectedCategory('all')
              setSelectedMajorStatus('depleted')
              setSelectedLowStock(false)
              setSelectedHot(false)
              setSearchQuery('')
            }}
            isActive={selectedMajorStatus === 'depleted'}
            activeColor="primary"
          />
          <StatsCard
            title="熱門商品"
            value={hotProducts}
            onClick={() => { 
              setSelectedStatus('all')
              setSelectedCategory('all')
              setSelectedMajorStatus('all')
              setSelectedLowStock(false)
              setSelectedHot(true)
              setSearchQuery('')
            }}
            isActive={selectedHot}
            activeColor="primary"
          />
          <StatsCard
            title="分解數"
            value={dismantledCount}
            onClick={() => router.push('/dismantled')}
            isActive={false}
          />
        </div>

        <PageCard>
          <SearchToolbar
            searchPlaceholder="搜尋商品名稱、編號..."
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            showExportCSV={true}
            onExportCSV={handleExportCSV}
            showAddButton={true}
            addButtonText="+ 新增商品"
            onAddClick={() => window.location.href = '/products/new'}
            children={
              <>
                <button
                  onClick={() => setIsXlsxOpen(true)}
                  className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors text-sm font-medium shadow-sm whitespace-nowrap"
                >
                  智能批量匯入
                </button>
                <button
                  onClick={() => zipRef.current?.click()}
                  disabled={zipUploading}
                  className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-60 transition-colors text-sm font-medium shadow-sm whitespace-nowrap"
                  title="上傳 .zip 壓縮檔，批量將圖片放入 Storage"
                >
                  {zipUploading ? '上傳中...' : '上傳圖片'}
                </button>
                <input ref={zipRef} type="file" accept=".zip" className="hidden" onChange={handleZipUpload} />
                {zipResult && (
                  <span className={`text-xs font-medium px-2 py-1 rounded ${zipResult.failed > 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                    ✓ 已上傳 {zipResult.uploaded} 張{zipResult.failed > 0 ? `，失敗 ${zipResult.failed}` : ''}
                  </span>
                )}
              </>
            }
            showDensity={true}
            density={tableDensity}
            onDensityChange={setTableDensity}
            showColumnToggle={true}
            columns={[
              { key: 'productCode', label: '編號', visible: visibleColumns.productCode },
              { key: 'name', label: '名稱', visible: visibleColumns.name },
              { key: 'type', label: '種類', visible: visibleColumns.type },
              { key: 'price', label: '價格(G)', visible: visibleColumns.price },
              { key: 'cost', label: '成本', visible: visibleColumns.cost },
              { key: 'stockAndSales', label: '庫存/銷量', visible: visibleColumns.stockAndSales },
              { key: 'majorStatus', label: '大獎狀態', visible: visibleColumns.majorStatus },
              { key: 'visibility', label: '上架', visible: visibleColumns.visibility },
              { key: 'createdAt', label: '建立時間', visible: visibleColumns.createdAt },
              { key: 'operations', label: '操作', visible: visibleColumns.operations }
            ]}
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
                  { value: 'active', label: '進行中' },
                  { value: 'pending', label: '待上架' },
                  { value: 'ended', label: '已完抽' }
                ]
              },
              {
                key: 'type',
                label: '種類',
                type: 'select',
                value: selectedType,
                onChange: (value: string) => setSelectedType(value as any),
                options: [
                  { value: 'all', label: '全部種類' },
                  { value: 'ichiban', label: '一番賞' },
                  { value: 'blindbox', label: '盲盒' },
                  { value: 'gacha', label: '轉蛋' },
                  { value: 'card', label: '抽卡' },
                  { value: 'custom', label: '自製賞' }
                ]
              },
              {
                key: 'category',
                label: '分類',
                type: 'select',
                value: selectedCategory,
                onChange: setSelectedCategory,
                options: [
                  { value: 'all', label: '全部分類' },
                  ...categories.map(c => ({ value: c, label: c }))
                ]
              },
              {
                key: 'majorStatus',
                label: '大獎狀態',
                type: 'select',
                value: selectedMajorStatus,
                onChange: setSelectedMajorStatus,
                options: [
                  { value: 'all', label: '全部' },
                  { value: 'normal', label: '正常' },
                  { value: 'depleted', label: '廢套' }
                ]
              }
            ]}
            onColumnToggle={(key, visible) => setVisibleColumns(prev => ({ ...prev, [key]: visible }))}
            selectedCount={selectedProducts.size}
            batchActions={[
              { label: '批量上架', onClick: handleBatchShow, variant: 'primary' },
              { label: '批量下架', onClick: handleBatchHide, variant: 'secondary' }
            ]}
            onClearSelection={() => setSelectedProducts(new Set())}
          />

          {/* 篩選條件 Tags */}
          <FilterTags
            tags={[
              ...(selectedStatus !== 'all' ? [{
                key: 'status',
                label: '狀態',
                value: selectedStatus === 'active' ? '進行中' : selectedStatus === 'pending' ? '待上架' : '已完抽',
                color: 'primary' as const,
                onRemove: () => setSelectedStatus('all')
              }] : []),
              ...(selectedType !== 'all' ? [{
                key: 'type',
                label: '種類',
                value: ({
                  ichiban: '一番賞',
                  blindbox: '盲盒',
                  gacha: '轉蛋',
                  card: '抽卡',
                  custom: '自製賞'
                } as const)[selectedType] || '一番賞',
                color: 'primary' as const,
                onRemove: () => setSelectedType('all')
              }] : []),
              ...(selectedCategory !== 'all' ? [{
                key: 'category',
                label: '分類',
                value: selectedCategory,
                color: 'primary' as const,
                onRemove: () => setSelectedCategory('all')
              }] : []),
              ...(selectedMajorStatus !== 'all' ? [{
                key: 'majorStatus',
                label: '大獎狀態',
                value: selectedMajorStatus === 'depleted' ? '廢套' : '正常',
                color: selectedMajorStatus === 'depleted' ? 'red' as const : 'green' as const,
                onRemove: () => setSelectedMajorStatus('all')
              }] : []),
              ...(selectedLowStock ? [{
                key: 'lowStock',
                label: '低庫存',
                value: '<10',
                color: 'red' as const,
                onRemove: () => setSelectedLowStock(false)
              }] : []),
              ...(selectedHot ? [{
                key: 'hot',
                label: '熱門商品',
                value: '是',
                color: 'green' as const,
                onRemove: () => setSelectedHot(false)
              }] : [])
            ]}
            onClearAll={() => {
              setSelectedStatus('all')
              setSelectedType('all')
              setSelectedCategory('all')
              setSelectedMajorStatus('all')
              setSelectedLowStock(false)
              setSelectedHot(false)
              setSearchQuery('')
            }}
          />

          {/* 表格 */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className={`${getDensityClasses()} text-left`}>
                    <input
                      type="checkbox"
                      checked={selectedProducts.size === sortedProducts.slice(0, displayCount).length && sortedProducts.length > 0}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="w-4 h-4 text-primary focus:ring-primary rounded"
                    />
                  </th>
                  {visibleColumns.productCode && (
                    <SortableTableHeader sortKey="productCode" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      編號
                    </SortableTableHeader>
                  )}
                  {visibleColumns.name && (
                    <SortableTableHeader sortKey="name" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      商品名稱
                    </SortableTableHeader>
                  )}
                  {visibleColumns.type && (
                    <SortableTableHeader sortKey="type" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      種類
                    </SortableTableHeader>
                  )}
                  {visibleColumns.price && (
                    <SortableTableHeader sortKey="price" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      價格(G)
                    </SortableTableHeader>
                  )}
                  {visibleColumns.cost && (
                    <SortableTableHeader sortKey="cost" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      成本
                    </SortableTableHeader>
                  )}
                  {visibleColumns.stockAndSales && (
                    <SortableTableHeader sortKey="stockAndSales" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      庫存/銷量
                    </SortableTableHeader>
                  )}
                  {visibleColumns.majorStatus && (
                    <SortableTableHeader sortKey="majorStatus" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      大獎狀態
                    </SortableTableHeader>
                  )}
                  {visibleColumns.visibility && (
                    <SortableTableHeader sortKey="visibility" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      上架
                    </SortableTableHeader>
                  )}
                  {visibleColumns.createdAt && (
                    <SortableTableHeader sortKey="createdAt" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      建立時間
                    </SortableTableHeader>
                  )}
                  {visibleColumns.startedAt && (
                    <SortableTableHeader sortKey="startedAt" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      開賣時間
                    </SortableTableHeader>
                  )}
                  {visibleColumns.endedAt && (
                    <SortableTableHeader sortKey="endedAt" currentSortField={sortField} sortDirection={sortDirection} onSort={handleSort}>
                      完抽時間
                    </SortableTableHeader>
                  )}
                  {visibleColumns.operations && (
                    <th className={`${getDensityClasses()} text-left text-sm font-semibold text-neutral-700 sticky right-0 bg-white z-20 border-l border-neutral-200 whitespace-nowrap`}>操作</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {sortedProducts.length === 0 ? (
                  <tr>
                    <td colSpan={20} className="text-center">
                      <div className="flex flex-col items-center justify-center py-24 text-neutral-400 text-sm gap-2">
                        <span>{isLoading ? '載入中...' : '沒有找到符合條件的商品'}</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  sortedProducts.slice(0, displayCount).map((product) => {
                    const isHighlighted = highlightedProductId === product.id
                  return (
                    <Fragment key={product.id}>
                      <tr 
                      ref={isHighlighted ? highlightedRowRef : null}
                      onClick={() => toggleProductExpand(product.id)}
                      className={`group border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer transition-all duration-300 ${
                        isHighlighted 
                          ? 'bg-yellow-200 border-yellow-400 border-2 shadow-lg ring-4 ring-yellow-300 ring-opacity-50 animate-highlight-flash' 
                          : expandedProducts.has(product.id)
                            ? 'bg-neutral-50'
                            : ''
                      }`}
                    >
                      <td className={getDensityClasses()} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedProducts.has(product.id)}
                          onChange={() => handleSelectProduct(product.id)}
                          className="w-4 h-4 text-primary focus:ring-primary rounded"
                        />
                      </td>
                      {visibleColumns.productCode && (
                        <td className={`${getDensityClasses()} text-sm text-neutral-700 font-mono whitespace-nowrap`}>
                          <span className="whitespace-nowrap">{getDisplayCode(product)}</span>
                        </td>
                      )}
                      {visibleColumns.name && (
                        <td className={`${getDensityClasses()} text-sm text-neutral-700 whitespace-nowrap`}>
                          <div className="flex items-center gap-2">
                            <svg className={`w-4 h-4 transition-transform flex-shrink-0 ${expandedProducts.has(product.id) ? 'rotate-180 text-primary' : 'text-neutral-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                            <span className="whitespace-nowrap">{product.name}</span>
                            {product.isHot && <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700 whitespace-nowrap flex-shrink-0">熱賣</span>}
                            {(() => {
                              const normalPrizes = product.prizes.filter(p => !isLastOneLevel(p.level))
                              const fallbackRemaining = normalPrizes.reduce((sum, s) => sum + s.remaining, 0)
                              const remaining = typeof product.remaining === 'number' ? product.remaining : fallbackRemaining
                              const isSoldOut = remaining === 0 && product.status !== 'pending'
                              return isSoldOut && (
                                <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700 whitespace-nowrap flex-shrink-0">
                                  已完抽
                                </span>
                              )
                            })()}
                          </div>
                        </td>
                      )}
                      {visibleColumns.type && (
                        <td className={`${getDensityClasses()} text-sm text-neutral-700 whitespace-nowrap`}>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            product.type === 'ichiban'
                              ? 'bg-blue-100 text-blue-700'
                              : product.type === 'blindbox'
                              ? 'bg-purple-100 text-purple-700'
                              : product.type === 'gacha'
                              ? 'bg-orange-100 text-orange-700'
                              : product.type === 'card'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}>
                            {{
                              ichiban: '一番賞',
                              blindbox: '盲盒',
                              gacha: '轉蛋',
                              card: '抽卡',
                              custom: '自製'
                            }[product.type || 'ichiban'] || '一番賞'}
                          </span>
                        </td>
                      )}
                      {visibleColumns.price && (
                        <td className={`${getDensityClasses()} text-sm text-neutral-700 font-semibold whitespace-nowrap`}>
                          <span className="whitespace-nowrap">{product.price}</span>
                        </td>
                      )}
                      {visibleColumns.cost && (
                        <td className={`${getDensityClasses()} text-sm text-neutral-500 whitespace-nowrap`}>
                          <span className="whitespace-nowrap">{product.cost != null ? product.cost : '–'}</span>
                        </td>
                      )}
                      {visibleColumns.stockAndSales && (
                        <td className={`${getDensityClasses()} text-sm whitespace-nowrap`}>
                          {(() => {
                            const normalPrizes = product.prizes.filter(p => !isLastOneLevel(p.level))
                            const totalCount = normalPrizes.reduce((sum, s) => sum + s.total, 0)
                            const fallbackRemaining = normalPrizes.reduce((sum, s) => sum + s.remaining, 0)
                            const remaining = typeof product.remaining === 'number' ? product.remaining : fallbackRemaining
                            const calculatedSales = product.sales
                            return (
                              <div className="flex flex-col gap-0.5">
                                <span className={`whitespace-nowrap font-mono ${remaining < 10 ? 'text-red-500 font-semibold' : 'text-neutral-700'}`}>
                                  庫存：{remaining}/{totalCount}
                                </span>
                                <span className="whitespace-nowrap font-mono text-neutral-500 text-xs">
                                  銷量：{calculatedSales}
                                </span>
                              </div>
                            )
                          })()}
                        </td>
                      )}
                      {visibleColumns.majorStatus && (
                        <td className={`${getDensityClasses()} whitespace-nowrap`}>
                          {['gacha', 'blindbox', 'card'].includes(product.type) ? (
                            <span className="text-neutral-400">—</span>
                          ) : isMajorDepleted(product) ? (
                            <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700 border border-red-200 font-semibold whitespace-nowrap">
                              廢套
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700 border border-green-200 font-semibold whitespace-nowrap">
                              正常
                            </span>
                          )}
                        </td>
                      )}
                      {visibleColumns.visibility && (
                        <td className={`${getDensityClasses()} whitespace-nowrap`} onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={async () => {
                              const currentVisibility = productVisibility[product.id]
                              const newVisibility = !currentVisibility
                              const newStatus = newVisibility ? 'active' : 'pending'
                              
                              try {
                                const res = await fetch('/api/admin/products/batch', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    action: 'update_status',
                                    ids: [product.id],
                                    status: newStatus,
                                    autoGenerateTxid: newVisibility && newStatus === 'active' && !product.txidHash,
                                  }),
                                })
                                if (!res.ok) {
                                  const data = await res.json().catch(() => null)
                                  throw new Error(data?.error || '更新狀態失敗')
                                }
                                const data = (await res.json()) as { products?: Array<{ id: number; seed?: string | null; txid_hash?: string | null; started_at?: string | null }> }
                                const updated = (data.products || [])[0]

                                setProductVisibility(prev => ({ ...prev, [product.id]: newVisibility }))
                                setProducts(prev => prev.map(p => {
                                  if (p.id !== product.id) return p
                                  return {
                                    ...p,
                                    status: newStatus,
                                    seed: updated?.seed ?? p.seed,
                                    txidHash: updated?.txid_hash ?? p.txidHash,
                                    startedAt: updated?.started_at ?? p.startedAt,
                                  }
                                }))
                                
                                // 記錄操作
                                addLog(
                                  newVisibility ? '上架商品' : '下架商品',
                                  '商品管理',
                                  `${newVisibility ? '上架' : '下架'}商品「${product.name}」`,
                                  'success'
                                )
                              } catch (error) {
                                console.error('更新狀態失敗:', error)
                                alert('更新狀態失敗')
                              }
                            }}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all flex-shrink-0 ${
                              productVisibility[product.id] ? 'bg-primary' : 'bg-neutral-300'
                            }`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              productVisibility[product.id] ? 'translate-x-6' : 'translate-x-1'
                            }`} />
                          </button>
                        </td>
                      )}
                      {visibleColumns.createdAt && (
                        <td className={`${getDensityClasses()} text-sm text-neutral-500 whitespace-nowrap`}>
                          <span className="whitespace-nowrap font-mono">{formatDateTime(product.createdAt)}</span>
                        </td>
                      )}
                      {visibleColumns.startedAt && (
                        <td className={`${getDensityClasses()} text-sm text-neutral-500 whitespace-nowrap`}>
                          <span className="whitespace-nowrap font-mono">{formatDateTime(product.startedAt)}</span>
                        </td>
                      )}
                      {visibleColumns.endedAt && (
                        <td className={`${getDensityClasses()} text-sm text-neutral-500 whitespace-nowrap`}>
                          <span className="whitespace-nowrap font-mono">{formatDateTime(product.endedAt)}</span>
                        </td>
                      )}
                      {visibleColumns.operations && (
                        <td className={`${getDensityClasses()} sticky right-0 z-20 border-l border-neutral-200 transition-colors duration-300 whitespace-nowrap ${
                          expandedProducts.has(product.id) ? 'bg-neutral-50' : 'bg-white group-hover:bg-neutral-50'
                        }`} onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <Link href={`/products/${product.id}`} className="text-blue-500 hover:text-blue-700 text-sm font-medium whitespace-nowrap">編輯</Link>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(product)
                              }}
                              className="text-red-500 hover:text-red-700 text-sm font-medium whitespace-nowrap"
                            >
                              刪除
                            </button>
                            {product.txidHash && (
                              <Link 
                                href={`/products/${product.id}/verify`} 
                                className="text-blue-500 hover:text-blue-700 text-sm font-medium whitespace-nowrap"
                                onClick={(e) => e.stopPropagation()}
                              >
                                驗證
                              </Link>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                    {expandedProducts.has(product.id) && (
                      <tr className="bg-neutral-50">
                        <td colSpan={2 + Object.values(visibleColumns).filter(Boolean).length} className="py-4 px-4">
                          <div className="pl-8 space-y-2">
                            {(() => {
                              // 計算所有獎項的剩餘數量總和 (排除 LAST ONE)
                              const totalRemaining = product.prizes
                                .filter(p => !['last_one', 'last one'].includes(p.level.toLowerCase()))
                                .reduce((sum, p) => sum + p.remaining, 0)
                              
                              return product.prizes.map((prize, idx) => {
                                // 計算當前機率：該獎項剩餘數量 / 所有獎項剩餘數量總和 × 100%
                                // 如果是 LAST ONE，不計算機率
                                const isLastOne = ['last_one', 'last one'].includes(prize.level.toLowerCase())
                                const currentProbability = (!isLastOne && totalRemaining > 0)
                                  ? ((prize.remaining / totalRemaining) * 100).toFixed(2)
                                  : '0.00'
                                
                                const drawn = prize.total - prize.remaining
                                const isExpanded = prize.id && expandedPrizes.has(prize.id)
                                const isLoadingPrize = prize.id && loadingPrizes.has(prize.id)
                                const drawData = prize.id ? (prizeDraws.get(prize.id) || { rows: [], total: 0, hasMore: false }) : { rows: [], total: 0, hasMore: false }
                                const draws = drawData.rows

                                return (
                                  <div key={idx}>
                                    <div
                                      className={`flex items-center gap-3 text-sm rounded px-2 py-1 -mx-2 cursor-pointer select-none transition-colors ${isExpanded ? 'bg-blue-50' : 'hover:bg-neutral-100'}`}
                                      onClick={() => prize.id && togglePrize(prize.id, drawn)}
                                    >
                                      <span className="text-neutral-400 w-3 text-xs">{isExpanded ? '▾' : '▸'}</span>
                                      <span className="text-neutral-500 font-mono text-xs min-w-[80px]">{getDisplayCode(product)}{(idx + 1).toString().padStart(2, '0')}</span>
                                      <img src={prize.imageUrl} alt={prize.name} className="w-10 h-10 object-cover rounded-lg" />
                                      <span className="text-neutral-700 min-w-[100px]">{prize.name}</span>
                                      <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-700">{prize.level}</span>
                                      <span className="text-neutral-700 min-w-[60px]">{prize.remaining}/{prize.total}</span>
                                      <span className="text-blue-500 font-mono text-xs min-w-[50px]">({currentProbability}%)</span>
                                      {drawn > 0 && <span className="text-xs text-neutral-400">已抽 {drawn}</span>}
                                    </div>
                                    {isExpanded && (
                                      <div className="ml-12 mt-1 mb-2 pl-3 border-l-2 border-blue-100">
                                        {isLoadingPrize ? (
                                          <span className="text-xs text-neutral-400">載入中…</span>
                                        ) : draws.length === 0 ? (
                                          <span className="text-xs text-neutral-400">品項當前無走向</span>
                                        ) : (
                                          <div
                                            className="max-h-44 overflow-y-auto space-y-1 pr-1"
                                            onScroll={(e) => {
                                              if (!prize.id) return
                                              const el = e.currentTarget
                                              if (el.scrollTop + el.clientHeight >= el.scrollHeight - 30) {
                                                if (drawData.hasMore && !loadingMorePrizes.has(prize.id)) {
                                                  fetchPrizeDraws(prize.id, draws.length)
                                                }
                                              }
                                            }}
                                          >
                                            {draws.map((dr: any, i: number) => {
                                              const { label, cls } = prizeStatusLabel(dr.status)
                                              return (
                                                <div key={i} className="flex items-center gap-2 text-xs">
                                                  <span className="text-neutral-400 font-mono tabular-nums">
                                                    {new Date(dr.created_at).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                                                  </span>
                                                  <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${cls}`}>{label}</span>
                                                  <Link
                                                    href={`/users/${dr.user_id}`}
                                                    className="text-blue-600 hover:underline font-medium"
                                                    onClick={(e) => e.stopPropagation()}
                                                  >
                                                    {dr.userName}
                                                  </Link>
                                                  {dr.orderNumber && (
                                                    <Link
                                                      href={`/orders/${dr.order_id}`}
                                                      className="text-neutral-500 hover:text-blue-600 hover:underline font-mono"
                                                      onClick={(e) => e.stopPropagation()}
                                                    >
                                                      {dr.orderNumber}
                                                    </Link>
                                                  )}
                                                </div>
                                              )
                                            })}
                                            {prize.id && loadingMorePrizes.has(prize.id) && (
                                              <div className="text-xs text-neutral-400 py-1 text-center">載入中…</div>
                                            )}
                                            <div className="text-[10px] text-neutral-300 pt-0.5 select-none">
                                              已顯示 {draws.length} / {drawData.total} 筆
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )
                              })
                            })()}
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  )
                }))}
              </tbody>
            </table>
            {displayCount < sortedProducts.length && (
              <div ref={observerTarget} className="py-8 text-center">
                {isLoadingMore ? (
                  <div className="flex items-center justify-center gap-2 text-neutral-500">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                    <span className="text-sm">載入中...</span>
                  </div>
                ) : <div className="h-4"></div>}
              </div>
            )}
          </div>
        </PageCard>

        {/* 智能 CSV 匯入 Wizard */}
        <CsvImportWizard
          isOpen={isBulkOpen}
          onClose={() => setIsBulkOpen(false)}
          onImported={() => { fetchProducts(); setIsBulkOpen(false) }}
        />
        {/* 智能 Excel 匯入 Wizard */}
        <XlsxImportWizard
          isOpen={isXlsxOpen}
          onClose={() => setIsXlsxOpen(false)}
          onImported={() => { fetchProducts(); setIsXlsxOpen(false) }}
        />
      </div>

      {/* 確認 Modal */}
      <Modal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        title={confirmModal.title}
      >
        <p className="text-neutral-700 mb-6">{confirmModal.message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
            className="px-4 py-2 text-sm text-neutral-700 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition-colors"
          >
            取消
          </button>
          <button
            onClick={confirmModal.onConfirm}
            className={`px-4 py-2 text-sm text-white rounded-lg transition-colors ${
              confirmModal.variant === 'danger'
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-primary hover:bg-primary-dark'
            }`}
          >
            確定
          </button>
        </div>
      </Modal>

      {/* 成功提示 Modal */}
      <Modal
        isOpen={successModal.isOpen}
        onClose={() => setSuccessModal(prev => ({ ...prev, isOpen: false }))}
        title={successModal.title}
      >
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-neutral-700 mb-6">{successModal.message}</p>
          <button
            onClick={() => setSuccessModal(prev => ({ ...prev, isOpen: false }))}
            className="px-6 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary-dark transition-colors"
          >
            確定
          </button>
        </div>
      </Modal>
    </AdminLayout>
  )
}
