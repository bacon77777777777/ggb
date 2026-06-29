/**
 * 抽獎邏輯核心函數
 * 實現分離驗證機制：TXID 只包含隨機數種子，不包含機率設定
 */

import crypto from 'crypto'

// ==================== 資料結構定義 ====================

/**
 * TXID 結構：僅包含隨機數種子 (Seed) 與序列 (Nonce)
 */
export interface TXID {
  seed: string        // 隨機數種子（用於生成隨機數序列）
  nonce: number       // 序列號（每次抽獎遞增）
}

/**
 * 抽獎請求參數
 */
export interface DrawRequest {
  userId: string
  productId: number
  seed: string
  nonce: number  // 單次抽獎的 nonce（籤號直接作為 nonce）
  ticketNumber?: number  // 會員選擇的籤號（01-80），如果提供則 nonce = ticketNumber
}

/**
 * 批量抽獎請求參數
 */
export interface BatchDrawRequest {
  userId: string
  productId: number
  seed: string
  ticketNumbers: number[]  // 會員選擇的多個籤號（01-80），每個籤號作為 nonce
}

/**
 * 抽獎結果
 */
export interface DrawResult {
  txid: TXID
  randomValue: number      // 該次抽獎生成的隨機數 (0-1)
  prizeLevel: string        // 中獎等級
  prizeName: string         // 中獎名稱
  txidHash: string          // TXID 的哈希值（用於驗證）
}

/**
 * 驗證結果
 */
export interface VerificationResult {
  txid: TXID
  randomValue: number       // 該次抽獎生成的隨機數
  hashMatch: boolean        // 哈希比對結果
  txidHash: string          // 計算出的哈希值
  expectedHash: string       // 預期的哈希值（從資料庫讀取）
}

// ==================== TXID 生成 ====================

/**
 * 生成 TXID（僅包含 Seed 和 Nonce）
 * @param seed 隨機數種子
 * @param nonce 序列號
 * @returns TXID 物件
 */
export function generateTXID(seed: string, nonce: number): TXID {
  return {
    seed,
    nonce
  }
}

/**
 * 計算 TXID 的哈希值
 * @param txid TXID 物件
 * @returns SHA256 哈希值（十六進制字串）
 */
export function calculateTXIDHash(txid: TXID): string {
  const txidString = `${txid.seed}:${txid.nonce}`
  return crypto.createHash('sha256').update(txidString).digest('hex')
}

// ==================== 隨機數生成 ====================

/**
 * 從 TXID 生成確定性的隨機數（0-1 之間）
 * 使用 HMAC-SHA256 確保確定性
 * @param txid TXID 物件
 * @returns 0-1 之間的隨機數
 */
export function generateRandomValue(txid: TXID): number {
  const hmac = crypto.createHmac('sha256', txid.seed)
  hmac.update(txid.nonce.toString())
  const hash = hmac.digest('hex')
  
  // 將哈希值轉換為 0-1 之間的浮點數
  // 取前 16 位十六進制數字，轉換為 0-1 之間的數值
  const hexValue = hash.substring(0, 16)
  const decimalValue = parseInt(hexValue, 16)
  const maxHexValue = parseInt('ffffffffffffffff', 16)
  
  return decimalValue / maxHexValue
}

// ==================== 抽獎函數 ====================

/**
 * 從資料庫讀取當前殺率參數（概念性函數）
 * 實際實現時需要連接資料庫
 * @param productId 商品ID
 * @returns 當前殺率參數（例如：1.0 = 100%，1.2 = 120%）
 */
async function getCurrentProfitRate(productId: number): Promise<number> {
  // TODO: 實際實現時從資料庫讀取
  // SELECT current_profit_rate FROM product_settings WHERE product_id = ?
  // 如果沒有設定，返回 1.0（100%）
  
  // 概念性實現：從記憶體或資料庫讀取
  // 這裡假設從某個配置或資料庫讀取
  return 1.0 // 預設值
}

/**
 * 從資料庫讀取商品獎項配置（概念性函數）
 */
async function getProductPrizes(productId: number): Promise<Array<{
  level: string
  name: string
  originalProbability: number  // 原始機率（用於實際抽獎）
  displayProbability: number   // 顯示機率（會員看到的機率）
}>> {
  // TODO: 實際實現時從資料庫讀取
  // SELECT level, name, original_probability, display_probability 
  // FROM product_prizes WHERE product_id = ? ORDER BY level
  
  // 概念性實現
  return []
}

