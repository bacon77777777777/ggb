'use client';

/**
 * 捲動時收起底部欄（手機用）
 *
 * 老闆 2026-08-29：首頁往下滑就把底部導航與公平性警語列收掉，
 * 把那 100 多 px 還給商品列表；手指往回撥一點點就要馬上出現。
 *
 * ── 為什麼不是「看方向」而是「累積位移」 ──
 * 單看每一幀的正負號，手指停在螢幕上的微小抖動就會讓底欄一直進出。
 * 這裡改成同方向累積，換方向就歸零，超過門檻才動：
 *   往下累積 `hideAfter`（8px）才收起 —— 擋掉抖動，正常滑動一幀就過了
 *   往上累積 `showAfter`（2px）就展開 —— 老闆指定，撥一下就要看到
 *
 * ── 三個一定要擋的假捲動 ──
 * ① 橡皮筋回彈：iOS 的 `scrollY` 會超出 [0, max]，放手回彈那段是反方向的，
 *    不夾住的話在頁面頂／底來回時底欄會自己彈出來。
 * ② 程式跳轉：首頁從商品頁返回會 `scrollTo` 還原位置，一次跳幾千 px。
 *    那不是手勢，`maxDelta` 以上直接忽略（只更新基準，不累積）。
 * ③ 頁面最上方：`topThreshold` 以內一律顯示 —— 那裡本來就看得到整頁，
 *    藏起來只是讓玩家少一個入口。
 *
 * 只在手機寬度生效（底部導航本身就是 `md:hidden`）。桌機或關閉時固定回傳 false。
 */

import { useEffect, useState } from 'react';

export interface HideOnScrollOptions {
  /** 關掉時固定回傳 false（例如非首頁） */
  enabled?: boolean;
  /** 生效的螢幕寬度，預設對齊 tailwind 的 md */
  mediaQuery?: string;
  /** 捲動位置在這之內一律顯示 */
  topThreshold?: number;
  /** 往下累積多少 px 收起 */
  hideAfter?: number;
  /** 往上累積多少 px 展開 */
  showAfter?: number;
  /** 單次位移超過這個值視為程式跳轉，不列入累積 */
  maxDelta?: number;
  /** 捲動容器（預設 window）。倉庫這種 fixed 覆蓋層是內部捲動，window.scrollY 不會動 */
  targetRef?: { current: HTMLElement | null };
  /**
   * 捲動容器選擇器 —— 比 targetRef 穩：renderTabContent 這類「同一份內容渲染兩個版位
   * （手機＋桌機）」的頁面，ref 會落在後渲染的隱藏那份上，selector 每次讀值
   * 都挑「當下可見」的那顆（2026-09-02 倉庫踩過）
   */
  targetSelector?: string;
}

export function useHideOnScroll(options: HideOnScrollOptions = {}): boolean {
  const {
    enabled = true,
    mediaQuery = '(max-width: 1023px)', // 768～1023 跟手機一樣會捲動收起（老闆 2026-09-05）
    topThreshold = 80,
    hideAfter = 8,
    showAfter = 2,
    maxDelta = 400,
    targetRef,
    targetSelector,
  } = options;

  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setHidden(false);
      return;
    }

    const mq = window.matchMedia(mediaQuery);
    let detach: (() => void) | null = null;

    const attach = () => {
      if (!mq.matches) {
        setHidden(false);
        return;
      }

      /*
       * 指名容器時**不能把節點抓死**：loading 早退、資料進來重建容器，
       * ref.current 會換人，綁在舊節點上的監聽器就聾了（2026-09-02 踩過）。
       * 改成：監聽掛在 window 的捕獲階段（scroll 不冒泡但捕獲收得到所有元素的捲動），
       * 每次讀值都從 ref.current 取當下那顆 —— 節點怎麼換都跟得上。
       */
      const useContainer = !!(targetSelector || targetRef);
      const resolve = (): HTMLElement | null => {
        if (targetSelector) {
          const list = document.querySelectorAll<HTMLElement>(targetSelector);
          for (const el of list) if (el.offsetParent !== null) return el; // 挑可見的那顆
          return list[0] ?? null;
        }
        return targetRef?.current ?? null;
      };
      const getY = () => {
        if (useContainer) return resolve()?.scrollTop ?? 0;
        return window.scrollY;
      };
      const getMax = () => {
        if (useContainer) {
          const t = resolve();
          return t ? Math.max(0, t.scrollHeight - t.clientHeight) : 0;
        }
        return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      };

      let last = getY();
      let acc = 0;
      let raf = 0;

      const read = () => {
        raf = 0;
        const max = getMax();
        const y = Math.min(Math.max(getY(), 0), max);   // ① 夾住橡皮筋
        const delta = y - last;
        last = y;
        if (delta === 0) return;

        if (Math.abs(delta) > maxDelta) {                        // ② 程式跳轉
          acc = 0;
          return;
        }
        if ((delta > 0) !== (acc > 0)) acc = 0;                   // 換方向重新累積
        acc += delta;

        if (y <= topThreshold) setHidden(false);                  // ③ 頁面最上方
        else if (acc <= -showAfter) setHidden(false);
        else if (acc >= hideAfter) setHidden(true);
      };

      const onScroll = () => {
        if (!raf) raf = requestAnimationFrame(read);
      };
      const opts: AddEventListenerOptions = useContainer
        ? { capture: true, passive: true }
        : { passive: true };
      window.addEventListener('scroll', onScroll, opts);
      detach = () => {
        window.removeEventListener('scroll', onScroll, opts);
        if (raf) cancelAnimationFrame(raf);
      };
    };

    const sync = () => {
      detach?.();
      detach = null;
      attach();
    };

    sync();
    mq.addEventListener('change', sync);
    return () => {
      mq.removeEventListener('change', sync);
      detach?.();
    };
  }, [enabled, mediaQuery, topThreshold, hideAfter, showAfter, maxDelta]);

  return hidden;
}
