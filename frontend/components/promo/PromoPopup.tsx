'use client';

/**
 * 首頁彈窗 —— 進站後蓋一層，卡片下方一個獨立的關閉鈕
 *
 * 版型比照常見的活動彈窗（卡片 + 卡片外的圓形叉叉），
 * 叉叉刻意放在卡片外面而不是右上角：放右上角時 CTA 與關閉太靠近，
 * 手機單手操作誤觸率高，玩家會覺得被騙點。
 *
 * 延遲一拍再出現，避免和首頁本身的載入動畫疊在一起閃。
 *
 * 有多則上架時排隊顯示：關掉一則後接著跳下一則，依 sort_order 排序。
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePromos, type SitePromo, type NewArrivalProduct } from './usePromos';
import { hideForToday } from '@/lib/promoDismiss';
import { useRouteTransition } from '@/components/ui/RouteTransition';
import { CATEGORY_LABELS, categoryFlagKey } from '@/lib/categoryFlags';
import { asset } from '@/lib/asset';

/** 卡片版的統一模板底圖（含外框、緞帶、喇叭與按鈕），版位百分比由此圖量測而來 */
const TEMPLATE_BG = asset('/images/bg.webp');

/** 最新上架彈窗的外框（含「最新上架」字樣與狗狗），中間留白給商品 */
const NEW_ARRIVAL_BG = asset('/images/new_item.webp');

/**
 * 外框裡那塊白板的內容區。
 *
 * 2026-08-12 換圖：新的外框是 800×1189（與公告模板 bg.webp 同尺寸），
 * 白板幾乎滿版 —— sharp 量原圖得 top 28.01% / bottom 0.25% / 左右各約 0.25%。
 * 這裡再往內縮出留白：上緣避開粉紅漸層、左右不要貼著圓角。
 * 上下留得比較緊（29% / 1.5%），把高度盡量讓給清單。
 */
const PANEL = { top: '29%', bottom: '1.5%', left: '6%', right: '6%' };

/** 商品頁網址：與 ProductCard 同一套規則，不要兩邊各寫一份 */
const productHref = (p: NewArrivalProduct) =>
  p.type === 'blindbox' ? `/blindbox/${p.id}`
    : p.type === 'gacha' ? `/gacha/${p.id}`
      : p.type === 'card' ? `/card/${p.id}`
        : `/item/${p.id}`;

/** 最新上架清單一次露出幾筆（捲到底再露一頁，直到全部顯示完） */
const NEW_ARRIVAL_PAGE = 10;
/** 距離底部幾 px 就算「捲到底」，提早一點載入才不會頓一下 */
const LOAD_MORE_THRESHOLD_PX = 48;

const APPEAR_DELAY_MS = 700;   // 首則：等首頁載入動畫跑完
const NEXT_DELAY_MS   = 260;   // 後續：讓上一則退場後再進場，不要疊在一起
const EXIT_MS         = 220;   // 與退場動畫時間相當