/**
 * 根據隨機數和機率設定決定獎項
 * @param randomValue 隨機數 (0-1)
 * @param prizes 獎項配置（已按機率排序）
 * @param profitRate 殺率參數
 * @returns 中獎的獎項
 */
function determinePrize(
  randomValue: number,
  prizes: Array<{ level: string; name: string; originalProbability: number }>,
  profitRate: number
): { level: string; name: string } {
  // 計算累積機率區間（使用原始機率 * 殺率）
  const adjustedProbabilities = prizes.map(prize => ({
    ...prize,
    adjustedProbability: prize.originalProbability * profitRate
  }))
  
  // 正規化機率（確保總和為 100%）
  const totalProbability = adjustedProbabilities.reduce(
    (sum, p) => sum + p.adjustedProbability, 
    0
  )
  
  let cumulativeProbability = 0
  for (const prize of adjustedProbabilities) {
    const normalizedProbability = prize.adjustedProbability / totalProbability
    cumulativeProbability += normalizedProbability
    
    if (randomValue <= cumulativeProbability) {
      return {
        level: prize.level,
        name: prize.name
      }
    }
  }
  
  // 如果沒有匹配（理論上不應該發生），返回最後一個獎項
  const lastPrize = prizes[prizes.length - 1]
  return {
    level: lastPrize.level,
    name: lastPrize.name
  }
}

/**
 * 執行抽獎
 * @param request 抽獎請求
 * @returns 抽獎結果
 */
export async function executeDraw(request: DrawRequest): Promise<DrawResult> {
  // 1. 確定 nonce（如果提供了 ticketNumber，則使用 ticketNumber 作為 nonce）
  const nonce = request.ticketNumber || request.nonce
  
  // 2. 生成 TXID（籤號直接作為 nonce）
  const txid = generateTXID(request.seed, nonce)
  
  // 3. 生成隨機數（從 TXID 確定性生成）
  const randomValue = generateRandomValue(txid)
  
  // 4. 計算 TXID Hash（用於驗證）
  const txidHash = calculateTXIDHash(txid)
  
  // 5. 從資料庫讀取當前殺率參數
  const profitRate = await getCurrentProfitRate(request.productId)
  
  // 6. 從資料庫讀取商品獎項配置
  const prizes = await getProductPrizes(request.productId)
  
  // 7. 根據隨機數和殺率決定獎項
  const prize = determinePrize(randomValue, prizes, profitRate)
  
  return {
    txid,
    randomValue,
    prizeLevel: prize.level,
    prizeName: prize.name,
    txidHash
  }
}

/**
 * 執行批量抽獎（多個籤號）
 * @param request 批量抽獎請求
 * @returns 抽獎結果數組
 */
export async function executeBatchDraw(request: BatchDrawRequest): Promise<DrawResult[]> {
  const results: DrawResult[] = []
  
  // 對每個籤號執行抽獎
  for (const ticketNumber of request.ticketNumbers) {
    const drawRequest: DrawRequest = {
      userId: request.userId,
      productId: request.productId,
      seed: request.seed,
      nonce: ticketNumber,  // 籤號直接作為 nonce
      ticketNumber: ticketNumber
    }
    
    const result = await executeDraw(drawRequest)
    results.push(result)
  }
  
  return results
}

// ==================== 驗證函數 ====================

/**
 * 驗證抽獎結果
 * @param seed 隨機數種子
 * @param nonce 序列號
 * @param expectedHash 預期的哈希值（從資料庫讀取）
 * @returns 驗證結果
 */
export function verifyDraw(
  seed: string,
  nonce: number,
  expectedHash: string
): VerificationResult {
  const txid = generateTXID(seed, nonce)
  const randomValue = generateRandomValue(txid)
  const calculatedHash = calculateTXIDHash(txid)
  const hashMatch = calculatedHash === expectedHash
  
  return {
    txid,
    randomValue,
    hashMatch,
    txidHash: calculatedHash,
    expectedHash
  }
}

// ==================== 輔助函數 ====================

/**
 * 初始化抽獎活動（生成初始 Seed）
 * @returns 隨機種子字串
 */
export function initializeDrawSession(): string {
  // 生成一個安全的隨機種子（32 字節 = 256 位）
  return crypto.randomBytes(32).toString('hex')
}
