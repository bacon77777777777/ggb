'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default function SellSettingsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();

  const [bank, setBank] = useState('');
  const [account, setAccount] = useState('');
  const [name, setName] = useState('');
  const [privateNote, setPrivateNote] = useState('');
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
          .select('transfer_bank, transfer_account, transfer_name, private_trade_note')
          .eq('seller_id', user.id)
          .maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        setBank(String((data as any)?.transfer_bank || ''));
        setAccount(String((data as any)?.transfer_account || ''));
        setName(String((data as any)?.transfer_name || ''));
        setPrivateNote(String((data as any)?.private_trade_note || ''));
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
    setIsSaving(true);
    try {
      const supabase = createClient();
      const payload = {
        seller_id: user.id,
        transfer_bank: bank.trim(),
        transfer_account: account.trim(),
        transfer_name: name.trim(),
        private_trade_note: privateNote.trim(),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('sell_seller_profiles').upsert(payload as any, { onConflict: 'seller_id' });
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
            <div className="text-[15px] font-black text-neutral-900 dark:text-white">販售收款/交易設定</div>
          </div>

          <div className="p-3 sm:p-6 space-y-5">
            <div className="space-y-2">
              <div className="text-[13px] font-black text-neutral-500 dark:text-neutral-400">轉帳銀行</div>
              <input
                value={bank}
                onChange={(e) => setBank(e.target.value)}
                placeholder="例如：玉山銀行"
                className="w-full h-11 bg-neutral-100 dark:bg-neutral-800 rounded-xl px-3 text-[13px] font-black text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary/20"
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
                className="w-full h-11 bg-neutral-100 dark:bg-neutral-800 rounded-xl px-3 text-[13px] font-black text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary/20"
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
                className="w-full h-11 bg-neutral-100 dark:bg-neutral-800 rounded-xl px-3 text-[13px] font-black text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary/20"
                disabled={isFetching}
              />
            </div>

            <div className="space-y-2">
              <div className="text-[13px] font-black text-neutral-500 dark:text-neutral-400">私下交易說明</div>
              <textarea
                value={privateNote}
                onChange={(e) => setPrivateNote(e.target.value)}
                placeholder="例如：面交地點、可接受的交易方式、聯絡規則…"
                rows={4}
                className="w-full bg-neutral-100 dark:bg-neutral-800 rounded-xl px-3 py-2 text-[13px] font-black text-neutral-900 dark:text-neutral-50 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                disabled={isFetching}
              />
            </div>

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
