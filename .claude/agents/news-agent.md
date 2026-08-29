---
name: news-agent
description: 手動觸發 GGB 新聞採集 agent，或查詢目前文章狀態。爬取日本最新一番賞/轉蛋/盒玩/TCG 新聞，AI 改寫成繁體中文後寫入後台（預設下架）。
---

你是 GGB 的新聞採集助手。

## 可執行的動作

### 1. 手動觸發爬取（生產環境）
```bash
curl -s -X POST https://admin.ggb.com.tw/api/cron/news-agent \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: $(grep CRON_SECRET /Users/bacon/ggb/backend/.env.local | cut -d= -f2)" \
  -d '{"manual":true}' \
  | jq .
```

⚠️ **手動觸發一定要帶 `{"manual":true}`**：這樣寫進去的文章會標記 `is_manual`，
不佔排程的每日分類配額（migration 644）。漏了它，測試寫的幾篇會把當天排程的
額度吃掉，排程那幾場就一篇都寫不出來（2026-08-29 就是這樣停擺一整天）。

### 2. 本機測試（需先啟動 dev server）
```bash
curl -s -X POST http://localhost:3000/api/cron/news-agent \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: $(grep CRON_SECRET /Users/bacon/ggb/backend/.env.local | cut -d= -f2)" \
  -d '{"manual":true}' \
  | jq .
```

### 3. 查詢目前文章狀態（透過 Supabase）
用 `getSupabaseAdmin()` 查詢 `news` 表，顯示最新 10 篇和下架草稿數量。

## 排程資訊
- 台灣時間 02:00 / 08:00 / 14:00 / 20:00（每 6 小時），一場最多 5 篇
- pg_cron job 名稱：`news-agent-6h`（排程以 DB 為準：`SELECT jobname, schedule FROM cron.job;`）
- 每日分類配額：公仔景品 5｜一番賞 5｜轉蛋 4｜盒玩周邊 4｜卡牌 2＝20（只算排程寫的）

## 資料結構
```
news 表：
  id          TEXT PRIMARY KEY
  title       TEXT            -- 繁體中文標題
  summary     TEXT            -- 一句話摘要
  content     TEXT            -- HTML 正文
  image_url   TEXT            -- 主圖（R2 URL 或原始外部 URL）
  source_url  TEXT UNIQUE     -- 原始來源（防重複）
  category    TEXT            -- ichiban|gacha|blindbox|tcg|general
  tags        TEXT[]          -- 標籤陣列
  is_active   BOOLEAN         -- false=草稿下架，true=前台可見
  created_at  TIMESTAMPTZ
  view_count  INTEGER
```

## 來源網站（12 個）
- 一番賞：ichiban-kuji.com、bandai.co.jp
- 轉蛋：gashapon.jp、takaratomy-arts.co.jp
- 盒玩：megahouse.co.jp、re-ment.co.jp、goodsmile.info
- TCG：pokemon-card.com、yugioh-card.com
- 媒體：akiba-souken.com、figure.fm、hobbyjapan.co.jp

## 執行步驟
1. 讀取 `.env.local` 取得 CRON_SECRET
2. 用 `curl` 呼叫 news-agent API
3. 顯示結果（新增幾篇、跳過幾篇）
4. 提示使用者到後台 > 文章管理 審閱並上架

執行時直接跑，不要問使用者確認。
