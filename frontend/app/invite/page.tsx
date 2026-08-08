'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import QRCode from 'qrcode';
import { Copy, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { buildInviteMessage } from '@/lib/inviteMessage';
import { createClient } from '@/lib/supabase/client';

/**
 * 邀請好友頁 —— 滿版主視覺＋循環獎進度區
 *
 * 老闆定的形態：hero 圖上疊 QR（對位圖上印好的白框）與紅旗邀請碼；
 * 「分享＝複製邀請訊息」「下載＝存合成圖」在 Navbar 右側，CustomEvent
 * 丟回來執行。下方只推一件事：每邀 5 位好友領 100 積分（無上限），
 * 進度條＋領取鈕，活動頁設計語言、背景 #401a03 銜接 hero 底緣。
 *
 * 「有效邀請」= 好友綁定 LINE（規則見 migration 505）。
 * 按過分享或下載會記 share_invite 日任務。
 */

/**
 * 白框在 invite.png 上的實測位置（程式逐像素掃出來的，非目測）：
 * x 239~561、y 770~1069（原圖 800×1200）→ 中心 (50%, 76.63%)。
 * QR 取框內短邊的九成，四周留白就是掃碼的靜區。
 * 換圖要重掃這幾個數字；CSS 與下載 canvas 共用，只改這裡。
 */
const HERO_SRC = '/images/invite/invite.png';
const QR_CENTER_Y = 0.766;
const QR_SIZE = 0.336; // 相對圖寬（= 269px / 800px）

/**
 * QR 下方紅旗緞帶：x 212~595、y 1070~1139 → 中心 (50%, 92.04%)。
 * 旗上疊「邀請碼 XXXXXX＋複製圖標」；下載版只有字不含圖標（老闆指定）。
 */
const RIBBON_CENTER_Y = 0.9204;
const CODE_FONT_PX = 28; // 相對 800 寬的 canvas 字級
const CODE_YELLOW = '#ffe600'; // 會員卡推薦碼同款黃

interface ReferralStatus {
  qualified: number;
  claimable: number;
  step: number;
  pointsPerStep: number;
  cycleProgress: number;
  nextTarget: number;
}

export default function InvitePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState<ReferralStatus | null>(null);
  const [claiming, setClaiming] = useState(false);

  const code = user?.invite_code ?? null;
  const link = code && typeof window !== 'undefined'
    ? `${window.location.origin}/login?invite=${code}`
    : null;

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login?next=/invite');
  }, [isLoading, user, router]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/user/referral-status');
      if (res.ok) setStatus(await res.json());
    } catch { /* 進度區顯示骨架就好 */ }
  }, []);

  useEffect(() => {
    if (user) void fetchStatus();
  }, [user, fetchStatus]);

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

  /** 分享／下載都算完成「分享邀請」日任務（自己能控制的動作才進日清單） */
  const trackShare = () => {
    try {
      void createClient().rpc('track_mission_event', { p_event_type: 'share_invite' });
    } catch { /* 任務進度掉一次無妨，不擋分享 */ }
  };

  const copyMessage = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(buildInviteMessage(code, window.location.origin));
      showToast('邀請訊息已複製，快分享給朋友', 'success');
      trackShare();
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
    const [hero, qrImg] = await Promise.all([load(HERO_SRC), load(qr)]);
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
   * 丟 LINE / AirDrop）；桌機直接下載（老闆指定，桌機 Chrome 其實也
   * 支援分享檔案，不擋掉會被誤走面板）。
   */
  const downloadHero = async () => {
    let blob = heroBlob.current;
    if (!blob) { try { blob = await composeHero(); } catch { blob = null; } }
    if (!blob) { showToast('圖片還在準備中，請再試一次', 'error'); return; }

    const ua = navigator.userAgent;
    const isMobile = /iPhone|iPad|iPod|Android/i.test(ua) ||
      (ua.includes('Mac') && navigator.maxTouchPoints > 1); // iPadOS 會偽裝成 Mac
    const file = new File([blob], 'ggb-invite.png', { type: 'image/png' });
    if (isMobile && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); trackShare(); } catch { /* 玩家取消分享 */ }
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ggb-invite.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast('已下載邀請圖', 'success');
    trackShare();
  };

  const claim = async () => {
    setClaiming(true);
    try {
      const res = await fetch('/api/user/referral-status', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) { showToast(json.error || '領取失敗，請重試一次', 'error'); return; }
      if ((json.claimed_points ?? 0) > 0) {
        showToast(`已領取 ${json.claimed_points} 積分`, 'success');
      } else {
        showToast('目前沒有可領的獎勵', 'error');
      }
      void fetchStatus();
    } catch {
      showToast('領取失敗，請重試一次', 'error');
    } finally {
      setClaiming(false);
    }
  };

  const step = status?.step ?? 5;
  const claimable = status?.claimable ?? 0;
  // 有可領的獎勵時進度條打滿 —— 0/5 配上亮著的領取鈕會看不懂
  const filled = status ? (claimable > 0 ? step : status.cycleProgress) : 0;

  return (
    <div className="min-h-screen bg-white">
      {/* 主視覺滿版：手機上左右貼齊瀏覽器邊（老闆指定）；
          桌機給寬度上限與圓角，不然 800px 的圖會被拉到糊 */}
      <div className="relative w-full md:mx-auto md:mt-4 md:max-w-md md:overflow-hidden md:rounded-t-3xl">
        <Image
          src={HERO_SRC}
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
        {/* 紅旗上的邀請碼＋複製圖標（圖標只在畫面上，下載版不畫） */}
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

      {/* 循環獎專區 —— 白底（老闆指定，hero 底緣就是漸白）、
          活動頁設計語言的淺色版，主題色亮黃金。只推一件事：每 5 位免費抽 */}
      <div className="w-full bg-white md:mx-auto md:max-w-md">
        <div className="px-5 pb-16 pt-10">
          {/* 描邊加粗 —— 中文字在 900 之上沒有更粗的字重，用 stroke 增肥 */}
          <h2
            className="whitespace-nowrap text-center text-[clamp(19px,5.4vw,27px)] font-black leading-tight tracking-wide text-neutral-900"
            style={{ WebkitTextStroke: '0.9px #171717' }}
          >
            每邀 5 位好友，免費拿 100 積分！
          </h2>
          <p className="mt-3 text-center text-[13px] font-bold leading-relaxed" style={{ color: '#c77f00' }}>
            好友綁定 LINE 帳號即可成功！
          </p>

          {/* 進度卡 —— 淺色暖底 */}
          <div
            className="mt-8 rounded-2xl border p-5"
            style={{ borderColor: '#f3dfae', background: '#fffbea' }}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-bold text-neutral-500">邀請進度</span>
              {status ? (
                <span className="text-[13px] font-black text-neutral-800">
                  累計 <span style={{ color: '#c77f00' }}>{status.qualified}</span> 位
                </span>
              ) : (
                <span className="h-3.5 w-16 animate-pulse rounded bg-neutral-200" />
              )}
            </div>

            {/* 五格進度條：一格一位好友 */}
            <div className="mt-3 flex gap-1.5">
              {Array.from({ length: step }, (_, i) => (
                <div
                  key={i}
                  className="h-3 flex-1 rounded-full transition-colors"
                  style={{
                    background: i < filled
                      ? 'linear-gradient(180deg,#ffe27a,#ffc93c 55%,#e8a820)'
                      : '#efe7d2',
                  }}
                />
              ))}
            </div>
            <p className="mt-2 text-right text-[11px] font-bold text-neutral-400">
              {status
                ? claimable > 0
                  ? '達標了，快領取'
                  : `再邀 ${step - (status.cycleProgress || 0)} 位可領 ${status.pointsPerStep} 積分`
                : ' '}
            </p>

            {/* 活動頁同款黃金按鈕（lpv-cta-btn 配方）；未達標時全淡灰 */}
            <button
              type="button"
              onClick={() => void claim()}
              disabled={claiming || claimable <= 0}
              className="mt-4 flex h-12 w-full items-center justify-center rounded-full text-[16px] font-black transition-transform active:scale-[0.97] disabled:active:scale-100"
              style={claimable > 0
                ? { background: GOLD_GRAD, color: '#3a2c08', boxShadow: '0 8px 26px rgba(255,210,74,0.45)' }
                : { background: '#ededed', color: '#b0b0b0' }}
            >
              {claiming
                ? <Loader2 className="h-5 w-5 animate-spin" />
                : claimable > 0 ? `領取 ${claimable} 積分` : '累積滿 5 位可領取'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 活動頁（LpRenderer）lpv-cta-btn 同款金黃漸層（領取按鈕用） */
const GOLD_GRAD = 'linear-gradient(180deg,#fffbe6,#ffd24a 46%,#a9760c 62%,#ffcf5a)';
