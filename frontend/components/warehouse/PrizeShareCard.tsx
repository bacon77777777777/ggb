'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Share2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SHARE_BG, SHARE_LAYOUT, formatWonAt, formatWonMonth, type PrizeShareData,
} from '@/lib/prizeShare';

/**
 * 曬獎圖彈窗（老闆 2026-08-24）
 *
 * 倉庫勾選**單一**大獎品項 → 底部「曬圖」→ 這個彈窗：Canvas 合成的圖 + 「分享曬圖」。
 * 分享走系統面板（`navigator.share({ files })`，同邀請頁）；桌機或不支援時退成下載。
 *
 * 版位全部集中在 `lib/prizeShare.ts` 的 `SHARE_LAYOUT` —— 老闆換挖空底圖時只改那裡。
 *
 * ⚠️ 圖不上傳、不進 R2：Canvas 在瀏覽器合成完直接分享，零儲存成本。
 * 品項圖多半在 R2（`pub-*.r2.dev`），而那邊**不回 CORS 標頭** —— 直接用
 * crossOrigin='anonymous' 會載不到（圖是空的），不帶 crossOrigin 則會污染 canvas、
 * toBlob 丟 SecurityError。所以外部圖一律走同源代理 `/api/image-proxy`（白名單限定）。
 */
function loadImage(src: string, cors = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** 依字數折行，最多 maxLines 行，超出的最後一行加省略號 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const ch of text) {
    if (ctx.measureText(cur + ch).width <= maxWidth) { cur += ch; continue; }
    lines.push(cur);
    cur = ch;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length === maxLines && cur && lines[maxLines - 1] !== cur) {
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = last + '…';
  }
  return lines;
}

