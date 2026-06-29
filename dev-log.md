# 開發日誌 (Development Log)

## 2026-06-29 ggb 上線遷移啟動 (ggb Cutover Kickoff)

### 進度摘要 (Progress)
- GitHub：建立 `bacon77777777777/ggb` 並成功推送 `main`（已設定追蹤 `origin/main`）。
- Backend：強化 `backend/scripts/manual_migrate.js`，可依序套用 `backend/db/migrations/*.sql`（用於新 Supabase 建齊 schema，不搬舊資料）。
- Supabase：已建立新專案 `ggb-prod` 並取得 API keys（待使用 Transaction/Pooler 連線字串執行 migrations）。

### 待辦 (Next) — 已完成，見 2026-06-30 條目

---

## 2026-06-30 DB 全面補齊、GitHub CI/CD 上線、藍新金流設定

### DB 補遷移（Supabase）

**根因**：新站 DB 原只有 9 張表（admins、roles、users、feature_flags、sell_* 系列），002～183 這段核心 migrations 未完整執行，導致前後台大量頁面 500 或資料空白。

**修復方式**：建立兩支安全 bootstrap migration（全程 `CREATE TABLE IF NOT EXISTS`，不 DROP 任何現有資料）：

- `185_safe_primary_bootstrap.sql`：建立所有核心表
  - categories、products、product_prizes、product_ticket_plan
  - orders、order_items、draw_records、recharge_records
  - banners、news、notifications、small_items
  - action_logs、visit_logs、search_logs、daily_check_ins
  - 補齊缺失欄位：`draw_records.is_tradable/is_last_one`、`recharge_records.updated_at/payment_method`、`products.updated_at`
  - 所有 RLS policy + Storage bucket（products、banners）
  - `create_topup_order` / `confirm_topup_order` functions

- `186_safe_secondary_bootstrap.sql`（原 185 改名）：建立相依表
  - coupons、user_coupons、referrals
  - tags、product_tag_links、menu_products、tag_daily_stats、product_view_events
  - tasks、user_task_progress
  - marketplace_listings/transactions/seller_profiles/orders/messages
  - exchange_offers/offer_cards/orders/messages/offer_activation_codes
  - admin_recycle_pool

**結果**：DB 從 23 張表擴展至 **46 張表**，兩支 migration 已直接透過 psql 套用至 Supabase production。

### GitHub Actions 自動化

- 新增 `.github/workflows/migrate.yml`：push 到 main 且有 `.sql` 變動時自動觸發
- Supabase 以 `_migration_log` 表追蹤已套用的 migration，skip 重複執行
- 支援 workflow_dispatch dry-run 模式
- GitHub secret `SUPABASE_DB_URL` 已透過 API 設定完成
- DB URL（pooler session mode）：`postgresql://postgres.akdqleelvqvjhjnfkpfq@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres`

### 藍新金流（NewebPay）環境設定

Vercel `ggb-backend` project 新增以下環境變數（原本完全未設定）：

| 變數 | 值 |
|------|---|
| `NEWEBPAY_MERCHANT_ID` | MS159643890 |
| `NEWEBPAY_HASH_KEY` | bSpuxdVoJilYr5BX64K9yqxkOOYEWPSX |
| `NEWEBPAY_HASH_IV` | CkU2Fnebq7yf6HWP |
| `NEWEBPAY_VERSION` | 2.0 |
| `NEWEBPAY_API_URL` | https://ccore.newebpay.com/MPG/mpg_gateway（測試環境）|

Backend 已 redeploy，`/api/payment/newebpay` 端點正常（回傳 401 Unauthorized 而非 500）。

**待辦（藍新）**：
- 至藍新商店後台填入 Callback URLs：
  - NotifyURL：`https://admin.ggb.com.tw/api/payment/newebpay/callback`
  - ReturnURL：`https://admin.ggb.com.tw/api/payment/newebpay/return`
- 執行一筆測試交易驗證整條金流

### 下一步

- **報表頁面**（`/admin/reports`）：儲值明細、消費明細、期間摘要三個 Tab，支援日期篩選 + CSV 匯出，對帳優先
- 之後再做廠商（supplier）維度：補 `suppliers` 表 + `products.supplier_id`，供靈感文創合作用
- 儀表板圖表目前結構正常，等真實資料累積後再驗證

