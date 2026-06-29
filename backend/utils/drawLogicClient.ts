/**
 * 客戶端抽獎邏輯函數（瀏覽器環境）
 * 用於前端驗證和測試
 */

// ==================== TXID 生成 ====================

export interface TXID {
  seed: string
  nonce: number
}

/**
 * 生成 TXID
 */
export function generateTXID(seed: string, nonce: number): TXID {
  return {
    seed,
    nonce
  }
}

/**
 * 計算 TXID 的 SHA256 哈希值（瀏覽器環境，單次抽獎用）
 */
export async function calculateTXIDHash(txid: TXID): Promise<string> {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    throw new Error('Web Crypto API 不可用')
  }
  
  const txidString = `${txid.seed}:${txid.nonce}`
  const encoder = new TextEncoder()
  const data = encoder.encode(txidString)
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

/**
 * 計算商品級別 Seed 的 SHA256 哈希值（瀏覽器環境，玩家驗證用）
 * Hash = SHA256(seed)
 */
export async function calculateSeedHash(seed: string): Promise<string> {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    throw new Error('Web Crypto API 不可用')
  }

  const encoder = new TextEncoder()
  const data = encoder.encode(seed)
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

/**
 * 從 TXID 生成確定性的隨機數（0-1 之間）
 * 使用 HMAC-SHA256 確保確定性（瀏覽器環境）
 */
export async function generateRandomValue(txid: TXID): Promise<number> {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    throw new Error('Web Crypto API 不可用')
  }
  
  const encoder = new TextEncoder()
  const keyData = encoder.encode(txid.seed)
  const messageData = encoder.encode(txid.nonce.toString())
  
  // 使用 Web Crypto API 的 HMAC
  const key = await window.crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  
  const signature = await window.crypto.subtle.sign('HMAC', key, messageData)
  const hashArray = Array.from(new Uint8Array(signature))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  
  // 將哈希值轉換為 0-1 之間的浮點數
  const hexValue = hashHex.substring(0, 16)
  const decimalValue = parseInt(hexValue, 16)
  const maxHexValue = parseInt('ffffffffffffffff', 16)
  
  return decimalValue / maxHexValue
}

/**
 * 根據隨機數和機率設定決定獎項
 */
export function determinePrize(
  randomValue: number,
  prizes: Array<{ level: string; name: string; probability: number }>
): { level: string; name: string } {
  // 計算累積機率區間
  let cumulativeProbability = 0
  for (const prize of prizes) {
    cumulativeProbability += prize.probability / 100
    
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
 * 驗證抽獎結果
 */
export async function verifyDraw(
  seed: string,
  nonce: number,
  expectedHash: string
): Promise<{
  txid: TXID
  randomValue: number
  hashMatch: boolean
  txidHash: string
  expectedHash: string
}> {
  const txid = generateTXID(seed, nonce)
  const randomValue = await generateRandomValue(txid)
  const calculatedHash = await calculateTXIDHash(txid)
  const hashMatch = calculatedHash === expectedHash
  
  return {
    txid,
    randomValue,
    hashMatch,
    txidHash: calculatedHash,
    expectedHash
  }
}