export default function PromoPopup({ placement = 'home' }: { placement?: string }) {
  const { promos, isLoaded } = usePromos(placement);
  const { navigate } = useRouteTransition();
  const [closedIds, setClosedIds] = useState<string[]>([]);
  const [current, setCurrent] = useState<SitePromo | null>(null);
  const [visible, setVisible] = useState(false);
  /** 「今日不再顯示」的勾選狀態。每換一則就歸零，不要沿用上一則的選擇 */
  const [hideToday, setHideToday] = useState(false);
  /** 最新上架清單目前露出幾筆，捲到底再加一頁 */
  const [visibleCount, setVisibleCount] = useState(NEW_ARRIVAL_PAGE);

  const shownOnceRef = useRef(false);

  // 挑下一則。
  // 「正在顯示的那則」存成 state 而不是每次從 promos 取第一筆：
  // 關閉會寫 localStorage 並觸發 usePromos 重新過濾，promos 會當場少一筆，
  // 直接取第一筆的話退場動畫還沒跑完，卡片內容就先被換成下一則了。
  useEffect(() => {
    if (!isLoaded || current) return;
    const next = promos.find(p => !closedIds.includes(p.id));
    if (next) setCurrent(next);
  }, [isLoaded, promos, closedIds, current]);

  // 進場延遲。刻意與上面拆開且只相依 current：
  // 兩件事寫在同一個 effect 時，setCurrent 會讓 effect 重跑並執行 cleanup，
  // 把還沒觸發的計時器清掉，結果彈窗永遠不會顯示。
  useEffect(() => {
    if (!current) return;
    const delay = shownOnceRef.current ? NEXT_DELAY_MS : APPEAR_DELAY_MS;
    setHideToday(false);
    setVisibleCount(NEW_ARRIVAL_PAGE);
    const t = setTimeout(() => { shownOnceRef.current = true; setVisible(true); }, delay);
    return () => clearTimeout(t);
  }, [current]);

  // 彈窗開著時鎖住背景捲動（同 components/ui/Modal.tsx 的作法）。
  // 這個 effect 必須放在下面的 early return 之前，否則 promo 為 null 時
  // hook 數量會變動。
  useEffect(() => {
    if (!visible) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; };
  }, [visible]);

  /*
   * 底圖先到、資料再淡入（老闆 2026-08-19）。
   * 原本兩者同時渲染，商品列會先出現在一片空白上，底圖才「啪」地補上來。
   *
   * ⚠ 一定要有逾時保險：底圖萬一載不出來（離線、CDN 掛掉、擋圖擴充套件），
   * 沒有這道保險整個彈窗會永遠空著 —— 那比先看到資料還糟。
   * onError 也要收，否則 404 時只會等到逾時才顯示。
   *
   * 必須放在下面那行提前 return 之前 —— hooks 不能條件式呼叫，
   * 放在 return 之後 lint 會直接報 rules-of-hooks（build 會失敗）。
   */
  /*
   * 只有「純圖」版型不需要等 —— 它整則就是一張圖，沒有要疊上去的東西。
   * 最新上架與公告卡片版都是「底圖 + 文字疊上去」，兩個都要等底圖到位
   * （老闆 2026-08-20：公告文字都出來了，底圖還沒出來）。
   */
  const wantsBg = !!current && !(current.layout === 'image' && !!current.image_url);
  const [bgReady, setBgReady] = useState(false);

  // 換下一則時重新等一次 —— 兩種版型用的底圖不同，不能沿用上一則的狀態
  useEffect(() => { setBgReady(false); }, [current?.id]);

  useEffect(() => {
    if (!wantsBg || bgReady) return;
    const t = setTimeout(() => setBgReady(true), 1200);
    return () => clearTimeout(t);
  }, [wantsBg, bgReady]);

  const promo = current;
  if (!promo) return null;

  // 沒圖就退回卡片版，否則會彈出一個全空的彈窗
  const isImageOnly = promo.layout === 'image' && !!promo.image_url;

  /**
   * 點 CTA / 圖片：立刻蓋上全屏 loading 再換頁。
   * 只呼叫 close() 的話，彈窗會先收起、畫面停在舊頁等路由切換，
   * 看起來像按了沒反應。
   */
  const isNewArrival = promo.layout === 'new_arrival';


  /*
   * 點內容就是要去看，不算「不想再看到」——只有按叉叉時才把勾選存起來。
   * （老闆指定：按叉叉＝儲存並關閉）
   */
  const go = (href: string | null) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (href) navigate(href);
    else setVisible(false);
  };

  const close = () => {
    setVisible(false);
    if (hideToday) hideForToday(promo.id);
    const id = promo.id;
    setTimeout(() => {
      setClosedIds(prev => [...prev, id]);
      setCurrent(null);          // 讓上面的 effect 接手挑下一則
    }, EXIT_MS);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[120] flex flex-col items-center justify-center px-8 bg-black/60 backdrop-blur-[2px] overscroll-contain"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          data-testid="promo-popup"
          /* iOS Safari 光靠 body overflow:hidden 擋不住手勢，
             遮罩本身要吃掉 touchmove；卡片內文那塊需要捲動，故不用 touch-action:none */
          onTouchMove={e => { if (e.target === e.currentTarget) e.preventDefault(); }}
        >
          <motion.div
            className={`w-full max-w-[330px] ${isImageOnly ? 'rounded-3xl overflow-hidden' : ''}`}
            initial={{ scale: 0.88, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          >
            {/* 最新上架：外框已經畫好標題與狗狗，中間白板放商品格 */}
            {isNewArrival ? (
              /* 比例綁死 800/1189（與公告模板同尺寸），下面 PANEL 的百分比才對得上 */
              <div className="relative w-full" style={{ aspectRatio: '800 / 1189' }}>
                <Image
                  src={NEW_ARRIVAL_BG}
                  alt=""
                  fill
                  priority
                  className="object-contain select-none pointer-events-none"
                  unoptimized
                  onLoad={() => setBgReady(true)}
                  onError={() => setBgReady(true)}
                />
                <div
                  className="absolute flex flex-col transition-opacity duration-300"
                  style={{ ...PANEL, opacity: bgReady ? 1 : 0 }}
                  aria-hidden={!bgReady}
                >
                  {/* 條列式：小圖 ＋ 類別膠囊 ＋ 名稱／價格。
                      每列不再有自己的卡片外框（老闆指定移除），改用淡分隔線隔開 ——
                      白板本身就是白的，再套一層淺灰卡片只是把版面切得更碎 */}
                  <div
                    className="flex-1 min-h-0 divide-y divide-neutral-100 overflow-y-auto"
                    /* 捲到接近底部就再露一頁。用 scroll 事件而不是 IntersectionObserver：
                       這裡只有一個容器、清單也不長，多掛一個 observer 不划算 */
                    onScroll={e => {
                      const el = e.currentTarget;
                      if (el.scrollHeight - el.scrollTop - el.clientHeight > LOAD_MORE_THRESHOLD_PX) return;
                      setVisibleCount(c => Math.min(c + NEW_ARRIVAL_PAGE, promo.products?.length ?? c));
                    }}
                  >
                    {(promo.products ?? []).slice(0, visibleCount).map(p => {
                      const cat = categoryFlagKey(p.type)
                      return (
                        <Link
                          key={p.id}
                          href={productHref(p)}
                          onClick={go(productHref(p))}
                          className="flex w-full items-center gap-2.5 py-1.5 text-left transition-transform active:scale-[0.99]"
                        >
                          {/* object-contain 不裁切：商品主圖直式橫式都有，cover 會把海報標題切掉 */}
                          {/* 不加白底：外框上緣是粉紅漸層，白色方塊會浮出來
                              （容器已經照老闆指定拿掉了，縮圖也不該自己帶一塊底） */}
                          <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg">
                            {p.image_url
                              ? <img src={p.image_url} alt={p.name} className="h-full w-full object-contain" />
                              : <span className="flex h-full w-full items-center justify-center text-[10px] text-neutral-400">無圖</span>}
                          </span>
                          <span className="min-w-0 flex-1">
                            {/* 類別膠囊擺在商品名上面、與名稱切齊左緣（老闆指定）。
                                固定寬 46px：兩字（抽卡）與三字（自製賞）等寬，
                                一排看下來邊緣才是一直線。
                                底色與字色都調深過 —— neutral-100/500 在粉紅漸層上看不清楚 */}
                            {cat && (
                              <span className="mb-0.5 inline-flex w-[46px] items-center justify-center rounded-md bg-neutral-200 py-0.5 text-[10px] font-black leading-none text-neutral-700">
                                {CATEGORY_LABELS[cat]}
                              </span>
                            )}
                            <span className="block truncate text-[13px] font-bold leading-[1.25] text-neutral-900">{p.name}</span>
                            {/* 金額比照商品小卡：G 幣圖示 ＋ font-amount ＋ 主題色。
                                小卡是 24px，這裡是列表所以縮到 15px，其餘一致 */}
                            {p.price != null && (
                              <span className="mt-0.5 flex items-center gap-1">
                                <Image src={asset("/images/gcoin.webp")} alt="G" width={12} height={12} className="h-3 w-3 object-contain" />
                                <span className="font-amount text-[15px] font-black leading-none tracking-tight text-amount">
                                  {p.price.toLocaleString()}
                                </span>
                              </span>
                            )}
                          </span>
                        </Link>
                      )
                    })}
                  </div>
                  {/* 底部淡出：清單超出內容區時的「還有更多」提示。
                      初始畫面常常剛好停在某一列的結尾，沒有這道漸層看不出來可以捲。
                      pointer-events-none 才不會擋到最後一列的點擊 */}
                  {visibleCount < (promo.products?.length ?? 0) && (
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-white to-transparent" />
                  )}
                </div>
              </div>
            ) : isImageOnly ? (
              /* 與卡片版同比例，多則排隊時尺寸才不會忽大忽小。
                 比例不符用 fill 拉伸而不裁切：banner 的文案是畫在圖裡的，
                 裁掉的很可能就是標題，變形至少看得出來要換圖。 */
              <Link
                href={promo.cta_href || '#'}
                onClick={go(promo.cta_href)}
                className="relative block w-full"
                style={{ aspectRatio: '800 / 1189' }}
              >
                <img
                  src={promo.image_url!}
                  alt={promo.body}
                  className="absolute inset-0 w-full h-full block"
                  style={{ objectFit: 'fill' }}
                />
              </Link>
            ) : (
              /* 卡片版＝統一模板：底圖已含外框、緞帶與按鈕，文字依量測出的版位疊上去。
                 模板不裁切也不自己畫底色，容器比例綁死 800/1189，
                 這樣喇叭超出卡片的部分才不會被切掉。 */
              <div className="relative w-full" style={{ aspectRatio: '800 / 1189' }}>
                <Image
                  src={TEMPLATE_BG}
                  alt=""
                  fill
                  priority
                  className="object-contain select-none pointer-events-none"
                  unoptimized
                  onLoad={() => setBgReady(true)}
                  onError={() => setBgReady(true)}
                />

                {/* 文字區：米白內板往內縮，下緣停在按鈕上方。
                    標題固定不捲動，內文吃剩餘高度並自行捲動 ——
                    整塊一起捲的話，標題會被捲出畫面，玩家就不知道在講什麼 */}
                <div
                  className="absolute flex flex-col transition-opacity duration-300"
                  /* top 用百分比而非固定 24px：卡片在小螢幕會等比縮小，
                     寫死 px 的話留白會相對變大 */
                  style={{ left: '9%', right: '9%', top: '27.9%', bottom: '17.5%', opacity: bgReady ? 1 : 0 }}
                  aria-hidden={!bgReady}
                >
                  {promo.title && (
                    <h2
                      /* 不用 text-balance：它會為了讓每行等長而提早斷行，
                         右側明明還有空間卻換行。標題要盡量填滿一行 */
                      className="flex-shrink-0 text-[20px] font-black leading-[1.35] text-[#0b3b8c] overflow-hidden"
                      style={{
                        display: '-webkit-box',
                        WebkitBoxOrient: 'vertical',
                        WebkitLineClamp: 3,   // 超過三行以刪節號收尾
                      }}
                    >
                      {promo.title}
                    </h2>
                  )}
                  <p className="mt-2.5 flex-1 min-h-0 overflow-y-auto text-[15px] leading-[1.6] text-neutral-700 whitespace-pre-line">
                    {promo.body}
                  </p>
                </div>

                {/* 按鈕文字疊在底圖已經畫好的橘色藥丸上 */}
                {promo.cta_text && (
                  <Link
                    href={promo.cta_href || '#'}
                    onClick={go(promo.cta_href)}
                    className="absolute flex items-center justify-center text-white text-[15px] font-black active:scale-[0.97] transition-transform duration-300"
                    style={{ left: '22.38%', top: '85.95%', width: '55.25%', height: '8.49%', opacity: bgReady ? 1 : 0 }}
                  >
                    {promo.cta_text}
                  </Link>
                )}
              </div>
            )}
          </motion.div>

          {/* 今日不再顯示：放在卡片與叉叉之間。
              勾了之後按叉叉才會存起來 —— 只是勾一下就生效的話，
              玩家還沒決定要不要關就已經被記住了 */}
          <label className="mt-5 flex items-center gap-2 text-[13px] text-white/85 select-none cursor-pointer">
            <span
              className={`w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center transition-colors ${
                hideToday ? 'bg-white border-white' : 'border-white/60'
              }`}
            >
              {hideToday && <Check className="w-3 h-3 text-neutral-800" strokeWidth={3} />}
            </span>
            <input
              type="checkbox"
              className="sr-only"
              checked={hideToday}
              onChange={e => setHideToday(e.target.checked)}
            />
            今日不再顯示
          </label>

          <button
            type="button"
            onClick={close}
            aria-label="關閉"
            className="mt-4 w-10 h-10 rounded-full border border-white/50 flex items-center justify-center text-white/90 active:scale-95 transition-transform"
          >
            <X className="w-5 h-5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
