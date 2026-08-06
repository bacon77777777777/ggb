-- 483：類別狀態改成三態（開放 / 維護中 / 關閉）
--
-- 原本只有 enabled 一個布林，於是「這個類別暫時停一下」跟
-- 「我們不做這個類別了」被迫用同一個開關表達。對玩家來說差很多：
--   維護中 → 東西還在，晚點回來就有 → 該讓他看得到、知道會回來
--   關閉   → 平台不提供了 → 該完全消失，不要留一個點不動的入口吊人胃口
--
-- 做法是加一個 state 欄位，並用 trigger 讓 enabled 永遠等於 (state = 'on')。
-- 這樣所有既有的讀取端（前台 context、綠界建單、482 的抽獎 trigger、GB哥）
-- 都不必改就繼續正確運作 —— 維護中與關閉一樣擋抽獎、擋儲值，
-- 差別只在前台怎麼呈現，而那是讀 state 的人才需要在意的事。

ALTER TABLE public.feature_flags
  ADD COLUMN IF NOT EXISTS state text;

-- 既有資料：開著的變 on，關著的變 off（沒有人是「維護中」，那是新概念）
UPDATE public.feature_flags
   SET state = CASE WHEN enabled THEN 'on' ELSE 'off' END
 WHERE state IS NULL;

ALTER TABLE public.feature_flags
  ALTER COLUMN state SET DEFAULT 'on',
  ALTER COLUMN state SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'feature_flags_state_check'
  ) THEN
    ALTER TABLE public.feature_flags
      ADD CONSTRAINT feature_flags_state_check
      CHECK (state IN ('on', 'maintenance', 'off'));
  END IF;
END $$;

-- enabled 與 state 互相同步。
--
-- 兩個方向都要處理，因為兩種寫法都還存在：後台功能開關頁改的是 state，
-- 但 line-push-flags 那支 API 與各種既有程式改的是 enabled。
-- 只同步單一方向的話，另一邊寫入時兩個欄位就會對不起來。
CREATE OR REPLACE FUNCTION public.sync_feature_flag_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- 新增時以有給值的那個為準；兩個都給就以 state 為準
    IF NEW.state IS DISTINCT FROM 'on' THEN
      NEW.enabled := (NEW.state = 'on');
    ELSE
      NEW.state := CASE WHEN NEW.enabled THEN 'on' ELSE 'off' END;
      NEW.enabled := (NEW.state = 'on');
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.state IS DISTINCT FROM OLD.state THEN
    NEW.enabled := (NEW.state = 'on');
  ELSIF NEW.enabled IS DISTINCT FROM OLD.enabled THEN
    -- 只改 enabled：true → on；false → 保留原本的 maintenance/off 語意，
    -- 不然每次舊程式關掉一個維護中的類別，都會把「維護中」降級成「關閉」
    NEW.state := CASE
      WHEN NEW.enabled THEN 'on'
      WHEN OLD.state = 'maintenance' THEN 'maintenance'
      ELSE 'off'
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_feature_flag_state ON public.feature_flags;
CREATE TRIGGER trg_sync_feature_flag_state
  BEFORE INSERT OR UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.sync_feature_flag_state();

-- 前台要讀 state 才分得出維護中與關閉
GRANT SELECT (key, enabled, state, updated_at) ON public.feature_flags TO anon, authenticated;

-- 482 的抽獎 trigger 只看 enabled，維護中與關閉都會擋 —— 這是對的，
-- 但錯誤訊息要分開講，玩家才知道是暫時的還是永久的
CREATE OR REPLACE FUNCTION public.assert_category_enabled()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_type  text;
  v_state text;
BEGIN
  SELECT type INTO v_type FROM products WHERE id = NEW.product_id;
  IF v_type IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT state INTO v_state FROM feature_flags WHERE key = v_type;

  -- 查不到旗標就放行 —— 機台（slot）就沒有對應的旗標
  IF v_state = 'maintenance' THEN
    RAISE EXCEPTION '這個類別正在維護，暫時抽不了，稍後再回來看看';
  ELSIF v_state = 'off' THEN
    RAISE EXCEPTION '這個類別已經沒有開放了';
  END IF;

  RETURN NEW;
END;
$$;
