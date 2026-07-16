'use client'

import { AdminLayout, PageCard, SearchToolbar, FilterTags, ConfirmDialog, AlertDialog } from '@/components'
import { Product, Prize } from '@/types/product'
import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { verifyDraw, generateRandomValue, determinePrize, calculateTXIDHash, generateTXID } from '@/utils/drawLogicClient'
import { supabase } from '@/lib/supabaseClient'
import { useLog } from '@/contexts/LogContext'

interface AdjustedPrize extends Prize {
  adjustedProbability: number
}

interface ProductRate extends Product {
  adjustedPrizes: AdjustedPrize[]
  profitRate: number  // 殺率參數（1.0 = 100%）
}

export default function RatesPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [expandedProduct, setExpandedProduct] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const { addLog } = useLog()
  
  // Fetch products from Supabase
  useEffect(() => {
    const fetchProducts = async () => {
      const { data: productsData } = await supabase
        .from('products')
        .select('*, type, prizes:product_prizes(*)')
      
      if (productsData) {
        const mappedProducts: Product[] = productsData.map((p: any) => ({
          id: p.id,
          productCode: p.product_code,
          name: p.name,
          category: p.category,
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
          majorPrizes: p.major_prizes,
          txidHash: p.txid_hash,
          seed: p.seed,
          type: p.type,
        }))
        setProducts(mappedProducts)

        // Initialize profit rates from DB
        const initialRates: { [key: number]: number } = {}
        productsData.forEach((p: any) => {
          if (p.profit_rate !== undefined && p.profit_rate !== null) {
            initialRates[p.id] = p.profit_rate
          }
        })
        setProfitRates(initialRates)
        setSavedProfitRates(initialRates)
      }
    }
    fetchProducts()
  }, [])
  
  // 確認對話框狀態
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    type?: 'danger' | 'warning' | 'info'
    onConfirm: () => void
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
    onConfirm: () => {}
  })

  // 提示對話框狀態
  const [alertDialog, setAlertDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    type?: 'success' | 'error' | 'info' | 'warning'
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  })
  
  // 哈希驗證狀態（每個商品）
  const [verificationData, setVerificationData] = useState<{
    [productId: number]: {
      seed: string
      nonce: string
      expectedHash: string
      isVerifying: boolean
      result: {
        randomValue: number
        txidHash: string
        hashMatch: boolean
        prizeWithOriginal: { level: string; name: string } | null
        prizeWithAdjusted: { level: string; name: string } | null
      } | null
    }
  }>({})

  // 生成測試用的 Seed 和 Hash
  const generateTestData = async (productId: number) => {
    if (typeof window === 'undefined' || !window.crypto) {
      return
    }

    const seed = Array.from(window.crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    const { calculateSeedHash } = await import('@/utils/drawLogicClient')
    const hash = await calculateSeedHash(seed)

    setVerificationData(prev => ({
      ...prev,
      [productId]: {
        seed,
        nonce: '1',
        expectedHash: hash,
        isVerifying: false,
        result: null
      }
    }))
  }

  
  // 存儲殺率參數（productId -> profitRate）- 當前設定（包括未保存的變更）
  const [profitRates, setProfitRates] = useState<{ [productId: number]: number }>({})

  // 已保存的殺率參數（用於判斷是否有變更）
  const [savedProfitRates, setSavedProfitRates] = useState<{ [productId: number]: number }>({})

  // 判斷是否有未保存的變更
  const hasUnsavedChanges = useMemo(() => {
    // 比較當前設定和已保存設定
    const currentKeys = Object.keys(profitRates).map(Number)
    const savedKeys = Object.keys(savedProfitRates).map(Number)
    
    // 如果鍵的數量不同，有變更
    if (currentKeys.length !== savedKeys.length) {
      return true
    }
    
    // 檢查每個鍵的值是否相同
    for (const key of currentKeys) {
      if (Math.abs((profitRates[key] || 1.0) - (savedProfitRates[key] || 1.0)) > 0.001) {
        return true
      }
    }
    
    // 檢查是否有已保存的鍵被刪除
    for (const key of savedKeys) {
      if (!(key in profitRates)) {
        return true
      }
    }
    
    return false
  }, [profitRates, savedProfitRates])


  // 獲取商品列表（帶殺率參數）
  const productsWithRates: ProductRate[] = useMemo(() => {
    const matchLevel = (prizeLevel: string, configured: string) => {
      const a = prizeLevel.trim().toLowerCase()
      const b = configured.trim().toLowerCase()
      if (!a || !b) return false
      if (a === b) return true
      const aNormalized = a.replace(/賞/g, '')
      const bNormalized = b.replace(/賞/g, '')
      if (aNormalized === bNormalized) return true
      if (aNormalized.startsWith(bNormalized) || bNormalized.startsWith(aNormalized)) return true
      return false
    }

    return products.map(product => {
      const profitRate = profitRates[product.id] ?? 1.0

      // 確定哪些是大獎項：
      // 1) 先使用資料庫設定的 majorPrizes，容許「A / A賞 / A賞 xxx」等變化
      // 2) 若沒有設定或設定無效，優先抓包含「隱藏 / Hidden / Last賞 / SP賞」等關鍵字的等級
      // 3) 如果仍然找不到，就把機率最低的等級當成大獎項
      let majorPrizeLevels = product.prizes
        .filter(p => {
          if (!p.level) return false
          const configured = product.majorPrizes && product.majorPrizes.length > 0
            ? product.majorPrizes
            : ['A賞']
          return configured.some(cfg => matchLevel(p.level as string, cfg))
        })
        .map(p => p.level)

      if (majorPrizeLevels.length === 0 && product.prizes.length > 0) {
        const keywordRegex = /(隱藏|hidden|Hidden|H賞|SP賞|最後賞|Last賞)/
        const keywordLevels = Array.from(
          new Set(
            product.prizes
              .filter(p => p.level && keywordRegex.test(p.level))
              .map(p => p.level)
          )
        )

        if (keywordLevels.length > 0) {
          majorPrizeLevels = keywordLevels
        } else {
          const minProb = Math.min(...product.prizes.map(p => p.probability))
          majorPrizeLevels = Array.from(
            new Set(
              product.prizes
                .filter(p => p.probability === minProb)
                .map(p => p.level)
            )
          )
        }
      }

      // 分離大獎項和小獎項
      const majorPrizes = product.prizes.filter(p => majorPrizeLevels.includes(p.level))
      const minorPrizes = product.prizes.filter(p => !majorPrizeLevels.includes(p.level))
      
      // 計算大獎項和小獎項的原始機率總和
      const majorOriginalTotal = majorPrizes.reduce((sum, p) => sum + p.probability, 0)
      const minorOriginalTotal = minorPrizes.reduce((sum, p) => sum + p.probability, 0)
      
      // 計算大獎項調整後的機率總和
      const majorAdjustedTotal = majorOriginalTotal * profitRate
      
      // 計算小獎項需要補足的總和（確保總和為100%）
      const minorAdjustedTotal = Math.max(0, 100 - majorAdjustedTotal)
      
      // 計算小獎項的調整係數（如果小獎項原始總和為0，則不調整）
      const minorAdjustmentFactor = minorOriginalTotal > 0 
        ? minorAdjustedTotal / minorOriginalTotal 
        : 1.0
      
      // 構建調整後的獎項列表
      const adjustedPrizes = product.prizes.map(prize => {
        const isMajor = majorPrizeLevels.includes(prize.level)
        // 大獎項：原始機率 * 殺率參數
        // 小獎項：原始機率 * 調整係數（自動補足到100%）
        const displayProbability = isMajor 
          ? prize.probability * profitRate
          : prize.probability * minorAdjustmentFactor
        
        return {
          ...prize,
          adjustedProbability: displayProbability
        }
      })
      
      return {
        ...product,
        adjustedPrizes,
        profitRate
      }
    })
  }, [products, profitRates])

  // 篩選處理
  const filteredProducts = useMemo(() => {
    let result = productsWithRates

    // 分類篩選
    if (selectedCategory !== 'all') {
      result = result.filter(p => p.category === selectedCategory)
    }

    // 狀態篩選
    if (selectedStatus !== 'all') {
      result = result.filter(p => p.status === selectedStatus)
    }

    // 搜尋篩選
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(p =>
        p.productCode.toLowerCase().includes(query) ||
        p.name.toLowerCase().includes(query)
      )
    }

    // 排序：最新的在第一個（根據 id 降序，id 越大越新）
    result = [...result].sort((a, b) => {
      // 先按 id 降序（最新的在前）
      return b.id - a.id
    })

    return result
  }, [productsWithRates, selectedCategory, selectedStatus, searchQuery])

  // 獲取分類選項
  const categories = useMemo(() => {
    const cats = Array.from(new Set(products.map(p => p.category)))
    return cats
  }, [products])

  // 處理殺率調整
  const handleProfitRateChange = (productId: number, newRate: number) => {
    // 限制殺率範圍 0.0 - 3.0（0% - 300%）
    const clampedRate = Math.max(0.0, Math.min(3.0, newRate))
    
    setProfitRates(prev => ({
      ...prev,
      [productId]: clampedRate
    }))
  }

  // 重置商品的殺率
  const handleResetProduct = (productId: number) => {
    setConfirmDialog({
      isOpen: true,
      title: '重置殺率設定',
      message: '確定要重置此商品的殺率設定嗎？重置後將恢復為預設值（100%）。',
      type: 'warning',
      onConfirm: () => {
        setProfitRates(prev => {
          const newRates = { ...prev }
          delete newRates[productId]
          return newRates
        })
      }
    })
  }

  // 重置所有殺率
  const handleResetAll = () => {
    const adjustedCount = Object.keys(profitRates).length
    setConfirmDialog({
      isOpen: true,
      title: '重置所有殺率設定',
      message: `確定要重置所有殺率設定嗎？這將清除 ${adjustedCount} 個商品的調整，恢復為預設值（100%）。請記得點擊「保存」以應用變更。`,
      type: 'warning',
      onConfirm: () => {
        setProfitRates({})
      }
    })
  }

  // 保存殺率設定
  const handleSave = async () => {
    setIsSaving(true)
    try {
      // 找出所有需要更新的商品
      // 1. 在 profitRates 中的商品 (如果與 saved 不同)
      // 2. 在 savedProfitRates 中但不在 profitRates 中的商品 (被重置為預設值的商品)
      
      const updates = []
      const allKeys = new Set([
        ...Object.keys(profitRates).map(Number), 
        ...Object.keys(savedProfitRates).map(Number)
      ])
      
      for (const productId of Array.from(allKeys)) {
        const currentRate = profitRates[productId] ?? 1.0
        const savedRate = savedProfitRates[productId] ?? 1.0
        
        if (Math.abs(currentRate - savedRate) > 0.001) {
          updates.push({ productId, profitRate: currentRate })
        }
      }
      
      if (updates.length === 0) {
        setIsSaving(false)
        return
      }

      // 批量更新 (Supabase 不支持直接批量更新不同值，所以使用 Promise.all)
      // 或者可以使用 upsert 如果數據結構允許，但這裡是 update
      await Promise.all(updates.map(update => 
        supabase
          .from('products')
          .update({ profit_rate: update.profitRate })
          .eq('id', update.productId)
      ))
      
      // 更新已保存的設定
      setSavedProfitRates({ ...profitRates })
      
      await addLog(
        '調整殺率',
        '殺率調整',
        `更新 ${updates.length} 個商品殺率設定`,
        'success'
      )

      setAlertDialog({
        isOpen: true,
        title: '保存成功',
        message: `已成功保存 ${updates.length} 個商品的殺率設定`,
        type: 'success'
      })
    } catch (error) {
      console.error('保存失敗:', error)
      await addLog(
        '調整殺率失敗',
        '殺率調整',
        String(error),
        'failed'
      )
      setAlertDialog({
        isOpen: true,
        title: '保存失敗',
        message: '保存失敗，請稍後再試',
        type: 'error'
      })
    } finally {
      setIsSaving(false)
    }
  }

  // 獲取獎項顏色
  const getPrizeColor = (level: string) => {
    switch (level) {
      case 'A賞':
        return 'bg-yellow-100 text-yellow-700 border border-yellow-200'
      case 'B賞':
        return 'bg-blue-100 text-primary border border-blue-200'
      case 'C賞':
        return 'bg-green-100 text-green-700 border border-green-200'
      case 'D賞':
        return 'bg-purple-100 text-purple-700 border border-purple-200'
      case '最後賞':
      case 'Last賞':
        return 'bg-red-100 text-red-700 border border-red-200'
      default:
        return 'bg-neutral-100 text-neutral-700 border border-neutral-200'
    }
  }

  // 計算調整後機率總和
  const calculateDisplayTotalRate = (product: ProductRate) => {
    return product.adjustedPrizes.reduce((sum, prize) => sum + prize.adjustedProbability, 0)
  }

  // 處理哈希驗證
  const handleVerify = async (productId: number) => {
    const data = verificationData[productId]
    if (!data || !data.seed || !data.nonce || !data.expectedHash) {
      setAlertDialog({
        isOpen: true,
        title: '驗證失敗',
        message: '請填寫完整的驗證資訊',
        type: 'warning'
      })
      return
    }

    const nonce = parseInt(data.nonce)
    if (isNaN(nonce)) {
      setAlertDialog({
        isOpen: true,
        title: '驗證失敗',
        message: 'Nonce 必須是數字',
        type: 'warning'
      })
      return
    }

    // 設置驗證中狀態
    setVerificationData(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        isVerifying: true
      }
    }))

    try {
      // 執行驗證
      const verifyResult = await verifyDraw(data.seed, nonce, data.expectedHash)
      
      // 獲取商品資訊
      const product = productsWithRates.find(p => p.id === productId)
      if (!product) return

      // 使用原始機率計算獎項
      const prizesWithOriginal = product.prizes.map(p => ({
        level: p.level,
        name: p.name,
        probability: p.probability
      }))
      // 確保機率總和為 100%，用於正確計算獎項
      const totalOriginalProb = prizesWithOriginal.reduce((sum, p) => sum + p.probability, 0)
      const normalizedOriginalPrizes = prizesWithOriginal.map(p => ({
        level: p.level,
        name: p.name,
        probability: totalOriginalProb > 0 ? (p.probability / totalOriginalProb) * 100 : p.probability
      }))
      const prizeWithOriginal = determinePrize(verifyResult.randomValue, normalizedOriginalPrizes)

      // 使用調整後機率計算獎項（使用 adjustedPrizes）
      const normalizedAdjustedPrizes = product.adjustedPrizes.map(p => ({
        level: p.level,
        name: p.name,
        probability: p.adjustedProbability
      }))
      const prizeWithAdjusted = determinePrize(verifyResult.randomValue, normalizedAdjustedPrizes)

      // 更新結果
      setVerificationData(prev => ({
        ...prev,
        [productId]: {
          ...prev[productId],
          isVerifying: false,
          result: {
            randomValue: verifyResult.randomValue,
            txidHash: verifyResult.txidHash,
            hashMatch: verifyResult.hashMatch,
            prizeWithOriginal,
            prizeWithAdjusted
          }
        }
      }))
    } catch (error) {
      console.error('驗證錯誤:', error)
      setAlertDialog({
        isOpen: true,
        title: '驗證失敗',
        message: '驗證失敗：' + (error instanceof Error ? error.message : '未知錯誤'),
        type: 'error'
      })
      setVerificationData(prev => ({
        ...prev,
        [productId]: {
          ...prev[productId],
          isVerifying: false
        }
      }))
    }
  }


  return (
    <AdminLayout 
      pageTitle="殺率調整"
    >
      <div className="space-y-6">
        {/* 簡化說明 + 殺率演示入口 */}
        <div className="bg-gradient-to-r from-primary to-indigo-50 border border-blue-200 rounded-lg p-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-neutral-900 mb-1">殺率調整功能</h3>
                <p className="text-sm text-neutral-600">
                  調整商品的殺率參數，僅針對大獎項進行調整，小獎項會自動補足至100%。調整後不影響 TXID 哈希驗證結果。
                </p>
              </div>
            </div>
            <div className="flex sm:flex-col gap-2 sm:gap-3 sm:items-end">
              <a
                href="/test/verify-demo"
                className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-white text-sm font-semibold text-primary border border-blue-200 shadow-sm hover:bg-primary transition-colors"
              >
                <span className="mr-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M4 6h8m-8 4h5m-5 4h3" />
                  </svg>
                </span>
                殺率演示
              </a>
            </div>
          </div>
        </div>

        {/* 表格區域 */}
        <PageCard>
          <SearchToolbar
            searchPlaceholder="搜尋商品編號、商品名稱..."
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            showDensity={false}
            showFilter={true}
            filterOptions={[
              {
                key: 'category',
                label: '分類',
                type: 'select',
                options: [
                  { value: 'all', label: '全部分類' },
                  ...categories.map(cat => ({ value: cat, label: cat }))
                ],
                value: selectedCategory,
                onChange: (value) => setSelectedCategory(value)
              },
              {
                key: 'status',
                label: '狀態',
                type: 'select',
                options: [
                  { value: 'all', label: '全部狀態' },
                  { value: 'active', label: '進行中' },
                  { value: 'pending', label: '待上架' },
                  { value: 'ended', label: '已完抽' }
                ],
                value: selectedStatus,
                onChange: (value) => setSelectedStatus(value)
              }
            ]}
            showColumnToggle={false}
            showAddButton={false}
            showExportCSV={false}
          />

          {/* 篩選條件 Tags */}
          <FilterTags
            tags={[
              ...(selectedCategory !== 'all' ? [{
                key: 'category',
                label: '分類',
                value: selectedCategory,
                color: 'primary' as const,
                onRemove: () => setSelectedCategory('all')
              }] : []),
              ...(selectedStatus !== 'all' ? [{
                key: 'status',
                label: '狀態',
                value: selectedStatus === 'active' ? '進行中' : selectedStatus === 'pending' ? '待上架' : '已完抽',
                color: 'primary' as const,
                onRemove: () => setSelectedStatus('all')
              }] : [])
            ]}
            onClearAll={() => {
              setSelectedCategory('all')
              setSelectedStatus('all')
            }}
          />

          {/* 操作按鈕 */}
          <div className="mt-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {/* 只有在有未保存的變更時才顯示保存按鈕 */}
              {hasUnsavedChanges && (
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-3 py-1.5 rounded-lg transition-colors text-sm bg-primary text-white hover:bg-primary-dark disabled:bg-neutral-300 disabled:cursor-not-allowed"
                >
                  {isSaving ? (
                    '保存中...'
                  ) : (
                    `保存殺率設定 (${Object.keys(profitRates).length})`
                  )}
                </button>
              )}
              {/* 只要有已調整的商品就顯示重置按鈕 */}
              {Object.keys(profitRates).length > 0 && (
                <button
                  onClick={handleResetAll}
                  className="px-3 py-1.5 rounded-lg transition-colors text-sm bg-red-500 text-white hover:bg-red-600"
                >
                  重置所有設定 ({Object.keys(profitRates).length})
                </button>
              )}
            </div>
            <div className="text-sm text-neutral-500">
              共 {filteredProducts.length} 個商品
              {Object.keys(profitRates).length > 0 && (
                <span className="ml-2 text-primary font-medium">
                  · {Object.keys(profitRates).length} 個已調整
                </span>
              )}
            </div>
          </div>

          {/* 商品列表 */}
          <div className="mt-6 space-y-4">
            {filteredProducts.map((product) => {
              const isExpanded = expandedProduct === product.id
              const hasAdjustment = profitRates[product.id] !== undefined
              const profitRate = product.profitRate
              const displayTotalRate = isExpanded ? calculateDisplayTotalRate(product) : 0
              const isEnded = product.status === 'ended'
              const isRateLocked = (product as any).type === 'gacha' || (product as any).type === 'blindbox'

              return (
                <div
                  key={product.id}
                  className={`border-2 rounded-lg transition-all ${
                    isEnded && !isExpanded
                      ? 'opacity-50 border-neutral-200 bg-neutral-50'
                      : hasAdjustment
                        ? 'border-primary/40 bg-primary/30'
                        : 'border-neutral-200 bg-white'
                  } ${isExpanded ? 'shadow-md' : 'hover:shadow-sm'}`}
                >
                  {/* 商品標題行 */}
                  <div
                    className="p-3 cursor-pointer"
                    onClick={() => setExpandedProduct(isExpanded ? null : product.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className={`font-mono text-xs ${isEnded && !isExpanded ? 'text-neutral-400' : 'text-neutral-500'}`}>{product.productCode}</span>
                          <h3 className={`text-sm font-semibold ${isEnded && !isExpanded ? 'text-neutral-500' : 'text-neutral-900'}`}>{product.name}</h3>
                          <span className={`px-2 py-1 text-xs rounded-full font-medium ${
                            product.status === 'active' ? 'bg-green-100 text-green-700 border border-green-200' :
                            product.status === 'pending' ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' :
                            'bg-neutral-100 text-neutral-700 border border-neutral-200'
                          }`}>
                            {product.status === 'active' ? '進行中' : product.status === 'pending' ? '待上架' : '已完抽'}
                          </span>
                          {isRateLocked && (
                            <span className="px-2.5 py-1 text-xs rounded-full font-semibold bg-neutral-100 text-neutral-500 border border-neutral-200">
                              不適用殺率
                            </span>
                          )}
                          {!isRateLocked && hasAdjustment && (
                            <span className="px-2.5 py-1 text-xs rounded-full font-semibold bg-blue-100 text-primary border border-blue-200">
                              殺率: {(profitRate * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-neutral-500">
                          <span>{product.category}</span>
                          <span>{product.price.toLocaleString()} (G)</span>
                          <span>{product.prizes.length} 個賞項</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/products/${product.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-primary hover:text-primary text-xs font-medium"
                        >
                          詳情
                        </Link>
                        {hasAdjustment && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleResetProduct(product.id)
                            }}
                            className="text-red-500 hover:text-red-700 text-xs font-medium"
                          >
                            重置
                          </button>
                        )}
                        <svg
                          className={`w-5 h-5 text-neutral-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* 展開的殺率調整區域 */}
                  {isExpanded && (
                    <div className="border-t border-neutral-200 p-4 bg-white">
                      {isRateLocked && (
                        <div className="mb-4 p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-[12px] text-neutral-500">
                          此商品類型（盒玩/轉蛋）不適用殺率調整，機率由商品設定直接決定，profit_rate 固定為 1.0。
                        </div>
                      )}
                      {/* 殺率調整主控區 */}
                      <div className={`mb-4 p-4 bg-gradient-to-r from-primary to-indigo-50 rounded-lg border-2 border-blue-200 ${isRateLocked ? 'opacity-40 pointer-events-none' : ''}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h4 className="text-sm font-semibold text-neutral-900 mb-0.5">殺率參數調整</h4>
                            <p className="text-xs text-neutral-600">
                              調整此參數僅影響大獎項的機率，小獎項會自動補足至100%
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-bold text-primary">
                              {(profitRate * 100).toFixed(0)}%
                            </div>
                            <div className="text-xs text-neutral-500">
                              {profitRate === 1.0 ? '預設值' : profitRate > 1.0 ? '提高' : '降低'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 relative">
                            <input
                              type="range"
                              min="0.0"
                              max="3.0"
                              step="0.01"
                              value={profitRate}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value)
                                handleProfitRateChange(product.id, value)
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                            {/* 標記位置計算：((value - min) / (max - min)) * 100% */}
                            <div className="relative mt-0.5" style={{ height: '16px' }}>
                              <span className="absolute text-xs text-neutral-500" style={{ left: '0%', transform: 'translateX(0)' }}>0%</span>
                              <span className="absolute text-xs text-neutral-500" style={{ left: '33.33%', transform: 'translateX(-50%)' }}>100%</span>
                              <span className="absolute text-xs text-neutral-500" style={{ right: '0%', transform: 'translateX(0)' }}>300%</span>
                            </div>
                          </div>
                          <div className="w-28">
                            <input
                              type="number"
                              min="0.0"
                              max="3.0"
                              step="0.01"
                              value={profitRate.toFixed(2)}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value) || 1.0
                                handleProfitRateChange(product.id, value)
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full px-2 py-1.5 border border-primary/40 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary text-sm font-mono text-center"
                            />
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-blue-200">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-neutral-600">原始機率總和</span>
                            <span className="font-mono font-medium text-neutral-900">
                              {product.prizes.reduce((sum, p) => sum + p.probability, 0).toFixed(2)}%
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs mt-1.5">
                            <span className="text-neutral-600">調整後機率總和</span>
                            <span className={`font-mono font-semibold ${
                              Math.abs(displayTotalRate - 100) < 0.01
                                ? 'text-green-600'
                                : Math.abs(displayTotalRate - 100) < 5
                                  ? 'text-orange-600'
                                  : 'text-red-500'
                            }`}>
                              {displayTotalRate.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      </div>

                        {/* 賞項列表 */}
                      <div>
                        <h4 className="text-sm font-semibold text-neutral-700 mb-3">賞項機率預覽</h4>
                        {/* 大獎項區域 */}
                        {(product.majorPrizes || ['A賞']).length > 0 && (
                          <div className="mb-4">
                            <div className="text-xs font-semibold text-primary mb-2 flex items-center gap-1.5">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                              大獎項（可調整）
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {product.adjustedPrizes
                                .filter(p => (product.majorPrizes || ['A賞']).includes(p.level))
                                .map((prize, index) => {
                                  const displayProbability = prize.adjustedProbability
                                  const change = displayProbability - prize.probability

                                  return (
                                    <div
                                      key={index}
                                      className="p-3 rounded-lg border-2 border-blue-200 bg-primary/50"
                                    >
                                      <div className="flex items-center gap-2 mb-2">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPrizeColor(prize.level)}`}>
                                          {prize.level}
                                        </span>
                                        <span className="text-sm font-medium text-neutral-900 flex-1 truncate">{prize.name}</span>
                                        <span className="text-xs text-neutral-500 whitespace-nowrap">
                                          {prize.remaining}/{prize.total}
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-3 gap-2">
                                        <div>
                                          <label className="block text-xs text-neutral-500 mb-1">原始</label>
                                          <div className="text-xs font-mono text-neutral-700 bg-white px-2 py-1 rounded border border-neutral-200">
                                            {prize.probability.toFixed(2)}%
                                          </div>
                                        </div>
                                        <div>
                                          <label className="block text-xs text-neutral-500 mb-1">調整後</label>
                                          <div className={`text-xs font-mono px-2 py-1 rounded border ${
                                            change > 0
                                              ? 'text-green-700 bg-green-50 border-green-200'
                                              : change < 0
                                                ? 'text-red-700 bg-red-50 border-red-200'
                                                : 'text-neutral-700 bg-white border-neutral-200'
                                          }`}>
                                            {displayProbability.toFixed(2)}%
                                          </div>
                                        </div>
                                        <div>
                                          <label className="block text-xs text-neutral-500 mb-1">變化</label>
                                          <div className={`text-xs font-mono px-2 py-1 rounded border ${
                                            change > 0
                                              ? 'text-green-700 bg-green-50 border-green-200'
                                              : change < 0
                                                ? 'text-red-700 bg-red-50 border-red-200'
                                                : 'text-neutral-400 bg-neutral-50 border-neutral-200'
                                          }`}>
                                            {change > 0 ? '+' : ''}{change.toFixed(2)}%
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                            </div>
                          </div>
                        )}
                        
                        {/* 小獎項區域 */}
                        {product.adjustedPrizes.filter(p => !(product.majorPrizes || ['A賞']).includes(p.level)).length > 0 && (
                          <div>
                            <div className="text-xs font-semibold text-neutral-600 mb-2 flex items-center gap-1.5">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                              </svg>
                              小獎項（自動補足）
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              {product.adjustedPrizes
                                .filter(p => !(product.majorPrizes || ['A賞']).includes(p.level))
                                .map((prize, index) => {
                                  const displayProbability = prize.adjustedProbability
                                  const change = displayProbability - prize.probability

                                  return (
                                    <div
                                      key={index}
                                      className="p-3 rounded-lg border border-neutral-200 bg-neutral-50"
                                    >
                                      <div className="flex items-center gap-2 mb-2">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPrizeColor(prize.level)}`}>
                                          {prize.level}
                                        </span>
                                        <span className="text-sm font-medium text-neutral-900 flex-1 truncate">{prize.name}</span>
                                        <span className="text-xs text-neutral-500 whitespace-nowrap">
                                          {prize.remaining}/{prize.total}
                                        </span>
                                      </div>
                                      <div className="grid grid-cols-3 gap-2">
                                        <div>
                                          <label className="block text-xs text-neutral-500 mb-1">原始</label>
                                          <div className="text-xs font-mono text-neutral-700 bg-white px-2 py-1 rounded border border-neutral-200">
                                            {prize.probability.toFixed(2)}%
                                          </div>
                                        </div>
                                        <div>
                                          <label className="block text-xs text-neutral-500 mb-1">調整後</label>
                                          <div className={`text-xs font-mono px-2 py-1 rounded border ${
                                            change > 0
                                              ? 'text-green-700 bg-green-50 border-green-200'
                                              : change < 0
                                                ? 'text-red-700 bg-red-50 border-red-200'
                                                : 'text-neutral-700 bg-white border-neutral-200'
                                          }`}>
                                            {displayProbability.toFixed(2)}%
                                          </div>
                                        </div>
                                        <div>
                                          <label className="block text-xs text-neutral-500 mb-1">變化</label>
                                          <div className={`text-xs font-mono px-2 py-1 rounded border ${
                                            change > 0
                                              ? 'text-green-700 bg-green-50 border-green-200'
                                              : change < 0
                                                ? 'text-red-700 bg-red-50 border-red-200'
                                                : 'text-neutral-400 bg-neutral-50 border-neutral-200'
                                          }`}>
                                            {change > 0 ? '+' : ''}{change.toFixed(2)}%
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 哈希驗證區塊 */}
                      <div className="mt-4 pt-4 border-t border-neutral-200">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h4 className="text-sm font-semibold text-neutral-700 mb-1.5">哈希驗證測試</h4>
                            <p className="text-xs text-neutral-500">
                              前往驗證演示頁面進行完整的哈希驗證測試
                            </p>
                          </div>
                        </div>
                        
                        <Link
                          href={`/test/verify-demo?productId=${product.id}`}
                          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 transition-colors shadow-sm hover:shadow-md"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                          前往驗證演示
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {filteredProducts.length === 0 && (
            <div className="text-center py-12">
              <svg className="w-12 h-12 text-neutral-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <p className="text-neutral-500">找不到符合條件的商品</p>
            </div>
          )}
        </PageCard>
      </div>

      {/* 確認對話框 */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        confirmText={confirmDialog.type === 'danger' ? '確定重置' : '確定'}
        cancelText="取消"
      />

      {/* 提示對話框 */}
      <AlertDialog
        isOpen={alertDialog.isOpen}
        onClose={() => setAlertDialog({ ...alertDialog, isOpen: false })}
        title={alertDialog.title}
        message={alertDialog.message}
        type={alertDialog.type}
      />
    </AdminLayout>
  )
}
