-- 652_lottery_sale.sql
--
-- 登記制抽籤販售（老闆 2026-08-31）
--
-- ## 這是什麼
--
-- 限量商品（例：10 組主題卡包盒）不走「先搶先贏」，改成：
--   開放登記（花積分當入場券）→ 截止 → 到時間統一開獎並公開名單 → 中籤者付 G 幣
--
-- 為什麼不是即時抽：10 組的商品用即時抽，等於「誰剛好在線上誰贏」，
-- 推播發出去時已經沒了，而且跟站上「公平可驗證」的主張互相打架。
-- 登記制把稀缺性變成事件：兩個行銷節點（開放登記／公布名單）、人人一票。
--
-- ## 為什麼入場券用積分不用代幣
--
-- 積分**買不到**（綠界 callback 只加 tokens，積分只能靠簽到／任務／邀請／LINE 綁定賺）。
-- 免費可得的入場券在抽獎活動的定性上乾淨得多；一旦能用錢買，就變成付費射倖。
-- ⚠️ 這條線要守住：日後不要開放用錢買積分。
--
-- ## 商品沿用 products
--
-- 抽籤販售不是新的商品類型，是掛在既有商品上的一個「檔期」。這樣封存、公平性驗證、
-- 倉庫、出貨、物流整組都不用複製一份。
--
-- ## 階段（phase）由時間推導，不存狀態機
--
-- `status` 只管人為的 draft/published/cancelled；「登記中／待開獎／已開獎」一律
-- 由 register_start_at、register_end_at、drawn_at 現算。存成狀態欄位的話，
-- 只要 cron 漏跑一次或時間被改過，狀態就跟時鐘對不上，而且看不出來哪個才是對的。

BEGIN;

CREATE TABLE IF NOT EXISTS lottery_events (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id         bigint NOT NULL REFERENCES products(id) ON DELETE RESTRICT,

  -- 檔期的門面。留空就用商品自己的名稱／主圖（後台不強迫填兩次）
  title              text,
  subtitle           text,
  cover_image_url    text,
  -- 內頁的活動頁區塊（沿用 events 的 section 形狀，交給 LpRenderer 畫）
  content            jsonb,

  entry_points       integer NOT NULL CHECK (entry_points > 0),
  per_user_entries   integer NOT NULL DEFAULT 1 CHECK (per_user_entries >= 1),
  winners_count      integer NOT NULL CHECK (winners_count >= 1),
  -- 備取：正取逾期未付就往下遞補。開獎時一起產生並公開，事後重抽會被說黑箱
  backup_count       integer NOT NULL DEFAULT 5 CHECK (backup_count >= 0),
  -- 中籤後要付的 G 幣（老闆 2026-08-31 選 G 幣，不等統編就能整條跑完）
  price_tokens       integer NOT NULL CHECK (price_tokens >= 0),
  pay_deadline_hours integer NOT NULL DEFAULT 48 CHECK (pay_deadline_hours >= 1),

  register_start_at  timestamptz NOT NULL,
  register_end_at    timestamptz NOT NULL,
  draw_at            timestamptz NOT NULL,

  /*
   * 公平性：跟商品頁同一套 commit-reveal。
   * 登記截止前公布 commitment（seed 的 sha256），開獎後公開 seed 與完整名單，
   * 任何人都能自己重算一次。這比商品頁的版本強 —— 名單是公開的，
   * 不是只有自己驗自己那一抽。
   */
  commitment         text,
  seed               text,
  drawn_at           timestamptz,

  /*
   * 登記期間要不要公開人數。預設**不公開** ——「只有 3 人登記」的畫面會勸退
   * 後面的人；開獎後再公布「XXX 人搶 N 組」才是要的標題。
   */
  show_entry_count   boolean NOT NULL DEFAULT false,

  status             text NOT NULL DEFAULT 'draft',
  sort_order         integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lottery_events_status_chk CHECK (status IN ('draft','published','cancelled')),
  CONSTRAINT lottery_events_time_chk   CHECK (register_start_at < register_end_at
                                          AND register_end_at  <= draw_at)
);

COMMENT ON TABLE lottery_events IS
  '抽籤販售檔期。階段（登記中／待開獎／已開獎）由時間欄位推導，status 只管人為的 draft/published/cancelled';

CREATE INDEX IF NOT EXISTS idx_lottery_events_live
  ON lottery_events (status, register_start_at, register_end_at) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_lottery_events_draw
  ON lottery_events (draw_at) WHERE status = 'published' AND drawn_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lottery_events_product ON lottery_events (product_id);


CREATE TABLE IF NOT EXISTS lottery_entries (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id      bigint NOT NULL REFERENCES lottery_events(id) ON DELETE CASCADE,
  user_id       uuid   NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  /*
   * 檔期內遞增的登記序號。開獎就是對這個序號做確定性洗牌 ——
   * 用 id 也可以，但 id 是全表流水號，公開名單時會洩漏「別的檔期有多少人登記」。
   */
  entry_no      integer NOT NULL,
  points_spent  integer NOT NULL CHECK (points_spent >= 0),

  /*
   * entered  已登記（未開獎）      won     正取
   * backup   備取                  lost    未中籤
   * paid     已付款（正式成交）     expired 逾期未付（讓位給備取）
   * refunded 檔期取消，積分已退
   */
  status        text NOT NULL DEFAULT 'entered',
  -- 開獎後的名次：正取 1..winners_count、備取接在後面
  rank          integer,
  pay_deadline  timestamptz,
  paid_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT lottery_entries_status_chk CHECK (status IN
    ('entered','won','backup','lost','paid','expired','refunded')),
  CONSTRAINT lottery_entries_no_uniq UNIQUE (event_id, entry_no)
);

COMMENT ON TABLE lottery_entries IS
  '抽籤登記。開獎＝依 seed 對 entry_no 做確定性洗牌，前 winners_count 名正取、接著 backup_count 名備取';

CREATE INDEX IF NOT EXISTS idx_lottery_entries_event_user ON lottery_entries (event_id, user_id);
CREATE INDEX IF NOT EXISTS idx_lottery_entries_user ON lottery_entries (user_id, created_at DESC);
-- 逾期掃描用
CREATE INDEX IF NOT EXISTS idx_lottery_entries_deadline
  ON lottery_entries (pay_deadline) WHERE status = 'won';


-- ── RLS ───────────────────────────────────────────────────────────
-- ⚠️ 開了 RLS 沒建 policy 前台會靜默拿到空陣列（CLAUDE.md 記過）
ALTER TABLE lottery_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lottery_entries ENABLE ROW LEVEL SECURITY;

-- 檔期：已發布的人人可讀（未登入也要看得到列表，那是拉新的入口）
DROP POLICY IF EXISTS lottery_events_public_read ON lottery_events;
CREATE POLICY lottery_events_public_read ON lottery_events
  FOR SELECT USING (status = 'published');

/*
 * 登記：只讀得到自己的。
 * 名單公開走另外一支 SECURITY DEFINER 的 RPC（只回暱稱與名次，不回 user_id）——
 * 直接開放讀全表會把所有參加者的 user_id 攤在前台。
 */
DROP POLICY IF EXISTS lottery_entries_self_read ON lottery_entries;
CREATE POLICY lottery_entries_self_read ON lottery_entries
  FOR SELECT USING (auth.uid() = user_id);
-- 寫入一律走 SECURITY DEFINER 的 RPC，不開任何 INSERT/UPDATE policy

COMMIT;
