# 商城接線交接文件（給下一台電腦的 Claude）

> 更新：2026-08-14。目前 `/sell` 是 **v3 定版原型的 1:1 移植**，跑在引擎內建假資料上。
> 老闆定案的開發順序：**UI 先行已完成 → 接下來把資料層逐段換成真接口**。
> 原型檔：`docs/prototypes/ggb-market-taobao_3.html`（老闆自己調的定版，一切以它為準）。

## 檔案架構（不要動的請別動）

| 檔案 | 角色 | 注意 |
|---|---|---|
| `app/sell/proto/mall.ts` | 引擎：原型 `<script>` **逐字移植**（1,800 行） | ⚠️ **不要順手重構**。接線＝只換資料存取，渲染邏輯不動，要跟原型檔 diff 得起來 |
| `app/sell/proto/shell.ts` | 靜態殼（hdr/screen/tabbar/sheets/dlg/toast） | 對應原型 `<body>` |
| `app/sell/page.tsx` | 宿主：React 只渲染空 div，effect 裡 `innerHTML=殼` → `initMall` | ⚠️ 刻意**不用** dangerouslySetInnerHTML——React 重渲染的調和會把引擎 DOM 洗回空殼（踩過） |
| `app/sell/market.css` | 檔尾兩段：「v3 原型完整樣式」（513 條，逐條 `.mk` 前綴）＋「宿主適配層」 | 改樣式改 v3 那段；適配層只管定位（sticky 頂欄／fixed 底欄／`#sheets` fixed 滿版 z-1000 當手機外框） |
| 舊實資料版 | git 歷史（v2026.08.14i 之前的 `app/sell/**`） | supabase 呼叫可以從那裡搬回來用 |
| 子路由 | `/sell/manage`、`/sell/orders`、`/sell/new`… 還在但主動線不經過 | 接線完成後整批清掉（改轉址殼） |

## 已定案的商業規則（跟老闆確認過，不要重開）

1. **C2C 五步流程**：待付款 → 待確認收款 → 待出貨 → 待收貨 → 完成（＋已取消）。原型 v3 已照此畫
2. **15 分鐘付款倒數**：管的是「按下我已完成匯款」，不是入帳。剩 3 分鐘推播提醒；歸零只取消還停在待付款的單（按鈕與取消原子互斥）
3. **待確認收款**：賣家 15 分鐘沒處理 → 視同已收款自動進待出貨（原型如此）；賣家可按「未收到款項，取消訂單」
4. **未收到款取消 → 保證金進 72 小時申訴保留期**：買家附憑證（截圖/末五碼/時間/金額）申訴 → 後台判定「賠付＋停權」或「解鎖結案」。取消單保留聊聊＋申訴入口
5. **保證金 = ⌈成交小計 × 等級比例⌉**（運費不計）：新手 100%／銀牌 60%（≥10 單且 ≥95%）／金牌 30%（≥100 單且 ≥98%）。下單瞬間鎖，可用 G 不足直接不給成立（「賣家目前無法接單」）。逾時申訴賠付＝保證金（不是訂單全額，原型文案要跟著改）
6. **收款方式複選**（銀行轉帳＋LINE Pay，至少留一種），買家下單時選、訂單記選了哪種
7. 玩家商城平台**不經手金流、不收成交手續費**；官方商城走綠界。上架要審核（DB trigger 擋，migration 552/554）

## 接線順序（老闆核可的六批）

### 第一批：DB 資料模型
- **兩層規格樹**：`sell_listings.items` 改 `{n,o:[{v,items:[{n,p,q,img}]}]}` 結構；`create_sell_order` 改收（群組,品項）定位；庫存扣減/回補跟著改
- **一單多商品**：新 `sell_order_items` 明細表（購物車合併結帳用）
- 收款複選（profiles 多值＋訂單記選擇）；保證金公式改成交小計；商品狀態欄（未拆/近全新/已拆封）
- ⚠️ migration 下一號 **570**；兩台電腦都在開發，先 `git fetch` 看 origin 最新編號再取號（撞過兩次）

### 第二批：購買鏈接線
- feed/詳情/店舖 → 既有 `sell_feed`/`sell_feed_one`/`sell_shop_feed`/`sell_shop_header`（569）
- 新：`sell_cart` 表＋CRUD；結帳建單（多商品＋配送方式＋備註欄）；15 分鐘 expiry（`sell_run_order_expiry` 改分鐘級：懶取消或下單排單次 job）

### 第三批：糾紛鏈
- 新 `sell_appeals` 表＋未收到款取消 RPC＋72hr 保留＋後台判定 API（賠付走 `sell_order_claim_compensation` 的路子）
- 原型「我的」裡的「後台·檢舉判定」是 demo——真實版做在**管理後台商城檢舉頁**，玩家端拿掉

### 第四批：社交鏈
- 聊聊 → `sell_messages`（加 meta 存商品卡/訂單卡 ctx、read_at 未讀）；通知 → `notifications` 表＋五類商城事件寫入（新訂單/逾時/審核/廣告/保證金）
- 評價 → `sell_reviews`（567，DB 全在只缺 UI 接線）

### 第五批：增長鏈
- 優惠券（賣場券＋平台券：券定義/領用/核銷，新表）；廣告推廣中狀態/加購（bookings 資料都在）；搜尋 kw 置頂（bookings.keyword 出小 RPC）

### 第六批：官方 B2C
- 結帳接綠界（`shop_orders` 既有）＋退款申請 RPC＋後台處理

## 既有接口速查（都驗過可用）

`sell_feed(p_official,p_category,p_search,…)`、`sell_feed_one`、`sell_shop_feed/header`、
`sell_my_dashboard`、`sell_seller_tier`、`sell_deposit_for`、`sell_is_pro`、
`create_sell_order`、`cancel_sell_order`、`sell_order_mark_paid/confirm_payment/mark_shipped/confirm_received/claim_compensation`、
`sell_run_order_expiry`（cron 每時 :15）、`sell_ad_slots/availability/quote/bookings`、
後台 API：listings 審核／orders／reports＋停權／settings（商城設定頁）

## 環境備忘

- 本地 dev：前台 3000、後台 3001；前台 `.env.local` 指 **STG**（zqxxmdbvtwuiocebaxvk）
- STG 假數據：C2C 24 件＋官方 22 件＋十個廣告版位全訂滿（給舊實資料版用的；原型引擎現階段用內建假資料）
- migration 執行完 **PROD/STG 都要套**（CLAUDE.md 規則）；pg_cron 只有 PROD 有
