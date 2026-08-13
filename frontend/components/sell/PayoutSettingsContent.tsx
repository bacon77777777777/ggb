'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';

/*
 * 商城收款設定的內容（原型 payCfg()）。
 *
 * ── 為什麼是二選一 ──
 * 老闆定調：「賣家就想要特定一種收款方式，那是他的自由」。
 * 原型寫「可複選」，但 migration 552 已把 payout_method 定成單值，依 DB 為準。
 * 下單時 create_sell_order 直接讀這裡的設定寫進訂單，前台傳什麼都不算數。
 *
 * ── 平台不碰錢 ──
 * 買家直接把錢匯給賣家，這頁填錯 = 收不到錢，所以提醒要講白話。
 *
 * ── 面交拿掉了 ──
 * 原本有「私下交易說明」（面交），2026-08-13 移除：面交零紀錄，
 * 出事時平台連誰跟誰約在哪都拿不出來。
 */

type PayoutMethod = 'bank' | 'linepay';

export default function PayoutSettingsContent({ onDone }: { onDone?: () => void }) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [method, setMethod] = useState<PayoutMethod>('bank');
  const [bank, setBank] = useState('');
  const [account, setAccount] = useState('');
  const [name, setName] = useState('');
  const [linepayId, setLinepayId] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!user?.id) return;
      setIsFetching(true);
      try {
        const { data } = await createClient()
          .from('sell_seller_profiles')
          .select('payout_method, transfer_bank, transfer_account, transfer_name, linepay_id')
          .eq('seller_id', user.id)
          .maybeSingle();
        if (cancelled) return;
        setMethod(String((data as any)?.payout_method || 'bank') === 'linepay' ? 'linepay' : 'bank');
        setBank(String((data as any)?.transfer_bank || ''));
        setAccount(String((data as any)?.transfer_account || ''));
        setName(String((data as any)?.transfer_name || ''));
        setLinepayId(String((data as any)?.linepay_id || ''));
      } finally {
        if (!cancelled) setIsFetching(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const save = async () => {
    if (!user?.id) return;
    if (method === 'bank') {
      if (!bank.trim() || !account.trim() || !name.trim()) {
        showToast('請完整填寫銀行、帳號與戶名', 'plain');
        return;
      }
    } else if (!linepayId.trim()) {
      showToast('請填寫 LINE Pay 的收款手機號或 ID', 'plain');
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await createClient().from('sell_seller_profiles').upsert(
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
      onDone?.();
    } catch (e) {
      console.error('Save seller profile failed:', e);
      showToast('儲存失敗', 'plain');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="blk first">
        <div className="secttl">收款方式</div>
        <p className="hint" style={{ margin: '0 0 10px' }}>
          買家會直接把錢付給你，平台不經手款項、也不收成交手續費。下單成立後，買家才看得到你的收款資訊。
        </p>
        <div className="two">
          {(
            [
              ['bank', '銀行轉帳', '匯款到你的帳戶'],
              ['linepay', 'LINE Pay', '需雙方都有 LINE Pay Money'],
            ] as const
          ).map(([v, label, sub]) => (
            <button key={v} type="button" className="pick" aria-pressed={method === v} onClick={() => setMethod(v)}>
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
      </div>
    </>
  );
}
