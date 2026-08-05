'use client';

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useAlert } from '@/components/ui/AlertDialog';

/**
 * 需要登入才能做的動作
 *
 * 之前各處的處理很不一致：按讚是靜靜地失敗（樂觀更新完打 API 拿到 401，
 * 畫面上的愛心先亮起來再被回滾，看起來像壞掉）、留言是 `alert('請先登入才能留言')`
 * 這種瀏覽器原生彈窗、其他地方則是一句 toast「請先登入」——
 * 三種都只是講一句話，沒有給人一條路走。
 *
 * 這支統一成：跳確認框，按下去就到登入頁，登入完回到原本那一頁。
 * 回原頁是關鍵 —— 使用者是為了對「這篇文章」按讚才去登入的，
 * 登完丟他回首頁等於要他自己找回來。
 *
 * 用法：
 *   const requireLogin = useRequireLogin();
 *   const handleLike = () => {
 *     if (!requireLogin('登入後就可以幫這篇按讚')) return;
 *     ...
 *   };
 *
 * 回傳 true 代表已登入、可以繼續；false 代表已經跳出提示，呼叫端直接 return。
 */
export function useRequireLogin() {
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const router = useRouter();
  const pathname = usePathname();

  return useCallback(
    (message = '登入後就可以使用這個功能') => {
      if (user) return true;

      showAlert({
        title: '需要登入',
        message,
        type: 'confirm',
        confirmText: '前往登入',
        cancelText: '再看看',
        onConfirm: () => {
          router.push(`/login?next=${encodeURIComponent(pathname)}`);
        },
      });
      return false;
    },
    [user, showAlert, router, pathname],
  );
}
