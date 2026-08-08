'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import QRCode from 'qrcode';
import { Copy, Share2, Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { buildInviteMessage } from '@/lib/inviteMessage';

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
    const onShare = () => { void copy('msg'); };
    const onDownload = () => { void downloadHero(); };
    window.addEventListener('ggb:invite-share', onShare);
    window.addEventListener('ggb:invite-download', onDownload);
    return () => {
      window.removeEventListener('ggb:invite-share', onShare);
      window.removeEventListener('ggb:invite-download', onDownload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, qr]);

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

  /**
   * 下載 hero 圖（含 QR）：把畫面上那張合成圖用 canvas 原樣畫一份存下來。
   * 座標跟 CSS 同一套百分比（QR 卡 52% 寬、top 54%、內距 6%），
   * 改版位只要兩邊同步改同兩個數字。
   */
  const downloadHero = async () => {
    if (!qr) return;
    const load = (src: string) => new Promise<HTMLImageElement>((ok, err) => {
      const im = new window.Image();
      im.onload = () => ok(im); im.onerror = err; im.src = src;
    });
    try {
      const [hero, qrImg] = await Promise.all([load('/images/invite/invite.jpg'), load(qr)]);
      const W = 800, H = 1200;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(hero, 0, 0, W, H);

      const cardW = W * 0.52, pad = W * 0.06, r = 20;
      const cx = (W - cardW) / 2, cy = H * 0.54;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(cx + r, cy);
      ctx.arcTo(cx + cardW, cy, cx + cardW, cy + cardW, r);
      ctx.arcTo(cx + cardW, cy + cardW, cx, cy + cardW, r);
      ctx.arcTo(cx, cy + cardW, cx, cy, r);
      ctx.arcTo(cx, cy, cx + cardW, cy, r);
      ctx.closePath();
      ctx.fill();
      ctx.drawImage(qrImg, cx + pad, cy + pad, cardW - pad * 2, cardW - pad * 2);

      canvas.toBlob(blob => {
        if (!blob) { showToast('下載失敗，請重試一次', 'error'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ggb-invite.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        showToast('已下載邀請圖', 'success');
      }, 'image/png');
    } catch {
      showToast('下載失敗，請重試一次', 'error');
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
      {/* 主視覺滿版：手機上左右貼齊瀏覽器邊（老闆指定）；
          桌機給寬度上限與圓角，不然 800px 的圖會被拉到糊 */}
      <div className="relative w-full md:mx-auto md:mt-4 md:max-w-md md:overflow-hidden md:rounded-3xl">
        <Image
          src="/images/invite/invite.jpg"
          alt="邀請好友"
          width={800}
          height={1200}
          priority
          className="h-auto w-full"
        />
        {/* QR 疊在圖的中下區域，百分比錨定，縮放跟著走 */}
        <div className="absolute left-1/2 top-[54%] w-[52%] -translate-x-1/2 rounded-2xl bg-white p-[6%] shadow-lg">
          {qr ? (
            // QR 是本地生成的 data URI，用原生 img 就好
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="邀請 QR code" className="aspect-square w-full" />
          ) : (
            <div className="aspect-square w-full animate-pulse rounded-xl bg-neutral-100" />
          )}
        </div>
      </div>

      <div className="flex flex-col items-center px-6 pb-12 pt-5">
        {/* 邀請碼 */}
        <button
          type="button"
          onClick={() => void copy('code')}
          className="flex items-center gap-2 rounded-full bg-primary/10 px-5 py-2.5 transition-colors active:bg-primary/20"
        >
          <span className="text-[13px] text-neutral-500">邀請碼</span>
          <span className="font-mono text-lg font-black tracking-[0.2em] text-primary">{code ?? '——'}</span>
          {copied === 'code'
            ? <Check className="h-4 w-4 text-primary" />
            : <Copy className="h-4 w-4 text-neutral-400" />}
        </button>

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
