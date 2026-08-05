/**
 * 前台可以讀的商品／品項欄位
 *
 * `products` 有三個欄位絕對不能給前台：
 *
 *   seed         抽獎種子。commit-reveal 的秘密值 —— 公開等於玩家可以預先算出
 *                每一抽的結果，整套公平性設計直接失效
 *                （txid_hash 才是該公開的 commitment）
 *   profit_rate  殺率。平台的商業機密，也是「玩家不該看到機率」的核心
 *   cost         進貨成本。商業機密，廠商之間也不該互相看到
 *
 * 這幾欄已經在資料庫用欄位級授權擋掉（migration 471 撤銷 anon / authenticated
 * 對它們的 SELECT）。但 PostgREST 的 `select('*')` 會展開成「所有欄位」，
 * 撞到沒授權的欄位就整個查詢 42501 失敗 —— 所以前台不能再用 `*`，要明確列出。
 *
 * 刻意寫成單一字面量（不是陣列 join、也不是字串串接）：Supabase 的型別推導
 * 靠的是 select 字串的字面量型別，只要經過 join 或 + 就會退化成 string，
 * 查詢結果的型別跟著變成 GenericStringError，整個檔案的型別檢查就垮了。
 *
 * 新增商品欄位時如果前台要用，記得加進來 —— 但**要先確認資料表真的有那一欄**。
 * 這份清單第一版是照 types/database.types.ts 產的，而那份型別檔把
 * product_prizes 的 probability 錯放在 products 底下，結果整個首頁的商品查詢
 * 42703 column does not exist、一個商品都載不出來。
 * 型別檔不等於資料表，要對 information_schema 驗。
 */

export const PRODUCT_PUBLIC_COLUMNS = 'id, product_code, name, description, image_url, category, type, status, price, total_count, remaining, remaining_count, is_hot, txid_hash, is_preorder, preorder_available_at, distributor, series, supplier_id, created_at'

export const PRIZE_PUBLIC_COLUMNS = 'id, product_id, level, name, image_url, total, remaining, probability, created_at'
