'use client';

/**
 * 刪除帳號（Apple App Store Review Guideline 5.1.1(v) 強制要求：
 * 有註冊功能就必須提供 App 內的刪除入口，只給「停用」不算數）
 *
 * 版面與擋門規則對齊同業（潮玩家）的做法：先把後果一條一條攤開，
 * 勾選「我已閱讀」才放行，並在三種情況下擋下刪除：
 *   1. 代幣還有餘額 —— 請先用完，或由客服代辦（DB function 的 p_force）
 *   2. 倉庫還有沒申請出貨的獎品 —— 那是已付款、平台還沒交付的實體商品
 *   3. 訂單還在進行中 —— 牽涉物流、廠商與交易對象，刪了就沒人能處理
 * 擋門判斷一律以後端 preflight 為準，這裡只負責講清楚。
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, FileText, Info, Loader2, Receipt, UserRound, Wallet } from 'lucide-react';
import SimplePageHeader from '@/components/ui/SimplePageHeader';
import { ActionBar } from '@/components/ui/ActionBar';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import { X } from 'lucide-react';

type Preflight = {
  ok: boolean;
  already_deleted: boolean;
  tokens: number;
  pending_orders: number;
  pending_platform: number;
  pending_sell_buy: number;
  pending_sell_sell: number;
  pending_shop: number;
  warehouse_prizes: number;
  active_listings: number;
};

function NoticeCard({
  icon,
  title,
  children,
  alert,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-2xl p-4 bg-white dark:bg-neutral-900 border',
        alert
          ? 'border-accent-red/30 bg-accent-red/[0.03]'
          : 'border-neutral-100 dark:border-neutral-800'
      )}
    >
      <div
        className={cn(
          'shrink-0 w-9 h-9 rounded-full flex items-center justify-center',
          alert
            ? 'bg-accent-red/10 text-accent-red'
            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400'
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 space-y-1">
        <h3
          className={cn(
            'font-bold text-[15px]',
            alert ? 'text-accent-red' : 'text-neutral-800 dark:text-neutral-100'
          )}
        >
          {title}
        </h3>
        <p className="text-[13.5px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
          {children}
        </p>
      </div>
    </div>
  );
}

export default function DeleteAccountSheet({
  isOpen,
  onClose,
  onDeleted,
}: {
  isOpen: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [pre, setPre] = useState<Preflight | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/user/delete-account');
      if (!res.ok) throw new Error('preflight failed');
      setPre(await res.json());
    } catch {
      setError('無法讀取帳號狀態，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setAgreed(false);
    setError('');
    load();
  }, [isOpen, load]);

  const handleDelete = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/user/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledged: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || '刪除失敗，請聯繫客服');
        await load(); // 擋門條件可能剛變動，重抓一次讓畫面說得出原因
        return;
      }
      onDeleted();
    } catch {
      setError('刪除失敗，請稍後再試');
    } finally {
      setSubmitting(false);
    }
  };

  /* 1024 起（cardx 桌機殼）改成置中彈窗，不再是滿版的手機頁（老闆 2026-09-05） */
  const isDesktop = useMediaQuery('(min-width: 768px)');

  if (!isOpen) return null;

  const hasTokens = !!pre && pre.tokens > 0;
  const hasWarehouse = !!pre && pre.warehouse_prizes > 0;
  const hasOrders = !!pre && pre.pending_orders > 0;
  const canSubmit = !!pre && pre.ok && agreed && !submitting;

  const content = (
    <>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-neutral-400 text-[14px]">
            <Loader2 className="w-4 h-4 animate-spin" />
            檢查帳號狀態…
          </div>
        ) : !pre ? (
          <div className="py-20 text-center space-y-3">
            <p className="text-[14px] text-neutral-500">{error || '讀取失敗'}</p>
            <button type="button" onClick={load} className="text-[14px] text-primary underline">
              重新檢查
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-3 rounded-2xl p-4 bg-primary/[0.06] border border-primary/20">
              <div className="shrink-0 w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center">
                <Info className="w-4 h-4" />
              </div>
              <div className="min-w-0 space-y-1">
                <h2 className="font-bold text-[15px] text-neutral-800 dark:text-neutral-100">刪除帳號</h2>
                <p className="text-[13.5px] text-neutral-600 dark:text-neutral-300 leading-relaxed">
                  刪除帳號後，你將無法再以此帳號登入，且帳號資料
                  <span className="font-bold text-accent-red">無法自行復原</span>。
                </p>
              </div>
            </div>

            <h2 className="pt-2 pb-1 px-1 font-bold text-[15px] text-neutral-800 dark:text-neutral-100">
              刪除帳號前，請確認以下事項：
            </h2>

            <NoticeCard icon={<UserRound className="w-4 h-4" />} title="帳號資料將無法再使用">
              包含會員基本資料、登入資訊，以及倉庫、收藏、徽章、稱號、優惠券等與帳號相關的個人資料，刪除後將無法以原帳號登入。
            </NoticeCard>

            <NoticeCard icon={<Wallet className="w-4 h-4" />} title="請先用完儲值的代幣" alert={hasTokens}>
              {hasTokens ? (
                <>
                  你目前還有 <span className="font-bold text-accent-red">{pre.tokens.toLocaleString()}</span> 代幣，
                  系統會擋下刪除要求。請先使用完畢，或聯繫客服協助處理。
                </>
              ) : (
                '若仍有未使用的代幣，系統會擋下刪除要求，請先使用完畢或聯繫客服協助。'
              )}
            </NoticeCard>

            <NoticeCard
              icon={<FileText className="w-4 h-4" />}
              title="請先完成進行中的訂單"
              alert={hasOrders || hasWarehouse}
            >
              {hasOrders || hasWarehouse ? (
                <>
                  目前還有：
                  {hasWarehouse && <>倉庫裡 {pre.warehouse_prizes} 件獎品尚未申請出貨</>}
                  {hasWarehouse && hasOrders && '、'}
                  {hasOrders && <>{pre.pending_orders} 筆訂單進行中</>}
                  。請先處理完成後再刪除帳號。
                </>
              ) : (
                '若有尚未完成的訂單，或倉庫中還有未申請出貨的獎品，請先處理完成後再刪除帳號。'
              )}
            </NoticeCard>

            <NoticeCard icon={<Receipt className="w-4 h-4" />} title="部分交易資料將依法保留">
              因會計、稅務與消費爭議處理等法令要求，儲值、抽獎與訂單等必要紀錄會在法定期限內繼續保存。這些紀錄會去識別化，僅供對帳與抽獎公平性驗證使用，不再與你的身分連結。
            </NoticeCard>

            <NoticeCard icon={<AlertCircle className="w-4 h-4" />} title="刪除後無法自行復原">
              帳號一旦刪除即無法自行恢復，且無法再以此帳號登入。
              {pre.active_listings > 0 && <>商城上架中的 {pre.active_listings} 件商品也會一併下架。</>}
            </NoticeCard>

            <label className="flex items-center gap-3 rounded-2xl p-4 bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-primary focus:ring-primary shrink-0"
              />
              <span className="text-[14px] text-neutral-700 dark:text-neutral-200">
                我已閱讀並了解刪除帳號後的須知
              </span>
            </label>

            {error && (
              <p className="px-1 text-[13px] text-accent-red">{error}</p>
            )}
          </>
        )}
    </>
  );

  if (isDesktop) {
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
        <div role="dialog" aria-modal="true" aria-label="刪除帳號" onClick={(e) => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-[520px] flex-col overflow-hidden rounded-[18px] bg-white shadow-[0_20px_70px_-15px_rgba(0,0,0,0.25)] dark:bg-neutral-900">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-100 px-5 dark:border-neutral-800">
            <div className="text-[16px] font-black text-neutral-900 dark:text-white">刪除帳號</div>
            <button type="button" aria-label="關閉" onClick={onClose} className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">{content}</div>
          {!loading && pre && (
            <div className="flex shrink-0 gap-3 border-t border-neutral-100 bg-white px-5 py-3 dark:border-neutral-800 dark:bg-neutral-900">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-[15px] text-neutral-700 dark:text-neutral-200 active:scale-[0.98] transition-all"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canSubmit}
            className={cn(
              'flex-1 h-12 rounded-xl text-[15px] font-bold text-white transition-all',
              canSubmit ? 'bg-accent-red active:scale-[0.98]' : 'bg-accent-red/40 cursor-not-allowed'
            )}
          >
            {submitting ? '刪除中…' : '刪除帳號'}
          </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[90] bg-neutral-50 dark:bg-neutral-950 overflow-y-auto">
      <SimplePageHeader title="刪除帳號" onBack={onClose} darkBg="page" className="z-[95]" />

      {/* SimplePageHeader 是 fixed，內容要自己讓開頭部高度，
          否則捲到頂端時第一張卡會被壓在導航列底下。
          safe-header-offset = 頭部高度 + 安全區（見 globals.css） */}
      <div className="safe-header-offset">
        <div className="max-w-2xl mx-auto p-4 pb-32 space-y-3">
        {content}
        </div>
      </div>

      {!loading && pre && (
        <ActionBar zIndex="z-[96]" className="gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-[15px] text-neutral-700 dark:text-neutral-200 active:scale-[0.98] transition-all"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canSubmit}
            className={cn(
              'flex-1 h-12 rounded-xl text-[15px] font-bold text-white transition-all',
              canSubmit ? 'bg-accent-red active:scale-[0.98]' : 'bg-accent-red/40 cursor-not-allowed'
            )}
          >
            {submitting ? '刪除中…' : '刪除帳號'}
          </button>
        </ActionBar>
      )}
    </div>
  );
}
