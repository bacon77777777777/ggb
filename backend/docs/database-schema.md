# 資料庫結構設計（概念性）

## 核心表結構

### 1. product_settings（商品設定表）
用於儲存商品的殺率參數

```sql
CREATE TABLE product_settings (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  product_id BIGINT NOT NULL UNIQUE,
  current_profit_rate DECIMAL(5,2) NOT NULL DEFAULT 1.00 COMMENT '當前殺率（1.00 = 100%）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by VARCHAR(100) COMMENT '最後更新者',
  INDEX idx_product_id (product_id)
);
```

### 2. product_prizes（商品獎項表）
儲存商品的獎項配置

```sql
CREATE TABLE product_prizes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  product_id BIGINT NOT NULL,
  level VARCHAR(20) NOT NULL COMMENT '獎項等級（A賞、B賞等）',
  name VARCHAR(200) NOT NULL COMMENT '獎項名稱',
  original_probability DECIMAL(5,2) NOT NULL COMMENT '原始機率（用於實際抽獎）',
  display_probability DECIMAL(5,2) NOT NULL COMMENT '顯示機率（用戶看到的機率）',
  total INT NOT NULL COMMENT '總數量',
  remaining INT NOT NULL COMMENT '剩餘數量',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_product_id (product_id),
  INDEX idx_product_level (product_id, level)
);
```

### 3. draw_sessions（抽獎活動表）
儲存每次抽獎活動的基本資訊

```sql
CREATE TABLE draw_sessions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  product_id BIGINT NOT NULL,
  seed VARCHAR(64) NOT NULL COMMENT '隨機數種子',
  txid_hash VARCHAR(64) NOT NULL COMMENT 'TXID 哈希值（初始時公布）',
  status ENUM('active', 'completed') DEFAULT 'active',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  INDEX idx_product_id (product_id),
  INDEX idx_seed (seed),
  INDEX idx_txid_hash (txid_hash)
);
```

### 4. draw_records（抽獎紀錄表）
儲存每次抽獎的詳細紀錄

```sql
CREATE TABLE draw_records (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  session_id BIGINT NOT NULL COMMENT '關聯到 draw_sessions.id',
  user_id VARCHAR(100) NOT NULL,
  product_id BIGINT NOT NULL,
  seed VARCHAR(64) NOT NULL COMMENT '隨機數種子',
  nonce INT NOT NULL COMMENT '序列號',
  random_value DECIMAL(20,18) NOT NULL COMMENT '生成的隨機數（0-1）',
  prize_level VARCHAR(20) NOT NULL,
  prize_name VARCHAR(200) NOT NULL,
  txid_hash VARCHAR(64) NOT NULL COMMENT 'TXID 哈希值',
  profit_rate DECIMAL(5,2) NOT NULL COMMENT '抽獎時的殺率參數（用於追溯）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session_id (session_id),
  INDEX idx_user_id (user_id),
  INDEX idx_product_id (product_id),
  INDEX idx_seed_nonce (seed, nonce),
  FOREIGN KEY (session_id) REFERENCES draw_sessions(id)
);
```

## 關鍵設計說明

1. **分離驗證機制**：
   - `draw_records.txid_hash` 只包含 `seed` 和 `nonce` 的哈希，不包含機率設定
   - `draw_records.profit_rate` 記錄抽獎時的殺率參數，用於追溯，但不參與哈希計算

2. **殺率調整**：
   - `product_settings.current_profit_rate` 可以隨時更新
   - 每次抽獎時會記錄當時的 `profit_rate`，確保可追溯性

3. **驗證機制**：
   - 用戶可以通過 `seed` 和 `nonce` 驗證 `random_value` 和 `txid_hash`
   - 驗證過程不涉及機率設定，確保哈希值一致性
