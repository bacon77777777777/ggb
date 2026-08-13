'use client';

import '../market.css';

/**
 * 商城收款設定（賣家自己填）
 *
 * ── 為什麼是二選一 ──
 * 老闆定調：「賣家就想要特定一種收款方式，那是他的自由」。
 * 所以這裡不做多選、也不讓買家挑 —— 賣家選一種，買家照著付。
 * 下單時 `create_sell_order` 會直接讀這裡的設定寫進訂單，前台傳什麼都不算數。
 *
 * ── 平台不碰錢 ──
 * 買家是直接把錢匯給賣家，平台不經手、不收成交手續費、也介入不了金流糾紛。
 * 所以這頁填錯 = 收不到錢，下面的提醒要講白話。
 *
 * ── 面交拿掉了 ──
 * 原本有「私下交易說明」欄位（面交），2026-08-13 移除：面交零紀錄，
 * 出事時平台連誰跟誰約在哪都拿不出來，糾紛完全無解。
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui';
import { ArrowLeft } from 'lucide-react';
import MarketTabBar from '@/components/sell/MarketTabBar';

export const dynamic = 'force-dynamic';

type PayoutMethod = 'bank' | 'linepay';

const FIELD_CLASS =
  'w-full h-11 bg-neutral-100 dark:bg-neutral-800 rounded-xl px-3 text-[13px] font-black text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary/20';

export default function SellSettingsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();

  const [method, setMethod] = useState<PayoutMethod>('bank');
  const [bank, setBank] = useState('');
  const [account, setAccount] = useState('');
  const [name, setName] = useState('');
  const [linepayId, setLinepayId] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!user?.id) {
      router.replace('/login?redirect=%2Fsell%2Fsettings');
      return;
    }
  }, [isLoading, router, user?.id]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user?.id) return;
      setIsFetching(true);
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('sell_seller_profiles')
          .select('payout_method, transfer_bank, transfer_account, transfer_name, linepay_id')
          .eq('seller_id', user.id)
          .maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        setMethod(String((data as any)?.payout_method || 'bank') === 'linepay' ? 'linepay' : 'bank');
        setBank(String((data as any)?.transfer_bank || ''));
        setAccount(String((data as any)?.transfer_account || ''));
        setName(String((data as any)?.transfer_name || ''));
        setLinepayId(String((data as any)?.linepay_id || ''));
      } catch (e) {
        console.error('Load seller profile failed:', e);
      } finally {
        if (!cancelled) setIsFetching(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const save = async () => {
    if (!user?.id) return;
    if (isSaving) return;

    // 填不完整就存進去的話，買家會下單到一半發現沒地方付錢 —— 在這裡先擋掉
    if (method === 'bank') {
      if (!bank.trim() || !account.trim() || !name.trim()) {
        showToast('銀行、帳號、戶名都要填，買家才匯得了款', 'plain');
        return;
      }
    } else if (!linepayId.trim()) {
      showToast('請填寫 LINE Pay 的收款手機號或 ID', 'plain');
      return;
    }

    setIsSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from('sell_seller_profiles').upsert(
        {
          seller_id: user.id,
          payout_method: method,
          transfer_bank: bank.trim(),
          transfer_account: account.trim(),
          transfer_name: name.trim(),
          linepay_id: linepayId.trim(),
          updated_at: new Date().toISOString(),
        } as any,
        { onConflict: 'seller_id' }
      );
      if (error) throw error;
      showToast('已儲存', 'plain');
      router.back();
    } catch (e) {
      console.error('Save seller profile failed:', e);
      showToast('儲存失敗', 'plain');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mk min-h-screen pb-[calc(64px+env(safe-area-inset-bottom))]">
      <div className="hdr plain sticky top-0 z-40 flex items-center gap-2">
        <button type="button" onClick={() => router.back()} aria-label="返回">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1">收款設定</h1>
      </div>

      <div className="blk first">
        <div className="secttl">收款方式</div>
        <p className="hint" style={{ margin: '0 0 10px' }}>
          買家會直接把錢付給你，平台不經手款項、也不收成交手續費。下單成立後，買家才看得到你的收款資訊。
        </p>

        {/*
          原型寫「可複選」，但 migration 552 已把收款方式定成單選
          （payout_method 只存一個值，買家不能自己挑）—— 依 DB 為準。
        */}
        <div className="two">
          {([
            ['bank', '銀行轉帳', '匯款到你的帳戶'],
            ['linepay', 'LINE Pay', '需雙方都有 LINE Pay Money'],
          ] as const).map(([v, label, sub]) => (
            <button
              key={v}
              type="button"
              className="pick"
              aria-pressed={method === v}
              onClick={() => setMethod(v)}
            >
              <span className="ck" />
              {label}
              <small>{sub}</small>
            </button>
          ))}
        </div>
      </div>

      {method === 'bank' ? (
        <div className="blk">
          <div className="secttl">轉帳資訊</div>
          <label className="f">轉帳銀行</label>
          <input className="fin" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="例如：玉山銀行" />
          <label className="f" style={{ marginTop: 12 }}>轉帳帳號</label>
          <input
            className="fin"
            inputMode="numeric"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder="例如：012345678901"
          />
          <label className="f" style={{ marginTop: 12 }}>戶名</label>
          <input className="fin" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：王小明" />
        </div>
      ) : (
        <div className="blk">
          <div className="secttl">LINE Pay</div>
          <label className="f">收款手機號或 ID</label>
          <input
            className="fin"
            value={linepayId}
            onChange={(e) => setLinepayId(e.target.value)}
            placeholder="例如：0912345678"
          />
          <p className="hint">LINE Pay 轉帳需要雙方都完成 LINE Pay Money 驗證，否則買家付不了款。</p>
        </div>
      )}

      <div className="blk">
        <button type="button" className="btn" disabled={isSaving || isFetching} onClick={save}>
          {isSaving ? '儲存中…' : '儲存'}
        </button>
        <button type="button" className="btn2" onClick={() => router.back()}>
          取消
        </button>
      </div>

      <MarketTabBar active="me" />
    </div>
  );
}
