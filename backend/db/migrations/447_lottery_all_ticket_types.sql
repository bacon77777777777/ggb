-- 447: 抽籤販售開放給一番賞與自製賞
--
-- 439 把 sale_mode = 'lottery' 限制在 type = 'card'。實際上這三種
-- （ichiban / card / custom）共用同一套封存排籤與 play_ichiban 引擎，
-- 抽籤販售的邏輯對三者完全相同，沒有理由只給抽卡。

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_lottery_cfg_chk;
ALTER TABLE public.products ADD CONSTRAINT products_lottery_cfg_chk
  CHECK (
    sale_mode <> 'lottery' OR (
      type IN ('ichiban', 'card', 'custom')
      AND lottery_total_draws    IS NOT NULL AND lottery_total_draws    > 0
      AND lottery_per_user_draws IS NOT NULL AND lottery_per_user_draws > 0
    )
  );

COMMENT ON COLUMN public.products.sale_mode IS
  'normal = 一般販售；lottery = 抽籤販售（0 元抽，中籤後寄出才付款）。適用一番賞／抽卡／自製賞。';
