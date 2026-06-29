'use client'

import AdminLayout from '@/components/AdminLayout'
import Modal from '@/components/Modal'
import { type Product } from '@/types/product'
import { generateTXID, calculateTXIDHash, generateRandomValue, determinePrize } from '@/utils/drawLogicClient'
import { useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

interface DrawRecord {
  id: number
  productId: number
  userId: string
  prizeLevel: string
  ticketNumber: number
  nonce: number
  txidHash: string
  profitRate?: number
  randomValue?: number
  createdAt: string
  drawId: string
  prize: string
  userName?: string
  time?: string
}

function isLastOneLevel(level: string) {
  if (!level) return false
  const l = level.toLowerCase()
  return l.includes('last one') || level.includes('最後賞')
}

function getProductPrizeStats(product: Product, draws: DrawRecord[]) {
  const stats: Record<string, { total: number; drawn: number; remaining: number }> = {}
  if (product && product.prizes) {
    const nonLastPrizes = product.prizes.filter(p => !isLastOneLevel(p.level))
    const nonLastTotal = nonLastPrizes.reduce(
      (sum, p) => sum + (typeof p.total === 'number' ? p.total : 0),
      0
    )
    const nonLastDrawn = draws.filter(d => !isLastOneLevel(d.prizeLevel)).length
    const isLastPrizeDrawn = nonLastTotal > 0 && nonLastDrawn >= nonLastTotal

    product.prizes.forEach(p => {
      const level = p.level
      const total = typeof p.total === 'number' ? p.total : 0
      const isLast = isLastOneLevel(level)
      let drawn: number
      let remaining: number

      if (isLast) {
        drawn = isLastPrizeDrawn ? total : 0
        remaining = isLastPrizeDrawn ? 0 : total
      } else {
        drawn = draws.filter(d => d.prizeLevel === level).length
        remaining = Math.max(total - drawn, 0)
      }

      stats[level] = {
        total,
        drawn,
        remaining
      }
    })
  }
  return stats
}

// Helper to get seed
function getProductSeed(product: Product): string {
  return product.seed || ''
}

function mapProductPrize(p: any) {
  const level = p.level ?? p.prize_level ?? ''
  const total = typeof p.total === 'number' ? p.total : (typeof p.quantity === 'number' ? p.quantity : 0)
  const remainingRaw = p.remaining ?? p.remaining_quantity
  const remaining = typeof remainingRaw === 'number' ? remainingRaw : total
  return {
    id: p.id,
    level,
    name: p.name,
    quantity: total,
    remaining,
    probability: typeof p.probability === 'number' ? p.probability : 0,
    imageUrl: p.image_url,
    total
  }
}

// 計算調整後的獎項機率（用於驗證）
function calculateAdjustedPrizes(product: Product, profitRate: number) {
  const majorPrizeLevels = product.majorPrizes || ['A賞']
  const majorPrizes = product.prizes.filter(p => majorPrizeLevels.includes(p.level))
  const minorPrizes = product.prizes.filter(p => !majorPrizeLevels.includes(p.level))
  
  const majorOriginalTotal = majorPrizes.reduce((sum, p) => sum + p.probability, 0)
  const minorOriginalTotal = minorPrizes.reduce((sum, p) => sum + p.probability, 0)
  
  const majorAdjustedTotal = majorOriginalTotal * profitRate
  const minorAdjustedTotal = Math.max(0, 100 - majorAdjustedTotal)
  
  const minorAdjustmentFactor = minorOriginalTotal > 0 
    ? minorAdjustedTotal / minorOriginalTotal 
    : 1.0
  
  return product.prizes.map(prize => {
    const isMajor = majorPrizeLevels.includes(prize.level)
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

export default function ProductVerifyPage() {
  const params = useParams()
  const productId = params.id as string
  
  const [product, setProduct] = useState<Product | null>(null)
  const [draws, setDraws] = useState<DrawRecord[]>([])
  const [verificationCode, setVerificationCode] = useState('')
  const [hashMatch, setHashMatch] = useState<boolean | null>(null)
  const [verificationResult, setVerificationResult] = useState<string>('')
  const [verificationResults, setVerificationResults] = useState<Array<{
    nonce: number
    drawId: string
    actualPrize: string
    calculatedPrize: string
    match: boolean
    randomValue: number
  }>>([])
  const [isVerifying, setIsVerifying] = useState(false)
  const [isCodeExpanded, setIsCodeExpanded] = useState(false)
  const [isResultsModalOpen, setIsResultsModalOpen] = useState(false)
  const [isDistributionExpanded, setIsDistributionExpanded] = useState(false)
  const [isPrizeDistributionExpanded, setIsPrizeDistributionExpanded] = useState(false)

  useEffect(() => {
    const logVisit = async () => {
      try {
        await fetch('/api/stats/visit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            page_path: `/products/${productId}/verify`,
            user_agent: navigator.userAgent
          })
        })
      } catch (e) {
        console.error('Failed to log visit:', e)
      }
    }
    logVisit()
  }, [productId])

  useEffect(() => {
    const fetchData = async () => {
      if (!productId) return

      try {
        // Fetch product with prizes
        const { data: productData, error: productError } = await supabase
          .from('products')
          .select(`
            *,
            prizes:product_prizes(*)
          `)
          .eq('id', productId)
          .single()

        if (productError) throw productError

        if (productData) {
          // Map database columns to Product type
          const formattedProduct: Product = {
            id: productData.id,
            productCode: productData.product_code || '',
            name: productData.name,
            category: productData.category || '一番賞',
            price: productData.price,
            remaining: productData.remaining || 0,
            sales: productData.sales || 0,
            isHot: productData.is_hot || false,
            totalCount: productData.total_count,
            status: productData.status,
            imageUrl: productData.image_url,
            createdAt: productData.created_at,
            endedAt: productData.ended_at,
            seed: productData.seed,
            txidHash: productData.txid_hash,
            majorPrizes: productData.major_prizes,
            prizes: (productData.prizes || [])
              .map((p: any) => mapProductPrize(p))
              .sort((a: any, b: any) => (a.level || '').localeCompare(b.level || ''))
          }
          setProduct(formattedProduct)
        }

        // Fetch draw records
        const { data: drawsData, error: drawsError } = await supabase
          .from('draw_records')
          .select(`
            *,
            user:users (id, name, email)
          `)
          .eq('product_id', productId)
          .order('ticket_number', { ascending: true })

        if (drawsError) throw drawsError

        if (drawsData) {
          const formattedDraws: DrawRecord[] = drawsData.map((d: any) => ({
            id: d.id,
            productId: d.product_id,
            userId: d.user?.id || d.user_id,
            prizeLevel: d.prize_level,
            ticketNumber: d.ticket_number,
            nonce: d.txid_nonce,
            txidHash: d.txid_hash,
            profitRate: d.profit_rate,
            randomValue: d.random_value,
            createdAt: d.created_at,
            drawId: d.id.toString(),
            prize: `${d.prize_level}賞`,
            userName: d.user?.name || d.user?.email || '',
            time: d.created_at
          }))
          setDraws(formattedDraws)
        }

      } catch (error) {
        console.error('Error fetching data:', error)
      }
    }

    fetchData()
  }, [productId])

  // 生成驗證程式碼
  useEffect(() => {
    if (!product || !product.txidHash) return
    
    const seed = getProductSeed(product)
    if (!seed) return

    const code = `// 公平性驗證程式碼
// 請填入本平台提供的 Seed 值並填入在單引號內
const seed = '${seed}';

// 總共幾個大賞
const majorPrizeCount = ${product.prizes.filter(p => (product.majorPrizes || ['A賞']).includes(p.level)).length};

// 總共幾個籤數（總抽獎次數）
const totalDraws = ${draws.length};

// 商品總數
const totalCount = ${product.totalCount || product.prizes.reduce((sum, p) => sum + p.total, 0)};

// 大獎等級列表
const majorPrizeLevels = ${JSON.stringify(product.majorPrizes || ['A賞'])};

// 獎項列表（包含機率）
const prizes = ${JSON.stringify(product.prizes.map(p => ({
  level: p.level,
  name: p.name,
  probability: p.probability,
  total: p.total
})))};

// 驗證函數
async function verifyDraws() {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    throw new Error('Web Crypto API 不可用');
  }

  const results = [];
  
  // 對每個抽獎進行驗證
  for (let nonce = 1; nonce <= totalDraws; nonce++) {
    // 生成 TXID
    const txid = { seed, nonce };
    
    // 計算隨機數
    const encoder = new TextEncoder();
    const keyData = encoder.encode(seed);
    const messageData = encoder.encode(nonce.toString());
    
    const key = await window.crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await window.crypto.subtle.sign('HMAC', key, messageData);
    const hashArray = Array.from(new Uint8Array(signature));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    const hexValue = hashHex.substring(0, 16);
    const decimalValue = parseInt(hexValue, 16);
    const maxHexValue = parseInt('ffffffffffffffff', 16);
    const randomValue = decimalValue / maxHexValue;
    
    // 根據機率決定獎項
    let cumulativeProbability = 0;
    let selectedPrize = null;
    for (const prize of prizes) {
      cumulativeProbability += prize.probability / 100;
      if (randomValue <= cumulativeProbability) {
        selectedPrize = prize;
        break;
      }
    }
    
    results.push({
      nonce,
      randomValue,
      prize: selectedPrize ? \`\${selectedPrize.level} \${selectedPrize.name}\` : '未知'
    });
  }
  
  return results;
}

// 執行驗證
verifyDraws().then(results => {
  console.log('驗證結果:', results);
  // 這裡可以比對實際抽獎記錄
}).catch(err => {
  console.error('驗證失敗:', err);
});`

    setVerificationCode(code)
  }, [product, draws])

  // 獲取商品的 Seed
  const getProductSeed = (product: Product): string | null => {
    return product.seed || null
  }

  // 驗證 TXID Hash 與 TXID 是否一致
  const handleVerifyHash = async () => {
    if (!product) {
      alert('商品資料不完整，無法驗證')
      return
    }

    const seed = getProductSeed(product)
    if (!seed) {
      alert('無法獲取 Seed，無法驗證。請確保商品已完抽或使用測試模式。')
      return
    }

    // 使用第一個抽獎記錄（ticketNumber=1）的 txidHash 進行驗證
    // 如果沒有抽獎記錄，使用 product.txidHash（但這可能只是測試資料）
    const firstDraw = draws.find(d => (d.ticketNumber || d.nonce) === 1) || (draws.length > 0 ? draws[0] : null)
    const expectedHash = firstDraw?.txidHash || product.txidHash
    
    if (!expectedHash) {
      alert('沒有可用的 TXID Hash 進行驗證')
      return
    }

    try {
      // 使用第一個抽獎的 nonce/ticketNumber（如果有的話），否則使用 1
      const nonce = firstDraw?.ticketNumber || firstDraw?.nonce || 1
      const txid = generateTXID(seed, nonce)
      const calculatedHash = await calculateTXIDHash(txid)
      const match = calculatedHash === expectedHash
      
      setHashMatch(match)
      setVerificationResult(match 
        ? '✓ 驗證成功：TXID Hash 與 TXID 一致，抽獎結果公平可信'
        : '✗ 驗證失敗：TXID Hash 與 TXID 不一致，請檢查資料')
    } catch (error) {
      console.error('驗證錯誤:', error)
      alert('驗證失敗：' + (error instanceof Error ? error.message : '未知錯誤'))
    }
  }

  // 驗證所有抽獎記錄
  const handleVerifyAllDraws = async () => {
    if (!product || draws.length === 0) {
      alert('沒有抽獎記錄可驗證')
      return
    }

    const seed = getProductSeed(product)
    if (!seed) {
      alert('無法獲取 Seed，無法驗證。請確保商品已完抽或使用測試模式。')
      return
    }

    setIsVerifying(true)
    const results: Array<{
      nonce: number
      drawId: string
      actualPrize: string
      calculatedPrize: string
      match: boolean
      randomValue: number
    }> = []

    try {
      // 追蹤每個獎項的已生成數量（用於模擬生成時的狀態）
      const prizeCounts: { [level: string]: number } = {}
      product.prizes.forEach(prize => {
        prizeCounts[prize.level] = 0
      })
      
      // 按 nonce/ticketNumber 排序抽獎記錄（與生成順序一致）
      // 生成時完抽商品是按 ticketNumber 從 1 到 totalCount 順序生成的
      const sortedDraws = [...draws].sort((a, b) => {
        const nonceA = a.ticketNumber || a.nonce || 0
        const nonceB = b.ticketNumber || b.nonce || 0
        return nonceA - nonceB
      })
      
      // 對每個抽獎記錄進行驗證
      for (const draw of sortedDraws) {
        try {
          // 使用記錄的殺率值（如果沒有記錄，使用默認值 1.0）
          const profitRate = draw.profitRate ?? 1.0
          
          // 計算調整後的獎項機率（使用記錄的殺率值）
          const adjustedPrizes = calculateAdjustedPrizes(product, profitRate)
          
          // 過濾出還未達到目標數量的獎項（與生成邏輯一致）
          const availablePrizes = adjustedPrizes.filter(prize => {
            const targetCount = product.prizes.find(p => p.level === prize.level)?.total || 0
            const currentCount = prizeCounts[prize.level] || 0
            return currentCount < targetCount
          })
          
          // 如果所有獎項都達到目標，使用所有獎項（不應該發生，但以防萬一）
          const prizesToUse = availablePrizes.length > 0 ? availablePrizes : adjustedPrizes
          
          // 正規化機率（確保總和為 100%）
          const totalProbability = prizesToUse.reduce((sum, p) => sum + p.adjustedProbability, 0)
          const normalizedPrizes = prizesToUse.map(p => ({
            level: p.level,
            name: p.name,
            probability: totalProbability > 0 ? (p.adjustedProbability / totalProbability) * 100 : 0
          }))
          
          // 生成 TXID（使用 ticketNumber 或 nonce，與生成邏輯一致）
          const nonce = draw.ticketNumber || draw.nonce
          const txid = generateTXID(seed, nonce)
          
          // 計算隨機數
          const randomValue = await generateRandomValue(txid)
          
          // 根據隨機數決定獎項
          const calculatedPrize = determinePrize(randomValue, normalizedPrizes)
          const calculatedPrizeStr = `${calculatedPrize.level} ${calculatedPrize.name}`
          
          // 更新獎項計數（模擬生成時的狀態）
          const actualPrizeLevel = draw.prize.split(' ')[0] || draw.prize
          prizeCounts[actualPrizeLevel] = (prizeCounts[actualPrizeLevel] || 0) + 1
          
          // 比對實際獎項與計算獎項
          const calculatedPrizeLevel = calculatedPrize.level
          const match = actualPrizeLevel === calculatedPrizeLevel

          results.push({
            nonce: nonce,
            drawId: draw.drawId,
            actualPrize: draw.prize,
            calculatedPrize: calculatedPrizeStr,
            match,
            randomValue
          })
        } catch (error) {
          console.error(`驗證抽獎 ${draw.drawId} 失敗:`, error)
          results.push({
            nonce: draw.nonce,
            drawId: draw.drawId,
            actualPrize: draw.prize,
            calculatedPrize: '驗證失敗',
            match: false,
            randomValue: 0
          })
        }
      }

      setVerificationResults(results)
      // 驗證完成後自動打開彈窗
      if (results.length > 0) {
        setIsResultsModalOpen(true)
      }
    } catch (error) {
      console.error('驗證錯誤:', error)
      alert('驗證失敗：' + (error instanceof Error ? error.message : '未知錯誤'))
    } finally {
      setIsVerifying(false)
    }
  }

  // 為不同獎項等級定義顏色（用於網格和表格）
  const getGridPrizeColor = (level: string) => {
    const levelMap: { [key: string]: { bg: string, text: string } } = {
      'A賞': { bg: 'bg-yellow-400', text: 'text-yellow-900' },
      'B賞': { bg: 'bg-gray-400', text: 'text-gray-900' },
      'C賞': { bg: 'bg-amber-700', text: 'text-amber-50' },
      'D賞': { bg: 'bg-blue-500', text: 'text-blue-900' },
      'E賞': { bg: 'bg-green-500', text: 'text-green-900' },
      'F賞': { bg: 'bg-pink-500', text: 'text-pink-900' },
      'G賞': { bg: 'bg-purple-500', text: 'text-purple-900' },
      'H賞': { bg: 'bg-red-500', text: 'text-red-900' },
      'I賞': { bg: 'bg-orange-500', text: 'text-orange-900' },
      'J賞': { bg: 'bg-red-600', text: 'text-red-50' },
    }
    return levelMap[level] || { bg: 'bg-gray-300', text: 'text-gray-900' }
  }

  if (!product) {
    return (
      <AdminLayout 
        pageTitle="公平性驗證"
        breadcrumbs={[
          { label: '商品管理', href: '/products' },
          { label: '公平性驗證', href: undefined }
        ]}
      >
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">載入中...</p>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout 
      pageTitle="公平性驗證"
      breadcrumbs={[
        { label: '商品管理', href: '/products' },
        { label: product.name, href: `/products/${product.id}` },
        { label: '公平性驗證', href: undefined }
      ]}
    >
      <div className="space-y-6">
        {/* 商品資訊 */}
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-4">
          <h2 className="text-lg font-semibold text-neutral-900 mb-2">{product.name}</h2>
          <div className="text-sm text-gray-600">
            <p>商品編號：{product.productCode}</p>
            <p>狀態：{product.status === 'ended' ? '已完抽' : product.status === 'active' ? '進行中' : '待上架'}</p>
            {product.endedAt && <p>結束時間：{product.endedAt}</p>}
          </div>
        </div>

        {/* 公平性驗證工具 */}
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-neutral-900">公平性驗證</h2>
          </div>

          <p className="text-sm text-gray-600 mb-6">
            請輸入抽獎相關參數進行公平性驗證，確保抽獎結果的透明度和公正性。
          </p>

          {/* 第三方驗證工具 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              第三方驗證工具：
            </label>
            <a
              href="https://emn178.github.io/online-tools/sha256.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              前往 SHA256 哈希驗證工具
            </a>
            <p className="text-xs text-gray-600 mt-2">
              可使用此工具驗證 TXID 與 TXID Hash 是否一致，確保抽獎結果的公平性（TXID 會在抽獎結束後公開）
            </p>
          </div>

          {/* 隨機種子 (TXID) */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              隨機種子 (TXID)
            </label>
            {(() => {
              const seed = getProductSeed(product)
              if (seed) {
                return (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-3 py-2 bg-gray-50 border-2 border-gray-200 rounded-lg text-sm font-mono text-gray-700 break-all">
                      {seed}
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(seed)
                          alert('Seed 已複製到剪貼板')
                        } catch (e) {
                          console.error('複製失敗:', e)
                        }
                      }}
                      className="px-3 py-2 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 transition-colors text-sm font-medium whitespace-nowrap"
                    >
                      複製
                    </button>
                  </div>
                )
              } else {
                return (
                  <div className="px-3 py-2 bg-gray-50 border-2 border-gray-200 rounded-lg text-sm text-gray-500">
                    完抽後公布
                  </div>
                )
              }
            })()}
          </div>

          {/* 隨機種子哈希值 (TXID Hash) */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              隨機種子哈希值 (TXID Hash)
            </label>
            {product.txidHash ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2 bg-gray-50 border-2 border-gray-200 rounded-lg text-sm font-mono text-gray-700 break-all">
                  {product.txidHash}
                </div>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(product.txidHash || '')
                      alert('TXID Hash 已複製到剪貼板')
                    } catch (e) {
                      console.error('複製失敗:', e)
                    }
                  }}
                  className="px-3 py-2 bg-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-300 transition-colors text-sm font-medium whitespace-nowrap"
                >
                  複製
                </button>
              </div>
            ) : (
              <div className="px-3 py-2 bg-gray-50 border-2 border-gray-200 rounded-lg text-sm text-gray-500">
                尚未生成（當商品上架且開賣時自動生成）
              </div>
            )}
          </div>

          {/* 驗證按鈕 */}
          {product.txidHash && (
            <div className="mb-6 space-y-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleVerifyHash}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:bg-gray-400 disabled:cursor-not-allowed disabled:hover:bg-gray-400 disabled:opacity-60 disabled:transition-none"
                  disabled={product.status === 'active' || (!product.seed && product.status !== 'ended')}
                >
                  驗證 TXID Hash
                </button>
                {draws.length > 0 && (
                  <button
                    onClick={handleVerifyAllDraws}
                    className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:bg-gray-400 disabled:cursor-not-allowed disabled:hover:bg-gray-400 disabled:opacity-60 disabled:transition-none"
                    disabled={isVerifying || product.status === 'active' || (!product.seed && product.status !== 'ended')}
                  >
                    {isVerifying ? '驗證中...' : '驗證所有抽獎記錄'}
                  </button>
                )}
              </div>
              {hashMatch !== null && (
                <div className={`p-4 rounded-lg ${
                  hashMatch ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                }`}>
                  <p className={`text-sm font-medium ${
                    hashMatch ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {verificationResult}
                  </p>
                </div>
              )}
              {/* 驗證結果簡要統計 */}
              {verificationResults.length > 0 && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="text-sm">
                        <span className="text-gray-600">總計：</span>
                        <span className="font-semibold text-gray-900 ml-1">{verificationResults.length}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-gray-600">通過：</span>
                        <span className="font-semibold text-green-600 ml-1">
                          {verificationResults.filter(r => r.match).length}
                        </span>
                      </div>
                      <div className="text-sm">
                        <span className="text-gray-600">失敗：</span>
                        <span className="font-semibold text-red-500 ml-1">
                          {verificationResults.filter(r => !r.match).length}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsResultsModalOpen(true)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                    >
                      查看詳細結果
                    </button>
                  </div>
                </div>
              )}
              {product.status === 'active' && (
                <p className="text-xs text-gray-500">
                  提示：活動進行中，驗證功能將在活動結束後開放。活動結束後會公布 Seed，屆時可進行完整驗證。
                </p>
              )}
              {product.status !== 'active' && !product.seed && product.status !== 'ended' && (
                <p className="text-xs text-gray-500">
                  提示：活動結束後才會公布 Seed，屆時可進行完整驗證。目前使用模擬 Seed 進行測試驗證。
                </p>
              )}
            </div>
          )}

          {/* 驗證參數 */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                大賞數量
              </label>
              <div className="px-3 py-2 bg-gray-50 border-2 border-gray-200 rounded-lg text-sm font-mono text-gray-700">
                {product.prizes.filter(p => (product.majorPrizes || ['A賞']).includes(p.level)).length}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                總抽獎次數
              </label>
              <div className="px-3 py-2 bg-gray-50 border-2 border-gray-200 rounded-lg text-sm font-mono text-gray-700">
                {draws.length}
              </div>
            </div>
          </div>
        </div>

        {product.txidHash && verificationCode && (
          <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
            <h3 className="text-base font-semibold text-neutral-900 mb-2">驗證程式碼</h3>
            <p className="text-sm text-gray-600 mb-4">
              以下是用於驗證抽獎結果的完整程式碼，您可以複製到任何 JavaScript 環境中執行以驗證結果：
            </p>
            <div className="relative">
              <pre className={`bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-xs font-mono ${
                !isCodeExpanded ? 'max-h-64 overflow-y-hidden' : ''
              }`}>
                <code>{verificationCode}</code>
              </pre>
              {!isCodeExpanded && (
                <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-gray-900 to-transparent pointer-events-none rounded-b-lg"></div>
              )}
              <div className="absolute top-4 right-4 flex items-center gap-2">
                <a
                  href="https://emn178.github.io/online-tools/sha256.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium inline-flex items-center gap-1.5"
                  title="前往 SHA256 哈希驗證工具"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  第三方驗證
                </a>
                <button
                  onClick={() => setIsCodeExpanded(!isCodeExpanded)}
                  className="px-3 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm font-medium"
                >
                  {isCodeExpanded ? '收起' : '展開全部'}
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(verificationCode)
                    alert('程式碼已複製到剪貼板')
                  }}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  複製程式碼
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
          <h3 className="text-base font-semibold text-neutral-900 mb-2">公平性資訊總覽</h3>
          <p className="text-sm text-gray-600 mb-4">
            快速檢視此商品目前對外公布的公平性關鍵資料，方便客服與自我檢查。
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
            <div>
              <div className="text-xs text-gray-500 mb-1">前台公平性驗證路徑</div>
              <div className="px-3 py-2 bg-gray-50 border-2 border-gray-200 rounded-lg font-mono break-all text-xs">
                /fairness/{product.id}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">目前 TXID Hash（商品級）</div>
              <div className="px-3 py-2 bg-gray-50 border-2 border-gray-200 rounded-lg font-mono break-all text-xs">
                {product.txidHash || '尚未生成'}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Seed</div>
              <div className="px-3 py-2 bg-gray-50 border-2 border-gray-200 rounded-lg font-mono break-all text-xs">
                {product.seed || '完抽後公布'}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">狀態</div>
              <div className="px-3 py-2 bg-gray-50 border-2 border-gray-200 rounded-lg text-xs">
                {product.status === 'ended'
                  ? '已完抽'
                  : product.status === 'active'
                    ? '進行中'
                    : '待上架'}
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            提示：前台玩家可在「公平性驗證」頁面透過 Seed Hash、TXID Hash 與自身抽獎紀錄完成第三方驗證。
          </p>
        </div>

        {/* 驗證結果彈窗 */}
        <Modal
          isOpen={isResultsModalOpen}
          onClose={() => setIsResultsModalOpen(false)}
          title="驗證結果"
          size="xl"
        >
          {verificationResults.length > 0 && (
            <>
              <div className="mb-4 flex items-center gap-4">
                <div className="text-sm">
                  <span className="text-gray-600">總計：</span>
                  <span className="font-semibold text-gray-900 ml-1">{verificationResults.length}</span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-600">通過：</span>
                  <span className="font-semibold text-green-600 ml-1">
                    {verificationResults.filter(r => r.match).length}
                  </span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-600">失敗：</span>
                  <span className="font-semibold text-red-500 ml-1">
                    {verificationResults.filter(r => !r.match).length}
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 font-medium text-gray-700">Nonce</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">抽獎編號</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">實際獎項</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">計算獎項</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">隨機數</th>
                      <th className="text-left py-2 px-3 font-medium text-gray-700">結果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {verificationResults.map((result, index) => (
                      <tr 
                        key={index} 
                        className={`border-b border-gray-100 ${
                          result.match ? 'bg-green-50' : 'bg-red-50'
                        }`}
                      >
                        <td className="py-2 px-3 font-mono text-gray-700">{result.nonce}</td>
                        <td className="py-2 px-3 font-mono text-gray-700">{result.drawId}</td>
                        <td className="py-2 px-3 text-gray-700">{result.actualPrize}</td>
                        <td className="py-2 px-3 text-gray-700">{result.calculatedPrize}</td>
                        <td className="py-2 px-3 font-mono text-gray-600 text-xs">
                          {result.randomValue.toFixed(6)}
                        </td>
                        <td className="py-2 px-3">
                          {result.match ? (
                            <span className="text-green-600 font-medium">✓ 通過</span>
                          ) : (
                            <span className="text-red-500 font-medium">✗ 失敗</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Modal>

        {/* 抽獎結果分布 */}
        {draws.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-neutral-900">抽獎結果分布</h3>
                <p className="text-sm text-gray-500 mt-1">（僅供查詢，無法操作）</p>
              </div>
              <button
                onClick={() => setIsDistributionExpanded(!isDistributionExpanded)}
                className="px-3 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm font-medium"
              >
                {isDistributionExpanded ? '收起' : '展開全部'}
              </button>
            </div>
            
            {/* 統計資訊 - 從實際抽獎記錄計算 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-6">
              {product.prizes.map((prize, index) => {
                const stats = getProductPrizeStats(product, draws)
                const prizeKey = prize.level || String(index)
                const prizeStats = stats[prize.level] || { total: prize.total, drawn: 0, remaining: prize.total }
                
                return (
                  <div key={prizeKey} className="bg-gray-50 rounded-lg p-3">
                    <div className="text-sm font-medium text-gray-700 mb-1">{prize.level}</div>
                    <div className="text-sm text-gray-900">
                      <span className="text-lg font-bold">{prizeStats.remaining}/{prizeStats.total}</span>
                      <span className="text-xs text-gray-500 ml-1">(已抽：{prizeStats.drawn} 個)</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 抽獎記錄列表和網格 - 可展開/收起 */}
            <div className="relative">
              <div className={`${!isDistributionExpanded ? 'max-h-96 overflow-y-hidden' : ''}`}>
                {/* 抽獎記錄列表 */}
                <div className="overflow-x-auto mb-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 px-3 font-medium text-gray-700">序號</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">抽獎編號</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">籤號</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">使用者</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">獎項</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700">時間</th>
                      </tr>
                    </thead>
                    <tbody>
                      {draws.map((draw, index) => {
                        const ticketNumber = draw.ticketNumber || draw.nonce
                        
                        return (
                          <tr key={draw.id} className="border-b border-gray-100">
                            <td className="py-2 px-3 text-gray-600 align-middle">{index + 1}</td>
                            <td className="py-2 px-3 font-mono text-gray-700 align-middle">{draw.drawId}</td>
                            <td className="py-2 px-3 align-middle">
                              <span className="inline-flex items-center justify-center font-mono bg-blue-50 px-2 py-1 rounded text-gray-700 w-[3.5rem]">
                                {ticketNumber.toString().padStart(3, '0')}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-gray-700 align-middle">{draw.userName}</td>
                            <td className="py-2 px-3 text-gray-700 align-middle">{draw.prize}</td>
                            <td className="py-2 px-3 text-gray-600 align-middle font-mono">{draw.time}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              {!isDistributionExpanded && (
                <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-white to-transparent pointer-events-none rounded-b-lg"></div>
              )}
            </div>
          </div>
        )}

        {/* 各賞分布網格 - 獨立卡片 */}
        {draws.length > 0 && product && (() => {
          const productDraws = draws
          const soldTickets = new Set(productDraws.map(d => d.ticketNumber || d.nonce))
          // 使用商品的實際總數量
          const totalTickets = product.totalCount || product.prizes.reduce((sum, p) => sum + p.total, 0)
          const soldCount = soldTickets.size
          const availableCount = totalTickets - soldCount
          
          // 根據總數決定桌面端每排顯示數量：<=200 用10列，>200 用20列
          const desktopCols = totalTickets <= 200 ? 10 : 20
          
          // 建立籤號到抽獎記錄的映射
          const ticketToDrawMap = new Map<number, typeof draws[0]>()
          productDraws.forEach(draw => {
            const ticketNum = draw.ticketNumber || draw.nonce
            ticketToDrawMap.set(ticketNum, draw)
          })
          
          // 響應式網格類別：手機/平板固定10列，桌面根據總數決定
          const gridColsClass = desktopCols === 20 
            ? 'grid-cols-10 lg:grid-cols-20' 
            : 'grid-cols-10'
          
          return (
            <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold text-neutral-900">各賞分布如下</h3>
                  <p className="text-sm text-gray-500 mt-1">（僅供查詢，無法操作）</p>
                </div>
                <button
                  onClick={() => setIsPrizeDistributionExpanded(!isPrizeDistributionExpanded)}
                  className="px-3 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm font-medium"
                >
                  {isPrizeDistributionExpanded ? '收起' : '展開全部'}
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-4 text-sm justify-center">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-blue-500 rounded"></div>
                    <span className="text-gray-700">可用：{availableCount} 個</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-gray-300 rounded"></div>
                    <span className="text-gray-700">已售：{soldCount} 個</span>
                  </div>
                </div>
                <div className="relative">
                  <div className={`${!isPrizeDistributionExpanded ? 'max-h-96 overflow-y-hidden' : ''}`}>
                    <div className={`grid gap-1.5 ${gridColsClass} w-full`}>
                      {Array.from({ length: totalTickets }, (_, i) => i + 1).map(ticketNumber => {
                        const isSold = soldTickets.has(ticketNumber)
                        const drawRecord = ticketToDrawMap.get(ticketNumber)
                        
                        // 提取賞號（獎項等級）
                        const prizeLevel = drawRecord ? (drawRecord.prize.split(' ')[0] || drawRecord.prize) : ''
                        
                        const tooltip = drawRecord
                          ? `籤號：${ticketNumber.toString().padStart(3, '0')} - ${drawRecord.prize} - ${drawRecord.userName} - ${drawRecord.time}`
                          : isSold
                          ? `籤號 ${ticketNumber.toString().padStart(3, '0')} 已售`
                          : `籤號 ${ticketNumber.toString().padStart(3, '0')} 可用`
                        
                        return (
                          <div
                            key={ticketNumber}
                            className={`p-1.5 rounded text-center text-xs font-medium flex flex-col justify-center items-center min-h-[3rem] ${
                              isSold
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-blue-500 text-white'
                            }`}
                            title={tooltip}
                          >
                            <div className="leading-tight">{ticketNumber.toString().padStart(3, '0')}</div>
                            <div className="text-[10px] leading-tight mt-0.5 min-h-[0.875rem]">
                              {isSold && prizeLevel ? prizeLevel : '\u00A0'}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  {!isPrizeDistributionExpanded && (
                    <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-white to-transparent pointer-events-none rounded-b-lg"></div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}
      </div>
    </AdminLayout>
  )
}
