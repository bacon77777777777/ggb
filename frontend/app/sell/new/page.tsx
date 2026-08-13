'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronRight, ImagePlus, X } from 'lucide-react';
import { ActionBar, Button } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

type ListingItem = {
  name: string;
  series: string;
  grade: string;
  image: string;
  quantity: string;
};

const DRAFT_KEY = 'sell:new:draft:v1';

export default function SellNewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();

  /**
   * 編輯模式（`?edit=<id>`）：同一張表單拿來改被退回／已下架的上架單。
   * 商城管理的「修改後重新送審」會帶這個參數進來。
   * 送出時走 UPDATE；若原狀態是 rejected / removed 會一併改回 pending 重新送審
   * （active 不用帶 —— DB 的防換餌 trigger 看到內容變了會自己退回待審）。
   */
  const editId = (() => {
    const n = Number(searchParams.get('edit'));
    return Number.isInteger(n) && n > 0 ? n : null;
  })();
  const [originalStatus, setOriginalStatus] = useState('');

  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [images, setImages] = useState<string[]>(['', '', '']);
  const [listingItems, setListingItems] = useState<ListingItem[]>([
    { name: '', series: '', grade: '', image: '', quantity: '1' },
  ]);
  const [isSaving, setIsSaving] = useState(false);
  const [editingImageIndex, setEditingImageIndex] = useState<number | null>(null);
  const [imageDraft, setImageDraft] = useState('');
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [pendingImageSlotIndex, setPendingImageSlotIndex] = useState<number | null>(null);
  const [pendingItemIndex, setPendingItemIndex] = useState<number | null>(null);
  const [pendingItemImageDraft, setPendingItemImageDraft] = useState('');
  /**
   * 類別白名單來自後台「商城設定」。
   * DB trigger `sell_guard_listing()` 會擋掉不在白名單內的類別 —— 前台一定要用同一份清單，
   * 不然玩家填完整頁才被拒絕，而且看不出是哪裡錯。
   */
  const [shippingFee, setShippingFee] = useState<number>(60);
  // 賣家等級決定保證金比例與單件售價上限。算法留在 DB（sell_my_dashboard），
  // 前台複製一份遲早會跟後端算出兩種答案
  const [tier, setTier] = useState<{ name: string; ratio: number; max_price: number } | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await createClient()
        .from('platform_settings')
        .select('value')
        .eq('key', 'sell_category_whitelist')
        .maybeSingle();
      if (cancelled) return;
      try {
        const parsed = JSON.parse(String((data as any)?.value || '[]'));
        if (Array.isArray(parsed)) setCategories(parsed.map(String).filter(Boolean));
      } catch {
        setCategories([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 賣家等級：決定保證金比例與單件售價上限，兩者都要在送出前先告訴賣家，
  // 不然會在 DB trigger 那裡被擋下來，只看到一句錯誤訊息
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      const { data } = await createClient().rpc('sell_my_dashboard');
      if (cancelled || !data || !(data as any).success) return;
      const t = (data as any).tier || {};
      setTier({
        name: String(t.name || '新手'),
        ratio: Number(t.ratio) || 100,
        max_price: Number(t.max_price) || 3000,
      });
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (isLoading) return;
    if (!user?.id) {
      router.replace('/login');
      return;
    }
  }, [isLoading, router, user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY) || '';
      if (!raw) return;
      const parsed = JSON.parse(raw) as any;
      // 草稿跟目前模式對不上就不吃：編輯 A 的草稿不能出現在編輯 B 或新上架的表單裡
      const draftEditId = Number(parsed?.editId || 0) || null;
      if (draftEditId !== editId) return;
      setOriginalStatus(String(parsed?.originalStatus || ''));
      setTitle(String(parsed?.title || ''));
      setPrice(String(parsed?.price || ''));
      if (parsed?.shippingFee !== undefined) setShippingFee(Number(parsed.shippingFee) || 0);
      setNote(String(parsed?.note || ''));
      setCategory(String(parsed?.category || ''));
      setImages(Array.isArray(parsed?.images) ? parsed.images.map((x: any) => String(x || '')) : ['', '', '']);
      setListingItems(
        Array.isArray(parsed?.listingItems) && parsed.listingItems.length > 0
          ? parsed.listingItems.map((x: any) => ({
              name: String(x?.name || ''),
              series: String(x?.series || ''),
              grade: String(x?.grade || ''),
              image: String(x?.image || ''),
              quantity: String(x?.quantity ?? '1'),
            }))
          : [{ name: '', series: '', grade: '', image: '', quantity: '1' }]
      );
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          editId,
          originalStatus,
          title,
          price,
          shippingFee,
          note,
          category,
          images,
          listingItems,
        })
      );
    } catch {}
  }, [category, editId, images, listingItems, note, originalStatus, price, shippingFee, title]);

  useEffect(() => {
    if (!editId || !user?.id) return;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY) || '';
      if (raw && (Number(JSON.parse(raw)?.editId || 0) || null) === editId) return; // 草稿就是這筆，別覆蓋
    } catch {}
    let cancelled = false;
    void (async () => {
      const { data } = await createClient()
        .from('sell_listings')
        .select('title, price, shipping_fee, note, category, status, images, items')
        .eq('id', editId)
        .eq('seller_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (!data) {
        showToast('找不到這筆上架', 'plain');
        router.replace('/sell/manage');
        return;
      }
      setTitle(String((data as any).title || ''));
      setPrice(String((data as any).price ?? ''));
      setShippingFee(Number((data as any).shipping_fee ?? 60));
      setNote(String((data as any).note || ''));
      setCategory(String((data as any).category || ''));
      setOriginalStatus(String((data as any).status || ''));
      const imgs = (Array.isArray((data as any).images) ? (data as any).images : [])
        .map((x: any) => String(x || '').trim());
      while (imgs.length < 3) imgs.push('');
      setImages(imgs.slice(0, 8));
      const its = Array.isArray((data as any).items) ? (data as any).items : [];
      setListingItems(
        its.length > 0
          ? its.map((x: any) => ({
              name: String(x?.name || ''),
              series: String(x?.series || ''),
              grade: String(x?.grade || ''),
              image: String(x?.image || ''),
              quantity: String(x?.quantity ?? '1'),
            }))
          : [{ name: '', series: '', grade: '', image: '', quantity: '1' }]
      );
    })();
    return () => { cancelled = true; };
  }, [editId, router, showToast, user?.id]);

  const firstItemImage = useMemo(() => {
    const byItem = listingItems.map((x) => String(x.image || '').trim()).find(Boolean) || '';
    return byItem;
  }, [listingItems]);

  useEffect(() => {
    setImages((prev) => {
      const next = [...prev];
      if (!String(next[0] || '').trim() && firstItemImage) next[0] = firstItemImage;
      return next;
    });
  }, [firstItemImage]);

  const canSubmit = useMemo(() => {
    if (!user?.id) return false;
    const p = Number(price);
    if (!Number.isFinite(p) || p <= 0) return false;
    const t = title.trim();
    if (!t) return false;
    if (!category.trim()) return false;
    // 超過等級售價上限就別讓他送出：DB trigger 會擋，但填完整頁才被拒絕很傷
    if (tier && p > tier.max_price) return false;
    const cleanCount = listingItems.filter((it) => String(it.name || '').trim()).length;
    if (cleanCount <= 0) return false;
    const allQtyOk = listingItems
      .filter((it) => String(it.name || '').trim())
      .every((it) => {
        const q = Number(String(it.quantity || '').trim());
        return Number.isFinite(q) && q >= 1;
      });
    if (!allQtyOk) return false;
    return true;
  }, [category, listingItems, price, tier, title, user?.id]);

  const totalQuantity = useMemo(() => {
    return listingItems
      .filter((it) => String(it.name || '').trim())
      .reduce((acc, it) => acc + (Number(String(it.quantity || '0').trim()) || 0), 0);
  }, [listingItems]);

  const uploadImage = async (file: File) => {
    if (!user?.id) throw new Error('login_required');
    const maxBytes = 8 * 1024 * 1024;
    if (file.size > maxBytes) throw new Error('file_too_large');
    if (!file.type.startsWith('image/')) throw new Error('invalid_file');

    const ext = (() => {
      const name = String(file.name || '').toLowerCase();
      const m = name.match(/\.(png|jpg|jpeg|webp|gif|heic)$/);
      if (m?.[1]) return m[1] === 'jpeg' ? 'jpg' : m[1];
      const t = String(file.type || '').toLowerCase();
      if (t.includes('png')) return 'png';
      if (t.includes('webp')) return 'webp';
      if (t.includes('gif')) return 'gif';
      if (t.includes('jpeg') || t.includes('jpg')) return 'jpg';
      if (t.includes('heic')) return 'heic';
      return 'jpg';
    })();

    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now());
    const objectPath = `${user.id}/sell/${Date.now()}-${id}`;

    const form = new FormData();
    form.append('file', file);
    form.append('bucket', 'marketplace');
    form.append('path', objectPath);
    const res = await fetch('/api/upload/image', { method: 'POST', body: form });
    if (!res.ok) throw new Error((await res.json()).error || 'no_public_url');
    const { publicUrl } = await res.json();
    if (!publicUrl) throw new Error('no_public_url');
    return publicUrl;
  };

  const openImageUploaderForSlot = (slotIndex: number) => {
    setPendingImageSlotIndex(slotIndex);
    setPendingItemIndex(null);
    setPendingItemImageDraft('');
  };

  const openImageUploaderForItem = (itemIndex: number, current: string) => {
    setPendingItemIndex(itemIndex);
    setPendingItemImageDraft(current);
    setPendingImageSlotIndex(null);
  };

  const submit = async () => {
    if (!canSubmit) return;
    if (!user?.id) return;
    setIsSaving(true);
    try {
      const supabase = createClient();
      const p = Math.round(Number(price));
      const cleanImages = images.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 8);
      const cleanItems = listingItems
        .map((it) => ({
          name: String(it.name || '').trim(),
          series: String(it.series || '').trim(),
          grade: String(it.grade || '').trim(),
          image: String(it.image || '').trim(),
          quantity: Math.max(1, Math.round(Number(String(it.quantity || '1').trim()) || 1)),
        }))
        .filter((it) => it.name)
        .slice(0, 50);

      if (editId) {
        const patch: Record<string, unknown> = {
          price: p,
          shipping_fee: shippingFee,
          title: title.trim(),
          note: note.trim(),
          category: category.trim(),
          images: cleanImages,
          items: cleanItems,
          updated_at: new Date().toISOString(),
        };
        // 被退回／已下架的改完要重新送審；上架中的不帶 status ——
        // DB 防換餌 trigger 看到內容變了會自己退回待審
        if (originalStatus === 'rejected' || originalStatus === 'removed') patch.status = 'pending';

        const { error } = await supabase
          .from('sell_listings')
          .update(patch as any)
          .eq('id', editId)
          .eq('seller_id', user.id);
        if (error) throw error;

        try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
        showToast('已重新送審，審核通過後就會恢復上架', 'plain');
        router.replace('/sell/manage');
        return;
      }

      const { data, error } = await supabase
        .from('sell_listings')
        .insert({
          seller_id: user.id,
          price: p,
          shipping_fee: shippingFee,
          status: 'active',
          title: title.trim(),
          note: note.trim(),
          category: category.trim(),
          images: cleanImages,
          items: cleanItems,
        } as any)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      const insertedId = (data as any)?.id ?? null;

      if (!insertedId) {
        showToast('上架失敗', 'plain');
        return;
      }

      try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
      showToast('已送出，審核通過後就會出現在商城', 'plain');
      router.replace(`/sell/${String(insertedId)}`);
    } catch (e: any) {
      console.error('Failed to save listing:', e);
      // DB trigger 的錯誤訊息本來就是寫給玩家看的中文（停權/類別/上限…），直接顯示
      const msg = String(e?.message || '');
      showToast(/[\u4e00-\u9fff]/.test(msg) ? msg : '上架失敗', 'plain');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-24">
      <div className="max-w-7xl mx-auto px-0 pt-2 pb-20">
        <div className="bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="text-[14px] font-black text-neutral-900 dark:text-white">商品圖片</div>
            <div className="text-[12px] font-black text-neutral-400 dark:text-neutral-500">1:1 比例圖片</div>
          </div>
          <div className="mt-2 flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
            {images
              .map((src, idx) => ({ src: String(src || '').trim(), idx }))
              .filter((x) => x.src)
              .map(({ src, idx }) => (
                <button
                  key={`${src}-${idx}`}
                  type="button"
                  onClick={() => {
                    setEditingImageIndex(idx);
                    setImageDraft(images[idx] || '');
                  }}
                  className="relative w-[72px] h-[72px] rounded-[6px] overflow-hidden border border-neutral-200 dark:border-neutral-800 flex-shrink-0"
                >
                  <Image src={src} alt="" fill className="object-cover" unoptimized />
                  <div className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/40 text-white grid place-items-center">
                    <X className="w-4 h-4" />
                  </div>
                </button>
              ))}
            <button
              type="button"
              onClick={() => {
                const idx = images.findIndex((x) => !String(x || '').trim());
                const target = idx === -1 ? images.length : idx;
                if (target >= 8) return;
                if (idx === -1) setImages((prev) => [...prev, '']);
                setEditingImageIndex(target);
                setImageDraft('');
              }}
              className="w-[72px] h-[72px] rounded-[6px] border border-dashed border-neutral-300 dark:border-neutral-700 flex flex-col items-center justify-center gap-1 flex-shrink-0 text-neutral-400 dark:text-neutral-500"
              aria-label="加入照片"
            >
              <ImagePlus className="w-6 h-6" />
              <div className="text-[12px] font-black">加入照片</div>
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[14px] font-black text-neutral-900 dark:text-white">商品名稱</div>
            <div className="text-[12px] font-black text-neutral-400 dark:text-neutral-500">{Math.min(60, title.length)}/60</div>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 60))}
            placeholder="請輸入"
            maxLength={60}
            className="mt-2 w-full h-10 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl px-3 text-[14px] font-black text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 px-4">
          <button
            type="button"
            onClick={() => setIsCategoryOpen((v) => !v)}
            className="w-full h-12 flex items-center justify-between gap-3"
          >
            <div className="text-[14px] font-black text-neutral-900 dark:text-white">類別</div>
            <div className="flex items-center gap-2 min-w-0">
              <span className={`text-[14px] font-black truncate ${category ? 'text-neutral-900 dark:text-white' : 'text-neutral-400 dark:text-neutral-500'}`}>
                {category || '請選擇'}
              </span>
              <ChevronRight className={`w-4 h-4 text-neutral-400 shrink-0 transition-transform ${isCategoryOpen ? 'rotate-90' : ''}`} />
            </div>
          </button>
          {isCategoryOpen && (
            <div className="pb-3 flex flex-wrap gap-2">
              {categories.length === 0 ? (
                <div className="text-[12px] font-bold text-neutral-400">
                  目前沒有開放的類別，暫時無法上架
                </div>
              ) : (
                categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { setCategory(c); setIsCategoryOpen(false); }}
                    className={`h-9 px-3 rounded-xl text-[13px] font-black transition-colors ${
                      category === c
                        ? 'bg-primary text-white'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300'
                    }`}
                  >
                    {c}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[14px] font-black text-neutral-900 dark:text-white">商品描述</div>
            <div className="text-[12px] font-black text-neutral-400 dark:text-neutral-500">{Math.min(3000, note.length)}/3000</div>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 3000))}
            rows={3}
            placeholder="請輸入"
            maxLength={3000}
            className="mt-2 w-full bg-neutral-50 dark:bg-neutral-800/60 rounded-xl px-3 py-2 text-[14px] font-black text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
          />
        </div>

        <div className="bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 px-4">
          <button
            type="button"
            onClick={() => router.push('/sell/new/specs')}
            className="w-full h-12 flex items-center justify-between gap-3"
          >
            <div className="text-[14px] font-black text-neutral-900 dark:text-white">規格</div>
            <div className="flex items-center gap-2 min-w-0">
              <div className="text-[13px] font-black text-neutral-400 dark:text-neutral-500 truncate">
                {listingItems.filter((x) => String(x.name || '').trim()).length > 0
                  ? `已新增 ${listingItems.filter((x) => String(x.name || '').trim()).length} 個`
                  : '未設定'}
              </div>
              <ChevronRight className="w-5 h-5 text-neutral-300 dark:text-neutral-600" />
            </div>
          </button>
        </div>

        <div className="bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 px-4">
          <div className="h-12 flex items-center justify-between gap-3">
            <div className="text-[14px] font-black text-neutral-900 dark:text-white">價格</div>
            <div className="flex items-center gap-2 flex-1 justify-end">
              <div className="w-4 h-4">
                <Image src="/images/gcoin.webp" alt="G" width={16} height={16} className="w-full h-full object-contain" />
              </div>
              <input
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="請輸入"
                className="w-[150px] h-10 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl px-3 text-right font-black font-amount focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
        </div>

        {/* 運費：買家結帳金額 = 售價 + 運費。0 代表賣家自己吸收 */}
        <div className="bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 px-4 py-3">
          <div className="text-[14px] font-black text-neutral-900 dark:text-white">運費</div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {[
              { v: 60, label: '交貨便', sub: '60' },
              { v: 80, label: '宅配', sub: '80' },
              { v: 0, label: '免運費', sub: '你吸收' },
              { v: -1, label: '自訂', sub: '下方填' },
            ].map((o) => {
              const isCustom = o.v === -1;
              const active = isCustom
                ? shippingFee !== 0 && shippingFee !== 60 && shippingFee !== 80
                : shippingFee === o.v;
              return (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setShippingFee(isCustom ? 100 : o.v)}
                  className={`rounded-xl px-2 py-2 text-center transition-colors ${
                    active
                      ? 'bg-primary/10 ring-2 ring-primary text-primary'
                      : 'bg-neutral-50 dark:bg-neutral-800/60 text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  <span className="block text-[12.5px] font-black">{o.label}</span>
                  <span className="block text-[10px] font-black opacity-70">{o.sub}</span>
                </button>
              );
            })}
          </div>
          {shippingFee !== 0 && shippingFee !== 60 && shippingFee !== 80 && (
            <input
              inputMode="numeric"
              value={String(shippingFee)}
              onChange={(e) => setShippingFee(Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
              placeholder="自訂運費金額"
              className="mt-2 w-full h-10 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl px-3 text-[14px] font-black text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          )}
          <p className="mt-2 text-[11.5px] font-black text-neutral-400">
            {Number(price) > 0
              ? `買家結帳 NT$${(Number(price) + shippingFee).toLocaleString('zh-TW')}（售價 ${Number(price).toLocaleString('zh-TW')}${shippingFee ? ` + 運費 ${shippingFee}` : '，免運費'}）`
              : '買家結帳金額 = 售價 + 運費'}
          </p>
        </div>

        {/* 保證金：上架不收，賣出才鎖。這裡先講清楚，不要等下單才發現被扣 G幣 */}
        {tier && (
          <div className="bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-black text-neutral-900 dark:text-white">保證金</span>
              <span className="text-[11.5px] font-black text-neutral-400">
                你是「{tier.name}」賣家 · 售價 {tier.ratio}%
              </span>
            </div>
            {Number(price) > tier.max_price ? (
              <p className="mt-2 text-[12.5px] font-black text-red-500">
                超過可賣價格：「{tier.name}」單件最高 {tier.max_price.toLocaleString('zh-TW')} 元。
                多完成幾筆交易升級後就能解鎖
              </p>
            ) : (
              <p className="mt-2 text-[17px] font-black text-primary">
                {Number(price) > 0
                  ? `${Math.ceil((Number(price) * tier.ratio) / 100).toLocaleString('zh-TW')} G`
                  : '填售價後顯示'}
              </p>
            )}
            <p className="mt-1 text-[11.5px] font-black text-neutral-400 leading-relaxed">
              上架不扣。有人下單時才從你的 G幣鎖起來，買家確認收貨後全額退還；
              運費不計入。若你沒出貨，這筆會賠給買家。
            </p>
          </div>
        )}

        <div className="bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 px-4">
          <div className="h-12 flex items-center justify-between gap-3">
            <div className="text-[14px] font-black text-neutral-900 dark:text-white">商品數量</div>
            <div className="text-[14px] font-black text-neutral-900 dark:text-white font-amount">{Math.max(0, totalQuantity).toLocaleString()}</div>
          </div>
        </div>
      </div>

      <ActionBar zIndex="z-[120]">
        <Button
          type="button"
          onClick={submit}
          disabled={!canSubmit || isSaving}
          className="w-full h-[44px] text-base font-black rounded-xl"
          variant="danger"
        >
          {isSaving ? '送出中…' : editId ? '儲存並重新送審' : '上架'}
        </Button>
      </ActionBar>

      {editingImageIndex !== null && (
        <div className="fixed inset-0 z-[2000] bg-black/40 flex items-end" onClick={() => setEditingImageIndex(null)}>
          <div
            className="w-full bg-white dark:bg-neutral-900 rounded-t-3xl border-t border-neutral-100 dark:border-neutral-800 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-[16px] font-black text-neutral-900 dark:text-white">商品圖片</div>
              <button
                type="button"
                onClick={() => setEditingImageIndex(null)}
                className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-200 grid place-items-center active:scale-95 transition-transform"
                aria-label="關閉"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                disabled={isImageUploading}
                onClick={() => openImageUploaderForSlot(editingImageIndex)}
                className="flex-1 h-[44px] rounded-xl bg-neutral-100 dark:bg-neutral-800 text-[14px] font-black text-neutral-900 dark:text-white active:scale-[0.99] transition-transform disabled:opacity-50"
              >
                {isImageUploading ? '上傳中…' : '上傳/拍照'}
              </button>
            </div>
            <div className="mt-4">
              <input
                value={imageDraft}
                onChange={(e) => setImageDraft(e.target.value)}
                placeholder="貼上圖片網址"
                className="w-full h-11 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl px-3 text-[14px] font-black text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                className="flex-1 h-[44px] text-base font-black rounded-xl"
                onClick={() => {
                  const idx = editingImageIndex;
                  setImages((prev) => {
                    const next = [...prev];
                    next[idx] = '';
                    return next;
                  });
                  setEditingImageIndex(null);
                }}
              >
                刪除
              </Button>
              <Button
                type="button"
                variant="danger"
                className="flex-1 h-[44px] text-base font-black rounded-xl"
                onClick={() => {
                  const idx = editingImageIndex;
                  const v = String(imageDraft || '').trim();
                  setImages((prev) => {
                    const next = [...prev];
                    while (next.length <= idx) next.push('');
                    next[idx] = v;
                    return next;
                  });
                  setEditingImageIndex(null);
                }}
              >
                確定
              </Button>
            </div>
          </div>
        </div>
      )}

      <input
        type="file"
        accept="image/*"
        className="hidden"
        id="sell-image-file"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.currentTarget.value = '';
          if (!file) return;
          try {
            setIsImageUploading(true);
            const url = await uploadImage(file);
            if (pendingImageSlotIndex !== null) {
              setImages((prev) => {
                const next = [...prev];
                while (next.length <= pendingImageSlotIndex) next.push('');
                next[pendingImageSlotIndex] = url;
                return next;
              });
              setEditingImageIndex(null);
            } else if (pendingItemIndex !== null) {
              setListingItems((prev) => {
                const next = [...prev];
                const current = next[pendingItemIndex] || { name: '', series: '', grade: '', image: '', quantity: '1' };
                next[pendingItemIndex] = { ...current, image: url };
                return next;
              });
            }
          } catch (err: any) {
            const msg = String(err?.message || '');
            if (msg === 'file_too_large') showToast('圖片太大（上限 8MB）', 'plain');
            else showToast('圖片上傳失敗', 'plain');
            console.error('Upload image failed:', err);
          } finally {
            setIsImageUploading(false);
            setPendingImageSlotIndex(null);
            setPendingItemIndex(null);
          }
        }}
      />

      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        id="sell-image-camera"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.currentTarget.value = '';
          if (!file) return;
          try {
            setIsImageUploading(true);
            const url = await uploadImage(file);
            if (pendingImageSlotIndex !== null) {
              setImages((prev) => {
                const next = [...prev];
                while (next.length <= pendingImageSlotIndex) next.push('');
                next[pendingImageSlotIndex] = url;
                return next;
              });
              setEditingImageIndex(null);
            } else if (pendingItemIndex !== null) {
              setListingItems((prev) => {
                const next = [...prev];
                const current = next[pendingItemIndex] || { name: '', series: '', grade: '', image: '', quantity: '1' };
                next[pendingItemIndex] = { ...current, image: url };
                return next;
              });
            }
          } catch (err: any) {
            const msg = String(err?.message || '');
            if (msg === 'file_too_large') showToast('圖片太大（上限 8MB）', 'plain');
            else showToast('圖片上傳失敗', 'plain');
            console.error('Upload image failed:', err);
          } finally {
            setIsImageUploading(false);
            setPendingImageSlotIndex(null);
            setPendingItemIndex(null);
          }
        }}
      />

      {(pendingImageSlotIndex !== null || pendingItemIndex !== null) && (
        <div className="fixed inset-0 z-[2400] bg-black/40 flex items-end" onClick={() => {
          setPendingImageSlotIndex(null);
          setPendingItemIndex(null);
        }}>
          <div
            className="w-full bg-white dark:bg-neutral-900 rounded-t-3xl border-t border-neutral-100 dark:border-neutral-800 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="text-[16px] font-black text-neutral-900 dark:text-white">加入照片</div>
              <button
                type="button"
                onClick={() => {
                  setPendingImageSlotIndex(null);
                  setPendingItemIndex(null);
                }}
                className="w-9 h-9 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-200 grid place-items-center active:scale-95 transition-transform"
                aria-label="關閉"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {pendingItemIndex !== null && (
              <div className="mt-4">
                <input
                  value={pendingItemImageDraft}
                  onChange={(e) => setPendingItemImageDraft(e.target.value)}
                  placeholder="貼上圖片網址"
                  className="w-full h-11 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl px-3 text-[14px] font-black text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <div className="mt-3">
                  <Button
                    type="button"
                    className="w-full h-[44px] text-base font-black rounded-xl"
                    variant="secondary"
                    onClick={() => {
                      const v = String(pendingItemImageDraft || '').trim();
                      setListingItems((prev) => {
                        const next = [...prev];
                        const current = next[pendingItemIndex] || { name: '', series: '', grade: '', image: '', quantity: '1' };
                        next[pendingItemIndex] = { ...current, image: v };
                        return next;
                      });
                      setPendingImageSlotIndex(null);
                      setPendingItemIndex(null);
                      setPendingItemImageDraft('');
                    }}
                  >
                    使用網址
                  </Button>
                </div>
              </div>
            )}

            <div className={pendingItemIndex !== null ? "mt-4 space-y-3" : "mt-4 space-y-3"}>
              <Button
                type="button"
                className="w-full h-[44px] text-base font-black rounded-xl"
                variant="secondary"
                disabled={isImageUploading}
                onClick={() => {
                  const el = document.getElementById('sell-image-file') as HTMLInputElement | null;
                  el?.click();
                }}
              >
                {isImageUploading ? '上傳中…' : '從相簿選擇'}
              </Button>
              <Button
                type="button"
                className="w-full h-[44px] text-base font-black rounded-xl"
                variant="secondary"
                disabled={isImageUploading}
                onClick={() => {
                  const el = document.getElementById('sell-image-camera') as HTMLInputElement | null;
                  el?.click();
                }}
              >
                {isImageUploading ? '上傳中…' : '拍照'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
