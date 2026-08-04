'use client';

/**
 * 商品頁的公平性區塊（一番賞／抽卡／自製賞）
 *
 * 這段原本在 item/[id]/page.tsx 裡出現兩次、一字不差，改一邊就會漏另一邊。
 *
 * 文案也換掉了。舊版寫「記錄隨機種子 Seed 與 TXID Hash，完抽後輸入 Seed 重算」——
 * 那是舊機制的說法，而且 Seed / TXID Hash 這種字丟給玩家等於沒說。
 * 現在的機制是開賣前把整檔籤排好封起來，玩家要對的只有一串驗證碼。
 */

import Link from 'next/link';
import { ShieldCheck, Info } from 'lucide-react';
import CopyableTruncatedField from '@/components/ui/CopyableTruncatedField';

interface Props {
  productId: number;
  /** products.txid_hash — 封存時寫入的承諾值 */
  commitment: string | null;
  /** products.sealed_at 非 NULL 才代表這一檔真的封存過 */
  isSealed: boolean;
  isSoldOut: boolean;
}

export default function FairnessPanel({ productId, commitment, isSealed, isSoldOut }: Props) {
  return (
    <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 p-3 sm:p-6 space-y-3 sm:space-y-6">
      <div className="flex items-center gap-3 sm:gap-4 border-b border-neutral-50 dark:border-neutral-800 pb-3 sm:pb-5">
        <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-accent-emerald/10 flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="w-5 h-5 sm:w-7 sm:h-7 text-accent-emerald stroke-[2.5]" />
        </div>
        <div>
          <h2 className="text-base sm:text-xl font-black text-neutral-900 dark:text-neutral-50 tracking-tight">
            公平性驗證
          </h2>
          <p className="text-[13px] sm:text-sm text-neutral-400 dark:text-neutral-500 font-black uppercase tracking-widest mt-0.5">
            確保抽獎過程的透明與公正
          </p>
        </div>
      </div>

      <div className="bg-primary/5 border border-primary/10 rounded-2xl p-3 sm:p-5 space-y-3 sm:space-y-4">
        <div className="flex items-center gap-2 text-primary font-black text-[13px] sm:text-sm uppercase tracking-widest">
          <Info className="w-3.5 h-3.5 stroke-[3]" />
          這一檔怎麼驗
        </div>
        <p className="text-[13px] sm:text-sm text-neutral-500 dark:text-neutral-400 font-bold leading-relaxed">
          開賣前，每一號籤對應哪個獎品就已經排好並封存，同時公布下面這串驗證碼。
          這一檔結束後會公開完整的對照表，你可以拿它算一次，
          算出來必須跟這串一模一樣 —— 只要中途改過一個字，兩邊就對不上。
        </p>
      </div>

      <div className="space-y-1.5 sm:space-y-2.5 pt-1 sm:pt-2">
        <div className="text-[13px] sm:text-sm font-black text-neutral-400 dark:text-neutral-500 uppercase tracking-widest">
          開賣時公布的驗證碼
        </div>
        <CopyableTruncatedField
          value={isSealed ? (commitment ?? '') : ''}
          placeholder={isSealed ? '尚未生成，請稍後再試' : '這一檔沒有封存對照表'}
        />
      </div>

      <Link
        href={`/fairness/${productId}`}
        className="w-full flex items-center justify-center px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl bg-primary text-white text-[13px] sm:text-sm font-black shadow-sm hover:bg-primary/90 transition-colors"
      >
        {isSoldOut ? '看完整對照表' : '看驗證說明'}
      </Link>
    </div>
  );
}
