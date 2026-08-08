'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import QRCode from 'qrcode';
import { Copy, Share2, Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { buildInviteMessage } from '@/lib/inviteMessage';
import SimplePageHeader from '@/components/ui/SimplePageHeader';

/**
 * 邀請好友頁 —— 分享場景的專門頁面
 *
 * 老闆定的分工：會員頁那顆小 Copy 圖標只複製「碼本身」（旁邊顯示的
 * 就是碼，複製整段訊息違反預期）；要分享的人來這一頁 ——
 * 直式卡片、中間 QR code 給面對面掃，下方按鈕複製整段邀請訊息
 * 或叫出系統分享面板貼給 LINE 群。
 *
 * QR 內容是 /login?invite=CODE：掃了進登入頁，登入完邀請碼自動填。
 */

export default function InvitePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState<'code' | 'msg' | null>(null);

  const code = user?.invite_code ?? null;
  const link = code && typeof window !== 'undefined'
    ? `${window.location.origin}/login?invite=${code}`
    : null;

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login?next=/invite');
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!link) return;
    QRCode.toDataURL(link, { width: 512, margin: 1, color: { dark: '#1a1a1a', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [link]);

  const copy = async (kind: 'code' | 'msg') => {
    if (!code) return;
    const text = kind === 'code' ? code : buildInviteMessage(code, window.location.origin);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1600);
      showToast(kind === 'code' ? '邀請碼已複製' : '邀請訊息已複製，快分享給朋友', 'success');
    } catch {
      showToast('複製失敗，請長按選取', 'error');
    }
  };

  const share = async () => {
    if (!code) return;
    const text = buildInviteMessage(code, window.location.origin);
    // 手機上叫系統分享面板（可直接丟 LINE）；不支援的環境退回複製
    if (navigator.share) {
      try { await navigator.share({ text }); } catch { /* 玩家取消分享 */ }
    } else {
      void copy('msg');
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <SimplePageHeader title="邀請好友" onBack={() => router.back()} darkBg="page" />

      <div className="flex flex-col items-center px-6 pb-12 pt-[76px]">
        {/* 直式邀請卡 */}
        <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-gradient-to-b from-primary to-primary/80 p-6 text-center shadow-xl shadow-primary/20">
          <Image
            src="/images/20260629/logo.svg"
            alt="吉吉比"
            width={110}
            height={37}
            priority
            className="mx-auto h-auto w-[110px] brightness-0 invert"
          />
          <h1 className="mt-4 text-xl font-black text-white">邀請好友，一起開箱抽好運</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-white/80">
            朋友掃描 QR code 或輸入你的邀請碼
            <br />
            完成註冊就算你邀請成功
          </p>

          {/* QR 白卡 */}
          <div className="mx-auto mt-5 w-[220px] rounded-2xl bg-white p-4 shadow-lg">
            {qr ? (
              // QR 是本地生成的 data URI，用原生 img 就好
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="邀請 QR code" className="h-[188px] w-[188px]" />
            ) : (
              <div className="h-[188px] w-[188px] animate-pulse rounded-xl bg-neutral-100" />
            )}
          </div>

          {/* 邀請碼 */}
          <button
            type="button"
            onClick={() => void copy('code')}
            className="mx-auto mt-5 flex items-center gap-2 rounded-full bg-white/15 px-5 py-2.5 backdrop-blur-sm transition-colors active:bg-white/25"
          >
            <span className="text-[13px] text-white/70">邀請碼</span>
            <span className="font-mono text-lg font-black tracking-[0.2em] text-white">{code ?? '——'}</span>
            {copied === 'code'
              ? <Check className="h-4 w-4 text-white" />
              : <Copy className="h-4 w-4 text-white/70" />}
          </button>
        </div>

        {/* 動作區 */}
        <div className="mt-6 w-full max-w-sm space-y-2.5">
          <button
            type="button"
            onClick={share}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-bold text-white shadow-lg shadow-primary/20 transition-all active:scale-[0.98]"
          >
            <Share2 className="h-[18px] w-[18px]" />
            分享給朋友
          </button>
          <button
            type="button"
            onClick={() => void copy('msg')}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white text-[15px] font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
          >
            {copied === 'msg' ? <Check className="h-[18px] w-[18px]" /> : <Copy className="h-[18px] w-[18px]" />}
            複製邀請訊息
          </button>
        </div>

        <p className="mt-5 max-w-sm text-center text-xs leading-relaxed text-neutral-400">
          朋友透過你的連結或邀請碼完成註冊後，你可以在任務中心查看邀請進度。
        </p>
      </div>
    </div>
  );
}
