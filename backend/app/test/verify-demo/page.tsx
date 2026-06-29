'use client'

import { AdminLayout } from '@/components'
import { useState, useEffect } from 'react'
import { Product } from '@/types/product'
import { supabase } from '@/lib/supabaseClient'
import { 
  generateTXID, 
  calculateTXIDHash, 
  generateRandomValue, 
  determinePrize 
} from '@/utils/drawLogicClient'

export default function VerifyDemoPage() {
  const [seed, setSeed] = useState('')  // Seed 在活動結束後才公布
  const [nonce, setNonce] = useState('1')
  const profitRate1 = 1.0  // 初始殺率（固定為1.0，不可調整）
  const [profitRate2, setProfitRate2] = useState(1.5)  // 調整後的殺率
  const [selectedProductId, setSelectedProductId] = useState(1)
  const [initialSeed, setInitialSeed] = useState<string>('')  // 內部使用的初始 Seed（不顯示）
  const [product, setProduct] = useState<Product | null>(null)
  
  const [publishedHash, setPublishedHash] = useState<string>('')  // 活動開始時公布的 TXID Hash
  const [showTooltip, setShowTooltip] = useState(false)  // 控制說明 tooltip 的顯示
  const [allProducts, setAllProducts] = useState<{id: number, name: string}[]>([])

  // 獲取所有商品列表
  useEffect(() => {
    const fetchAllProducts = async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name')
        .order('created_at', { ascending: false })
      
      if (data) {
        setAllProducts(data)
        // 如果當前選擇的 ID 不在列表中且列表不為空，默認選擇第一個
        if (data.length > 0 && !data.find(p => p.id === selectedProductId)) {
          setSelectedProductId(data[0].id)
        }
      }
    }
    fetchAllProducts()
  }, [])
  
  // 從URL參數讀取商品ID
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      const productIdParam = urlParams.get('productId')
      if (productIdParam) {
        const productId = parseInt(productIdParam)
        if (!isNaN(productId)) {
          setSelectedProductId(productId)
        }
      }
    }
  }, [])
  
  // 當商品切換時，更新 TXID Hash（使用商品的真實 txidHash）
  useEffect(() => {
    const updateHashForProduct = async () => {
      if (typeof window === 'undefined' || !window.crypto) {
        return
      }
      
      const { data: productData } = await supabase
        .from('products')
        .select('*, prizes:product_prizes(*)')
        .eq('id', selectedProductId)
        .single()
      
      if (productData) {
        const mappedProduct: Product = {
          id: productData.id,
          productCode: productData.product_code,
          name: productData.name,
          category: productData.category,
          price: productData.price,
          remaining: productData.remaining,
          status: productData.status,
          sales: productData.sales,
          isHot: productData.is_hot,
          createdAt: productData.created_at,
          imageUrl: productData.image_url,
          prizes: productData.prizes.map((pz: any) => ({
            name: pz.name,
            level: pz.level,
            imageUrl: pz.image_url,
            total: pz.total,
            remaining: pz.remaining,
            probability: pz.probability
          })),
          totalCount: productData.total_count,
          releaseYear: productData.release_year,
          releaseMonth: productData.release_month,
          distributor: productData.distributor,
          rarity: productData.rarity,
          majorPrizes: productData.major_prizes,
          txidHash: productData.txid_hash,
          seed: productData.seed
        }
        setProduct(mappedProduct)
        
        // 如果商品有 Seed，使用商品的真實 Seed
        if (mappedProduct.seed) {
          setInitialSeed(mappedProduct.seed)
          setSeed('')  // 重置已公布的 Seed（活動結束後才公布）
          setResults(null)  // 清除之前的驗證結果
          
          // 使用真實 Seed 計算商品級哈希值（Hash = SHA256(Seed)）
          const { calculateSeedHash } = await import('@/utils/drawLogicClient')
          const hash = await calculateSeedHash(mappedProduct.seed)
          setPublishedHash(hash)
        } else if (mappedProduct.txidHash) {
          // 如果商品有 txidHash 但沒有 Seed（舊數據或活動進行中）
          setPublishedHash(mappedProduct.txidHash)
          // 生成一個新的 Seed（用於驗證演示）
          // 注意：這個 Seed 生成的 Hash 可能與商品的 txidHash 不匹配
          // 這是正常的，因為我們不知道商品真正的 Seed（活動進行中時 Seed 保密）
          const randomBytes = Array.from(window.crypto.getRandomValues(new Uint8Array(32)))
          const newSeed = randomBytes.map(b => b.toString(16).padStart(2, '0')).join('')
          setInitialSeed(newSeed)
          setSeed('')  // 重置已公布的 Seed
          setResults(null)  // 清除之前的驗證結果
        } else {
          // 如果商品沒有 txidHash，生成一個新的 Seed 和 Hash
          const randomBytes = Array.from(window.crypto.getRandomValues(new Uint8Array(32)))
          const newSeed = randomBytes.map(b => b.toString(16).padStart(2, '0')).join('')
          setInitialSeed(newSeed)
          setSeed('')  // 重置已公布的 Seed
          setResults(null)  // 清除之前的驗證結果
          
          // 計算商品級哈希值
          const { calculateSeedHash } = await import('@/utils/drawLogicClient')
          const hash = await calculateSeedHash(newSeed)
          setPublishedHash(hash)
        }
      }
    }
    
    updateHashForProduct()
  }, [selectedProductId])
  const [results, setResults] = useState<{
    txidHash: string
    randomValue: number
    prizeWithRate1: { level: string; name: string } | null
    prizeWithRate2: { level: string; name: string } | null
    hashMatch: boolean
  } | null>(null)

  // 模擬活動結束，公布 Seed（商品全數抽完後）
  const publishSeed = () => {
    if (initialSeed) {
      setSeed(initialSeed)
      setNonce('1')
      setResults(null)
    }
  }
  
  // 重新開始（生成新的初始 Seed 和 Hash）
  const resetActivity = async () => {
    if (typeof window === 'undefined' || !window.crypto) {
      alert('瀏覽器不支持 Web Crypto API')
      return
    }
    const randomBytes = Array.from(window.crypto.getRandomValues(new Uint8Array(32)))
    const newSeed = randomBytes.map(b => b.toString(16).padStart(2, '0')).join('')
    setInitialSeed(newSeed)
    setSeed('')  // 清空已公布的 Seed
    setNonce('1')
    setResults(null)
    
    // 重新計算活動開始時公布的 TXID Hash
    const nonceNum = 1
    const txid = generateTXID(newSeed, nonceNum)
    const hash = await calculateTXIDHash(txid)
    setPublishedHash(hash)
  }

  // 計算調整後的獎項機率（只調整大獎項，小獎項自動補足）
  const calculateAdjustedPrizes = (product: Product, profitRate: number) => {
    // 確定哪些是大獎項（使用 majorPrizes 或默認 ['A賞']）
    const majorPrizeLevels = product.majorPrizes || ['A賞']
    
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
    return product.prizes.map(prize => {
      const isMajor = majorPrizeLevels.includes(prize.level)
      // 大獎項：原始機率 * 殺率參數
      // 小獎項：原始機率 * 調整係數（自動補足到100%）
      const adjustedProbability = isMajor 
        ? prize.probability * profitRate
        : prize.probability * minorAdjustmentFactor
      
      return {
        level: prize.level,
        name: prize.name,
        probability: prize.probability,
        adjustedProbability
      }
    })
  }

  // 執行驗證測試（自動公布 Seed 模擬活動結束）
  const runVerification = async () => {
    // 如果 Seed 尚未公布，自動公布（模擬活動結束）
    if (!seed && initialSeed) {
      setSeed(initialSeed)
    }
    
    const seedToUse = seed || initialSeed
    
    if (!seedToUse || !nonce) {
      alert('請先確保 Seed 已生成')
      return
    }

    const nonceNum = parseInt(nonce)
    if (isNaN(nonceNum) || nonceNum < 1) {
      alert('Nonce 必須是大於 0 的數字')
      return
    }

    if (!publishedHash) {
      alert('請先確保已生成 TXID Hash')
      return
    }

    if (!product) {
      alert('找不到商品')
      return
    }

    try {
      // 生成 TXID（使用 seedToUse）
      const txid = generateTXID(seedToUse, nonceNum)
      
      // 計算 TXID Hash（這個不會因為殺率改變而改變）
      const txidHash = await calculateTXIDHash(txid)
      
      // 驗證計算出的 Hash 與公布的 Hash 是否一致
      // 注意：如果商品有 txidHash，但我們生成的 Seed 無法匹配，這是正常的
      // 因為我們不知道商品真正的 Seed（Seed 在活動結束後才公布）
      const hashMatch = txidHash === publishedHash
      
      // 生成隨機數（這個也不會因為殺率改變而改變）
      const randomValue = await generateRandomValue(txid)
      
      // 使用殺率 1 計算獎項（只調整大獎項，小獎項自動補足）
      const adjustedPrizes1 = calculateAdjustedPrizes(product, profitRate1)
      const normalizedPrizes1 = adjustedPrizes1.map(p => ({
        level: p.level,
        name: p.name,
        probability: p.adjustedProbability
      }))
      const prizeWithRate1 = determinePrize(randomValue, normalizedPrizes1)
      
      // 使用殺率 2 計算獎項（只調整大獎項，小獎項自動補足）
      const adjustedPrizes2 = calculateAdjustedPrizes(product, profitRate2)
      const normalizedPrizes2 = adjustedPrizes2.map(p => ({
        level: p.level,
        name: p.name,
        probability: p.adjustedProbability
      }))
      const prizeWithRate2 = determinePrize(randomValue, normalizedPrizes2)
      
      setResults({
        txidHash,
        randomValue,
        prizeWithRate1,
        prizeWithRate2,
        hashMatch  // 驗證計算出的 Hash 與公布的 Hash 是否一致
      })
    } catch (error) {
      console.error('驗證錯誤:', error)
      alert('驗證失敗：' + (error instanceof Error ? error.message : '未知錯誤'))
    }
  }

  // 獲取獎項顏色
  const getPrizeColor = (level: string) => {
    switch (level) {
      case 'A賞':
        return 'bg-yellow-100 text-yellow-700 border border-yellow-200'
      case 'B賞':
        return 'bg-blue-100 text-blue-700 border border-blue-200'
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

  // 計算調整後的獎項列表（用於顯示）
  const adjustedPrizes1 = product ? calculateAdjustedPrizes(product, profitRate1) : []
  const adjustedPrizes2 = product ? calculateAdjustedPrizes(product, profitRate2) : []

  return (
    <AdminLayout 
      pageTitle="殺率調整驗證演示"
      breadcrumbs={[
        { label: '測試', href: '/test' },
        { label: '殺率調整驗證演示', href: undefined }
      ]}
    >
      <div className="space-y-4">
        {/* 步驟引導 */}
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-neutral-900">驗證流程步驟</h2>
            {/* 說明按鈕 */}
            <div className="relative">
              <button
                onClick={() => setShowTooltip(!showTooltip)}
                className="w-8 h-8 rounded-full bg-blue-100 hover:bg-blue-200 flex items-center justify-center transition-colors"
                aria-label="驗證機制說明"
              >
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              {/* Tooltip */}
              {showTooltip && (
                <>
                  {/* 背景遮罩，點擊關閉 */}
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowTooltip(false)}
                  />
                  {/* Tooltip 內容 */}
                  <div className="absolute right-0 top-full mt-2 w-96 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 shadow-lg z-50">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-gray-900 mb-1">驗證機制說明</h3>
                        <div className="text-sm text-gray-600 space-y-1.5">
                          <p>
                            <strong>核心原理：</strong>TXID Hash 只基於「隨機種子 (Seed)」和「序列號 (Nonce)」，不包含殺率參數。
                          </p>
                          <p>
                            <strong>驗證流程：</strong>活動開始時公布 TXID Hash → 抽獎過程中可動態調整殺率（不影響 Hash）→ 活動結束後公布 Seed → 玩家驗證結果一致。
                          </p>
                          <p>
                            <strong>關鍵點：</strong>即使殺率改變，只要 Seed 和 Nonce 相同，TXID Hash 就永遠相同，保證驗證一致性。
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-2">
            {/* 步驟 1 */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                selectedProductId ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {selectedProductId ? '✓' : '1'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-600">步驟 1</div>
                <div className="text-sm font-medium text-gray-900 truncate">選擇商品</div>
              </div>
            </div>
            <div className="hidden md:block text-gray-300">→</div>
            
            {/* 步驟 2 */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                publishedHash ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {publishedHash ? '✓' : '2'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-600">步驟 2</div>
                <div className="text-sm font-medium text-gray-900 truncate">查看 TXID Hash</div>
              </div>
            </div>
            <div className="hidden md:block text-gray-300">→</div>
            
            {/* 步驟 3 */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold bg-blue-100 text-blue-700">
                3
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-600">步驟 3</div>
                <div className="text-sm font-medium text-gray-900 truncate">調整殺率（可選）</div>
              </div>
            </div>
            <div className="hidden md:block text-gray-300">→</div>
            
            {/* 步驟 4 */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                seed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {seed ? '✓' : '4'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-600">步驟 4</div>
                <div className="text-sm font-medium text-gray-900 truncate">活動結束，公布 Seed</div>
              </div>
            </div>
            <div className="hidden md:block text-gray-300">→</div>
            
            {/* 步驟 5 */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                results ? (results.hashMatch ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700') : 'bg-gray-100 text-gray-500'
              }`}>
                {results ? (results.hashMatch ? '✓' : '✗') : '5'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-600">步驟 5</div>
                <div className="text-sm font-medium text-gray-900 truncate">執行驗證測試</div>
              </div>
            </div>
          </div>
        </div>

        {/* 輸入區域 */}
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-4">
          <h2 className="text-base font-semibold text-neutral-900 mb-3">測試參數</h2>
          
          <div className="space-y-3 mb-3">
            {/* 商品選擇 */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                商品選擇
                <span className="ml-2 text-xs text-gray-500 font-normal">（選擇要測試的商品）</span>
              </label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(parseInt(e.target.value))}
                className="w-full px-3 py-2 border-2 border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all text-sm"
              >
                {allProducts.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                選擇要進行驗證測試的商品
              </p>
            </div>

            {/* 活動開始時公布的 TXID Hash */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                活動開始時公布的 TXID Hash
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={publishedHash}
                  disabled
                  readOnly
                  placeholder="活動開始時會自動生成並顯示"
                  className="flex-1 px-3 py-2 border-2 border-neutral-200 rounded-lg bg-neutral-50 text-sm font-mono text-gray-600 cursor-not-allowed placeholder:text-gray-400"
                />
                <button
                  onClick={async () => {
                    if (!publishedHash) return
                    try {
                      await navigator.clipboard.writeText(publishedHash)
                      alert('已複製到剪貼簿')
                    } catch (err) {
                      console.error('複製失敗:', err)
                    }
                  }}
                  disabled={!publishedHash}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-medium whitespace-nowrap disabled:bg-gray-300 disabled:cursor-not-allowed disabled:hover:bg-gray-300"
                >
                  複製
                </button>
              </div>
            </div>

            {/* 隨機種子 (Seed) 和 序列號 (Nonce) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                  隨機種子 (Seed)
                  <span className="ml-2 text-xs text-gray-500 font-normal">（活動結束後公布）</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={seed}
                    disabled
                    readOnly
                    placeholder={seed ? seed : "執行驗證測試時會自動公布"}
                    className="flex-1 px-3 py-2 border-2 border-neutral-200 rounded-lg bg-neutral-50 text-sm font-mono text-gray-600 cursor-not-allowed placeholder:text-gray-400"
                  />
                  <button
                    onClick={publishSeed}
                    disabled={!initialSeed || !!seed}
                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors text-sm font-medium whitespace-nowrap disabled:bg-gray-300 disabled:cursor-not-allowed disabled:hover:bg-gray-300"
                    title={seed ? 'Seed 已公布' : '手動提前公布 Seed（執行驗證時會自動公布）'}
                  >
                    {seed ? '✓ 已公布' : '提前公布'}
                  </button>
                </div>
                {!seed && (
                  <p className="text-xs text-gray-500 mt-1">
                    💡 提示：點擊「執行驗證測試」時會自動公布 Seed（模擬活動結束）
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1.5">
                  序列號 (Nonce)
                  <span className="ml-2 text-xs text-gray-500 font-normal">（抽獎序號）</span>
                </label>
                <input
                  type="number"
                  value={nonce}
                  onChange={(e) => setNonce(e.target.value)}
                  min="1"
                  className="w-full px-3 py-2 border-2 border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  用於指定要驗證的抽獎序號（從 1 開始）
                </p>
              </div>
            </div>
          </div>

          {/* 殺率設定 */}
          {product && (
            <div className="border-t border-neutral-200 pt-4 mt-4">
              <h3 className="text-sm font-semibold text-neutral-700 mb-4">殺率參數設定（僅調整大獎項，小獎項自動補足）</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 初始殺率 */}
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <label className="text-sm font-medium text-gray-900 block">
                        基準值（活動開始時）
                      </label>
                      <p className="text-xs text-gray-600 mt-0.5">這是活動開始時的基準值，不可調整</p>
                    </div>
                    <span className="text-lg font-bold text-gray-700">
                      {(profitRate1 * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 relative">
                      {/* 只讀顯示滑桿，固定值為1.0 */}
                      <div className="relative">
                        <div className="w-full h-2 bg-gray-200 rounded-lg relative">
                          {/* 顯示當前值的位置（1.0 = 33.33%） */}
                          <div 
                            className="absolute top-0 h-2 bg-gray-400 rounded-lg"
                            style={{ width: '33.33%' }}
                          />
                          {/* 節點標記 */}
                          <div 
                            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-gray-500 rounded-full border-2 border-white shadow-md"
                            style={{ left: 'calc(33.33% - 8px)' }}
                          />
                        </div>
                        <div className="relative mt-1" style={{ height: '18px' }}>
                          <span className="absolute text-xs text-gray-500" style={{ left: '0%', transform: 'translateX(0)' }}>0%</span>
                          <span className="absolute text-xs text-gray-500" style={{ left: '33.33%', transform: 'translateX(-50%)' }}>100%</span>
                          <span className="absolute text-xs text-gray-500" style={{ right: '0%', transform: 'translateX(0)' }}>300%</span>
                        </div>
                      </div>
                    </div>
                    <div className="w-24">
                      <input
                        type="text"
                        value={profitRate1.toFixed(2)}
                        readOnly
                        disabled
                        className="w-full px-2 py-1.5 border-2 border-gray-300 rounded-lg bg-gray-100 text-sm font-mono text-center text-gray-600 cursor-not-allowed"
                      />
                    </div>
                  </div>
                  
                  {/* 大獎項機率列表 */}
                  {(() => {
                    const majorPrizeLevels = product.majorPrizes || ['A賞']
                    const adjustedPrizes1 = calculateAdjustedPrizes(product, profitRate1)
                    const majorPrizes1 = adjustedPrizes1.filter(p => majorPrizeLevels.includes(p.level))
                    const minorPrizes1 = adjustedPrizes1.filter(p => !majorPrizeLevels.includes(p.level))
                    
                    return (
                      <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
                        {/* 大獎項 */}
                        {majorPrizes1.length > 0 && (
                          <>
                            <div className="text-xs font-semibold text-green-700 mb-2 flex items-center gap-1.5">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                              大獎項機率
                            </div>
                            <div className="space-y-1.5">
                              {majorPrizes1.map((prize, idx) => {
                                const change = prize.adjustedProbability - prize.probability
                                // 從原始商品數據中獲取獎項的總數量
                                const originalPrize = product.prizes.find(p => p.level === prize.level && p.name === prize.name)
                                const totalQuantity = originalPrize?.total || 0
                                return (
                                  <div key={idx} className="flex items-center justify-between text-sm bg-white rounded px-2.5 py-1.5 border border-green-200">
                                    <div className="flex items-center gap-2">
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPrizeColor(prize.level)}`}>
                                        {prize.level}
                                      </span>
                                      <span className="text-gray-700 truncate max-w-[140px]">{prize.name}</span>
                                      <span className="text-gray-400 text-xs font-mono">0/{totalQuantity}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-500 text-xs">{prize.probability.toFixed(2)}%</span>
                                      <span className="text-gray-400 text-xs">→</span>
                                      <span className={`font-mono text-xs ${
                                        change > 0 ? 'text-green-700' : change < 0 ? 'text-red-700' : 'text-gray-700'
                                      }`}>
                                        {prize.adjustedProbability.toFixed(2)}%
                                      </span>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </>
                        )}
                        
                        {/* 小獎項（自動補足） */}
                        {minorPrizes1.length > 0 && (
                          <>
                            <div className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-200">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                              </svg>
                              小獎項機率（自動補足至100%）
                            </div>
                            <div className="space-y-1.5">
                              {minorPrizes1.map((prize, idx) => {
                                const change = prize.adjustedProbability - prize.probability
                                // 從原始商品數據中獲取獎項的總數量
                                const originalPrize = product.prizes.find(p => p.level === prize.level && p.name === prize.name)
                                const totalQuantity = originalPrize?.total || 0
                                return (
                                  <div key={idx} className="flex items-center justify-between text-sm bg-white rounded px-2.5 py-1.5 border border-gray-200">
                                    <div className="flex items-center gap-2">
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPrizeColor(prize.level)}`}>
                                        {prize.level}
                                      </span>
                                      <span className="text-gray-700 truncate max-w-[140px]">{prize.name}</span>
                                      <span className="text-gray-400 text-xs font-mono">0/{totalQuantity}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-500 text-xs">{prize.probability.toFixed(2)}%</span>
                                      <span className="text-gray-400 text-xs">→</span>
                                      <span className={`font-mono text-xs ${
                                        change > 0 ? 'text-green-700' : change < 0 ? 'text-red-700' : 'text-gray-700'
                                      }`}>
                                        {prize.adjustedProbability.toFixed(2)}%
                                      </span>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                            {/* 顯示總和 */}
                            <div className="mt-2 pt-2 border-t border-gray-200 flex items-center justify-between text-xs">
                              <span className="text-gray-600">機率總和</span>
                              <span className="font-mono font-semibold text-gray-900">
                                {adjustedPrizes1.reduce((sum, p) => sum + p.adjustedProbability, 0).toFixed(2)}%
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })()}
                </div>

                {/* 調整後殺率 */}
                <div className="p-4 bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg border border-orange-200">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-orange-900">
                      調整後殺率（過程中調整）
                    </label>
                    <span className="text-lg font-bold text-orange-700">
                      {(profitRate2 * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 relative">
                      <input
                        type="range"
                        min="0.0"
                        max="3.0"
                        step="0.01"
                        value={profitRate2}
                        onChange={(e) => setProfitRate2(parseFloat(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-600"
                      />
                      <div className="relative mt-1" style={{ height: '18px' }}>
                        <span className="absolute text-xs text-gray-500" style={{ left: '0%', transform: 'translateX(0)' }}>0%</span>
                        <span className="absolute text-xs text-gray-500" style={{ left: '33.33%', transform: 'translateX(-50%)' }}>100%</span>
                        <span className="absolute text-xs text-gray-500" style={{ right: '0%', transform: 'translateX(0)' }}>300%</span>
                      </div>
                    </div>
                    <div className="w-24">
                      <input
                        type="number"
                        min="0.0"
                        max="3.0"
                        step="0.01"
                        value={profitRate2.toFixed(2)}
                        onChange={(e) => setProfitRate2(parseFloat(e.target.value) || 1.0)}
                        className="w-full px-2 py-1.5 border-2 border-orange-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm font-mono text-center"
                      />
                    </div>
                  </div>
                  
                  {/* 大獎項機率列表 */}
                  {(() => {
                    const majorPrizeLevels = product.majorPrizes || ['A賞']
                    const adjustedPrizes2 = calculateAdjustedPrizes(product, profitRate2)
                    const majorPrizes2 = adjustedPrizes2.filter(p => majorPrizeLevels.includes(p.level))
                    const minorPrizes2 = adjustedPrizes2.filter(p => !majorPrizeLevels.includes(p.level))
                    
                    return (
                      <div className="mt-3 pt-3 border-t border-orange-200 space-y-3">
                        {/* 大獎項 */}
                        {majorPrizes2.length > 0 && (
                          <>
                            <div className="text-xs font-semibold text-orange-700 mb-2 flex items-center gap-1.5">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                              </svg>
                              大獎項機率
                            </div>
                            <div className="space-y-1.5">
                              {majorPrizes2.map((prize, idx) => {
                                const change = prize.adjustedProbability - prize.probability
                                // 從原始商品數據中獲取獎項的總數量
                                const originalPrize = product.prizes.find(p => p.level === prize.level && p.name === prize.name)
                                const totalQuantity = originalPrize?.total || 0
                                return (
                                  <div key={idx} className="flex items-center justify-between text-sm bg-white rounded px-2.5 py-1.5 border border-orange-200">
                                    <div className="flex items-center gap-2">
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPrizeColor(prize.level)}`}>
                                        {prize.level}
                                      </span>
                                      <span className="text-gray-700 truncate max-w-[140px]">{prize.name}</span>
                                      <span className="text-gray-400 text-xs font-mono">0/{totalQuantity}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-500 text-xs">{prize.probability.toFixed(2)}%</span>
                                      <span className="text-gray-400 text-xs">→</span>
                                      <span className={`font-mono text-xs ${
                                        change > 0 ? 'text-green-700' : change < 0 ? 'text-red-700' : 'text-gray-700'
                                      }`}>
                                        {prize.adjustedProbability.toFixed(2)}%
                                      </span>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </>
                        )}
                        
                        {/* 小獎項（自動補足） */}
                        {minorPrizes2.length > 0 && (
                          <>
                            <div className="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1.5 mt-3 pt-3 border-t border-orange-200">
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                              </svg>
                              小獎項機率（自動補足至100%）
                            </div>
                            <div className="space-y-1.5">
                              {minorPrizes2.map((prize, idx) => {
                                const change = prize.adjustedProbability - prize.probability
                                // 從原始商品數據中獲取獎項的總數量
                                const originalPrize = product.prizes.find(p => p.level === prize.level && p.name === prize.name)
                                const totalQuantity = originalPrize?.total || 0
                                return (
                                  <div key={idx} className="flex items-center justify-between text-sm bg-white rounded px-2.5 py-1.5 border border-gray-200">
                                    <div className="flex items-center gap-2">
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPrizeColor(prize.level)}`}>
                                        {prize.level}
                                      </span>
                                      <span className="text-gray-700 truncate max-w-[140px]">{prize.name}</span>
                                      <span className="text-gray-400 text-xs font-mono">0/{totalQuantity}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-500 text-xs">{prize.probability.toFixed(2)}%</span>
                                      <span className="text-gray-400 text-xs">→</span>
                                      <span className={`font-mono text-xs ${
                                        change > 0 ? 'text-green-700' : change < 0 ? 'text-red-700' : 'text-gray-700'
                                      }`}>
                                        {prize.adjustedProbability.toFixed(2)}%
                                      </span>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                            {/* 顯示總和 */}
                            <div className="mt-2 pt-2 border-t border-gray-200 flex items-center justify-between text-xs">
                              <span className="text-gray-600">機率總和</span>
                              <span className="font-mono font-semibold text-gray-900">
                                {adjustedPrizes2.reduce((sum, p) => sum + p.adjustedProbability, 0).toFixed(2)}%
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* 執行按鈕 */}
          <div className="mt-4">
            <button
              onClick={runVerification}
              disabled={!initialSeed || !nonce || !publishedHash}
              className="w-full px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-base font-semibold shadow-md hover:shadow-lg flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              執行驗證測試
            </button>
            {(!initialSeed || !nonce || !publishedHash) && (
              <p className="text-xs text-gray-500 mt-2 text-center">
                {!publishedHash && '⚠️ 請等待 TXID Hash 生成'}
                {publishedHash && !nonce && '⚠️ 請輸入序列號 (Nonce)'}
                {publishedHash && nonce && !initialSeed && '⚠️ 請等待系統初始化'}
              </p>
            )}
          </div>
        </div>

        {/* 結果顯示 */}
        {results && product && (
          <div className="bg-white rounded-lg shadow-lg border-2 border-neutral-200 p-6">
            {/* 驗證結果標題 - 更明顯 */}
            <div className={`mb-6 p-5 rounded-xl border-2 ${
              results.hashMatch 
                ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300' 
                : 'bg-gradient-to-r from-red-50 to-rose-50 border-red-300'
            }`}>
              <div className="flex items-center gap-4">
                <div className={`flex-shrink-0 w-16 h-16 rounded-full flex items-center justify-center shadow-lg ${
                  results.hashMatch ? 'bg-green-500' : 'bg-red-500'
                }`}>
                  {results.hashMatch ? (
                    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <h2 className={`text-2xl font-bold mb-2 ${
                    results.hashMatch ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {results.hashMatch ? '✓ 驗證成功！' : '✗ 驗證失敗'}
                  </h2>
                  <p className={`text-base font-medium ${
                    results.hashMatch ? 'text-green-600' : 'text-red-500'
                  }`}>
                    {results.hashMatch 
                      ? '即使殺率改變，TXID Hash 仍然一致，證明系統公平可靠'
                      : '計算出的 Hash 與公布的 Hash 不一致。如果商品有真實的 txidHash，這是正常的，因為我們不知道商品真正的 Seed（Seed 在活動結束後才公布）'}
                  </p>
                </div>
              </div>
            </div>
            
            {/* 哈希驗證詳細結果 */}
            <div className={`mb-6 p-4 rounded-lg border ${
              results.hashMatch 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  results.hashMatch ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  {results.hashMatch ? (
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </div>
                <div>
                  <h3 className={`text-base font-semibold ${
                    results.hashMatch ? 'text-green-700' : 'text-red-700'
                  }`}>
                    {results.hashMatch ? '哈希驗證成功' : '哈希驗證失敗'}
                  </h3>
                  <p className={`text-sm ${
                    results.hashMatch ? 'text-green-600' : 'text-red-500'
                  }`}>
                    {results.hashMatch 
                      ? '無論殺率如何調整，TXID Hash 保持一致'
                      : '計算出的 Hash 與公布的 Hash 不一致，請檢查輸入'}
                  </p>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className={`bg-white rounded p-2.5 border ${
                  results.hashMatch ? 'border-green-200' : 'border-red-200'
                }`}>
                  <div className={`text-sm mb-1 font-medium ${
                    results.hashMatch ? 'text-green-700' : 'text-red-700'
                  }`}>
                    公布的 TXID Hash
                  </div>
                  <code className={`text-sm font-mono break-all block ${
                    results.hashMatch ? 'text-green-900' : 'text-red-900'
                  }`}>
                    {publishedHash}
                  </code>
                </div>
                <div className={`bg-white rounded p-2.5 border ${
                  results.hashMatch ? 'border-green-200' : 'border-red-200'
                }`}>
                  <div className={`text-sm mb-1 font-medium ${
                    results.hashMatch ? 'text-green-700' : 'text-red-700'
                  }`}>
                    計算出的 TXID Hash
                  </div>
                  <code className={`text-sm font-mono break-all block ${
                    results.hashMatch ? 'text-green-900' : 'text-red-900'
                  }`}>
                    {results.txidHash}
                  </code>
                </div>
                <div className={`bg-white rounded p-2.5 border ${
                  results.hashMatch ? 'border-green-200' : 'border-red-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-sm ${
                      results.hashMatch ? 'text-green-700' : 'text-red-700'
                    }`}>
                      隨機數: {results.randomValue.toFixed(10)}
                    </span>
                    <span className={`px-2.5 py-1 rounded-full text-sm font-semibold ${
                      results.hashMatch
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {results.hashMatch ? '✓ 一致' : '✗ 不一致'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 獎項對比 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div className="p-3 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
                <h3 className="text-sm font-semibold text-green-900 mb-2">
                  初始殺率 ({profitRate1.toFixed(2)}x) 的獎項
                </h3>
                {results.prizeWithRate1 && (
                  <div className="bg-white rounded p-2 border border-green-200">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPrizeColor(results.prizeWithRate1.level)}`}>
                        {results.prizeWithRate1.level}
                      </span>
                      <span className="text-sm font-medium text-green-900">{results.prizeWithRate1.name}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg border border-orange-200">
                <h3 className="text-sm font-semibold text-orange-900 mb-2">
                  調整後殺率 ({profitRate2.toFixed(2)}x) 的獎項
                </h3>
                {results.prizeWithRate2 && (
                  <div className="bg-white rounded p-2 border border-orange-200">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPrizeColor(results.prizeWithRate2.level)}`}>
                        {results.prizeWithRate2.level}
                      </span>
                      <span className="text-sm font-medium text-orange-900">{results.prizeWithRate2.name}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 獎項機率預覽 */}
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">獎項機率預覽</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* 初始殺率的獎項列表 */}
                <div>
                  <div className="text-sm font-semibold text-green-700 mb-2 flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    初始殺率 ({profitRate1.toFixed(2)}x)
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {adjustedPrizes1.map((prize, index) => {
                      const isMajor = (product.majorPrizes || ['A賞']).includes(prize.level)
                      return (
                        <div
                          key={index}
                          className={`p-2.5 rounded-lg border ${isMajor ? 'border-green-200 bg-green-50/50' : 'border-gray-200 bg-gray-50'}`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPrizeColor(prize.level)}`}>
                              {prize.level}
                            </span>
                            <span className="text-sm font-medium text-gray-900 flex-1 truncate">{prize.name}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">原始</label>
                              <div className="text-sm font-mono text-gray-700 bg-white px-2 py-1 rounded border border-gray-200">
                                {prize.probability.toFixed(2)}%
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">調整後</label>
                              <div className={`text-sm font-mono px-2 py-1 rounded border ${
                                prize.adjustedProbability > prize.probability
                                  ? 'text-green-700 bg-green-50 border-green-200'
                                  : prize.adjustedProbability < prize.probability
                                    ? 'text-red-700 bg-red-50 border-red-200'
                                    : 'text-gray-700 bg-white border-gray-200'
                              }`}>
                                {prize.adjustedProbability.toFixed(2)}%
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 調整後殺率的獎項列表 */}
                <div>
                  <div className="text-sm font-semibold text-orange-700 mb-2 flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    調整後殺率 ({profitRate2.toFixed(2)}x)
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {adjustedPrizes2.map((prize, index) => {
                      const isMajor = (product.majorPrizes || ['A賞']).includes(prize.level)
                      return (
                        <div
                          key={index}
                          className={`p-2 rounded-lg border ${isMajor ? 'border-orange-200 bg-orange-50/50' : 'border-gray-200 bg-gray-50'}`}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${getPrizeColor(prize.level)}`}>
                              {prize.level}
                            </span>
                            <span className="text-xs font-medium text-gray-900 flex-1 truncate">{prize.name}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">原始</label>
                              <div className="text-sm font-mono text-gray-700 bg-white px-2 py-1 rounded border border-gray-200">
                                {prize.probability.toFixed(2)}%
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">調整後</label>
                              <div className={`text-sm font-mono px-2 py-1 rounded border ${
                                prize.adjustedProbability > prize.probability
                                  ? 'text-green-700 bg-green-50 border-green-200'
                                  : prize.adjustedProbability < prize.probability
                                    ? 'text-red-700 bg-red-50 border-red-200'
                                    : 'text-gray-700 bg-white border-gray-200'
                              }`}>
                                {prize.adjustedProbability.toFixed(2)}%
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* 關鍵結論 */}
            {results.prizeWithRate1 && results.prizeWithRate2 && (
              <div className={`mb-3 p-3 rounded-lg border ${
                results.prizeWithRate1.level === results.prizeWithRate2.level
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-yellow-50 border-yellow-200'
              }`}>
                <div className="flex items-start gap-2">
                  <svg className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                    results.prizeWithRate1.level === results.prizeWithRate2.level
                      ? 'text-blue-500'
                      : 'text-yellow-600'
                  }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1">
                    <h4 className={`text-xs font-semibold mb-0.5 ${
                      results.prizeWithRate1.level === results.prizeWithRate2.level
                        ? 'text-blue-900'
                        : 'text-yellow-900'
                    }`}>
                      {results.prizeWithRate1.level === results.prizeWithRate2.level
                        ? '獎項一致'
                        : '獎項不同'}
                    </h4>
                    <p className={`text-xs ${
                      results.prizeWithRate1.level === results.prizeWithRate2.level
                        ? 'text-blue-800'
                        : 'text-yellow-800'
                    }`}>
                      {results.prizeWithRate1.level === results.prizeWithRate2.level
                        ? '雖然殺率改變了，但由於隨機數相同，獎項結果相同。這證明了殺率調整不會影響已生成的隨機數。'
                        : '殺率改變導致獎項判定不同，但這不影響哈希驗證。因為 TXID Hash 只基於 Seed:Nonce，與殺率無關。玩家驗證時，只要 Seed 和 Nonce 正確，Hash 就會一致。'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 驗證流程視覺化 */}
            <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-200">
              <h4 className="text-base font-semibold text-neutral-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                驗證流程時間軸
              </h4>
              
              {/* 時間軸 */}
              <div className="relative pl-8 space-y-4">
                {/* 時間軸線 */}
                <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-blue-300"></div>
                
                {/* 步驟 1: 活動開始 */}
                <div className="relative">
                  <div className="absolute left-[-1.5rem] w-6 h-6 bg-blue-500 rounded-full border-2 border-white shadow-md flex items-center justify-center">
                    <span className="text-xs font-bold text-white">1</span>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-blue-200 shadow-sm">
                    <div className="text-sm font-semibold text-blue-700 mb-1">活動開始</div>
                    <div className="text-xs text-gray-600">系統公布 TXID Hash</div>
                    <code className="text-xs font-mono bg-blue-50 px-2 py-1 rounded mt-1 inline-block">{publishedHash.substring(0, 20)}...</code>
                  </div>
                </div>
                
                {/* 步驟 2: 抽獎過程 */}
                <div className="relative">
                  <div className="absolute left-[-1.5rem] w-6 h-6 bg-orange-500 rounded-full border-2 border-white shadow-md flex items-center justify-center">
                    <span className="text-xs font-bold text-white">2</span>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-orange-200 shadow-sm">
                    <div className="text-sm font-semibold text-orange-700 mb-1">抽獎過程</div>
                    <div className="text-xs text-gray-600">管理員調整殺率：{profitRate1.toFixed(2)}x → {profitRate2.toFixed(2)}x</div>
                    <div className="text-xs text-green-600 mt-1">✓ Hash 不受影響</div>
                  </div>
                </div>
                
                {/* 步驟 3: 活動結束 */}
                <div className="relative">
                  <div className="absolute left-[-1.5rem] w-6 h-6 bg-green-500 rounded-full border-2 border-white shadow-md flex items-center justify-center">
                    <span className="text-xs font-bold text-white">3</span>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-green-200 shadow-sm">
                    <div className="text-sm font-semibold text-green-700 mb-1">活動結束</div>
                    <div className="text-xs text-gray-600">系統公布 Seed</div>
                    {seed ? (
                      <code className="text-xs font-mono bg-green-50 px-2 py-1 rounded mt-1 inline-block">{seed.substring(0, 20)}...</code>
                    ) : (
                      <span className="text-xs text-gray-400 italic">（執行驗證時自動公布）</span>
                    )}
                  </div>
                </div>
                
                {/* 步驟 4: 驗證 */}
                <div className="relative">
                  <div className={`absolute left-[-1.5rem] w-6 h-6 rounded-full border-2 border-white shadow-md flex items-center justify-center ${
                    results ? (results.hashMatch ? 'bg-green-500' : 'bg-red-500') : 'bg-purple-500'
                  }`}>
                    {results ? (
                      <span className="text-xs font-bold text-white">{results.hashMatch ? '✓' : '✗'}</span>
                    ) : (
                      <span className="text-xs font-bold text-white">4</span>
                    )}
                  </div>
                  <div className={`bg-white rounded-lg p-3 border-2 shadow-sm ${
                    results ? (results.hashMatch ? 'border-green-300' : 'border-red-300') : 'border-purple-200'
                  }`}>
                    <div className={`text-sm font-semibold mb-1 ${
                      results ? (results.hashMatch ? 'text-green-700' : 'text-red-700') : 'text-purple-700'
                    }`}>
                      {results ? (results.hashMatch ? '✓ 驗證成功' : '✗ 驗證失敗') : '玩家驗證'}
                    </div>
                    <div className="text-xs text-gray-600">
                      {results 
                        ? (results.hashMatch 
                          ? '使用 Seed、Nonce 和 Hash 驗證，結果一致'
                          : 'Hash 不一致，請檢查參數')
                        : `使用 Seed、Nonce (${nonce}) 和 Hash 進行驗證`}
                    </div>
                    {results && results.hashMatch && (
                      <div className="text-xs text-green-600 font-medium mt-1">
                        ✓ 證明：即使殺率改變，Hash 仍然一致，系統公平可靠
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
