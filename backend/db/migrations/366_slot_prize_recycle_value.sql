-- 366_slot_prize_recycle_value.sql
-- 為 slot_prizes 加入 recycle_value（基礎回收價值，以 100G 檔次為基準）
-- 實際顯示價值 = floor(recycle_value * 下注檔次 / 100)

ALTER TABLE slot_prizes ADD COLUMN IF NOT EXISTS recycle_value INTEGER NOT NULL DEFAULT 0;

-- 更新「絕頂RUSH」六種實體獎品的基礎回收價值（稀有度越高價值越高）
UPDATE slot_prizes SET recycle_value = CASE name
  WHEN '限定帆布托特包'   THEN 750   -- 最稀有 weight 80  → 100G 時 750G，2000G 時 15000G
  WHEN '壓克力立牌（大）' THEN 400   -- weight 150        → 100G 時 400G，2000G 時 8000G
  WHEN '角色 A4 海報組'   THEN 200   -- weight 250        → 100G 時 200G，2000G 時 4000G
  WHEN '角色徽章套組'     THEN 120   -- weight 350        → 100G 時 120G，2000G 時 2400G
  WHEN '限定明信片組'     THEN 60    -- weight 500        → 100G 時  60G，2000G 時 1200G
  WHEN '隨機貼紙包'       THEN 30    -- 最常見 weight 700 → 100G 時  30G，2000G 時  600G
  ELSE 0
END
WHERE name IN (
  '限定帆布托特包','壓克力立牌（大）','角色 A4 海報組',
  '角色徽章套組','限定明信片組','隨機貼紙包'
);
