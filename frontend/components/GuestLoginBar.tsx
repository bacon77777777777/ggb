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
 * 定位分兩種（`lowered` 由 MobileTabbar 傳，＝底欄收起了沒）：
 *   底欄在 —— 安全區 + 6px + 底欄 60px + 警語列高度（`--promo-notice-h`，NoticeBar 發佈）
 *   底欄收起 —— 貼近底邊：安全區 − 10px（老闆 2026-09-03：再往下一點；iPhone 上離底邊 24px），
 *              沒有安全區的網頁保底 8px，不然會切到
 *
 * 自己再發佈 `--guest-login-bar-h`：首頁那兩顆懸浮按鈕（扇形選單、商城上架）
 * 本來坐在警語列上緣，這條插進來它們要再往上讓一段，不然會壓在膠囊上。
 */

/** 膠囊 52px ＋ 跟警語列的間隙 6px */
const BAR_H = '58px';

export default function GuestLoginBar({ visible, lowered }: { visible: boolean; lowered: boolean }) {
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
        bottom: lowered
          ? 'max(env(safe-area-inset-bottom) - 10px, 8px)'
          : 'calc(env(safe-area-inset-bottom) + 6px + 3.75rem + var(--promo-notice-h, 0px))',
      }}
      aria-hidden={!visible}
      data-testid="guest-login-bar"
    >
      {/* gap-1.5 是金幣與文字的間距（老闆：拉近一點，怕文案被裁）；文字與按鈕靠按鈕的 ml-0.5 補回 8px */}
      <div className="flex h-[52px] items-center gap-1.5 rounded-full bg-black/75 backdrop-blur-md pl-3 pr-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.3)]">
        {/* 18px（老闆 2026-09-03：28→22→18，文案加長後再縮一點） */}
        <Image
          src={asset('/images/gcoin.webp')}
          alt=""
          width={18}
          height={18}
          unoptimized
          className="h-[18px] w-[18px] shrink-0 object-contain"
        />
        {/* 字級是量過的：這句 17 個字在 13px 約 221px 寬，393pt 機型剛好放滿；
            375pt（SE 2/3、mini）只剩約 205px，所以 385pt 以下降到 12px，按鈕內距也縮 2px。
            「300積分」跟登入頁紅膠囊同一個數字 */}
        <span className="min-w-0 flex-1 truncate text-[13px] max-[385px]:text-[12px] font-black text-white cjk-optical-center">
          新用戶使用
          {/* 「LINE登入」與「300積分」再粗（老闆）：字重已到 PingFang 的上限，
              補同色描邊撐粗，跟「立即登入」同一招；前者維持白、後者亮黃 */}
          <span className="[-webkit-text-stroke:0.5px_currentColor]">LINE登入</span>
          即領
          <span className="text-accent-yellow [-webkit-text-stroke:0.5px_currentColor]">300積分</span>
          讚讚
        </span>
        {/* 「再粗一點」（老闆 2026-09-03）：中文字型是系統 PingFang，最粗只到 600、
            font-black 已經是天花板，所以補 0.6px 的同色描邊把筆畫撐粗，字級也放到 16px */}
        <Link
          href="/login"
          className="ml-0.5 flex h-10 shrink-0 items-center rounded-full bg-gradient-to-r from-[#d8f552] to-[#5ee266] px-3.5 max-[385px]:px-3 text-[16px] font-black text-neutral-900 [-webkit-text-stroke:0.6px_#171717] shadow-[0_2px_8px_rgba(94,226,102,0.45)] active:scale-95 transition-transform"
        >
          {/* 不套 .cjk-optical-center：這顆 40px 高、字 16px 又有描邊，再往下推 0.13em
              就偏下了（老闆 2026-09-03 回報沒垂直置中）。跟簽到頁那顆同樣的坑 */}
          <span>立即登入</span>
        </Link>
      </div>
    </div>
  );
}
