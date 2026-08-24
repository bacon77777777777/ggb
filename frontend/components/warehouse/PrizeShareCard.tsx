'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Share2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SHARE_BG, SHARE_AVATAR_FALLBACK, SHARE_LAYOUT, formatWonAt, formatWonMonth, formatTokensShort, type PrizeShareData,
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

/*
 * 品項圖去背（老闆 2026-08-24）。成本 0：純 Canvas 像素運算，不呼叫任何服務
 * （CLAUDE.md 的取材成本原則）。之所以做得到，是因為外部圖本來就走同源代理 ——
 * 沒有那層，canvas 會被污染、getImageData 直接拋 SecurityError。
 *
 * 演算法是踩過兩個坑之後定下來的，改之前先看這段：
 *
 * ❌ **不能「把接近白的像素都挖掉」**：商品照裡白色不只在背景 —— 那隻公仔的靴子、
 *    圍巾、刀刃都是淺色，一律挖掉會在人物身上開洞。
 * ❌ **不能「跟四角平均色差太遠就留著」**：商品照的背景常常是漸層（實測那張是
 *    上緣 232、下緣 255），用固定參考色會把純白的下半部判成「不是背景」，
 *    結果留下一塊灰。
 * ❌ **不能沿著鄰居色差漫延**：能跟著漸層走，但淺色刀刃與背景之間是平滑過渡，
 *    會被一路吃掉。
 *
 * ✅ 現在的作法：用「亮度高且彩度低」算出背景分數，**只挖跟畫面邊緣連得起來的**
 *    （flood fill），所以人物內部的白留著；判定是二值的（不做半透明漸變），
 *    最後對 alpha 做一次 3×3 平均當 1px 柔邊，接住照片本身的抗鋸齒。
 */
