'use client';

/*
 * 交易所的共用小元件。
 *
 * 全部輸出商城（app/sell/market.css）既有的 class —— 版型由那支 CSS 負責，
 * 這裡只負責把資料填進去。**不要在這裡寫 tailwind 重畫一次**，
 * 那等於跟商城分家，之後商城調版型交易所就跟著走鐘。
 *
 * 幣別是 G 幣不是 NT$，所以 .pprice 的單位擺在數字後面（見 exchange.css ②）。
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export const gnum = (n: number) => n.toLocaleString('en-US');

/** 賣家名 → 頭像圓點的顏色。商城的 hue()：同一個人永遠同一個顏色 */
export function hue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 62% 58%)`;
}

/** 相對時間。「3 分鐘前」比「2026-09-01 14:03」好讀，逛街時只想知道新不新 */
export function ago(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return '剛剛';
  if (m < 60) return `${m} 分鐘前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小時前`;
  const day = Math.floor(h / 24);
  if (day < 30) return `${day} 天前`;
  return new Date(iso).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
}

/* ────────────────────────────────────────────────
 * 彈層
 *
 * 商城的彈層手感：從底部推上來、背後壓一層黑幕、**手機返回鍵可以關**。
 * 最後那點是靠網址 —— 開彈層時 push 一格 `?v=<key>`，關的時候 back 回去。
 *
 * ⚠️ 分享連結直接開在 `?v=` 上的話，history 裡沒有我們推的那一格，
 * back 會離開整個站。所以要記住這一格是不是自己推的（pushedRef）。
 * ──────────────────────────────────────────────── */
export function useSheetRoute() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = params?.get('v') || '';
  const pushedRef = useRef(false);

  const open = (key: string) => {
    pushedRef.current = true;
    // 保留原本的查詢字串（交易所的分頁在 ?tab=）——只換掉 v。
    // 不保留的話彈層一開，後面那層會跳回預設分頁，關掉才彈回來
    const q = new URLSearchParams(params?.toString() || '');
    q.set('v', key);
    router.push(`${pathname}?${q}`, { scroll: false });
  };
  const close = () => {
    if (pushedRef.current) {
      pushedRef.current = false;
      router.back();
      return;
    }
    // 分享連結直接開在 ?v= 上：history 裡沒有我們推的那一格，back 會離開整個站
    const q = new URLSearchParams(params?.toString() || '');
    q.delete('v');
    // 用 toString() 判斷有沒有剩，不用 URLSearchParams.size —— 那個要 Safari 17，
    // 站上還有 iOS 16 的玩家
    const rest = q.toString();
    router.replace(rest ? `${pathname}?${rest}` : pathname, { scroll: false });
  };
  return { view, open, close };
}

export function Sheet({ open, title, onClose, children, footer, full }: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  full?: boolean;
}) {
  // 掛上之後下一幀才加 .on，transform 才有東西可以動（直接帶 .on 會沒有動畫）
  const [on, setOn] = useState(false);
  // 開場動畫走完就把過渡關掉（settled）：iOS 鍵盤彈出時視口會動，
  // 常駐的 transform 過渡會讓整張面板跟著「滑」一下（老闆 2026-09-02 回報）
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!open) { setOn(false); setSettled(false); return; }
    const t = requestAnimationFrame(() => setOn(true));
    const st = setTimeout(() => setSettled(true), 320);
    return () => { cancelAnimationFrame(t); clearTimeout(st); };
  }, [open]);

  // 面板開著時鎖住背景頁捲動（老闆 2026-09-02：面板內容不高時手勢穿透，
  // 後面的列表頁一直捲、螢幕右緣還冒出它的捲軸）
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  /*
   * 鍵盤讓位（老闆 2026-09-02：「輸入框 focus 時彈窗會跳一下」）。
   * iOS 鍵盤彈出時不縮排版視口，而是平移視覺視口＋對 fixed 層做一次
   * scroll-into-view 校正 —— 那一下就是跳動的來源。這裡自己用 visualViewport
   * 算出鍵盤高度、把 #sheets 的底部讓出來：輸入框永遠在鍵盤上方，
   * Safari 沒有東西要校正，就不跳了。瀏覽器沒鍵盤時 kb=0，什麼都不變。
   */
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const el = rootRef.current;
      if (!el) return;
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      el.style.bottom = kb ? `${kb}px` : '';
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      if (rootRef.current) rootRef.current.style.bottom = '';
    };
  }, [open]);

  if (!open) return null;
  return (
    <div id="sheets" ref={rootRef}>
      <div className="layer">
        <div className={`scrim${on ? ' on' : ''}`} onClick={onClose} />
        <div className={`sheet${full ? ' full' : ' tall'}${on ? ' on' : ''}`} style={settled ? { transition: 'none' } : undefined}>
          <div className="shd">
            <h3>{title}</h3>
            <button type="button" className="x" onClick={onClose} aria-label="關閉">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <div className="sbd">{children}</div>
          {footer && <div className="abar">{footer}</div>}
        </div>
      </div>
    </div>
  );
}

/** 確認框（商城的 .dlg）。買東西、下架這類不可反悔的動作走這個，不是 window.confirm */
export function Dialog({ open, title, desc, confirmText = '確定', onConfirm, onCancel, busy }: {
  open: boolean;
  title: string;
  desc?: ReactNode;
  confirmText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="dlg on" onClick={onCancel}>
      <div className="dlgbox" onClick={(e) => e.stopPropagation()}>
        <div className="dlgt">{title}</div>
        {desc && <div className="dlgs">{desc}</div>}
        <div className="dlgb">
          <button type="button" onClick={onCancel}>再想想</button>
          <button type="button" className="warn" onClick={onConfirm} disabled={busy}>
            {busy ? '處理中…' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 商城那顆貼在畫面中央的黑底提示 */
export function Toast({ text }: { text: string }) {
  return <div className={`toast${text ? ' on' : ''}`}>{text}</div>;
}

export function useMarketToast() {
  const [text, setText] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = (m: string) => {
    setText(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(''), 2200);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { text, show };
}
