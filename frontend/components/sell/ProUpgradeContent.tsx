'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';

/*
 * 官方認證商家的內容（原型 goPro()）。
 *
 * ⚠️「保證金比例：不變」是刻意的（原型也這樣寫）：
 * 保證金是買家保障，能用月費買掉就失去意義。
 */

export default function ProUpgradeContent({ onDone }: { onDone?: () => void }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [price, setPrice] = useState(1200);
  const [isPro, setIsPro] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: row }, { data: dash }] = await Promise.all([
      supabase.from('platform_settings').select('value').eq('key', 'sell_pro_monthly_price').maybeSingle(),
      user?.id ? supabase.rpc('sell_my_dashboard') : Promise.resolve({ data: null }),
    ]);
    setPrice(Number((row as any)?.value) || 1200);
    if ((dash as any)?.success) setIsPro(!!(dash as any).is_pro);
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  const subscribe = async () => {
    setBusy(true);
    try {
      const { data, error } = await createClient().rpc('sell_pro_subscribe');
      if (error) throw error;
      const r = data as any;
      if (!r?.success) { showToast(r?.message || '訂閱失敗', 'plain'); return; }
      showToast('已升級為官方認證商家', 'plain');
      await load();
      onDone?.();
    } catch (e: any) {
      showToast(e?.message || '訂閱失敗', 'plain');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="blk first">
      <div className="secttl">升級後解鎖</div>
      <div className="kv"><span>認證徽章</span><span>個人頁與商品卡</span></div>
      <div className="kv"><span>店鋪頁</span><span>集中展示你的商品</span></div>
      <div className="kv"><span>自家商品置頂</span><span>店鋪頁排序</span></div>
      <div className="kv"><span>單件售價上限</span><span style={{ color: 'var(--red)' }}>提高一級</span></div>
      <div className="kv"><span>保證金比例</span><span>不變</span></div>

      {isPro ? (
        <p className="hint" style={{ textAlign: 'center' }}>你已經是官方認證商家</p>
      ) : (
        <button type="button" className="btn gold" disabled={busy} onClick={subscribe}>
          {busy ? '處理中…' : `${price.toLocaleString('zh-TW')}G／月　立即升級`}
        </button>
      )}
    </div>
  );
}
