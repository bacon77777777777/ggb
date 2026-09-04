'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * 商品收藏（product_follows）：跟 Navbar 右上那顆愛心同一套邏輯。
 * 電腦版把收藏鈕做進舞台裡（老闆 2026-09-04：照 packs），所以抽成 hook 兩邊共用。
 * 未登入按下去導到登入頁。
 */
export function useProductFollow(productId: number, enabled = true) {
  const { user } = useAuth();
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [followed, setFollowed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !enabled) { setFollowed(false); return; }
    let alive = true;
    (async () => {
      try {
        const { count } = await supabase
          .from('product_follows')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('product_id', productId);
        if (alive) setFollowed(!!count);
      } catch {}
    })();
    return () => { alive = false; };
  }, [user, productId, supabase, enabled]);

  const toggle = useCallback(async () => {
    if (!user) { router.push('/login'); return; }
    if (busy) return;
    setBusy(true);
    try {
      if (followed) {
        const { error } = await supabase.from('product_follows').delete().eq('user_id', user.id).eq('product_id', productId);
        if (!error) setFollowed(false);
      } else {
        const { error } = await supabase.from('product_follows').insert({ user_id: user.id, product_id: productId });
        if (!error) setFollowed(true);
      }
    } finally {
      setBusy(false);
    }
  }, [user, busy, followed, productId, router, supabase]);

  return { followed, toggle, busy };
}
