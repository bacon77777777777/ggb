# Gacha Go (Monorepo)

此專案包含一番賞網站的前台與後台。

## 專案結構

- **frontend/**: 使用者前台 (Next.js)
- **backend/**: 管理後台 (Next.js / Admin)

## 如何在另一台電腦開始開發

1. **Clone 專案**
   ```bash
   git clone https://github.com/bacon0731/gachago-prod.git
   cd gachago
   ```

2. **設定環境變數 (.env)**
   由於 `.env` 檔案包含敏感資料（如 Supabase Keys），它們不會被上傳到 GitHub。你需要手動建立它們：
   
   - 在 `frontend/` 目錄下建立 `.env.local`
   - 在 `backend/` 目錄下建立 `.env.local` (如果有需要)
   
   *請參考原電腦的 `.env` 檔案內容。*

3. **安裝依賴與執行**

   **前台：**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

   **後台：**
   ```bash
   cd ../backend
   npm install
   npm run dev
   ```
