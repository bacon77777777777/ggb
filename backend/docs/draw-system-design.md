# 抽獎系統設計文檔

## 概述

本系統實現了**分離驗證機制**，允許在抽獎過程中動態調整殺率，同時確保 TXID 哈希驗證的一致性。

## 核心設計理念

### 方案 1：分離驗證機制（已採用）

**核心思路**：TXID Hash 只驗證抽獎結果的隨機性，不包含機率設定。

- **TXID 內容**：只包含隨機數種子 (Seed) 和序列 (Nonce)
- **機率/殺率**：作為獨立參數，不參與 TXID 計算
- **驗證邏輯**：
  - TXID Hash 驗證：確保隨機數序列未被篡改
  - 機率變更記錄：單獨記錄每次機率變更（不公開給用戶）

## 資料結構

### TXID 結構

```typescript
interface TXID {
  seed: string    // 隨機數種子（用於生成隨機數序列）
  nonce: number   // 序列號（每次抽獎遞增）
}
```

### 抽獎流程

1. **初始化抽獎活動**
   - 生成隨機種子 (Seed)
   - 計算 TXID Hash：`SHA256(seed:nonce)`
   - 公布 TXID Hash 給用戶

2. **執行抽獎**
   - 輸入：`(userId, productId, seed, nonce)`
   - 從資料庫讀取 `current_profit_rate`（殺率參數）
   - 從 TXID 生成確定性隨機數：`randomValue = generateRandomValue(txid)`
   - 根據 `randomValue` 和 `current_profit_rate` 決定獎項
   - 返回：`(txid, randomValue, prizeLevel, prizeName, txidHash)`

3. **驗證抽獎結果**
   - 用戶輸入：`(seed, nonce, expectedHash)`
   - 系統計算：`calculatedHash = SHA256(seed:nonce)`
   - 返回：`(randomValue, hashMatch)`
   - **不顯示**：機率公式、判斷區間

## API 端點

### 1. POST /api/draw
執行抽獎

**請求**：
```json
{
  "userId": "user123",
  "productId": 1,
  "seed": "abc123...",
  "nonce": 1
}
```

**回應**：
```json
{
  "success": true,
  "data": {
    "txid": {
      "seed": "abc123...",
      "nonce": 1
    },
    "randomValue": 0.123456789,
    "prizeLevel": "A賞",
    "prizeName": "炭治郎",
    "txidHash": "517552437659771913c7670c11643fc422336e8932f0491da4a7cc5d4d029caf"
  }
}
```

### 2. POST /api/verify
驗證抽獎結果

**請求**：
```json
{
  "seed": "abc123...",
  "nonce": 1,
  "expectedHash": "517552437659771913c7670c11643fc422336e8932f0491da4a7cc5d4d029caf"
}
```

**回應**：
```json
{
  "success": true,
  "data": {
    "randomValue": 0.123456789,
    "hashMatch": true,
    "txidHash": "517552437659771913c7670c11643fc422336e8932f0491da4a7cc5d4d029caf"
  }
}
```

### 3. GET /api/rates/:productId
獲取商品殺率設定

### 4. PUT /api/rates/:productId
更新商品殺率設定

**請求**：
```json
{
  "profitRate": 1.2
}
```

## 關鍵函數

### generateRandomValue(txid: TXID): number
從 TXID 生成確定性的隨機數（0-1 之間）

使用 HMAC-SHA256 確保確定性：
- 輸入：`seed` 和 `nonce`
- 輸出：0-1 之間的浮點數

### calculateTXIDHash(txid: TXID): string
計算 TXID 的 SHA256 哈希值

- 輸入：`seed:nonce`（字串格式）
- 輸出：64 字元十六進制哈希值

### executeDraw(request: DrawRequest): Promise<DrawResult>
執行抽獎的核心函數

流程：
1. 生成 TXID
2. 生成隨機數
3. 讀取當前殺率參數
4. 讀取商品獎項配置
5. 決定獎項
6. 返回結果

## 殺率調整機制

### 管理後台 UI

- **殺率參數**：統一調整整個商品的殺率（0.1 - 3.0，即 10% - 300%）
- **顯示機率**：`顯示機率 = 原始機率 × 殺率參數`
- **實時預覽**：調整殺率時，即時顯示所有賞項的機率變化

### 資料庫設計

- `product_settings.current_profit_rate`：當前殺率參數
- `draw_records.profit_rate`：抽獎時的殺率參數（用於追溯）

## 安全性與公平性

### 保證

1. **TXID Hash 一致性**：TXID 只包含 Seed 和 Nonce，不包含機率設定，確保哈希值不變
2. **隨機數確定性**：相同 TXID 總是生成相同的隨機數
3. **可追溯性**：每次抽獎都記錄當時的殺率參數

### 隱私保護

- 用戶看不到機率變更歷史
- 用戶只能驗證隨機數和哈希值
- 不顯示機率公式或判斷區間

## 使用範例

### 初始化抽獎活動

```typescript
const seed = initializeDrawSession()
const txid = generateTXID(seed, 0)
const txidHash = calculateTXIDHash(txid)
// 公布 txidHash 給用戶
```

### 執行抽獎

```typescript
const result = await executeDraw({
  userId: 'user123',
  productId: 1,
  seed: seed,
  nonce: 1
})
// result.randomValue 用於決定獎項
// result.txidHash 應該等於初始公布的 txidHash
```

### 驗證結果

```typescript
const verification = verifyDraw(seed, 1, expectedHash)
// verification.hashMatch 應該為 true
// verification.randomValue 應該等於抽獎時的 randomValue
```

## 注意事項

1. **殺率調整**：可以在抽獎過程中隨時調整，不影響已完成的抽獎驗證
2. **資料庫連接**：實際實現時需要連接資料庫讀取 `current_profit_rate` 和商品配置
3. **會話管理**：需要確保每個抽獎活動使用相同的 Seed
4. **Nonce 管理**：每次抽獎 Nonce 應該遞增，確保唯一性
