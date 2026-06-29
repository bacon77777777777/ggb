'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ChevronRight, ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui';
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
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();

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
      setTitle(String(parsed?.title || ''));
      setPrice(String(parsed?.price || ''));
      setNote(String(parsed?.note || ''));
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
          title,
          price,
          note,
          images,
          listingItems,
        })
      );
    } catch {}
  }, [images, listingItems, note, price, title]);

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
  }, [listingItems, price, title, user?.id]);

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
    const objectPath = `${user.id}/sell/${Date.now()}-${id}.${ext}`;

    const supabase = createClient();
    const { error } = await supabase.storage.from('marketplace').upload(objectPath, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: '3600',
    });
    if (error) throw error;
    const { data } = supabase.storage.from('marketplace').getPublicUrl(objectPath);
    const publicUrl = String(data?.publicUrl || '').trim();
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

      const { data, error } = await supabase
        .from('sell_listings')
        .insert({
          seller_id: user.id,
          price: p,
          status: 'active',
          title: title.trim(),
          note: note.trim(),
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

      showToast('已上架販售', 'plain');
      router.replace(`/sell/${String(insertedId)}`);
    } catch (e) {
      console.error('Failed to create listing:', e);
      showToast('上架失敗', 'plain');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F5] dark:bg-neutral-950 pb-24">
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
            className="mt-2 w-full h-10 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl px-3 text-[14px] font-black text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
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
                <Image src="/images/gcoin.png" alt="G" width={16} height={16} className="w-full h-full object-contain" />
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

        <div className="bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 px-4">
          <div className="h-12 flex items-center justify-between gap-3">
            <div className="text-[14px] font-black text-neutral-900 dark:text-white">商品數量</div>
            <div className="text-[14px] font-black text-neutral-900 dark:text-white font-amount">{Math.max(0, totalQuantity).toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-[120] bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl border-t border-neutral-100 dark:border-neutral-800 px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2">
        <Button
          type="button"
          onClick={submit}
          disabled={!canSubmit || isSaving}
          className="w-full h-[44px] text-base font-black rounded-xl"
          variant="danger"
        >
          {isSaving ? '上架中…' : '上架'}
        </Button>
      </div>

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