export function PrizeShareCard({ data, onClose }: { data: PrizeShareData; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [isRendering, setIsRendering] = useState(true);
  const [failed, setFailed] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const draw = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const L = SHARE_LAYOUT;
    canvas.width = L.canvas.w;
    canvas.height = L.canvas.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      // 字型要先就位，不然第一次畫出來是系統預設字
      try { await document.fonts.ready; } catch { /* 不支援就算了 */ }

      const bg = await loadImage(SHARE_BG);
      ctx.drawImage(bg, 0, 0, L.canvas.w, L.canvas.h);

      // 品項圖：contain 置中。外部網域（R2／Supabase）走同源代理，本站路徑直接用
      if (data.prizeImage) {
        try {
          const src = /^https?:\/\//i.test(data.prizeImage)
            ? `/api/image-proxy?url=${encodeURIComponent(data.prizeImage)}`
            : data.prizeImage;
          const img = await loadImage(src, true);
          const box = L.prizeImage;
          const scale = Math.min(box.w / img.width, box.h / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          ctx.drawImage(img, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
        } catch {
          // 品項圖載不到（外站擋 CORS、圖被刪）就只留底圖，其餘照畫
        }
      }

      const cjk = "'GGB CJK', 'PingFang TC', 'Noto Sans TC', sans-serif";
      const num = "'Oswald', 'GGB CJK', sans-serif";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';

      // 品項名稱
      const n = L.prizeName;
      ctx.fillStyle = L.colors.white;
      ctx.font = `700 ${n.size}px ${cjk}`;
      const nameLines = wrapText(ctx, data.prizeName || data.productName, n.maxWidth, n.maxLines);
      nameLines.forEach((line, i) => ctx.fillText(line, n.cx, n.y + i * n.lineHeight));

      /*
       * 三個數據（老闆指定）：抽獎次數／總抽金額／中獎時間（年月）。
       * 數字用 Oswald（跟站上金額同一套），單位用中文字型接在右邊。
       */
      const s = L.stats;
      const cells: { label: string; value: string; unit: string }[] = [
        { label: '總共抽了', value: data.drawCount.toLocaleString(), unit: '抽' },
        { label: '花費代幣', value: data.totalSpent.toLocaleString(), unit: '代幣' },
        { label: '中獎時間', value: formatWonMonth(data.wonAt), unit: '' },
      ];
      cells.forEach((cell, i) => {
        const cx = s.cx[i];
        ctx.fillStyle = L.colors.white;
        ctx.font = `500 ${s.labelSize}px ${cjk}`;
        ctx.fillText(cell.label, cx, s.labelY);

        /*
         * 數字＋單位要塞進欄寬（cellWidth）。花費代幣可能是五六位數（12,000／120,000），
         * 用固定字級會撞到隔欄，所以量過寬度就等比縮字級（最小 34px 還是看得清）。
         */
        // 型別要寫 number：SHARE_LAYOUT 是 as const，直接推導會變成字面量型別（62／24）不能重新賦值
        let valueSize: number = s.valueSize;
        let unitSize: number = s.unitSize;
        let vw = 0;
        let uw = 0;
        for (;;) {
          ctx.font = `700 ${valueSize}px ${num}`;
          vw = ctx.measureText(cell.value).width;
          ctx.font = `500 ${unitSize}px ${cjk}`;
          uw = cell.unit ? ctx.measureText(cell.unit).width + 6 : 0;
          if (vw + uw <= s.cellWidth || valueSize <= 34) break;
          valueSize -= 2;
          unitSize = Math.max(18, unitSize - 1);
        }
        const startX = cx - (vw + uw) / 2;

        ctx.textAlign = 'left';
        ctx.fillStyle = L.colors.lime;
        ctx.font = `700 ${valueSize}px ${num}`;
        ctx.fillText(cell.value, startX, s.valueY);
        if (cell.unit) {
          ctx.fillStyle = L.colors.white;
          ctx.font = `500 ${unitSize}px ${cjk}`;
          ctx.fillText(cell.unit, startX + vw + 6, s.valueY);
        }
        ctx.textAlign = 'center';
      });

      // 玩家名與完整時間
      const p = L.player;
      ctx.textAlign = 'left';
      ctx.fillStyle = L.colors.white;
      ctx.font = `700 ${p.nameSize}px ${cjk}`;
      ctx.fillText(data.playerName || 'GGB 玩家', p.x, p.nameY);
      ctx.fillStyle = L.colors.lime;
      ctx.font = `500 ${p.timeSize}px ${num}`;
      ctx.fillText(formatWonAt(data.wonAt), p.x, p.timeY);

      const out = await new Promise<Blob | null>(res => canvas.toBlob(b => res(b), 'image/png'));
      setBlob(out);
    } catch {
      setFailed(true);
    } finally {
      setIsRendering(false);
    }
  }, [data]);

  useEffect(() => { void draw(); }, [draw]);

  const share = async () => {
    if (!blob) return;
    setIsSharing(true);
    try {
      const file = new File([blob], `ggb-${data.drawId}.png`, { type: 'image/png' });
      const canShareFile = typeof navigator !== 'undefined'
        && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
      if (canShareFile) {
        await navigator.share({ files: [file] });
      } else {
        // 桌機／不支援檔案分享：退成下載（App 內的下載由原生殼攔截處理）
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // 玩家自己取消分享，不當成錯誤
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm px-4 pt-[env(safe-area-inset-top)] pb-[calc(16px+env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={onClose}
        aria-label="關閉"
        className="absolute right-4 top-[calc(16px+env(safe-area-inset-top))] flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm active:scale-95"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="relative flex max-h-[76vh] w-full max-w-[420px] items-center justify-center">
        <canvas
          ref={canvasRef}
          className={cn('max-h-[76vh] w-auto max-w-full rounded-2xl shadow-2xl transition-opacity', isRendering && 'opacity-0')}
        />
        {isRendering && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-white/70" />
          </div>
        )}
      </div>

      {failed ? (
        <p className="mt-4 text-sm font-bold text-white/70">曬圖產生失敗，請稍後再試</p>
      ) : (
        <button
          type="button"
          onClick={share}
          disabled={!blob || isSharing}
          className="mt-5 flex h-12 w-full max-w-[420px] items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-black text-white shadow-lg active:scale-95 disabled:opacity-60"
        >
          {isSharing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Share2 className="h-4 w-4" />}
          分享曬圖
        </button>
      )}
    </div>
  );
}

export default PrizeShareCard;
