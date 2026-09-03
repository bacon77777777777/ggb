'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { asset } from '@/lib/asset';
import { cn } from '@/lib/utils';

/**
 * 訪客的底部登入條（老闆 2026-09-03 定案，參考同業）
 *
 * 位置：貼在公平性警語列上面（警語列又貼在底欄上面）。
 * 行為：剛進首頁**不顯示**；第一次往下滑就出現，之後就一直在 ——
 *       底欄收起時它不收，只是跟著往下降到畫面底；底欄回來它就再升回警語列上面。
 *       顯示與否由 MobileTabbar 判（它才知道底欄收起了沒、玩家有沒有滑過）。
 * 樣式：黑色半透明膠囊、積分圖標、一句話、綠黃漸層「立即登入」。
 *
 * 定位靠兩個既有變數：`--promo-notice-h`（警語列高度，NoticeBar 發佈）與
 * `--bottom-nav-shift`（底欄收起的距離，MobileTabbar 發佈）。底欄收起時 shift
 * 剛好等於「底欄＋警語列」的高度，所以同一條算式自然就降到底。
 *
 * 自己再發佈 `--guest-login-bar-h`：首頁那兩顆懸浮按鈕（扇形選單、商城上架）
 * 本來坐在警語列上緣，這條插進來它們要再往上讓一段，不然會壓在膠囊上。
 */

/** 膠囊 52px ＋ 跟警語列的間隙 6px */
const BAR_H = '58px';

export default function GuestLoginBar({ visible }: { visible: boolean }) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--guest-login-bar-h', visible ? BAR_H : '0px');
    return () => { root.style.removeProperty('--guest-login-bar-h'); };
  }, [visible]);

  return (
    <div
      className={cn(
        'fixed left-0 right-0 z-40 md:hidden px-3',
        'transition-[bottom,transform,opacity] duration-200 ease-out',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0 pointer-events-none',
      )}
      style={{
        bottom: 'calc(env(safe-area-inset-bottom) + 6px + 3.75rem + var(--promo-notice-h, 0px) - var(--bottom-nav-shift, 0px))',
      }}
      aria-hidden={!visible}
      data-testid="guest-login-bar"
    >
      <div className="flex h-[52px] items-center gap-2 rounded-full bg-black/75 backdrop-blur-md pl-3 pr-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.3)]">
        <Image
          src={asset('/images/gcoin.webp')}
          alt=""
          width={28}
          height={28}
          unoptimized
          className="h-7 w-7 shrink-0 object-contain"
        />
        {/* 13px 是算過的：iPhone SE（375px）扣掉邊距、幣、按鈕只剩約 200px 給字，
            這句 15 個字在 14px 就會被截掉。「300積分」跟登入頁紅膠囊同一個數字 */}
        <span className="min-w-0 flex-1 truncate text-[13px] font-black text-white cjk-optical-center">
          新用戶使用LINE登入即領300積分
        </span>
        {/* 「再粗一點」（老闆 2026-09-03）：中文字型是系統 PingFang，最粗只到 600、
            font-black 已經是天花板，所以補 0.6px 的同色描邊把筆畫撐粗，字級也放到 16px */}
        <Link
          href="/login"
          className="flex h-10 shrink-0 items-center rounded-full bg-gradient-to-r from-[#d8f552] to-[#5ee266] px-3.5 text-[16px] font-black text-neutral-900 [-webkit-text-stroke:0.6px_#171717] shadow-[0_2px_8px_rgba(94,226,102,0.45)] active:scale-95 transition-transform"
        >
          <span className="cjk-optical-center">立即登入</span>
        </Link>
      </div>
    </div>
  );
}
