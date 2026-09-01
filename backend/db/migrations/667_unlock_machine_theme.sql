-- 667: 抽獎模組上架後也可以改（全類別），順便清掉重複的 guard（老闆 2026-09-01）
--
-- ── 為什麼解鎖 ────────────────────────────────────────────────
--
-- 模組是**純表演**：開出什麼卡由封存表在開賣前定死，籤號、賞項、機率都不會
-- 因為換演出而變。玩家拿得去驗證的東西一個都沒動。
--
-- 原本鎖著的理由是「賣到一半換演出，先買與後買的玩家看到的會是兩套」，
-- 但這個理由套到別的欄位就全放行了 —— 售價、商品名、商品圖、說明通通可以改，
-- 而售價對玩家的影響遠大於哪一個動畫。
--
-- 更關鍵的是：**這個鎖擋得住個別商品，卻擋不住全站設定**。
-- migration 666 把 module_settings 的抽卡預設改成 card_peel，兩個環境各 12 件
-- 上架中、沒有個別指定模組的商品當場就換了演出 —— 那條路徑完全沒有經過這支 guard。
-- 同一件事換個入口就能做，鎖在這裡只是擋住操作者、擋不住結果。
--
-- 實務代價則很高：模組有 bug 或想換更好的演出時，唯一的辦法是刪掉商品重建，
-- 那會炸掉銷售紀錄、玩家倉庫的關聯與公平性頁的籤號。
--
-- ⚠️ 真正該鎖的兩個維持不動：
--    ・一包幾張（包的分組與籤號綁死，改了公平性驗證會對不上）→ trg_guard_sealed_pack_size
--    ・賞項與數量 → guard_sealed_product（掛在 product_prizes）

-- ── 順便更正 migration 666 的一個疏漏 ──────────────────────────
--
-- 666 加了 trg_guard_sealed_pack_size 來擋「封存後改一包幾張」，但那件事
-- guard_card_mode_and_module_change 早就在擋了 —— 當時只查了掛在 product_prizes
-- 上的 guard_sealed_product，沒有列 products 自己的 trigger，結果變成兩支擋同一件事。
--
-- 現在把舊的整支拿掉：它剩下的 cards_per_pack 那一段與新的完全重複，
-- 而新的那支更嚴謹（`COALESCE(…,1)` 讓 NULL 與 1 視為同一件事，
-- 舊的用裸 IS DISTINCT FROM，把 NULL 改成 1 會被誤判成「改了」）
-- 也更省（BEFORE UPDATE OF cards_per_pack，欄位沒被寫到就不觸發）。
DROP TRIGGER IF EXISTS trg_guard_card_mode_and_module ON public.products;
DROP FUNCTION IF EXISTS public.guard_card_mode_and_module_change();

COMMENT ON FUNCTION public.guard_sealed_pack_size() IS
  '封存後不准改一包幾張。migration 667 起這是 products 上唯一的封存守門（模組已開放變更）。';
