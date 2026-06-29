# 2026-03-03 Release Notes

## Frontend
- PurchaseConfirmationModal
  - 改為「單抽 / 十連抽」二選一按鈕，當剩餘數量 < 10 時十連抽自動禁用
  - 新增處理中鎖定選擇，避免付款後視覺跳回單抽
- Blindbox 購買流程
  - 購買前刷新最新剩餘數量，並以最新庫存夾取數量
  - 強化錯誤訊息：庫存不足/無獎品時提示友善訊息
  - 完抽後返回詳情頁即刷新並顯示售完；點「立即開盒」時若售完則提示
- Toast UI
  - 版式改為圖標在上、文字在下；移除關閉叉叉；圖標 60x60

## Backend Admin
- 新增/編輯商品的「獎項等級」：
  - 一番賞/自製賞：A賞–J賞 + 最後賞
  - 盒玩：普通款、稀有款、隱藏款、異色款、夜光款、透明款、店鋪限定、首批限定
  - 轉蛋：一般、稀有、隱藏、異色、特效、限定、配件
  - 抽卡：N、R、SR、SSR、UR、LR、SP、SEC、PR、HR、GR、MR、CHR
- normalizePrizes 等級順序擴充至 J 賞

## Seed & Fairness
- reset_and_seed.sql 調整：
  - Banner 3 個；一番賞 10 個；其他類別各 3 個（共 22）
  - 所有商品 remaining = total_count；所有獎項 remaining = total；最後彙總回寫
  - 每個商品建立 seed 並計算 txid_hash = SHA sophon(Seed)
  - draw_records 的 txid_hash = SHA256(seed:nonce)；nonce = 籤號
  - 補齊缺 seed/txid_hash 的商品時，安全地逐筆生成並寫回
- 以腳本驗證：
  - seed/hash 計算一致
  - 單抽/十連抽扣庫存一致，且與獎項餘量合計相符
  - txid_hash 與 random_value 可用前端算法重算匹配

## Misc
- 後端本地啟動埠 3001，前端 3000；新增 DATABASE_URL 到 backend/.env.local（僅本地，不建議提交到遠端）

## 注意
- 請勿將 .env.local 推上遠端；此檔案已加入 .gitignore

