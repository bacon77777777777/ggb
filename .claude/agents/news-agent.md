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
  | jq .
```

### 2. 本機測試（需先啟動 dev server）
```bash
curl -s -X POST http://localhost:3000/api/cron/news-agent \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: $(grep CRON_SECRET /Users/bacon/ggb/backend/.env.local | cut -d= -f2)" \
  | jq .
```

### 3. 查詢目前文章狀態（透過 Supabase）
用 `getSupabaseAdmin()` 查詢 `news` 表，顯示最新 10 篇和下架草稿數量。

## 排程資訊
- 每天 TW 06:30（UTC 22:30）自動執行
- pg_cron job 名稱：`news-agent-daily`

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
