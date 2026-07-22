'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/types/database.types';
import { calculateSeedHash, verifyDraw, determinePrize } from '@/utils/drawLogicClient';
import { useAuth } from '@/contexts/AuthContext';
import CopyableTruncatedField from '@/components/ui/CopyableTruncatedField';

type ProductRow = Database['public']['Tables']['products']['Row'];

export default function FairnessVerifyPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [supabase] = useState(() => createClient());
  const [product, setProduct] = useState<ProductRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  const [seedInput, setSeedInput] = useState('');
  const [seedHashMatch, setSeedHashMatch] = useState<boolean | null>(null);
  const [seedHashExpected, setSeedHashExpected] = useState<string | null>(null);
  const [seedHashCalculated, setSeedHashCalculated] = useState<string | null>(null);
  const [isVerifyingSeed, setIsVerifyingSeed] = useState(false);

  const [nonceInput, setNonceInput] = useState('');
  const [expectedTxidHashInput, setExpectedTxidHashInput] = useState('');
  const [txidHashCalculated, setTxidHashCalculated] = useState<string | null>(null);
  const [txidHashMatch, setTxidHashMatch] = useState<boolean | null>(null);
  const [isVerifyingDraw, setIsVerifyingDraw] = useState(false);
  const [verifiedPrize, setVerifiedPrize] = useState<{ level: string; name: string } | null>(null);
  const [prizesForVerification, setPrizesForVerification] = useState<
    { level: string; name: string; probability: number }[]
  >([]);

  const [copied, setCopied] = useState(false);

  const [userTickets, setUserTickets] = useState<
    { ticket_number: number; txid_hash: string | null }[]
  >([]);
  const [isLoadingTickets, setIsLoadingTickets] = useState(false);

  const hasSeedForDraw = !!((seedInput && seedInput.trim()) || product?.seed);
  const hasNonceForDraw = !!(nonceInput && nonceInput.trim());
  const hasTxidHashForDraw = !!(expectedTxidHashInput && expectedTxidHashInput.trim());
  const isVerifyDrawDisabled = isVerifyingDraw || !hasSeedForDraw || !hasNonceForDraw || !hasTxidHashForDraw;

  useEffect(() => {
    const prefillNonce = searchParams.get('nonce');
    const prefillTxid = searchParams.get('txid_hash');
    if (prefillNonce) {
      setNonceInput(prefillNonce);
    }
    if (prefillTxid) {
      setExpectedTxidHashInput(prefillTxid);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isAuthLoading, router]);

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
        const productId = Number(rawId);
        if (!productId || Number.isNaN(productId)) {
          setError('找不到商品');
          setIsLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('id', productId)
          .single();

        if (error) throw error;

        setProduct(data);

        const isEndedOrSoldOut =
          data.status === 'ended' ||
          (typeof data.remaining === 'number' && data.remaining <= 0);

        if (isEndedOrSoldOut && data.seed) {
          setSeedInput(data.seed);
        } else {
          setSeedInput('');
        }
        setSeedHashExpected(data.txid_hash || null);

        const { data: prizeRows, error: prizeError } = await supabase
          .from('product_prizes')
          .select('level, name, probability')
          .eq('product_id', productId)
          .order('level', { ascending: true });

        if (prizeError) {
          console.error('載入獎項設定失敗', prizeError);
        } else {
          type PrizeRow = { level: string | null; name: string | null; probability: number | null };
          const rows: PrizeRow[] = (prizeRows ?? []) as PrizeRow[];
          const filteredPrizes = rows.filter((p) => {
            if (p.probability === null) return false;
            if (p.level === 'Last One' || p.level === 'LAST ONE') return false;
            if (p.level !== null && p.level.includes('最後賞')) return false;
            return true;
          });

          setPrizesForVerification(
            filteredPrizes.map((p) => ({
              level: p.level ?? '',
              name: p.name ?? '',
              probability: p.probability ?? 0,
            })),
          );
        }
      } catch (err) {
        console.error('載入商品失敗', err);
        setError('載入商品失敗，請稍後再試');
      } finally {
        setIsLoading(false);
      }
    };

    fetchProduct();
  }, [params, supabase, searchParams]);

  useEffect(() => {
    const fetchUserTickets = async () => {
      if (!product || !isAuthenticated || isAuthLoading) return;
      try {
        setIsLoadingTickets(true);
        const { data, error } = await supabase
          .from('draw_records')
          .select('ticket_number, txid_hash')
          .eq('product_id', product.id)
          .order('ticket_number', { ascending: true });

        if (error) {
          console.error('載入籤號失敗', error);
          return;
        }

        const filtered =
          data?.filter((row) => row.ticket_number !== null) ?? [];

        setUserTickets(
          filtered.map((row) => ({
            ticket_number: row.ticket_number as number,
            txid_hash: row.txid_hash as string | null,
          })),
        );
      } catch (err) {
        console.error('載入籤號失敗', err);
      } finally {
        setIsLoadingTickets(false);
      }
    };

    fetchUserTickets();
  }, [product, supabase, isAuthenticated, isAuthLoading]);

  const handleVerifySeed = async () => {
    if (!product || !product.txid_hash) {
      setError('此商品尚未提供 Seed Hash 驗證');
      return;
    }

    const seed = seedInput.trim();
    if (!seed) {
      setError('請輸入 Seed');
      return;
    }

    try {
      setIsVerifyingSeed(true);
      setError(null);
      setSeedHashMatch(null);

      const calculated = await calculateSeedHash(seed);
      setSeedHashCalculated(calculated);
      setSeedHashExpected(product.txid_hash);
      setSeedHashMatch(calculated === product.txid_hash);
    } catch (err) {
      console.error('Seed 驗證失敗', err);
      setError('Seed 驗證失敗，請稍後再試');
      setSeedHashMatch(null);
    } finally {
      setIsVerifyingSeed(false);
    }
  };

  const handleVerifyDraw = async () => {
    if (!product) {
      setError('找不到商品');
      return;
    }

    const seed = seedInput.trim();
    const nonce = Number(nonceInput.trim());
    const expectedHash = expectedTxidHashInput.trim();

    if (!seed) {
      setError('請輸入 Seed');
      return;
    }

    if (!Number.isFinite(nonce) || nonce < 0) {
      setError('請輸入正確的籤號 / Nonce');
      return;
    }

    if (!expectedHash) {
      setError('請輸入欲驗證的 TXID Hash');
      return;
    }

    try {
      setIsVerifyingDraw(true);
      setError(null);
      setTxidHashCalculated(null);
      setTxidHashMatch(null);
      setVerifiedPrize(null);

      const result = await verifyDraw(seed, nonce, expectedHash);
      setTxidHashCalculated(result.txidHash);
      setTxidHashMatch(result.hashMatch);

      if (prizesForVerification.length > 0) {
        const mappedPrize = determinePrize(result.randomValue, prizesForVerification);
        setVerifiedPrize(mappedPrize);
      } else {
        setVerifiedPrize(null);
      }
    } catch (err) {
      console.error('抽獎驗證失敗', err);
      setError('抽獎驗證失敗，請稍後再試');
      setTxidHashCalculated(null);
      setTxidHashMatch(null);
      setVerifiedPrize(null);
    } finally {
      setIsVerifyingDraw(false);
    }
  };

  const phpCode = `// 以下為示意驗證程式碼，請依本平台提供的 Seed 與 Nonce 驗證 TXID Hash
// Seed: 商品級隨機種子
// Nonce: 序號（例如籤號）
// 驗證方式請參考平台提供的 TypeScript 示例程式碼

type TXID = {
  seed: string;
  nonce: number;
};

function generateTXID(seed: string, nonce: number): TXID {
  return { seed, nonce };
}

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacToRandom(seed: string, nonce: number): Promise<number> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(seed);
  const messageData = encoder.encode(String(nonce));

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  const bytes = new Uint8Array(signature);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const slice = hex.slice(0, 16);
  const intValue = parseInt(slice, 16);
  const maxValue = parseInt('ffffffffffffffff', 16);
  return intValue / maxValue;
}

async function verifyDraw(seed: string, nonce: number, expectedHash: string) {
  const txid = generateTXID(seed, nonce);
  const txidHash = await sha256(txid.seed + ':' + String(txid.nonce));
  const randomValue = await hmacToRandom(txid.seed, txid.nonce);
  const hashMatch = txidHash === expectedHash;

  return { txid, txidHash, randomValue, hashMatch };
}`;

  const handleCopyCode = async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard) return;
      await navigator.clipboard.writeText(phpCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('複製程式碼失敗', err);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-10">
        {isLoading && (
          <div className="min-h-[70vh] flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-neutral-500 dark:text-neutral-400">
              <div className="w-8 h-8 border-2 border-neutral-300 dark:border-neutral-700 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-black tracking-widest">載入公平性驗證中...</span>
            </div>
          </div>
        )}

        {error && !isLoading && (
          <div className="text-sm text-red-500">
            {error}
          </div>
        )}

        {product && !isLoading && !error && (
          <div className="space-y-5 sm:space-y-6">
            <div className="bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-xl p-3 sm:p-4 space-y-3 sm:space-y-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <Link
                  href={product ? `/item/${product.id}` : '/'}
                  className="hidden sm:flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-200 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Link>
                <div className="space-y-0.5">
                  <h1 className="text-lg sm:text-2xl font-black text-neutral-900 dark:text-neutral-50">
                    {product?.name || '公平性驗證'}
                  </h1>
                  <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
                    本工具用於驗證 Seed 與單筆抽獎結果是否與平台紀錄一致。
                  </p>
                </div>
              </div>
              <div className="text-xs sm:text-sm font-black text-neutral-700 dark:text-neutral-200">
                Seed 驗證
              </div>
              <div className="space-y-3 sm:space-y-4">
                <div className="space-y-1.5">
                  <div className="text-xs sm:text-sm font-black text-neutral-500 dark:text-neutral-400">
                    商品 Seed
                  </div>
                  <CopyableTruncatedField
                    value={seedInput}
                    onChange={setSeedInput}
                    placeholder="完抽後才會公開 Seed"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleVerifySeed}
                disabled={isVerifyingSeed}
                className="w-full mt-1 inline-flex items-center justify-center rounded-xl bg-primary text-white text-sm sm:text-base font-black py-2.5 sm:py-3 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
              >
                {isVerifyingSeed ? '驗證中...' : '驗證 Seed 與 Seed Hash'}
              </button>
              <div className="mt-2 space-y-1.5 text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400">
                <p className="break-all leading-relaxed">
                  Seed Hash（平台公開值）：{seedHashExpected || '尚未提供'}
                </p>
                <p className="break-all leading-relaxed">
                  Seed 重新計算 Hash：{seedHashCalculated || '—'}
                </p>
                <div className="flex items-baseline gap-1">
                  <span>驗證結果：</span>
                  <span
                    className={[
                      'text-[12px] sm:text-sm font-black',
                      seedHashMatch === null
                        ? 'text-neutral-500 dark:text-neutral-400'
                        : seedHashMatch
                          ? 'text-accent-emerald dark:text-accent-emerald'
                          : 'text-red-500 dark:text-red-400',
                    ].join(' ')}
                  >
                    {seedHashMatch === null
                      ? '—'
                      : seedHashMatch
                        ? '一致'
                        : '不一致'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-xl p-3 sm:p-4 space-y-3 sm:space-y-4">
              <div className="text-xs sm:text-sm font-black text-neutral-500 dark:text-neutral-400">
                單筆抽獎驗證
              </div>
              <div className="space-y-2">
                <div className="text-[11px] sm:text-xs font-black text-neutral-500 dark:text-neutral-400">
                  您在此商品已抽到的籤號
                </div>
                {isLoadingTickets && (
                  <span className="text-[11px] sm:text-xs text-neutral-400">
                    載入中...
                  </span>
                )}
                {!isLoadingTickets && userTickets.length === 0 && (
                  <span className="text-[11px] sm:text-xs text-neutral-400">
                    尚無抽獎紀錄
                  </span>
                )}
                {!isLoadingTickets && userTickets.length > 0 && (
                  <div className="max-h-[144px] sm:max-h-[200px] overflow-y-auto pr-1 sm:pr-2 custom-scrollbar">
                    <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5 sm:gap-2">
                      {userTickets.map((t) => (
                        <button
                          key={t.ticket_number}
                          type="button"
                          onClick={() => {
                            setNonceInput(String(t.ticket_number));
                            if (t.txid_hash) {
                              setExpectedTxidHashInput(t.txid_hash);
                            }
                          }}
                          className="px-2.5 py-1 rounded-full border border-neutral-200 dark:border-neutral-700 text-[11px] sm:text-xs font-black font-sans text-neutral-700 dark:text-neutral-100 bg-neutral-50 dark:bg-neutral-800 hover:bg-primary/10 hover:border-primary/40 hover:text-primary transition-colors"
                        >
                          {t.ticket_number}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="text-xs sm:text-sm font-black text-neutral-500 dark:text-neutral-400">
                    籤號 / Nonce
                  </div>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={nonceInput}
                    onChange={(e) => setNonceInput(e.target.value)}
                    placeholder="請輸入您當時抽到的籤號或序號"
                    className="w-full px-3 py-2 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 text-sm font-black text-neutral-900 dark:text-neutral-50 outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs sm:text-sm font-black text-neutral-500 dark:text-neutral-400">
                    抽獎紀錄中的 TXID Hash
                  </div>
                  <CopyableTruncatedField
                    value={expectedTxidHashInput}
                    onChange={setExpectedTxidHashInput}
                    placeholder="請貼上您在抽獎紀錄中看到的 TXID Hash"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleVerifyDraw}
                disabled={isVerifyDrawDisabled}
                className="w-full mt-1 inline-flex items-center justify-center rounded-xl bg-primary text-white text-sm sm:text-base font-black py-2.5 sm:py-3 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
              >
                {isVerifyingDraw ? '驗證中...' : '驗證這一抽'}
              </button>
              <div className="mt-2 space-y-1.5 text-[11px] sm:text-xs text-neutral-500 dark:text-neutral-400">
                <div className="space-y-1">
                  <div>重新計算的 TXID Hash：</div>
                  <div className="font-mono break-all">{txidHashCalculated || '—'}</div>
                </div>
                <div className="flex items-baseline gap-1">
                  <span>Hash 是否一致：</span>
                  <span
                    className={[
                      'text-[12px] sm:text-sm font-black',
                      txidHashMatch === null
                        ? 'text-neutral-500 dark:text-neutral-400'
                        : txidHashMatch
                          ? 'text-accent-emerald dark:text-accent-emerald'
                          : 'text-red-500 dark:text-red-400',
                    ].join(' ')}
                  >
                    {txidHashMatch === null
                      ? '—'
                      : txidHashMatch
                        ? '一致'
                        : '不一致'}
                  </span>
                </div>
                <p>
                  這一抽依目前機率對應獎項：
                  {verifiedPrize ? `${verifiedPrize.level} ${verifiedPrize.name}` : '—'}
                </p>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-3 sm:p-4 space-y-2.5 sm:space-y-3">
              <div className="text-xs sm:text-sm font-black text-neutral-500 dark:text-neutral-400">
                驗證程式碼（示意）
              </div>
              <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-300">
                以下為示意驗證程式碼片段，實際以本平台提供的 TypeScript 版本為準，您可以在任何支援 HMAC-SHA256 與 SHA256 的環境中重現驗證流程。
              </p>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs sm:text-sm font-black text-neutral-500 dark:text-neutral-400">
                  驗證程式碼概要
                </div>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-[11px] sm:text-xs font-black hover:bg-neutral-800 transition-colors"
                >
                  {copied ? '已複製' : '複製程式碼'}
                </button>
              </div>
              <pre className="bg-neutral-900 text-neutral-50 rounded-xl p-3 sm:p-4 text-[11px] sm:text-xs overflow-x-auto">
<code>{phpCode}</code>
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
