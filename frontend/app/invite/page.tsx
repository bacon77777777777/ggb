'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import QRCode from 'qrcode';
import { Copy, Gift, Medal } from 'lucide-react';
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

/**
 * QR 下方紅旗緞帶：x 234~572、y 1113~1173 → 中心 (50%, 95.25%)。
 * 旗上疊「邀請碼 XXXXXX＋複製圖標」；下載的合成圖畫同一行字但
 * 不含複製圖標（老闆指定）。碼是 8 位，旗內側約 280px 寬，
 * 字級 28px（相對 800 寬）剛好裝下＝手機 3.5vw（滿版時視窗寬＝圖寬）
 * ＝桌機 16px（max-w-md 448px）。碼用會員卡同款黃 #ffe600。
 */
const RIBBON_CENTER_Y = 0.9605;
const CODE_FONT_PX = 28; // 相對 800 寬的 canvas 字級
const CODE_YELLOW = '#ffe600'; // 會員卡推薦碼同款黃

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

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      showToast('邀請碼已複製', 'success');
    } catch {
      showToast('複製失敗，請重試一次', 'error');
    }
  };

  /** 把畫面那張合成圖（hero＋QR＋邀請碼字）畫進 canvas，輸出 PNG blob */
  const composeHero = async (): Promise<Blob | null> => {
    if (!qr) return null;
    const load = (src: string) => new Promise<HTMLImageElement>((ok, err) => {
      const im = new window.Image();
      im.onload = () => ok(im); im.onerror = err; im.src = src;
    });
    const [hero, qrImg] = await Promise.all([load('/images/invite/invite.jpg'), load(qr)]);
    const W = 800, H = 1200;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(hero, 0, 0, W, H);

    const size = W * QR_SIZE;
    ctx.drawImage(qrImg, (W - size) / 2, H * QR_CENTER_Y - size / 2, size, size);

    // 紅旗上的邀請碼 —— 下載版只有字，不畫複製圖標（老闆指定）；
    // 「邀請碼」白、碼黃，跟畫面同款雙色
    if (code) {
      ctx.font = `bold ${CODE_FONT_PX}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const label = '邀請碼 ';
      const wLabel = ctx.measureText(label).width;
      const startX = (W - wLabel - ctx.measureText(code).width) / 2;
      const textY = H * RIBBON_CENTER_Y + 2;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, startX, textY);
      ctx.fillStyle = CODE_YELLOW;
      ctx.fillText(code, startX + wLabel, textY);
    }

    return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  };

  // 合成圖先畫好放著 —— iPhone 的分享面板要在點擊的當下叫出來，
  // 點了才開始畫會錯過手勢窗口，面板就開不出來
  const heroBlob = useRef<Blob | null>(null);
  useEffect(() => {
    if (!qr) return;
    heroBlob.current = null;
    composeHero().then(b => { heroBlob.current = b; }).catch(() => { /* 點下載時再重試 */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qr, code]);

  /**
   * 下載：手機走系統分享面板直出（面板上就有「儲存影像」，也能直接
   * 丟 LINE / AirDrop）；不支援分享檔案的環境（桌機）退回傳統下載。
   * 老闆抓的：a.download 在 iPhone 會先開一頁檔案預覽，要再按分享
   * 圖標才存得了，多繞兩步。
   */
  const downloadHero = async () => {
    let blob = heroBlob.current;
    if (!blob) { try { blob = await composeHero(); } catch { blob = null; } }
    if (!blob) { showToast('圖片還在準備中，請再試一次', 'error'); return; }

    const file = new File([blob], 'ggb-invite.png', { type: 'image/png' });
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); } catch { /* 玩家取消分享 */ }
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ggb-invite.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast('已下載邀請圖', 'success');
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
        {/* 紅旗上的邀請碼＋複製圖標（圖標只在畫面上，下載版不畫）。
            字級跟下載 canvas 同一個 34/800 比例：手機滿版用 vw，桌機固定 px */}
        {code && (
          <button
            type="button"
            onClick={() => void copyCode()}
            className="absolute inset-x-0 flex -translate-y-1/2 items-center justify-center gap-[1vw] md:gap-1"
            style={{ top: `${RIBBON_CENTER_Y * 100}%` }}
          >
            <span className="text-[3.5vw] font-bold text-white md:text-[16px]">
              邀請碼 <span style={{ color: CODE_YELLOW }}>{code}</span>
            </span>
            <Copy className="h-[3vw] w-[3vw] text-white/90 md:h-3.5 md:w-3.5" />
          </button>
        )}
      </div>

      {/* 頁面下方說明（老闆指定）。只寫現在真的有的東西：
          成就積分（tasks invite_friend 四階）＋同名徽章。
          被邀請的好友目前沒有獎勵，所以隻字不提 —— 寫了就是不實廣告 */}
      <div className="mx-auto max-w-md px-6 pb-14 pt-8">
        <h2 className="text-[17px] font-bold text-neutral-900 dark:text-neutral-100">
          邀請好友有什麼好處？
        </h2>
        <div className="mt-4 space-y-3">
          <div className="flex gap-3 rounded-xl bg-neutral-50 p-4 dark:bg-neutral-900">
            <Gift className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-[15px] font-bold text-neutral-800 dark:text-neutral-200">解鎖成就、領積分</p>
              <p className="mt-1 text-[13px] leading-relaxed text-neutral-500">
                成功邀請 1、5、20、100 位好友，各解鎖一個成就，到任務中心就能領積分。
                積分在部分商品抽獎時可以折抵。
              </p>
            </div>
          </div>
          <div className="flex gap-3 rounded-xl bg-neutral-50 p-4 dark:bg-neutral-900">
            <Medal className="mt-0.5 h-5 w-5 shrink-0 text-accent-yellow" />
            <div>
              <p className="text-[15px] font-bold text-neutral-800 dark:text-neutral-200">點亮專屬徽章</p>
              <p className="mt-1 text-[13px] leading-relaxed text-neutral-500">
                從「初級召集人」一路收集到「信徒滿天下」，徽章會展示在你的玩家小卡上。
              </p>
            </div>
          </div>
        </div>

        <h3 className="mt-8 text-[15px] font-bold text-neutral-900 dark:text-neutral-100">
          怎樣算邀請成功？
        </h3>
        <p className="mt-2 text-[13px] leading-relaxed text-neutral-500">
          好友掃上面的 QR code 或點你分享的連結完成登入，就會自動算在你名下；
          好友也可以在註冊後 7 天內，到會員中心自己填入你的邀請碼。
        </p>
      </div>
    </div>
  );
}
