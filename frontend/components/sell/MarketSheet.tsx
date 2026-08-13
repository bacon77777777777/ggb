'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

/*
 * 商城的底部彈層 —— 照原型的 sheet()：scrim + 由下滑上的面板。
 *
 * 商品詳情、收銀台、規則說明在原型裡都是彈層而不是換頁，
 * 這樣逛街動線不會被打斷（關掉就回到剛才捲到的位置）。
 *
 * ⚠️ 進退場要走兩個 state：直接用 `open` 一個布林值切 class，
 * 元素是「掛上去的同時就已經是 .on」，CSS transition 沒有起始影格可以動，
 * 面板會用瞬移的方式出現。所以先掛上（transform 在畫面外），
 * 下一個影格再加 .on 才會滑上來；關閉則要等動畫跑完才卸載。
 */

const ANIM_MS = 280; // 與 market.css 的 transition 0.28s 對齊

export default function MarketSheet({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** 固定在底部的操作列（原型的 .abar） */
  footer?: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const t = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(t);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), ANIM_MS);
    return () => clearTimeout(t);
  }, [open]);

  // 彈層開著時鎖住背景捲動，不然滑到底會帶著整頁一起動
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!mounted) return null;

  return (
    <div className="mk">
      <div className={`mk-scrim${shown ? ' on' : ''}`} onClick={onClose} />
      <div className={`mk-sheet${shown ? ' on' : ''}`} role="dialog" aria-modal="true">
        <div className="shd">
          <h3>{title}</h3>
          <button type="button" className="x" onClick={onClose} aria-label="關閉">
            <X className="w-[15px] h-[15px]" strokeWidth={2.4} />
          </button>
        </div>
        <div className="sbd">{children}</div>
        {footer}
      </div>
    </div>
  );
}
