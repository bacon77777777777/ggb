'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ActionBar, Button } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase/client';
import { Plus, Trash2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

type ListingItem = {
  name: string;
  series: string;
  grade: string;
  image: string;
  quantity: string;
};

const DRAFT_KEY = 'sell:new:draft:v1';

export default function SellNewSpecsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { showToast } = useToast();

  const [listingItems, setListingItems] = useState<ListingItem[]>([{ name: '', series: '', grade: '', image: '', quantity: '1' }]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!user?.id) {
      router.replace('/login?redirect=%2Fsell%2Fnew%2Fspecs');
      return;
    }
  }, [isLoading, router, user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY) || '';
      if (!raw) return;
      const parsed = JSON.parse(raw) as any;
      const items = Array.isArray(parsed?.listingItems) ? parsed.listingItems : [];
      setListingItems(
        items.length > 0
          ? items.map((x: any) => ({
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

  const saveDraft = (items: ListingItem[]) => {
    if (typeof window === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY) || '';
      const parsed = raw ? (JSON.parse(raw) as any) : {};
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...parsed, listingItems: items }));
    } catch {}
  };

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

  const count = useMemo(() => listingItems.filter((x) => String(x.name || '').trim()).length, [listingItems]);

  const done = () => {
    const hasAny = listingItems.some((x) => String(x.name || '').trim());
    if (!hasAny) {
      showToast('請至少新增 1 張卡片', 'plain');
      return;
    }
    saveDraft(listingItems);
    router.back();
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 pb-24">
      <div className="max-w-7xl mx-auto px-0 pt-2 pb-20">
        <div className="bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[14px] font-black text-neutral-900 dark:text-white">卡片規格</div>
            <div className="text-[12px] font-black text-neutral-400 dark:text-neutral-500">已新增 {count} 個</div>
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800">
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {listingItems.map((it, idx) => (
              <div key={idx} className="px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[12px] font-black text-neutral-400 uppercase tracking-widest">卡片 {idx + 1}</div>
                  {listingItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = listingItems.filter((_, i) => i !== idx);
                        setListingItems(next.length > 0 ? next : [{ name: '', series: '', grade: '', image: '', quantity: '1' }]);
                        saveDraft(next.length > 0 ? next : [{ name: '', series: '', grade: '', image: '', quantity: '1' }]);
                      }}
                      className="h-9 px-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-200 text-[13px] font-black flex items-center gap-2 active:scale-95 transition-transform"
                      aria-label="刪除"
                    >
                      <Trash2 className="w-4 h-4" />
                      刪除
                    </button>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <input
                    value={it.name}
                    onChange={(e) => {
                      const next = [...listingItems];
                      next[idx] = { ...next[idx], name: e.target.value };
                      setListingItems(next);
                      saveDraft(next);
                    }}
                    placeholder="名稱"
                    className="w-full h-11 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl px-3 text-[14px] font-black text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <input
                    inputMode="numeric"
                    value={it.quantity}
                    onChange={(e) => {
                      const next = [...listingItems];
                      next[idx] = { ...next[idx], quantity: e.target.value.replace(/[^\d]/g, '') };
                      setListingItems(next);
                      saveDraft(next);
                    }}
                    placeholder="數量"
                    className="w-full h-11 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl px-3 text-right font-black font-amount focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <input
                    value={it.series}
                    onChange={(e) => {
                      const next = [...listingItems];
                      next[idx] = { ...next[idx], series: e.target.value };
                      setListingItems(next);
                      saveDraft(next);
                    }}
                    placeholder="系列"
                    className="w-full h-11 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl px-3 text-[14px] font-black text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <input
                    value={it.grade}
                    onChange={(e) => {
                      const next = [...listingItems];
                      next[idx] = { ...next[idx], grade: e.target.value };
                      setListingItems(next);
                      saveDraft(next);
                    }}
                    placeholder="等級"
                    className="w-full h-11 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl px-3 text-[14px] font-black text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <input
                    value={it.image}
                    onChange={(e) => {
                      const next = [...listingItems];
                      next[idx] = { ...next[idx], image: e.target.value };
                      setListingItems(next);
                      saveDraft(next);
                    }}
                    placeholder="卡圖網址"
                    className="col-span-2 w-full h-11 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl px-3 text-[14px] font-black text-neutral-900 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />

                  <div className="col-span-2 flex items-center gap-2">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id={`sell-item-upload-${idx}`}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.currentTarget.value = '';
                        if (!file) return;
                        try {
                          setIsUploading(true);
                          setUploadingIndex(idx);
                          const url = await uploadImage(file);
                          const next = [...listingItems];
                          next[idx] = { ...next[idx], image: url };
                          setListingItems(next);
                          saveDraft(next);
                        } catch (err: any) {
                          const msg = String(err?.message || '');
                          if (msg === 'file_too_large') showToast('圖片太大（上限 8MB）', 'plain');
                          else showToast('圖片上傳失敗', 'plain');
                        } finally {
                          setIsUploading(false);
                          setUploadingIndex(null);
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="flex-1 h-[44px] text-base font-black rounded-xl"
                      disabled={isUploading}
                      onClick={() => {
                        const el = document.getElementById(`sell-item-upload-${idx}`) as HTMLInputElement | null;
                        el?.click();
                      }}
                    >
                      {isUploading && uploadingIndex === idx ? '上傳中…' : '上傳/拍照卡圖'}
                    </Button>
                  </div>

                  {String(it.image || '').trim() && (
                    <div className="col-span-2 pt-1">
                      <div className="relative w-full aspect-[5/7] rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-800">
                        <Image src={String(it.image || '').trim()} alt="" fill className="object-contain" unoptimized />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setListingItems((prev) => {
                if (prev.length >= 50) return prev;
                const next = [...prev, { name: '', series: '', grade: '', image: '', quantity: '1' }];
                saveDraft(next);
                return next;
              });
            }}
            className="w-full h-14 flex items-center justify-center gap-2 border-t border-neutral-100 dark:border-neutral-800 text-[14px] font-black text-neutral-900 dark:text-white active:bg-neutral-50 dark:active:bg-neutral-800/50 transition-colors"
          >
            <Plus className="w-5 h-5" />
            新增規格
          </button>
        </div>
      </div>

      <ActionBar zIndex="z-[120]">
        <Button type="button" onClick={done} className="w-full h-[44px] text-base font-black rounded-xl" variant="danger">
          完成
        </Button>
      </ActionBar>
    </div>
  );
}

