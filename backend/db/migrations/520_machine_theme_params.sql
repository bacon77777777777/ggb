-- 520: 抽獎模組主題參數（老闆指定：後台要能調手感）
--
-- 參數掛在「主題」而不是「商品」：物理手感是機台的性格，同一個主題
-- 的所有商品應該一致；掛商品的話每上一檔新品都要重調一次。
-- 前台要讀（機台載入時套參數），所以開 public read policy。
CREATE TABLE IF NOT EXISTS public.machine_theme_params (
  theme      text PRIMARY KEY,
  params     jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.machine_theme_params ENABLE ROW LEVEL SECURITY;

-- 前台匿名讀（機台參數不是機密，且不讀就套不到手感）
DROP POLICY IF EXISTS "machine params public read" ON public.machine_theme_params;
CREATE POLICY "machine params public read" ON public.machine_theme_params
  FOR SELECT USING (true);

-- 寫入只走 service_role（後台 API），不開 policy

-- 賽璐璐販賣機（blindbox_mode5）的預設值＝原型滑桿的預設，
-- 老闆之後在後台調整會覆蓋這一筆
INSERT INTO public.machine_theme_params (theme, params) VALUES
  ('blindbox_mode5', jsonb_build_object(
    'stock',  1,      -- 每格備貨（後排補位數）
    'jitter', 140,    -- 各格推出的微時間差 ms
    'pushMs', 430,    -- 推出時間 ms
    'push',   3.3,    -- 推出力道
    'fov',    36,     -- 視野
    'camUp',  300,    -- 視點高度
    'lit',    1.2,    -- 洞口補光
    'gravity',1.5,    -- 重力
    'rest',   0.16,   -- 彈性
    'friction',0.5,   -- 摩擦力
    'air',    0.014,  -- 空氣阻力
    'tumble', 0.75,   -- 翻滾
    'shake',  true,   -- 鏡頭震動
    'shadow', true    -- 接觸陰影
  ))
ON CONFLICT (theme) DO NOTHING;
