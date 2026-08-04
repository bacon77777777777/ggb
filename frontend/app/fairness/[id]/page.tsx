'use client';

/**
 * 公平性驗證（玩家端）
 *
 * 舊版要玩家自己算 HMAC 再跑一次配獎邏輯 —— 那是算不出來的：
 * 舊機制的權重會隨「在你之前誰抽走了什麼」改變，玩家沒有那份順序，
 * 頁面上那顆「驗證」按鈕其實只是重算了一個 hash，證明不了獎項對不對。
 *
 * 現在整檔的籤在開賣前就排好並封存，驗證只剩三件事，都不需要懂密碼學：
 *   1. 開賣時公布承諾值 → 完抽後公開對照表 → 兩者用 SHA-256 對得上
 *      = 這張表開賣前就固定了，中途沒被改
 *   2. 表裡你的籤號 → 對照倉庫拿到的東西 = 沒被掉包
 *   3. 數表裡各賞等的數量 → 對照商品頁公告 = 沒有短少
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { IpLoader } from '@/components/ui/IpLoader';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface SealInfo {
  sealed: boolean;
  revealed?: boolean;
  commitment?: string;
  tickets?: number;
  sealed_at?: string;
  seal_text?: string;
  closed_out?: number[] | null;
}

interface PrizeRow {
  level: string;
  name: string;
  total: number;
}

async function sha256(text: string) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

const THIRD_PARTY_TOOL = 'https://emn178.github.io/online-tools/sha256.html';

export default function FairnessVerifyPage() {
  const params = useParams();
  const productId = Number(params?.id);
  const [supabase] = useState(() => createClient());
  const { isAuthenticated } = useAuth();

  const [prizes, setPrizes] = useState<PrizeRow[]>([]);
  const [seal, setSeal] = useState<SealInfo | null>(null);
  const [myTickets, setMyTickets] = useState<{ ticket_number: number; prize_level: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [recalculated, setRecalculated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(productId)) {
      setError('找不到這個商品');
      setIsLoading(false);
      return;
    }

    const load = async () => {
      const [{ data: product }, { data: prizeRows }, { data: sealData }] = await Promise.all([
        supabase.from('products').select('name').eq('id', productId).single(),
        supabase.from('product_prizes').select('level, name, total').eq('product_id', productId),
        supabase.rpc('get_ticket_seal', { p_product_id: productId }),
      ]);

      if (!product) {
        setError('找不到這個商品');
        setIsLoading(false);
        return;
      }

      setPrizes((prizeRows ?? []) as PrizeRow[]);
      setSeal((sealData ?? { sealed: false }) as SealInfo);

      // 只撈自己的籤，用來在表裡標出「這幾張是我的」
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: mine } = await supabase
          .from('draw_records')
          .select('ticket_number, prize_level')
          .eq('product_id', productId)
          .eq('user_id', user.id)
          .order('ticket_number');
        setMyTickets(mine ?? []);
      }

      setIsLoading(false);
    };

    load().catch(() => {
      setError('讀取失敗，請稍後再試');
      setIsLoading(false);
    });
  }, [productId, supabase]);

  /** 封存原文解析成「籤號 → 賞等」*/
  const assignment = useMemo(() => {
    if (!seal?.seal_text) return [];
    return seal.seal_text
      .split('\n')
      .map(line => line.match(/^(\d+):(.+)$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map(m => ({ ticket: Number(m[1]), level: m[2] }));
  }, [seal?.seal_text]);

  /** 表裡實際數量 vs 商品頁公告數量 */
  const counts = useMemo(() => {
    if (assignment.length === 0) return [];
    const inTable = new Map<string, number>();
    for (const a of assignment) inTable.set(a.level, (inTable.get(a.level) ?? 0) + 1);

    const announced = new Map<string, number>();
    for (const p of prizes) announced.set(p.level, (announced.get(p.level) ?? 0) + p.total);

    return [...new Set([...inTable.keys(), ...announced.keys()])]
      .sort((a, b) => a.localeCompare(b, 'zh-Hant'))
      .map(level => ({
        level,
        inTable: inTable.get(level) ?? 0,
        announced: announced.get(level) ?? 0,
      }))
      // 最後賞不列進表格。它不是抽出來的籤，列出來「表裡 0 張」看起來像短少
      .filter(c => c.inTable > 0);
  }, [assignment, prizes]);

  /** 這一檔有沒有最後賞 —— 有的話要在數量對照下面講一句，不然玩家會以為它不見了 */
  const lastOnePrizes = useMemo(
    () => prizes.filter(p => ['Last One', 'LAST ONE', '最後賞'].includes(p.level)),
    [prizes],
  );

  const myTicketSet = useMemo(() => new Set(myTickets.map(t => t.ticket_number)), [myTickets]);
  const closedSet = useMemo(() => new Set(seal?.closed_out ?? []), [seal?.closed_out]);

  const recalculate = useCallback(async () => {
    if (!seal?.seal_text) return;
    setRecalculated(await sha256(seal.seal_text));
  }, [seal?.seal_text]);

  const copySealText = async () => {
    if (!seal?.seal_text || !navigator.clipboard) return;
    await navigator.clipboard.writeText(seal.seal_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center">
        <IpLoader />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <div className="max-w-3xl mx-auto px-3 sm:px-6 py-6 sm:py-10 space-y-4 sm:space-y-5">
        {error ? (
          <div className="text-sm text-red-500">{error}</div>
        ) : (
          <>
            {/* 標題由全站導航列顯示（商品名），這裡不再重複一層 */}

            {!seal?.sealed ? (
              <Card>
                <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
                  這一檔在對照表機制上線前就開賣了，沒有可公開的對照表。之後上架的都會有。
                </p>
              </Card>
            ) : (
              <>
                {/* 承諾值 */}
                <Card>
                  <SectionTitle>開賣時的驗證碼</SectionTitle>
                  <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mb-3 leading-relaxed">
                    {`${seal.sealed_at ? new Date(seal.sealed_at).toLocaleString('zh-TW') : '開賣時'} 公布。對照表改過一個字，這串就會完全不同。`}
                  </p>
                  <code className="block text-[11px] sm:text-xs font-mono break-all bg-neutral-50 dark:bg-neutral-800 rounded-lg p-3 text-neutral-700 dark:text-neutral-200">
                    {seal.commitment}
                  </code>
                  <p className="mt-3 text-xs sm:text-sm text-neutral-500 dark:text-neutral-400">
                    共 {seal.tickets} 張籤
                  </p>
                </Card>

                {!seal.revealed ? (
                  <Card>
                    <SectionTitle>對照表尚未公開</SectionTitle>
                    <p className="text-sm text-neutral-600 dark:text-neutral-300 leading-relaxed">
                      販售中不能公開，否則等於公告幾號有大獎。
                      先把上面的驗證碼存起來，結束後回來對，必須一模一樣。
                    </p>
                    {myTickets.length > 0 && (
                      <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
                        你在這一檔抽了 {myTickets.length} 張，籤號：
                        {myTickets.map(t => t.ticket_number).join('、')}
                      </p>
                    )}
                  </Card>
                ) : (
                  <>
                    {/* 自己動手驗 */}
                    <Card>
                      <SectionTitle>自己驗一次</SectionTitle>
                      {/* 「用外面的工具最準」拿掉了：下面就有一顆「用外部工具驗」，講兩次是廢話 */}
                      <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mb-3 leading-relaxed">
                        複製下面整段，貼到任一 SHA-256 工具，算出來要跟上面的驗證碼一樣。
                      </p>

                      <div className="relative">
                        <pre className="text-[11px] sm:text-xs font-mono bg-neutral-50 dark:bg-neutral-800 rounded-lg p-3 pr-12 max-h-56 overflow-auto text-neutral-700 dark:text-neutral-200 whitespace-pre">
                          {seal.seal_text}
                        </pre>
                        <button
                          type="button"
                          onClick={copySealText}
                          className="absolute top-2 right-2 flex items-center justify-center w-8 h-8 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
                          aria-label="複製對照表"
                        >
                          {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={recalculate}
                          className="inline-flex items-center justify-center rounded-xl bg-primary text-white text-sm font-black px-4 py-2.5 hover:bg-primary/90 transition-colors"
                        >
                          在這頁算一次
                        </button>
                        <a
                          href={THIRD_PARTY_TOOL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-sm font-black px-4 py-2.5 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                        >
                          用外部工具驗
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>

                      {recalculated && (
                        <div className="mt-3">
                          <code className="block text-[11px] sm:text-xs font-mono break-all bg-neutral-50 dark:bg-neutral-800 rounded-lg p-3 text-neutral-700 dark:text-neutral-200">
                            {recalculated}
                          </code>
                          <p className={`mt-2 text-sm font-black ${
                            recalculated === seal.commitment ? 'text-green-600' : 'text-red-500'
                          }`}>
                            {recalculated === seal.commitment
                              ? '跟開賣時公布的驗證碼一致 —— 這張表沒有被改過'
                              : '與驗證碼不一致，請聯繫客服'}
                          </p>
                        </div>
                      )}
                    </Card>

                    {/* 數量對照 */}
                    <Card>
                      {/* 表頭已經是「公告 / 表裡 / 結果」，不需要再用一句話重述一遍 */}
                      <SectionTitle>獎品數量</SectionTitle>
                      <div className="mb-3" />
                      <div className="overflow-x-auto -mx-1 px-1">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-neutral-400 dark:text-neutral-500 border-b border-neutral-100 dark:border-neutral-800">
                              <th className="py-2 font-black">獎品</th>
                              <th className="py-2 font-black text-right tabular-nums">公告</th>
                              <th className="py-2 font-black text-right tabular-nums">表裡</th>
                              <th className="py-2 font-black text-right">結果</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                            {counts.map(c => (
                              <tr key={c.level}>
                                <td className="py-2 font-black text-neutral-800 dark:text-neutral-100">{c.level}</td>
                                <td className="py-2 text-right tabular-nums text-neutral-600 dark:text-neutral-300">{c.announced}</td>
                                <td className="py-2 text-right tabular-nums text-neutral-600 dark:text-neutral-300">{c.inTable}</td>
                                <td className={`py-2 text-right font-black ${
                                  c.inTable === c.announced ? 'text-green-600' : 'text-red-500'
                                }`}>
                                  {c.inTable === c.announced ? '相符' : '不符'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {lastOnePrizes.length > 0 && (
                        <p className="mt-3 text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
                          {lastOnePrizes.map(p => p.level).join('、')}
                          不在表裡 —— 它不是抽出來的，是給抽走最後一張的人。
                        </p>
                      )}
                    </Card>

                    {/* 你的籤 */}
                    {isAuthenticated && myTickets.length > 0 && (
                      <Card>
                        <SectionTitle>你抽到的</SectionTitle>
                        <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mb-3 leading-relaxed">
                          表上排定的，跟你實際拿到的。
                        </p>
                        <div className="space-y-1.5">
                          {myTickets.map(t => {
                            const inTable = assignment.find(a => a.ticket === t.ticket_number)?.level;
                            const ok = inTable === t.prize_level;
                            return (
                              <div key={t.ticket_number} className="flex items-center justify-between text-sm py-1.5">
                                <span className="text-neutral-500 dark:text-neutral-400 tabular-nums">
                                  {t.ticket_number} 號
                                </span>
                                <span className="flex items-center gap-3">
                                  <span className="text-neutral-800 dark:text-neutral-100 font-black">
                                    {t.prize_level}
                                  </span>
                                  <span className={`font-black ${ok ? 'text-green-600' : 'text-red-500'}`}>
                                    {ok ? '相符' : '不符'}
                                  </span>
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </Card>
                    )}

                    {/* 完整對照表 */}
                    <Card>
                      <SectionTitle>完整對照表</SectionTitle>
                      {closedSet.size > 0 && (
                        <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mb-3 leading-relaxed">
                          灰色 {closedSet.size} 張未售出，由平台收回。
                        </p>
                      )}
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-1.5">
                        {assignment.map(a => {
                          const mine = myTicketSet.has(a.ticket);
                          const closed = closedSet.has(a.ticket);
                          return (
                            <div
                              key={a.ticket}
                              className={`rounded-lg px-2 py-1.5 text-center text-xs ${
                                mine
                                  ? 'bg-primary text-white'
                                  : closed
                                    ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600'
                                    : 'bg-neutral-50 dark:bg-neutral-800/50 text-neutral-600 dark:text-neutral-300'
                              }`}
                            >
                              <div className="tabular-nums opacity-70">{a.ticket}</div>
                              <div className="font-black truncate">{a.level}</div>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 rounded-xl p-3 sm:p-4">
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm sm:text-base font-black text-neutral-900 dark:text-neutral-50 mb-1.5">
      {children}
    </h2>
  );
}
