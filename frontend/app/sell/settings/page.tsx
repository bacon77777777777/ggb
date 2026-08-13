'use client';

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
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pt-14 md:pt-0 pb-24">
      <div className="max-w-3xl mx-auto px-2 py-2 sm:py-6">
        <div className="bg-white dark:bg-neutral-900 rounded-2xl sm:rounded-3xl shadow-card border border-neutral-100 dark:border-neutral-800 overflow-hidden">
          <div className="p-3 sm:p-4 border-b border-neutral-50 dark:border-neutral-800 bg-neutral-50/30 dark:bg-neutral-800/30">
            <div className="text-[15px] font-black text-neutral-900 dark:text-white">商城收款設定</div>
            <div className="mt-1 text-[11px] font-bold leading-relaxed text-neutral-400 dark:text-neutral-500">
              買家會直接把錢付給你，平台不經手款項、也不收成交手續費。
              下單成立後，買家才看得到你的收款資訊。
            </div>
          </div>

          <div className="p-3 sm:p-6 space-y-5">
            <div className="space-y-2">
              <div className="text-[13px] font-black text-neutral-500 dark:text-neutral-400">收款方式</div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { v: 'bank' as const, label: '銀行轉帳' },
                  { v: 'linepay' as const, label: 'LINE Pay' },
                ]).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    disabled={isFetching}
                    onClick={() => setMethod(o.v)}
                    className={`h-11 rounded-xl text-[13px] font-black transition-colors disabled:opacity-50 ${
                      method === o.v
                        ? 'bg-primary text-white'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <div className="text-[11px] font-bold leading-relaxed text-neutral-400 dark:text-neutral-500">
                只能選一種，買家不能自己挑。
                {method === 'linepay' &&
                  ' LINE Pay 個人轉帳需要買賣雙方都有 LINE Pay Money（原一卡通）帳戶，只綁信用卡的一般 LINE Pay 轉不了帳。'}
              </div>
            </div>

            {method === 'bank' ? (
              <>
                <div className="space-y-2">
                  <div className="text-[13px] font-black text-neutral-500 dark:text-neutral-400">轉帳銀行</div>
                  <input
                    value={bank}
                    onChange={(e) => setBank(e.target.value)}
                    placeholder="例如：玉山銀行"
                    className={FIELD_CLASS}
                    disabled={isFetching}
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-[13px] font-black text-neutral-500 dark:text-neutral-400">轉帳帳號</div>
                  <input
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                    inputMode="numeric"
                    placeholder="例如：012345678901"
                    className={FIELD_CLASS}
                    disabled={isFetching}
                  />
                </div>

                <div className="space-y-2">
                  <div className="text-[13px] font-black text-neutral-500 dark:text-neutral-400">戶名</div>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例如：王小明"
                    maxLength={30}
                    className={FIELD_CLASS}
                    disabled={isFetching}
                  />
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <div className="text-[13px] font-black text-neutral-500 dark:text-neutral-400">
                  LINE Pay 收款手機號 / ID
                </div>
                <input
                  value={linepayId}
                  onChange={(e) => setLinepayId(e.target.value)}
                  placeholder="例如：0912345678"
                  maxLength={50}
                  className={FIELD_CLASS}
                  disabled={isFetching}
                />
              </div>
            )}

            <Button
              type="button"
              variant="danger"
              className="w-full h-[44px] text-base font-black rounded-xl"
              onClick={save}
              disabled={isSaving || isFetching}
            >
              {isSaving ? '儲存中…' : '儲存'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
