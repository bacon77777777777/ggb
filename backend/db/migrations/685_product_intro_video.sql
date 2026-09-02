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
