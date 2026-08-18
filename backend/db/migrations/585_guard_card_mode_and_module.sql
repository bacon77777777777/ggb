-- 585_guard_card_mode_and_module.sql
--
-- 開賣（排籤封存）之後，鎖住「開卡模式」與「抽獎模組」。老闆 2026-08-18 指示。
--
-- 為什麼「每包張數」非鎖不可（這是完整性，不是操作習慣）：
--   整包模式的第 k 包 = 籤位 (k-1)*n+1 … k*n（migration 584）。n 從 10 改成 5，
--   同一個「第 37 包」就換成完全不同的一批籤位 —— 已經賣掉的包，玩家拿包號去對
--   封存表會對不上，而沒賣的包會跟已賣的籤位重疊。我們對外宣稱可驗證，
--   這一改等於自己把驗證弄壞。
--
--   單張 ↔ 整包 互換也一樣：單張模式配的是散裝籤位，改成整包後那些散籤會
--   讓大量的包變成「已被動過」而永久賣不掉。
--
-- 為什麼模組也鎖：抽卡兩種模式的演出不通用（撕開封口是整包的演出，
--   蓄力開卡包是單張的），賣到一半換掉，先買的人跟後買的人看到的是兩套東西。
--   這條是政策不是完整性 —— 真的需要換（例如某模組有 bug）就找 Claude 放行。
--
-- 未封存的商品完全不受影響：還沒開賣愛怎麼改都可以。

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_card_mode_and_module_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- 沒封存＝還沒開賣，隨便改
  IF NOT EXISTS (SELECT 1 FROM public.product_ticket_seals WHERE product_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  IF NEW.cards_per_pack IS DISTINCT FROM OLD.cards_per_pack THEN
    RAISE EXCEPTION
      'PRODUCT_SEALED: 此商品已排籤封存，不可更改開卡模式（每包張數）。'
      '包的組成在開賣前就隨封存表定案，改了會讓已售出的包驗證對不上。';
  END IF;

  IF NEW.machine_theme IS DISTINCT FROM OLD.machine_theme THEN
    RAISE EXCEPTION
      'PRODUCT_SEALED: 此商品已排籤封存，不可更換抽獎模組。'
      '賣到一半換演出，先買與後買的玩家看到的會是兩套東西。';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_card_mode_and_module ON public.products;
CREATE TRIGGER trg_guard_card_mode_and_module
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.guard_card_mode_and_module_change();

COMMENT ON FUNCTION public.guard_card_mode_and_module_change() IS
  '已封存商品鎖住 cards_per_pack 與 machine_theme（migration 585）';

COMMIT;