function removeBackdrop(img: HTMLImageElement): HTMLCanvasElement | HTMLImageElement {
  const MAX = 900;
  const scale = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true });
  if (!cx) return img;
  cx.drawImage(img, 0, 0, w, h);

  let px: ImageData;
  try { px = cx.getImageData(0, 0, w, h); } catch { return img; }
  const d = px.data;

  /*
   * 已經去過背的圖就原樣回傳（老闆 2026-08-25）。
   * ⚠️ 不可以只看左上角那一個像素（舊版 `d[3] === 0`）—— 去背圖的四角常常不是
   * 全透明（帶陰影、有 1px 白邊、或物件本來就頂到角落），漏判就會再去一次背，
   * 而背景既然已經透明，flood fill 只好從物件本身的淺色吃進去 —— 就是老闆看到的
   * 「去到品項圖」。改成抽樣整張：只要有像樣比例的透明像素就代表本來就有 alpha。
   */
  let clear = 0, sampled = 0;
  for (let p = 0; p < w * h; p += 7) { sampled++; if (d[p * 4 + 3] < 250) clear++; }
  if (clear > sampled * 0.02) return c;

  /** 背景分數：亮度 185→220、彩度 34→18 之間過渡，兩者取小 */
  const score = (i: number) => {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    return Math.max(0, Math.min(1, Math.min((lum - 185) / 35, (34 - sat) / 16)));
  };
  const CUT = 0.8;

  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (seen[p]) return;
    if (score(p * 4) < CUT) return;
    seen[p] = 1;
    stack.push(x, y);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }

  // 邊緣一圈都不像背景（深底、有花紋的照片）就別硬做
  if (stack.length === 0) return img;

  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }

  let removed = 0;
  const alpha = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    if (seen[p]) removed++;
    else alpha[p] = 255;
  }
  // 幾乎整張被吃掉＝判斷錯了（白底白物），退回原圖
  if (removed > w * h * 0.97) return img;

  // 3×3 平均當柔邊。讀 alpha[]、寫回 d[]，不會自我回饋
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy, xx = x + dx;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          sum += alpha[yy * w + xx]; n++;
        }
      }
      d[(y * w + x) * 4 + 3] = Math.round(sum / n);
    }
  }

  cx.putImageData(px, 0, 0);
  return c;
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
          // 白底商品照去背，讓品項直接站在底圖的紫色上（見 removeBackdrop）
          const cut = removeBackdrop(img);
          const box = L.prizeImage;
          const scale = Math.min(box.w / cut.width, box.h / cut.height);
          const w = cut.width * scale;
          const h = cut.height * scale;
          ctx.drawImage(cut, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
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
      /* 斜體（老闆 2026-08-24）：底圖那條紫帶本身是斜的，正體字擺上去會覺得沒對齊。
         中文字型沒有真正的義大利體，瀏覽器會合成傾斜 —— 這裡要的就是傾斜 */
      ctx.font = `italic 700 ${n.size}px ${cjk}`;
      const nameLines = wrapText(ctx, data.prizeName || data.productName, n.maxWidth, n.maxLines);
      /* 只有一行時整塊往下推半行，讓它落在紫帶的中線上（老闆 2026-08-25）——
         n.y 是「兩行版」第一行的基線，單行沿用會整個偏上 */
      const nameY = n.y + (n.maxLines - nameLines.length) * n.lineHeight / 2;
      nameLines.forEach((line, i) => ctx.fillText(line, n.cx, nameY + i * n.lineHeight));

      /*
       * 三個數據（老闆指定）：抽獎次數／總抽金額／中獎時間（年月）。
       * 數字用 Oswald（跟站上金額同一套），單位用中文字型接在右邊。
       */
      const s = L.stats;
      /*
       * ⚠️ 只畫數字，**不要畫欄位標題**。「總共抽了／花費代幣／獲得時間」在
       * 2026-08-24 換上的挖空版底圖裡已經是印好的美術字，程式再畫一次會疊字。
       * 換底圖時如果新圖沒有印標題，要把標題畫回來（labelSize／labelY 還留著）。
       */
      const cells: { value: string; unit: string }[] = [
        { value: data.drawCount.toLocaleString(), unit: '抽' },
        // 花費代幣走 K（25,200 → 25.2K）：原字串太寬會逼字級縮小，三欄就一大一小
        { value: formatTokensShort(data.totalSpent), unit: '代幣' },
        { value: formatWonMonth(data.wonAt), unit: '' },
      ];

      /*
       * 三欄的數字**一律同一個字級**（老闆 2026-08-24）。
       * 先各自算出「塞得進欄寬」的最大字級，再取三者的最小值套用到全部 ——
       * 逐欄各縮各的會變成 71 很大、2026.08 很小，看起來像做壞了。
       */
      // 型別要寫 number：SHARE_LAYOUT 是 as const，直接推導會變成字面量型別（62／24）不能重新賦值
      const fitSize = (value: string, unit: string) => {
        let vs: number = s.valueSize;
        let us: number = s.unitSize;
        for (;;) {
          ctx.font = `700 ${vs}px ${num}`;
          const vw = ctx.measureText(value).width;
          ctx.font = `500 ${us}px ${cjk}`;
          const uw = unit ? ctx.measureText(unit).width + 6 : 0;
          if (vw + uw <= s.cellWidth || vs <= 34) return { vs, us };
          vs -= 2;
          us = Math.max(18, us - 1);
        }
      };
      const fitted = cells.map(c => fitSize(c.value, c.unit));
      const valueSize = Math.min(...fitted.map(f => f.vs));
      const unitSize = Math.min(...fitted.map(f => f.us));

      cells.forEach((cell, i) => {
        const cx = s.cx[i];

        ctx.font = `700 ${valueSize}px ${num}`;
        const vw = ctx.measureText(cell.value).width;
        ctx.font = `500 ${unitSize}px ${cjk}`;
        const uw = cell.unit ? ctx.measureText(cell.unit).width + 6 : 0;
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

      const p = L.player;

      /*
       * 頭像（老闆 2026-08-24）。底圖左下角那個黑框本來就是留給它的。
       * avatar_url 三種形態都要吃：外部網址（R2／LINE CDN）走同源代理，
       * 站內路徑直接用，沒設過就退預設圖。載不到也照畫預設圖 ——
       * 少一張頭像不該讓整張曬圖畫不出來。
       */
      const a = p.avatar;
      const avatarSrc = data.playerAvatar
        ? (/^https?:\/\//i.test(data.playerAvatar)
          ? `/api/image-proxy?url=${encodeURIComponent(data.playerAvatar)}`
          : data.playerAvatar)
        : SHARE_AVATAR_FALLBACK;
      let avatarImg: HTMLImageElement | null = null;
      try {
        avatarImg = await loadImage(avatarSrc, true);
      } catch {
        try { avatarImg = await loadImage(SHARE_AVATAR_FALLBACK); } catch { /* 連預設圖都掛就不畫 */ }
      }
      if (avatarImg) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(a.cx, a.cy, a.size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        // cover：頭像是方的或長的都填滿圓形，不留缺角
        const scale = Math.max(a.size / avatarImg.width, a.size / avatarImg.height);
        const w = avatarImg.width * scale;
        const h = avatarImg.height * scale;
        ctx.drawImage(avatarImg, a.cx - w / 2, a.cy - h / 2, w, h);
        ctx.restore();
      }

      // 玩家名與完整時間
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
      <div className="relative flex max-h-[76vh] w-full max-w-[420px] items-center justify-center">
        {/* 叉叉蓋在圖的右上角（老闆 2026-08-24）。
            包一層 relative 讓它貼齊 canvas 本身而不是外層容器 —— canvas 是等比縮放的，
            寬度會隨螢幕變，貼外層在窄螢幕上就會離圖邊有一段空隙。
            也一定要放在 canvas **後面**：兩者同一個堆疊層，先畫的會被後畫的蓋掉，
            原本按鈕在前所以被整張圖蓋住（實機看不到，老闆截圖回報）。*/}
        <div className="relative">
          <canvas
            ref={canvasRef}
            className={cn('block max-h-[76vh] w-auto max-w-full rounded-2xl shadow-2xl transition-opacity', isRendering && 'opacity-0')}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm active:scale-95"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>
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
