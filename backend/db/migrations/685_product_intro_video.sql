-- 685：自製賞的「自製過場影片」模組
--
-- 新模組 custom_video：抽獎後播一段老闆自己上傳的影片，播完彈中獎結果。
-- 站上原本的過場影片是寫死的靜態檔（frontend/public/videos/video1.mp4 給自製賞、
-- card.mp4 給抽卡、blindbox_op.mp4 給盒玩），每一檔商品都長一樣。
--
-- 影片網址存在這裡而不是 metadata：前台 item 頁是直接 select products.*，
-- 放欄位就跟著出來，不用為了一支網址多解一層 jsonb。
ALTER TABLE products ADD COLUMN IF NOT EXISTS intro_video_url text;

COMMENT ON COLUMN products.intro_video_url IS
  '自製過場影片的網址（machine_theme = custom_video 時使用）。R2 直傳，見 backend/app/api/admin/upload/presign';

-- ⚠️ 這張表的前台讀取權限是**逐欄授權**的（anon／authenticated 各 52 欄，
-- 不是整張表 GRANT SELECT）。新增欄位不補 GRANT，PostgREST 只要被 select 到
-- 這一欄就整個請求回 42501 permission denied for table products ——
-- 前台首頁「無法載入商品列表」，而且錯誤訊息完全看不出是哪一欄造成的。
-- 2026-09-02 就是這樣把 PROD／STG 的商品列表一起弄掛的。
GRANT SELECT (intro_video_url) ON public.products TO anon, authenticated;
