'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import SoundToggle from '@/components/ui/SoundToggle';
import {
  bigRip, crackle, flashPop, spawnConfetti, unlockTearAudio,
  sfxTicketDrop, sfxGrab, sfxTension, sfxFlutter, sfxBounceBack,
  sfxRiser, sfxRevealCommon, sfxRevealGrand, sfxInterlude,
  startTearMusic, stopTearMusic, setTearDucking,
} from '@/lib/tearSfx';
import { isSoundMuted } from '@/lib/soundPrefs';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { asset } from '@/lib/asset';

declare global {
  interface Window { jQuery: any }
}

interface FigmaTearSceneProps {
  prizeTierLetter: string;
  onDone?: () => void;
  initialDone?: boolean;
  isLast?: boolean;
  onNext?: () => void;
  onOpenAll?: () => void;
  onBack?: () => void;
}

export default function FigmaTearScene({
  prizeTierLetter,
  onDone,
  initialDone = false,
  isLast = true,
  onNext,
  onOpenAll,
  onBack,
}: FigmaTearSceneProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const flipbookRef   = useRef<HTMLDivElement>(null);
  const [dims, setDims]           = useState({ w: 393, h: 844 });
  const [done, setDone]           = useState(initialDone);
  const [showButton, setShowButton] = useState(initialDone);
  const [showPrize, setShowPrize]  = useState(initialDone);
  const [touched, setTouched]     = useState(false);
  // 防止 auto-trigger 重複呼叫（rare race condition）
  const finishedRef = useRef(false);
  const wrapperRef    = useRef<HTMLDivElement>(null);  // .ichiban-flipbook
  const turnReady     = useRef(false);
  const pressStartX   = useRef<number | null>(null);
  const pressStartY   = useRef<number | null>(null);
  const slideRight    = useRef(false);
  const hasMoved      = useRef(false);  // 任何 pointermove 觸發即為 true，比 slideRight 更早

  /**
   * 撕完一整張所需的拖曳距離，以場景寬度為單位。
   * turn.js 過半就算撕開，所以真正的門檻是這個數字的一半 —— 393px 的手機約 82px，
   * 摺紙點大致跟著手指 1:1 走（券本身就佔場景寬度的一半左右）。
   */
  const TEAR_SCREEN_RATIO = 0.42;
  /** turn.js 的內部把手：拆掉它自己的 DOM listener 之後，改由我們手動餵事件 */
  const turnApi = useRef<{ handlers: any; pages: any } | null>(null);
  /** 這一次全螢幕拖曳的起始資料（摺紙原點、螢幕位移換算摺紙位移的倍率） */
  const dragRef = useRef<{ active: boolean; cornerX: number; cornerY: number; gain: number; pageW: number; pageH: number } | null>(null);

  /*
   * 獎項文字要等蓋板圖真的載好才顯示。
   *
   * 原本是寫死 `setTimeout(…, 2000)`，註解也直說是「讓 up1.svg 先載入蓋住」——
   * 但那是用猜的秒數。冷快取或網路慢的時候 2 秒不夠，蓋板還沒出現、
   * 獎項文字就先浮上來，玩家還沒撕就看到「A賞」，整個演出直接爆雷。
   *
   * 改成監聽實際的載入完成。MIN_DELAY 是節奏用的下限（避免跟蓋板同一幀出現）；
   * HARD_CAP 是保險 —— 圖真的掛了也不能永遠不顯示，否則撕開後是一片空白。
   */
  useEffect(() => {
    if (initialDone) return;

    const MIN_DELAY = 400;
    const HARD_CAP = 8000;
    const COVER_IMAGES = [
      asset('/images/ichiban-tear/up1.svg'),  // 蓋板正面，就是它擋住獎項
      asset('/images/ichiban-tear/up2.svg'),  // 掀起時的背面
      asset('/images/ichiban-tear/bg.svg'),   // 券底，獎項文字畫在它上面
    ];

    let cancelled = false;
    const startedAt = Date.now();
    let revealTimer: ReturnType<typeof setTimeout> | undefined;

    const reveal = () => {
      if (cancelled) return;
      const wait = Math.max(0, MIN_DELAY - (Date.now() - startedAt));
      revealTimer = setTimeout(() => {
        if (!cancelled) setShowPrize(true);
      }, wait);
    };

    let pending = COVER_IMAGES.length;
    const settle = () => {
      if (--pending <= 0) reveal();
    };

    COVER_IMAGES.forEach((src) => {
      const img = new window.Image();
      // 載失敗也要往下走：蓋板破圖的情況下，「撕開後什麼都沒有」比爆雷更糟
      img.onload = settle;
      img.onerror = settle;
      img.src = src;
    });

    const cap = setTimeout(reveal, HARD_CAP);
    return () => {
      cancelled = true;
      clearTimeout(cap);
      if (revealTimer) clearTimeout(revealTimer);
    };
  }, [initialDone]);

  // Container resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setDims({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setDims({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // 撕完後 1 秒顯示「下一張」按鈕（SKIP 隨時可按）
  useEffect(() => {
    if (!done || showButton) return;
    const t = setTimeout(() => setShowButton(true), 1000);
    return () => clearTimeout(t);
  }, [done, showButton]);

  // 最後一張撕完 → 1 秒自動結束（不等使用者按 SKIP）
  useEffect(() => {
    if (!done || !isLast) return;
    const t = setTimeout(() => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      (onOpenAll ?? onBack ?? onDone)?.();
    }, 1000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, isLast]);

  /*
   * 音效改用 WebAudio 合成（lib/tearSfx，自老闆的 ichiban-tear 原型移植）。
   * 原本是在翻頁動畫**完成之後**才播一顆 0.5 秒的撕紙 mp3，
   * 玩家整段拖曳都是安靜的，聲音永遠慢半拍 —— 這就是「音效對不上」的原因。
   */
  /** 上次觸發細碎聲的位移，每 8px 響一次（同原型） */
  const lastCrackle = useRef(0);
  /** 這次真的撕開了。放手時用它決定要不要把紙彈回去 */
  const tearCompleted = useRef(false);
  /**
   * 這一次按下有沒有真的接上 turn.js（＝正在撕）。
   *
   * 以前它的意思是「按的位置落在券左緣的撕取區」—— 因為 turn.js 只認那個角。
   * 現在改成全螢幕任何地方按下都算（老闆 2026-08-31），所以它只剩下
   * 「代理有沒有成功掛上」：turn.js 還沒初始化好時按下去，不出聲也不進撕開狀態。
   */
  const inGrabZone = useRef(false);
  /** 上一次 pointermove 的位置與時間 —— crackle 的強度吃「拖多快」而不只是「拖多遠」 */
  const lastMove = useRef<{ x: number; t: number } | null>(null);
  /** 這一次拖曳有沒有已經發過「拉緊」那一聲（只在剛開始拉的時候響一次） */
  const tensionDone = useRef(false);
  /** 演出用的計時器，卸載時要全部清掉 */
  const sfxTimers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => {
    sfxTimers.current.push(window.setTimeout(fn, ms));
  };

  /*
   * 按著不放的持續震動 —— **照抄蓄力開包那條曲線**（老闆 2026-09-01）。
   *
   * 第一版做成固定 70ms 的平拍、而且用最輕的 `hapticTick`（Taptic 的
   * selectionChanged），老闆回報手感跟蓄力開包不一樣。差在兩件事：
   *
   *   ① **強度**：蓄力用的是 `hapticLight`（impact LIGHT），明顯比 tick 重。
   *      網頁端的差別更大 —— tick 只 vibrate(6)，light 是 vibrate(12)。
   *
   * ⚠️ **「震動太大」要從密度降，不要從階級降**（2026-09-02 連撞兩次）：
   *   第一次把整條鋪底拿掉 → 幾乎不震。第二次改成 `hapticTick` → 還是沒感覺，
   *   因為 tick 在 iOS 走 `selectionChanged()`，那是 Apple 最弱的一階，
   *   單獨點一下就很輕，拿來連續打根本感覺不到（老闆：「按著不放的震動沒感覺」）。
   *   **impact LIGHT 已經是「摸得到」的下限**，再往下就是沒有。
   *   所以階級留在 `hapticLight`，改把 `GAP_TIGHT` 從 42ms 放寬到 78ms ——
   *   最密的時候由每秒 24 下降到 13 下，手感是「輕了」而不是「不見了」。
   *   撕開收尾那一下維持由 `hapticHeavy` 降成 `hapticMedium`。
   *   ② **節奏**：蓄力的震動節點是 [0.2, 0.38, 0.52, 0.64, 0.74, 0.82, 0.89, 0.95]，
   *      間隔由 140ms 一路縮到 42ms —— 等距的話手感是平的，密起來才有
   *      「快滿了」的蓄力感。這裡取同樣的頭尾。
   *
   * 差別只在「進度」是什麼。蓄力是固定 700ms 的時間軸；撕紙沒有時限，
   * 所以取**時間與拉開距離兩條進度的較大者**：
   *   ・按著不動 → 照蓄力同樣的 700ms 由疏到密，滿了就維持最密（＝真的一直震）
   *   ・往外拉   → 拉得越開節拍越急，拉得快就早一點到最密
   * 兩條都算，手感才不會比蓄力弱。撕開的瞬間交給 `hapticMedium()` 收尾
   * ——跟蓄力滿格時那一下是同一個位置。
   *
   * 拖曳時每 8px 的顆粒感仍然照舊，只是跟鋪底**共用同一個節流時鐘**，
   * 而且最快不超過 GAP_TIGHT —— 不然快速拖動時兩套疊在一起會糊成一團嗡嗡聲。
   */
  const GAP_LOOSE = 150;   // 蓄力第一拍的間隔
  const GAP_TIGHT = 78;    // 蓄力最後一拍的間隔（也是整體的最快上限）
                           // ⚠️ 這個數字就是「震動多大」的旋鈕，不要去動 hapticX 的階級
  const RAMP_MS = 700;     // 蓄力從第一拍到最後一拍的長度，這裡照用
  const holdBuzzTimer = useRef<number | null>(null);
  const lastBuzzAt = useRef(0);
  /** 這一次拖曳離「撕開」還有多遠，0~1。pointermove 更新，決定節拍多密 */
  const tearProgress = useRef(0);
  /** 撕開所需的拖曳距離（px），按下時算好 */
  const tearNeed = useRef(0);
  /** 這一次按下的時間，時間那條進度用 */
  const holdStartAt = useRef(0);

  const gapNow = () => {
    const byTime = Math.min(1, (performance.now() - holdStartAt.current) / RAMP_MS);
    const p = Math.max(byTime, tearProgress.current);
    return GAP_LOOSE + (GAP_TIGHT - GAP_LOOSE) * p;
  };
  /** 震一下，但不會比 GAP_TIGHT 更密（拖曳顆粒與按住鋪底共用這個時鐘） */
  const buzz = (minGap = GAP_TIGHT) => {
    const now = performance.now();
    if (now - lastBuzzAt.current < minGap) return;
    lastBuzzAt.current = now;
    hapticLight();         // impact LIGHT —— 摸得到的下限，再輕就等於沒有
  };
  const scheduleHoldBuzz = () => {
    const gap = gapNow();
    holdBuzzTimer.current = window.setTimeout(() => {
      buzz(gap - 10);          // 剛剛才因為拖曳震過就跳過這一拍
      scheduleHoldBuzz();      // 下一拍的間隔重算，才跟得上進度
    }, gap);
  };
  const startHoldBuzz = () => {
    if (holdBuzzTimer.current !== null) return;
    tearProgress.current = 0;
    holdStartAt.current = performance.now();
    scheduleHoldBuzz();
  };
  const stopHoldBuzz = () => {
    if (holdBuzzTimer.current === null) return;
    window.clearTimeout(holdBuzzTimer.current);
    holdBuzzTimer.current = null;
    tearProgress.current = 0;
  };
  // 元件收掉時一定要停：不然離開這一張券之後手機還在震
  useEffect(() => stopHoldBuzz, []);

  /*
   * 背景音樂（懸念感）與券落定的聲音。
   *
   * 每一張券都是重新掛載這個元件（父層用 key 換），所以音樂會跟著每張重新起頭 ——
   * 中間有間奏聲蓋著，聽起來是「換一張、重新屏息」而不是斷掉。
   */
  useEffect(() => {
    if (initialDone) return;
    startTearMusic();
    const t = window.setTimeout(() => sfxTicketDrop(), 260);
    return () => {
      clearTimeout(t);
      sfxTimers.current.forEach(clearTimeout);
      sfxTimers.current = [];
      stopTearMusic();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 載入 jQuery + turn.js，初始化 flipbook
  useEffect(() => {
    if (done || turnReady.current || !flipbookRef.current) return;

    const injectScript = (src: string): Promise<void> =>
      new Promise<void>(resolve => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => resolve();
        document.head.appendChild(s);
      });

    let cancelled = false;
    // 儲存 jQuery 物件：在 done=true 後 flipbookRef.current 會先變 null，
    // 所以用 closure 變數保存，確保 destroy 在 cleanup 時能正確執行
    let $fbSaved: any = null;

    // 滑動追蹤：capture 相位確保在 turn.js 之前執行
    const getPtEl = () =>
      flipbookRef.current?.querySelector('.p-temporal') as HTMLElement | null;

    /*
     * 餵給 turn.js 的假事件。
     * 它內部有兩條路：觸控裝置讀 `originalEvent.touches[0]`，滑鼠讀事件本身，
     * 兩邊都只取 pageX/pageY —— 所以同時備妥這兩種形狀就通吃。
     */
    const fakeEvt = (pageX: number, pageY: number): any => ({
      pageX, pageY,
      originalEvent: { touches: [{ pageX, pageY }] },
      preventDefault() {}, stopPropagation() {},
      isDefaultPrevented: () => false,
    });

    const onCapturePointerDown = (e: PointerEvent) => {
      if (tearCompleted.current) return;
      // 按鈕不算撕紙：SKIP／下一張／聲音開關都掛 data-ui
      if ((e.target as HTMLElement | null)?.closest?.('[data-ui]')) return;

      setTouched(true);
      pressStartX.current = e.clientX;
      pressStartY.current = e.clientY;
      slideRight.current = false;
      hasMoved.current = false;  // 每次按下重置
      lastCrackle.current = 0;
      lastMove.current = null;
      tensionDone.current = false;

      /*
       * 全螢幕拖曳代理：畫面上任何一點按下去，都當成「捏住券的左緣」。
       *
       * turn.js 規定 mousedown/touchstart 必須落在它自己的 tl/bl 角上才會開始摺紙，
       * 而券只有 ~190px 寬，玩家得瞄準畫面裡一小塊地方才捏得到（老闆回報）。
       * 這裡改成由我們手動呼叫 turn.js 的 handler，起點餵在券左緣 ——
       * 摺紙曲線、陰影、過半才算撕開、沒過半就彈回，全部還是 turn.js 在做，沒有改。
       *
       * 摺紙的**方向**則跟著手指走（老闆 2026-09-01 回報「以前可以上下拖曳」）：
       *   ・按在券的上半 → 餵 tl 角，掀起來的是左上角
       *   ・按在券的下半 → 餵 bl 角，掀起來的是左下角
       *   ・拖曳過程再把手指的縱向位移 dy 一起餵進去（見 onCapturePointerMove），
       *     所以往上拖紙就往上、往下拖就往下
       * 這一段在改成全螢幕代理時被寫死成「左緣中點、y 永遠不動」，摺線因此只剩水平一種。
       *
       * y 的座標系：turn.js 是拿 `餵進來的 pageY − parent.offset().top` 去比
       * 自己的 layout height，所以基準要用 offsetHeight（未經 transform 的版面高），
       * 不能用 bounding rect —— 券是斜的，bounding rect 比實際高，換算會落到別的角。
       * cornerSize = ceil(fbH/2)+4，故 y<cs 判成 t、y≥cs 判成 b，各留 2px 邊界餘裕。
       */
      const api = turnApi.current;
      const fb = flipbookRef.current;
      const $ = window.jQuery;
      if (!api || !fb || !$) { inGrabZone.current = false; return; }

      const pos = $(fb).offset();
      const rect = fb.getBoundingClientRect();
      const grabbedTop = e.clientY < rect.top + rect.height / 2;
      const cornerX = pos.left + 2;
      const cornerY = grabbedTop ? pos.top + 2 : pos.top + fb.offsetHeight - 2;
      const pageW = fb.offsetWidth || 1;
      const pageH = fb.offsetHeight || 1;
      // 撕完一整張要拖 TEAR_SCREEN_RATIO 個畫面寬；過半即撕開，所以實際門檻是一半
      const need = Math.max(60, (containerRef.current?.clientWidth || window.innerWidth) * TEAR_SCREEN_RATIO);
      dragRef.current = { active: true, cornerX, cornerY, gain: pageW / need, pageW, pageH };
      // 過半即撕開 → 手指真正要走的距離是 need 的一半，震動節拍就照這個算進度
      tearNeed.current = need / 2;

      api.handlers.touchStart(fakeEvt(cornerX, cornerY));
      inGrabZone.current = true;

      // iOS 的 AudioContext 必須在使用者手勢裡建立，否則第一次撕會沒聲音
      if (!isSoundMuted()) {
        unlockTearAudio();
        sfxGrab();                       // 捏到了 —— 沒有這一聲玩家不知道自己抓住了
      }
      /* 震動不看靜音開關：靜音是為了不吵到別人，震動本來就是靜的（其他頁也是這樣） */
      hapticLight();                     // 捏到了的手感，跟 sfxGrab 同一刻
      lastBuzzAt.current = performance.now();
      startHoldBuzz();                   // 之後只要手指還壓著就一直震
    };

    const onCapturePointerMove = (e: PointerEvent) => {
      if (pressStartX.current === null) return;
      hasMoved.current = true;  // 只要有任何移動就設 true（turning gate 用這個）
      const d = dragRef.current;
      if (!d?.active || !inGrabZone.current) return;

      // 左滑右滑都算（老闆指定）—— 撕開的程度只看離按下點多遠
      const dx = Math.abs(e.clientX - pressStartX.current);
      // 拉得越開節拍越急，跟蓄力的 charge% 是同一回事
      tearProgress.current = tearNeed.current > 0 ? Math.min(1, dx / tearNeed.current) : 0;
      /*
       * 餵給 turn.js 的摺紙點。
       * X 決定「撕多開」，Y 決定「往哪個方向摺」—— 兩軸都要餵，只餵 X 摺線永遠是水平的。
       *
       * 兩軸仍然要夾住（放到無限大 turn.js 算出的角度會亂跳、紙會抖），但**上限不能
       * 卡在畫面裡**。舊值 X 是 `pageW * 1.15`：券的左緣在畫面 107/393 處、券寬約
       * 225，摺線最遠只能走到 365 —— 幾乎就是螢幕右緣。老闆回報「翻起的紙張到螢幕
       * 邊界就出不去了」講的就是這個：手指還在往右走，紙卻停在邊上不動了。
       *
       * 改成 2.6 倍（摺線可以整條走出畫面外），紙就會一路被掀出去，
       * 手指跟紙不再脫節。Y 同理放寬到 2 倍券高，往上／往下拖也不會提早卡住。
       */
      const dy = pressStartY.current === null ? 0 : e.clientY - pressStartY.current;
      const foldX = d.cornerX + Math.min(dx * d.gain, d.pageW * 2.6);
      const foldY = d.cornerY + Math.max(-d.pageH * 2, Math.min(dy * d.gain, d.pageH * 2));
      turnApi.current?.handlers.touchMove(fakeEvt(foldX, foldY));

      if (dx > 3) {
        slideRight.current = true;
        wrapperRef.current?.classList.add('tearing');
        const pt = getPtEl();
        if (pt) pt.style.visibility = 'visible';
      }
      // 拉緊但還沒撕開：纖維被扯住的悶聲，整段拖曳只響一次
      if (!isSoundMuted() && !tensionDone.current && dx > 6) {
        tensionDone.current = true;
        sfxTension();
      }
      /*
       * 虛線孔一格格裂開的細碎聲：跟著手指走，撕多少響多少。
       * 強度吃**拖曳速度**（px/ms）而不只是距離 —— 慢慢撕是細碎的啵啵，
       * 一口氣扯就是連續的刷，沉浸感差別最大的就是這裡。
       */
      if (dx - lastCrackle.current > 8) {
        const now = performance.now();
        const prev = lastMove.current;
        const speed = prev ? Math.abs(e.clientX - prev.x) / Math.max(1, now - prev.t) : 0.3;
        lastMove.current = { x: e.clientX, t: now };
        if (!isSoundMuted()) crackle(Math.min(1, 0.25 + speed * 0.5));
        /* 每一格都頓一下 —— 這一下才是「紙在我手上裂開」的來源，
           節流跟聲音共用同一個 8px 門檻，快撕就密、慢撕就疏 */
        buzz();   // 最快 GAP_TIGHT 一次，不會跟鋪底疊成一團
        lastCrackle.current = dx;
      }
    };

    const onPointerUp = () => {
      stopHoldBuzz();
      lastCrackle.current = 0;
      inGrabZone.current = false;

      const d = dragRef.current;
      if (d?.active) {
        d.active = false;
        const api = turnApi.current;
        const $ = window.jQuery;
        if (api && $) {
          /*
           * turn.js 還有一條捷徑：按下到放開不到 200ms 就直接翻頁（_eventReleased）。
           * 以前那要按在角上才中得到，現在按哪裡都算，隨手點一下券就撕開了。
           * 把每頁的 time 歸零關掉它 —— 撕不撕開純看拖了多遠，沒過半照樣彈回。
           */
          Object.keys(api.pages || {}).forEach((k) => {
            const f = api.pages[k]?.data?.()?.f;
            if (f) f.time = 0;
          });
          api.handlers.touchEnd(fakeEvt(d.cornerX, d.cornerY));
        }
      }

      /*
       * 沒撕完就要彈回去。
       * 原本只有「完全沒往右拖」才清掉 tearing —— 拖了一半放手的話，
       * turn.js 的頁面是彈回去了，但我們自己的撕開視覺（tearing class 與
       * 那條虛線）留在原地，紙看起來就一直是撕開的。
       */
      if (!tearCompleted.current) {
        wrapperRef.current?.classList.remove('tearing');
        const pt = getPtEl();
        if (pt) pt.style.visibility = '';
      }
      pressStartX.current = null;
      pressStartY.current = null;
    };

    (async () => {
      if (!window.jQuery)           await injectScript('/js/jquery.min.js');
      if (!window.jQuery?.fn?.turn) await injectScript('/js/turn.js');

      // 等下一個動畫幀：確保前一次交互的 mouseup/pointerup 事件已被瀏覽器清空，
      // 且 DOM layout 穩定（第二次購買無 await 時同步跑到這裡，RAf 提供必要的間隔）
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

      if (cancelled || !flipbookRef.current) return;

      const $ = window.jQuery;
      if (!$) return;

      const $fb = $(flipbookRef.current);
      // 防禦：若舊 turn.js 資料殘留在此元素（key 已變不應有，但保險起見），先清除
      try { if ($fb.data('turn')) $fb.turn('destroy'); } catch { /* ignore */ }
      // 核心清理：移除 document 上所有 jQuery drag 事件
      // turn.js 用無 namespace 的 bind，destroy 用 specific handler ref unbind
      // 若上一個 instance 的 destroy 因某原因未執行，殘留 handler 可能阻擋新 instance
      // 本 app 只有 turn.js 會在 document 上 bind mousemove/mouseup，所以全清安全
      try { $(document).off('mousemove mouseup touchmove touchend'); } catch { /* ignore */ }

      document.addEventListener('pointerdown', onCapturePointerDown, true);  // capture
      document.addEventListener('pointermove', onCapturePointerMove, true);  // capture
      document.addEventListener('pointerup',   onPointerUp);
      document.addEventListener('pointercancel', onPointerUp);

      // cornerSize 超過高度一半 → tl+bl 合起來覆蓋整個 Y 軸；X 軸觸發寬度 = cornerSize
      const fbH = flipbookRef.current.clientHeight || 100;
      const cs  = Math.ceil(fbH / 2) + 4; // +4 確保中間無縫

      $fb.turn({
        display:     'single',
        gradients:   true,
        duration:    800,
        pages:       2,
        direction:   'rtl',
        autoCenter:  false,
        elevation:   0,
        cornerSize:  cs,
        turnCorners: 'tl,bl',
        when: {
          // turning gate 已移除：turn.js 需要拖曳過 50% 才完成，純點擊不會到達，不需攔截
          turned: (_e: Event, page: number) => {
            if (page === 2) {
              tearCompleted.current = true;
              stopHoldBuzz();         // 撕開了就不用再鋪底，重的那一下自己來
              hapticMedium();         // 撕開的那一下，跟 bigRip 同一刻
              if (!isSoundMuted()) {
                /*
                 * 張力曲線的後半段：撕開（爆）→ 紙片飄落 → **靜半拍** → 揭曉（亮）。
                 * 那個「靜半拍」是刻意的 —— 撕完立刻上號角就不緊張了。
                 * A賞與最後賞給長號角＋亮片，其餘統一清脆 ding（老闆 2026-08-30）。
                 */
                setTearDucking(true);
                bigRip();
                later(() => sfxFlutter(), 220);
                later(() => sfxRiser(0.5), 320);
                const grand = prizeTierLetter === 'LAST' || prizeTierLetter.toUpperCase().startsWith('A');
                later(() => (grand ? sfxRevealGrand() : sfxRevealCommon()), 860);
                later(() => setTearDucking(false), grand ? 2600 : 1600);
              }
              const host = wrapperRef.current?.parentElement ?? wrapperRef.current;
              if (host) {
                // 撕開的同時就撒，等 setDone 之後這個節點就不在了
                if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
                flashPop(host);      // 先鋪黃光，紙屑蓋在它上面
                spawnConfetti(host);
              }
              setTimeout(() => setDone(true), 300);
            } else if (page === 1) {
              hapticLight();          // 沒撕開、彈回去了，手上也要知道
              if (!isSoundMuted()) sfxBounceBack();
              // 彈回時清除拖曳狀態
              wrapperRef.current?.classList.remove('tearing');
              const pt = getPtEl();
              if (pt) pt.style.visibility = '';
            }
          },
        },
      });

      /*
       * 拆掉 turn.js 自己綁的三個 DOM listener，改由上面那組 pointer handler 手動餵。
       *
       * **不拆不行**：手指真的滑過畫面時，turn.js 綁在 document 上的 mousemove／touchmove
       * 會用手指的真實座標去改摺紙點，跟我們餵進去的位置打架 —— 紙會抖。
       * 拆掉之後 turn.js 只剩「怎麼摺、要不要翻」的邏輯，事件全由我們決定。
       */
      const tdata = $fb.data();
      if (tdata?.eventHandlers) {
        $fb.off('mousedown touchstart', tdata.eventHandlers.touchStart);
        $(document)
          .off('mousemove touchmove', tdata.eventHandlers.touchMove)
          .off('mouseup touchend',    tdata.eventHandlers.touchEnd);
        turnApi.current = { handlers: tdata.eventHandlers, pages: tdata.pages };
      }

      $fbSaved = $fb;      // 儲存供 cleanup destroy 使用
      turnReady.current = true;
    })();

    return () => {
      cancelled = true;
      document.removeEventListener('pointerdown', onCapturePointerDown, true);
      document.removeEventListener('pointermove', onCapturePointerMove, true);
      document.removeEventListener('pointerup',   onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      turnApi.current = null;
      dragRef.current = null;
      // 用 closure 儲存的 $fbSaved，避免 flipbookRef.current 已經被 React 設為 null
      if (turnReady.current && $fbSaved) {
        try { $fbSaved.turn('destroy'); } catch { /* ignore */ }
        $fbSaved = null;
        turnReady.current = false;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const s            = dims.w / 393;
  const ticketW      = 255 * s;
  const ticketH      = 124 * s;
  const ticketGroupY = Math.max(0, (dims.h - 843 * s) / 2) + 217 * s;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{ minHeight: '100dvh', background: '#111', touchAction: 'none' }}
    >
      {/* 全屏背景 */}
      <Image src={asset("/images/ichiban-tear/bg.webp")} alt="" fill className="object-cover" unoptimized priority />

      {/* 聲音開關：撕紙聲跟中獎音效都在這個畫面響，位置與轉蛋機台同一套 */}
      <div data-ui className="absolute top-4 right-4 z-30">
        <SoundToggle safeTop />
      </div>

      {/* 場景群組：手 + 票 */}
      <div
        className="absolute"
        style={{
          top: ticketGroupY, left: -71 * s,
          width: 433 * s, height: 491 * s,
          transform: 'rotate(4deg)',
          pointerEvents: 'none',
        }}
      >
        {/* 手 */}
        <Image
          src={asset("/images/ichiban-tear/hand.webp")} alt="" unoptimized
          style={{
            position: 'absolute', top: 11 * s, left: 5 * s,
            width: 283 * s, height: 467 * s,
            transform: 'rotate(-5deg)', objectFit: 'contain',
            zIndex: 10,
          }}
          width={283} height={467}
        />

        {/* 票 */}
        <div style={{
          position: 'absolute',
          top: 34 * s, left: 178 * s,
          width: ticketW, height: ticketH,
          transform: 'rotate(-12deg)',
          pointerEvents: done ? 'none' : 'auto',
        }}>
          {/* 底層：bg.svg + 獎項文字 */}
          <div style={{ position: 'absolute', inset: 0, borderRadius: 18 * s, overflow: 'hidden' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset("/images/ichiban-tear/bg.svg")} alt=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            {/*
              賞等文字。

              2026-09-01 換新券之後這一段整個改過：
                ・**顏色**從淺灰 #D3D3D3 換成深色 —— 舊券的視窗是深藍底，
                  新券是白底，淺灰字在白底上等於看不見（textShadow 也一起拿掉）
                ・**位置**改成對準白色視窗的中心，不是整張券的中心：
                  券的左邊有一條「往右滑動撕開」的撕開條，照整張置中會偏左
                ・**字級**放大到視窗高度的量級（老闆 2026-09-01：「A 字太小了」，
                  同日再加大一次到 0.52）

              座標基準是 bg.svg 的 320×156。**要對準的是「空白處」不是整個白視窗** ——
              白底的上緣被藍色標題列與那行小字佔掉、下緣接著藍色頁腳，
              實際可寫的空白帶是 y 48–115（高 67）、x 37–313（左側 37 之前是撕開條）。
              中心取 (175, 86) —— 縱向不取空白帶的正中心 81，刻意往下 4 單位，
              因為 lineHeight:1 的行框底下留了降部空間、字看起來會偏高。
              賞等字級 0.52×ticketH（字高約 0.72 倍，約 58 單位，
              上下各留 4~5 單位）。換圖時重新量這條空白帶再調這三個數字即可。
            */}
            <div
              className="absolute inset-0"
              style={{ opacity: showPrize ? 1 : 0, transition: 'opacity 0.4s' }}
            >
              <div style={{
                position: 'absolute',
                left: 175 / 320 * ticketW,
                top:   86 / 156 * ticketH,
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                alignItems: 'baseline',
                gap: ticketH * 0.02,
                whiteSpace: 'nowrap',
                color: prizeTierLetter === 'LAST' ? '#E8A400' : '#1B1B1B',
                lineHeight: 1,
              }}>
                <span style={{
                  fontSize: ticketH * (prizeTierLetter === 'LAST' ? 0.32 : 0.52),
                  fontWeight: 900,
                }}>
                  {prizeTierLetter === 'LAST' ? 'LAST' : prizeTierLetter}
                </span>
                <span style={{
                  fontSize: ticketH * (prizeTierLetter === 'LAST' ? 0.20 : 0.22),
                  fontWeight: 900,
                }}>
                  {prizeTierLetter === 'LAST' ? 'ONE' : '賞'}
                </span>
              </div>
            </div>
          </div>

          {/* turn.js flipbook 貼紙蓋板 */}
          {!done && (
            <>
              <div
                ref={wrapperRef}
                className={`ichiban-flipbook${touched ? ' touched' : ''}`}
                style={{
                  position: 'absolute',
                  /*
                   * 貼紙蓋板在 bg.svg（320×156）座標上的位置。
                   * 2026-09-01 換新券：蓋板由 243×133 變成 280×137，
                   * 量到的券身 bbox 是 left 36 / top 10 / 276×135（長寬比 2.044，
                   * 跟蓋板的 280/137 完全一致 —— 兩張是同一個畫布尺度出的）。
                   * 這裡各留 1px 出血蓋過去，不然兩張的鋸齒邊形狀不同，
                   * 邊緣會露出一絲底下的藍色。
                   */
                  left:   33 / 320 * ticketW,
                  top:     8 / 156 * ticketH,
                  width:  282 / 320 * ticketW,
                  height: 138 / 156 * ticketH,
                  overflow: 'visible',
                  /*
                   * 貼紙的三張圖從這裡餵給 CSS（globals.css 的 .ichiban-flipbook 那段）。
                   * 用變數而不是 inline background：`.p-temporal`（掀起的背面）與漸層層
                   * 都是 turn.js 執行期塞的 DOM，JSX 碰不到，但變數會繼承下去。
                   * 一定要走 asset()：prod 帶內容雜湊，跟上面 COVER_IMAGES 的預載
                   * 必須是同一個網址，否則防爆雷的 gate 等的是另一個請求。
                   */
                  ['--tear-up1'  as string]: `url(${asset('/images/ichiban-tear/up1.svg')})`,
                  ['--tear-up2'  as string]: `url(${asset('/images/ichiban-tear/up2.svg')})`,
                  ['--tear-light' as string]: `url(${asset('/images/ichiban-tear/light.svg')})`,
                } as React.CSSProperties}
              >
                <div ref={flipbookRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
                  <div className="sheet cover" />  {/* 第 1 頁：up.svg 貼紙正面 */}
                  <div className="sheet blank" />  {/* 第 2 頁：透明，撕開後露出 bg */}
                </div>
              </div>

            </>
          )}
        </div>
      </div>

      {/*
        滑動提示。
        撕紙改成「畫面上任何地方按著拖」之後，提示就不能再貼在券上比劃左緣 ——
        那會繼續教玩家去捏那個小角落。改放在券下方的畫面中央，划一段夠長的距離。
      */}
      {!done && !touched && (
        <motion.div
          className="absolute left-1/2 z-20 flex flex-col items-center"
          style={{ top: '72%', width: 160 * s, marginLeft: -80 * s, pointerEvents: 'none' }}
          animate={{ opacity: [0.35, 1, 1, 0.35] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', times: [0, 0.25, 0.75, 1] }}
        >
          <motion.div
            style={{ width: 52 * s, height: 52 * s, position: 'relative' }}
            animate={{ x: [-46 * s, 46 * s, -46 * s] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Image src={asset("/images/finger.png")} alt="" fill className="object-contain drop-shadow-md" unoptimized />
          </motion.div>
          <span
            className="mt-1 whitespace-nowrap font-black text-white/90"
            style={{ fontSize: 13 * s, letterSpacing: '0.1em', textShadow: '0 2px 6px rgba(0,0,0,0.7)' }}
          >
            左右滑動撕開
          </span>
        </motion.div>
      )}

      {/*
        「下一張」＝**整個畫面都可以點**（老闆 2026-08-31）。

        先前是券右下角那顆會晃的按鈕；再之前是底部按鈕。兩版的問題是同一個：
        撕完的下一秒玩家的視線還黏在券上，還要先找到、再瞄準一顆按鈕。
        撕紙本身已經改成「畫面任一處按著拖」，換張也就沒有理由再要求瞄準。

        提示**跟「左右滑動撕開」完全同一個位置、同一個樣式**（老闆 2026-08-31）：
        兩段提示落在同一處、長得一樣，眼睛不用重新找、也不用重新認。
        所以這裡不畫膠囊，就是一行帶陰影的白字。
        它是 pointer-events-none 的裝飾，整層才是那顆按鈕。

        z-20：SKIP 與聲音開關是 z-30，疊在這層上面，照樣點得到。
      */}
      <AnimatePresence>
        {showButton && !isLast && (
          <motion.button
            key="next-tap"
            data-ui
            type="button"
            aria-label="下一張"
            onClick={() => {
              if (!isSoundMuted()) sfxInterlude();
              hapticLight();
              (onNext ?? onDone)?.();
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 z-20"
          >
            <motion.span
              className="pointer-events-none absolute left-1/2 whitespace-nowrap font-black text-white/90"
              style={{
                top: '72%',
                /* 「左右滑動撕開」那行字上面還有一張 52*s 的手指圖示（外加 mt-1），
                   要對齊的是**文字**不是容器，所以往下推同樣的距離 */
                marginTop: 52 * s + 4,
                transform: 'translateX(-50%)',
                fontSize: 13 * s,
                letterSpacing: '0.1em',
                textShadow: '0 2px 6px rgba(0,0,0,0.7)',
              }}
              animate={{ opacity: [0.35, 1, 1, 0.35] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', times: [0, 0.25, 0.75, 1] }}
            >
              點擊換張
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>

      {/*
        底部只留 SKIP。「下一張」不再是一顆按鈕，改成整個畫面都能點（見上）。
      */}
      <div className="absolute bottom-4 left-4 right-4 z-30 flex items-center justify-end gap-3">
        <button
          data-ui
          onClick={() => {
            if (finishedRef.current) return;
            finishedRef.current = true;
            (onOpenAll ?? onBack ?? onDone)?.();
          }}
          className="shrink-0 px-5 h-10 rounded-[8px] bg-black/60 border border-white/30 flex items-center justify-center text-white text-sm font-black tracking-[0.25em] active:scale-95"
        >
          SKIP
        </button>
      </div>
    </div>
  );
}
