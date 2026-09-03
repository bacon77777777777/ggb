'use client';

import Link from 'next/link';
import Image from 'next/image';
import { asset } from '@/lib/asset';
import { cn } from '@/lib/utils';

/**
 * 未登入時，底部導航往下滑收起後浮出來的登入提示（老闆 2026-09-03，參考同業）
 *
 * 底欄收起是為了把畫面還給商品列表，但對訪客來說那也是把「會員」入口收掉了。
 * 這條接在底欄原本的位置：深色半透明膠囊、左邊吉祥物、中間一句話、右邊亮綠色「立即登入」
 * —— 顏色照老闆給的參考圖。底欄一回來（往上撥）它就退場，兩個不會同時在。
 *
 * 顯示與否由 MobileTabbar 決定（它才知道自己有沒有收起），這裡只管長相與進出場。
 * 高度刻意跟底欄一樣是 60px（52px 膠囊＋上下各 4px）：MobileTabbar 發佈的
 * `--bottom-nav-shift` 是拿這個高度算的，首頁那兩顆懸浮按鈕才會剛好坐在膠囊上緣。
 */
export const GUEST_LOGIN_BAR_HEIGHT = '3.75rem';

export default function GuestLoginBar({ visible }: { visible: boolean }) {
  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50 md:hidden px-3 py-1 pb-[calc(env(safe-area-inset-bottom)+4px)]',
        'transition-transform duration-200 ease-out',
        !visible && 'translate-y-full pointer-events-none',
      )}
      aria-hidden={!visible}
      data-testid="guest-login-bar"
    >
      <div className="flex h-[52px] items-center gap-2.5 rounded-full bg-neutral-900/85 backdrop-blur-md pl-1.5 pr-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.25)]">
        {/* 吉祥物：底欄「首頁」那顆膠囊柴犬，圓形正好塞進圓框；圓框底色照參考圖的暗紅 */}
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#7b1f2c]">
          <Image
            src={asset('/images/topbar/1b.png')}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 object-contain"
          />
        </span>
        {/* 「拿 300 積分」跟登入頁 LINE 鈕上的紅膠囊同一句，不要兩邊說不同數字 */}
        <span className="min-w-0 flex-1 truncate text-[15px] font-black text-white cjk-optical-center">
          使用 LINE 登入，拿 300 積分
        </span>
        <Link
          href="/login"
          className="flex h-9 shrink-0 items-center rounded-full bg-[#b9f04a] px-4 text-[14px] font-black text-neutral-900 active:scale-95 transition-transform"
        >
          <span className="cjk-optical-center">立即登入</span>
        </Link>
      </div>
    </div>
  );
}
