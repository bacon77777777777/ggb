-- 607: 預設暱稱改隨機詞庫，不再用信箱前綴（老闆 2026-08-24：用信箱怕隱私洩露，猜得到對方信箱帳號）
--
-- 規則：有 metadata 名（LINE 顯示名）就用它；沒有就從 30 個形容詞 × 30 個名詞隨機配
-- （900 種組合，例：幸運的水豚、深夜的扭蛋手）。撞名先換一組重抽，再不行補兩位數字。
-- email 從此完全不參與暱稱。
-- 影響三處：default_user_name()（migration 600 的 BEFORE INSERT 保險）、
-- handle_new_user()（auth 註冊 trigger）、以及回填現有「name = 信箱前綴」的真人帳號
-- （PROD 5 個、STG 2 個 —— 這些是舊邏輯自動配的，不是玩家自己取的）。

CREATE OR REPLACE FUNCTION public.default_user_name(p_email text, p_meta_name text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_adj  text[] := ARRAY['快樂的','幸運的','神秘的','閃亮的','悠哉的','熱血的','想睡的','貪吃的','傲嬌的','呆萌的',
                         '元氣的','慵懶的','迷路的','好運的','低調的','認真的','隨性的','微笑的','夜行的','奔跑的',
                         '發光的','歐皇級','佛系的','爆肝的','治癒系','天然呆','傳說中的','收藏系','打瞌睡的','蓄勢待發的'];
  v_noun text[] := ARRAY['扭蛋機','轉蛋手','柴犬','三花貓','企鵝','水豚','倉鼠','小恐龍','鯊魚','布丁',
                         '糰子','麻糬','星星','月亮','雲朵','汽水','餅乾','咖啡','拉麵','壽司',
                         '玩具箱','收藏家','賞金獵人','拆箱手','抽卡人','幸運星','小畫家','夾娃娃師','盲盒獵人','打工仔'];
  v_name  text;
  v_tries int := 0;
BEGIN
  -- metadata 名（LINE 顯示名等玩家自己的名字）優先；信箱一律不用
  v_name := NULLIF(btrim(COALESCE(p_meta_name, '')), '');
  IF v_name IS NOT NULL THEN
    WHILE EXISTS (SELECT 1 FROM public.users WHERE name = v_name) AND v_tries < 20 LOOP
      v_name := NULLIF(btrim(p_meta_name), '') || floor(random() * 9000 + 1000)::int;
      v_tries := v_tries + 1;
    END LOOP;
    RETURN v_name;
  END IF;

  -- 隨機詞庫：先重抽組合，撞了再補兩位數字
  LOOP
    v_name := v_adj[1 + floor(random() * array_length(v_adj, 1))::int]
           || v_noun[1 + floor(random() * array_length(v_noun, 1))::int];
    IF v_tries >= 25 THEN
      v_name := v_name || lpad(floor(random() * 100)::int::text, 2, '0');
    END IF;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.users WHERE name = v_name) OR v_tries >= 60;
    v_tries := v_tries + 1;
  END LOOP;
  RETURN v_name;
END;
$$;

-- auth 註冊 trigger：metadata 名 → 隨機詞庫（原本第二順位是信箱前綴）
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.users (id, email, name, invite_code)
  VALUES (
    new.id,
    new.email,
    public.default_user_name(NULL, new.raw_user_meta_data->>'name'),
    public.generate_invite_code()
  );
  RETURN new;
END;
$$;

-- 回填：舊邏輯自動配成信箱前綴的真人帳號（逐筆跑，函數的撞名檢查才看得到前面已改的）
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.users
    WHERE (is_bot IS NULL OR is_bot = false)
      AND email IS NOT NULL AND position('@' IN email) > 1
      AND name = split_part(email, '@', 1)
  LOOP
    UPDATE public.users SET name = public.default_user_name(NULL, NULL) WHERE id = r.id;
  END LOOP;
END $$;

-- 補：舊撞名邏輯配的「前綴＋1~4 碼數字」（例 ap702087375）也一併換掉
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.users
    WHERE (is_bot IS NULL OR is_bot = false)
      AND email IS NOT NULL AND position('@' IN email) > 1
      AND name LIKE split_part(email, '@', 1) || '%'
      AND substring(name FROM length(split_part(email, '@', 1)) + 1) ~ '^[0-9]{1,4}$'
  LOOP
    UPDATE public.users SET name = public.default_user_name(NULL, NULL) WHERE id = r.id;
  END LOOP;
END $$;
