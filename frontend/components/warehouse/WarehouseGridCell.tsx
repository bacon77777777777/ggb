import React from 'react';
import Image from 'next/image';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { asset } from '@/lib/asset';
import { GradeBadge } from '@/components/ui/GradeBadge';

/**
 * 倉庫格狀的一格 = 一支獎品（老闆 2026-08-24，照 Pokémon GO 的寶可夢倉庫）。
 *
 * ⚠️ **不要把同品項合併成 ×N**。一度做成堆疊，老闆當天否掉：同一款抽到 20 支，
 * 玩家常常是「留一張、其餘回收」，整堆一起進出選取就做不到這件事。
 * PoGO 有三千隻也是一隻一格 —— 撐得住的原因是搜尋與篩選夠好，不是把東西藏起來。
 * 要縮短清單請往搜尋／篩選加，不要回頭合併格子。
 */
export interface WarehouseGridCellProps {
  name: string;
  grade: string;
  image: string;
  selected: boolean;
  /**
   * 大賞／最後賞。以前拿它決定膠囊顏色（大獎實色、一般灰底）；
   * 2026-09-03 老闆要求全站賞等配色統一走 GradeBadge，這裡不再用它上色，
   * 保留欄位是因為呼叫端還在傳（篩選也用同一個判斷）。
   */
  major?: boolean;
  /** 已申請配送，不能再操作 */
  pending?: boolean;
  /** 掛在交易所架上，不能再操作（下架才解鎖） */
  listed?: boolean;
  /** 廠商鎖：一張訂單只能有一家廠商的貨，非鎖定廠商的整格淡掉 */
  disabled?: boolean;
  onToggle: () => void;
}

export default function WarehouseGridCell({
  name,
  grade,
  image,
  selected,
  pending = false,
  listed = false,
  disabled = false,
  onToggle,
}: WarehouseGridCellProps) {
  const locked = pending || listed || disabled;
  /*
   * 圖還沒載出來時墊預設圖（老闆 2026-08-24）。
   * 原本只有 bg-item-bg 打底，一整格深灰色塊看起來像壞圖；一次載 12 格、
   * 每格都是外部網址，這個空窗一定會被看到。載壞了也退回預設圖。
   */
  const [imageReady, setImageReady] = React.useState(false);
  const [imageFailed, setImageFailed] = React.useState(false);
  const fallback = asset('/images/item_defaulet.webp');
  const src = !image || imageFailed ? fallback : image;
  const showFallback = !imageReady && src !== fallback;

  return (
    <button
      type="button"
      onClick={() => { if (!locked) onToggle(); }}
      disabled={locked}
      className={cn(
        'group relative flex flex-col rounded-xl border bg-white p-1.5 text-left transition-all dark:bg-neutral-900',
        locked
          ? 'cursor-not-allowed border-neutral-100 opacity-40 dark:border-neutral-800'
          : 'active:scale-[0.97]',
        selected && !locked
          ? 'border-accent-emerald bg-accent-emerald/5 dark:bg-accent-emerald/10'
          : 'border-neutral-100 dark:border-neutral-800',
      )}
    >
      {/* 白底不是 bg-item-bg（#28324E 深藍灰）：品項圖走 contain 會留白邊，
          深底會在每張圖周圍框一圈深藍灰，卡牌那種滿版直式圖尤其明顯（老闆 2026-08-25）。
          商品照本來就多半是白背景，白底接得起來 */}
      {/*
        * 長按不跳原生選單。**全站已經統一擋掉了**（`globals.css` 的 img/canvas 規則
        * ＋ `components/ImageLongPressGuard.tsx`），這裡多加一層是因為倉庫的圖是
        * 玩家的獎品 —— 就算哪天全站那層被動到，這一格也不該破功。
        */}
      {/* 賞等：全站統一配色（GradeBadge／lib/prizeGrade，老闆 2026-09-03），
          貼卡片左上角不留邊、只圓外側兩角 —— 跟商品頁品項總覽的大圖格子、小卡「熱門」同一顆版。
          掛在卡片層級而不是圖框裡：圖框外面還有 p-1.5，掛圖框會離卡片邊 6px */}
      <GradeBadge
        grade={grade}
        size="sm"
        className="absolute -left-px -top-px z-10 h-6 max-w-[60%] rounded-none rounded-tl-xl rounded-br-lg border border-white/10 px-2 py-0"
      />
      <div
        className="relative aspect-square w-full overflow-hidden rounded-lg bg-white"
        style={{ WebkitTouchCallout: 'none', userSelect: 'none', WebkitUserSelect: 'none' } as React.CSSProperties}
        onContextMenu={e => e.preventDefault()}
      >
        {showFallback && (
          <Image
            src={fallback}
            alt=""
            fill
            sizes="33vw"
            className="object-contain"
            unoptimized
            draggable={false}
            aria-hidden
          />
        )}
        <Image
          src={src}
          alt={name}
          fill
          sizes="33vw"
          /* contain 不裁切：卡牌是直式、公仔是方的、毛巾是長條，cover 會把卡面
             的字跟公仔的頭切掉（老闆 2026-08-24）。留白比切掉好認 */
          className={cn('object-contain transition-opacity', showFallback && 'opacity-0')}
          unoptimized
          draggable={false}
          onLoad={() => setImageReady(true)}
          onError={() => { setImageFailed(true); setImageReady(true); }}
        />


        {pending && (
          <span className="absolute bottom-1 left-1 rounded-md bg-blue-500 px-1.5 py-[3px] text-[10px] font-black leading-none text-white">
            <span className="cjk-optical-center">出貨中</span>
          </span>
        )}
        {listed && (
          <span className="absolute bottom-1 left-1 rounded-md bg-amber-500 px-1.5 py-[3px] text-[10px] font-black leading-none text-white">
            <span className="cjk-optical-center">上架中</span>
          </span>
        )}

        {!locked && (
          <span
            className={cn(
              'absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border-[1.5px] transition-all',
              selected
                ? 'border-accent-emerald bg-accent-emerald text-white'
                : 'border-white/80 bg-black/15 backdrop-blur-[2px]',
            )}
          >
            {selected && <CheckCircle2 className="h-3.5 w-3.5" />}
          </span>
        )}
      </div>

      {/*
        品名固定兩行高（老闆 2026-08-24）：一行的與兩行的名稱都佔一樣的高度，
        格子才會排成整齊的網格；名稱在這個框裡上下置中。
        line-clamp 要用 -webkit-box，跟 flex 衝突，所以外層負責置中、<p> 只管截行。
        12px × 1.25 行高 × 2 行 = 30px。
      */}
      <div className="mt-1.5 flex h-[30px] items-center px-0.5">
        <p className="line-clamp-2 w-full text-center text-[12px] font-bold leading-[1.25] text-neutral-900 dark:text-white">
          {name}
        </p>
      </div>
    </button>
  );
}
