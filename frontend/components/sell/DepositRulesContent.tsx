'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';

/*
 * 保證金規則的內容（原型 depInfo()）。
 *
 * 抽成元件是因為它有兩個出口：「我的」頁的彈層，以及 /sell/deposit 這條
 * 深連結路由。同一份內容不能寫兩次 —— 規則改了只改到一邊會很難發現。
 */

type Tier = { k: number; name: string; ratio: number; max_price: number; cond: string };

export default function DepositRulesContent({ onDone }: { onDone?: () => void } = {}) {
  const { user } = useAuth();
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [myK, setMyK] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const [{ data: row }, { data: dash }] = await Promise.all([
        supabase.from('platform_settings').select('value').eq('key', 'sell_tiers').maybeSingle(),
        user?.id ? supabase.rpc('sell_my_dashboard') : Promise.resolve({ data: null }),
      ]);
      if (cancelled) return;
      try {
        const parsed = JSON.parse(String((row as any)?.value || '[]'));
        if (Array.isArray(parsed)) setTiers(parsed as Tier[]);
      } catch {
        setTiers([]);
      }
      if ((dash as any)?.success) setMyK(Number((dash as any).tier?.k) || null);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  return (
    <>
      <div className="blk first">
        <div className="secttl">怎麼運作</div>
        <div className="kv"><span>上架時</span><span style={{ color: '#3FA34D' }}>不扣</span></div>
        <div className="kv"><span>賣出時</span><span>依售價收一筆 G幣</span></div>
        <div className="kv"><span>買家確認收貨</span><span style={{ color: '#3FA34D' }}>全額退還</span></div>
        <div className="kv"><span>你沒出貨</span><span style={{ color: 'var(--red)' }}>保證金賠給買家</span></div>
        <p className="hint">運費不計入保證金基數。買家要等超過出貨期限才能申請補償，不是逾時就自動扣。</p>
      </div>

      <div className="blk">
        <div className="secttl">等級與比例</div>
        <table className="t">
          <thead>
            <tr><th>等級</th><th>條件</th><th>保證金</th><th>單件最高賣</th></tr>
          </thead>
          <tbody>
            {[...tiers].reverse().map((t) => (
              <tr key={t.k} className={myK === t.k ? 'me' : undefined}>
                <td>{t.name}</td>
                <td style={{ color: 'var(--sub)' }}>{t.cond}</td>
                <td>售價 {t.ratio}%</td>
                <td>{Number(t.max_price).toLocaleString('zh-TW')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
