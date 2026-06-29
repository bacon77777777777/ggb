# 一番賞線上抽獎 - 後台管理系統

這是「一番賞線上抽獎」平台的後台管理系統，用於管理商品、訂單、用戶、抽獎紀錄等。

## 功能模組

- 📊 **儀表板** - 數據統計與概覽
- 🛍️ **商品管理** - 商品列表、新增、編輯、刪除
- 📦 **訂單管理** - 訂單列表、訂單詳情、訂單狀態管理
- 👥 **用戶管理** - 用戶列表、用戶詳情、用戶狀態管理
- 🎲 **抽獎紀錄管理** - 查看所有抽獎紀錄、統計分析
- 💰 **儲值紀錄管理** - 查看儲值紀錄、退款處理
- ⚙️ **配率管理** - 設定商品獎項配率
- 📈 **數據分析** - 銷售報表、用戶分析

## 技術棧

- **框架**: Next.js 14 (App Router)
- **語言**: TypeScript
- **樣式**: Tailwind CSS
- **狀態管理**: React Hooks

## 開始使用

## 環境變數

本專案同時有「前端可公開」與「僅後端使用」的環境變數：

- 必填（後端伺服器端）
  - `SUPABASE_SERVICE_ROLE_KEY`：Supabase Service Role Key（後台 API 寫入 DB、繞過 RLS 用）
  - `ADMIN_SESSION_SECRET`：後台登入 cookie 簽章用的隨機字串（建議 32+ 字元）
- 必填（前後端皆需要）
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

本機開發：

- 複製 [backend/.env.example](file:///Users/bacon/gachago/backend/.env.example) 成 `backend/.env.local` 並填入值
- 修改完環境變數後需要重新啟動 `npm run dev`

部署（例如 Vercel / Cloud Run / 任意 Node 主機）：

- 將上述環境變數設定在部署平台的環境變數設定處
- 注意 `SUPABASE_SERVICE_ROLE_KEY` 與 `ADMIN_SESSION_SECRET` 只能放在後端，不要放到任何 `NEXT_PUBLIC_` 或前端專案的環境變數中

### 安裝依賴

```bash
npm install
```

### 開發模式

```bash
npm run dev
```

訪問 [http://localhost:3000](http://localhost:3000) 查看結果。

### 建置生產版本

```bash
npm run build
npm start
```

## 專案結構

```
ichiban-kuji-admin/
├── app/                    # Next.js App Router 頁面
│   ├── login/             # 登入頁面
│   ├── dashboard/         # 儀表板
│   ├── products/          # 商品管理
│   ├── orders/            # 訂單管理
│   ├── users/             # 用戶管理
│   ├── draws/             # 抽獎紀錄管理
│   ├── recharges/         # 儲值紀錄管理
│   └── settings/          # 系統設定
├── components/            # 可重用組件
├── contexts/              # React Context
├── utils/                 # 工具函數
└── public/                # 靜態資源
```
