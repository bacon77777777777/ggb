-- 416: 站上推廣素材（首頁彈窗 + 底部警語列）
--
-- 首波用途是公平性推廣，但刻意做成通用的：老闆要能自己上活動推廣與公告，
-- 不必每次找工程改字串。彈窗與警語列合成同一張表（kind 區分），
-- 因為兩者的欄位重疊度高（檔期、關閉規則、CTA），拆兩張表後台就要維護兩頁。
--
-- placements 決定出現在哪些位置，前端各頁自行宣告要吃哪個位置：
--   home      → 首頁
--   item_fair → 一番賞／抽卡／自製賞商品內頁（走 commit-reveal 引擎、有籤號的三種）
--
-- dismiss_days：玩家按下叉叉後幾天內不再出現。0 表示關掉就永久不再出現。
-- 關閉狀態記在前端 localStorage，不寫 DB —— 這三個位置的主要說服對象是
-- 「還沒註冊的訪客」，綁 user_id 的話最需要看到的人反而記不住關閉狀態。

CREATE TABLE IF NOT EXISTS public.site_promos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         TEXT NOT NULL CHECK (kind IN ('popup', 'notice')),
  title        TEXT,
  body         TEXT NOT NULL,
  image_url    TEXT,
  cta_text     TEXT,
  cta_href     TEXT,
  placements   TEXT[] NOT NULL DEFAULT '{}',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  start_at     TIMESTAMPTZ,
  end_at       TIMESTAMPTZ,
  dismiss_days INTEGER NOT NULL DEFAULT 7 CHECK (dismiss_days >= 0),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.site_promos          IS '首頁彈窗與底部警語列的內容與投放規則';
COMMENT ON COLUMN public.site_promos.kind     IS 'popup=首頁彈窗｜notice=底部警語列';
COMMENT ON COLUMN public.site_promos.placements IS '出現位置：home / item_fair';
COMMENT ON COLUMN public.site_promos.dismiss_days IS '關閉後幾天不再出現，0=永久關閉';

CREATE INDEX IF NOT EXISTS idx_site_promos_active
  ON public.site_promos (kind, is_active, sort_order);

ALTER TABLE public.site_promos ENABLE ROW LEVEL SECURITY;

-- 前台用 anon key 讀，沒有 policy 會靜默拿到空陣列
DROP POLICY IF EXISTS "public can read active site_promos" ON public.site_promos;
CREATE POLICY "public can read active site_promos"
  ON public.site_promos FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "service role full access on site_promos" ON public.site_promos;
CREATE POLICY "service role full access on site_promos"
  ON public.site_promos FOR ALL
  USING (auth.role() = 'service_role');

-- ── 首波內容：公平性推廣 ────────────────────────────────────────────────────
-- 文案刻意不用 Seed / TXID Hash / 雜湊 這類字眼（見 CLAUDE.md 前台文案原則），
-- 玩家看不懂的詞放在說服位置等於沒寫。

INSERT INTO public.site_promos (kind, title, body, cta_text, cta_href, placements, dismiss_days, sort_order)
SELECT 'popup',
       '每一抽，你都能自己驗算',
       E'抽之前，結果就已經封存了，連我們也改不了。\n\n全部抽完後會公開驗證碼，你可以自己重算一次對答案——不用相信我們，數學會告訴你。',
       '看看怎麼驗',
       '/fairness',
       ARRAY['home'],
       0,
       0
WHERE NOT EXISTS (SELECT 1 FROM public.site_promos WHERE kind = 'popup' AND cta_href = '/fairness');

INSERT INTO public.site_promos (kind, body, cta_text, cta_href, placements, dismiss_days, sort_order)
SELECT 'notice',
       '這裡每一抽的結果都事先封存、事後可驗算，不是我們說了算。',
       '看怎麼驗',
       '/fairness',
       ARRAY['home', 'item_fair'],
       7,
       0
WHERE NOT EXISTS (SELECT 1 FROM public.site_promos WHERE kind = 'notice' AND cta_href = '/fairness');
