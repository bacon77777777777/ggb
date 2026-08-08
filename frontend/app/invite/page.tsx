'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import QRCode from 'qrcode';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { buildInviteMessage } from '@/lib/inviteMessage';

/**
 * 邀請好友頁 —— 一張滿版主視覺，動作都在頂部導航
 *
 * 老闆定的形態：頁面本體只有 hero 圖（圖上已印好白框，QR 直接
 * 對位疊進去，不另畫白卡 —— 疊白卡會變雙重白邊）；「分享 =
 * 複製邀請訊息」「下載 = 存含 QR 的合成圖」兩顆文字鈕在 Navbar
 * 右側，透過 CustomEvent 丟回來這裡執行。
 *
 * QR 內容是 /login?invite=CODE：掃了進登入頁，登入完邀請碼自動填。
 */

/**
 * 白框在 invite.jpg 上的實測位置（程式逐像素掃出來的，非目測）：
 * x 219~581、y 777~1112（原圖 800×1200）→ 中心 (50%, 78.7%)。
 * QR 取框內短邊的九成，四周留白就是掃碼的靜區。
 * 換圖要重掃這三個數字；CSS 與下載 canvas 共用，只改這裡。
 */
const QR_CENTER_Y = 0.787;
const QR_SIZE = 0.375; // 相對圖寬（= 300px / 800px）

export default function InvitePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();
  const [qr, setQr] = useState<string | null>(null);

  const code = user?.invite_code ?? null;
  const link = code && typeof window !== 'undefined'
    ? `${window.location.origin}/login?invite=${code}`
    : null;

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login?next=/invite');
  }, [isLoading, user, router]);

  useEffect(() => {
    const onShare = () => { void copyMessage(); };
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
    // margin: 0 —— 靜區由圖上的白框提供，QR 自帶白邊會跟框疊出雙重白
    QRCode.toDataURL(link, { width: 512, margin: 0, color: { dark: '#1a1a1a', light: '#ffffff' } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [link]);

  const copyMessage = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(buildInviteMessage(code, window.location.origin));
      showToast('邀請訊息已複製，快分享給朋友', 'success');
    } catch {
      showToast('複製失敗，請重試一次', 'error');
    }
  };

  /** 下載 hero 圖（含 QR）：跟畫面同一組座標常數，畫一份存下來 */
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

      const size = W * QR_SIZE;
      ctx.drawImage(qrImg, (W - size) / 2, H * QR_CENTER_Y - size / 2, size, size);

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
        {/* QR 對位到圖上印好的白框中心（座標見檔頭常數） */}
        <div
          className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ top: `${QR_CENTER_Y * 100}%`, width: `${QR_SIZE * 100}%` }}
        >
          {qr ? (
            // QR 是本地生成的 data URI，用原生 img 就好
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="邀請 QR code" className="aspect-square w-full" />
          ) : (
            <div className="aspect-square w-full animate-pulse rounded-lg bg-neutral-100" />
          )}
        </div>
      </div>
    </div>
  );
}
