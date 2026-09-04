"use client";

/**
 * 建立交換（桌機版，768 以上）—— 真資料
 *
 * 挑「我拿出」與「我想要」各最多 4 張卡，寫個說明，送出後寫進
 * `exchange_offers`（status=active）＋ `exchange_offer_cards`（side=give／want）。
 * 卡池與系列來自站內既有的 `/api/limitless/jp-cards`、`/api/limitless/jp-sets`
 * （跟手機版 /exchange/new 同一組），不新增任何外部服務。
 *
 * ⚠️ 這頁原本是一張純文字表單（標題／遊戲分類／我有／我想要／備註），
 * 送出只寫 localStorage 的 `cardx.trades.my.v1` —— 別人看不到、重灌瀏覽器就沒了。
 * 那幾個欄位 DB 也沒有對應（沒有 title、沒有 game 分類欄），所以整張表單重做：
 * 改成挑真的卡，寫進真的表。
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureGate } from "@/lib/useFeatureGate";

type PickCard = {
  id: string;
  name: string;
  series: string;
  image: string;
  value: number;
};

type SeriesOption = { id: string; name: string };
type Side = "give" | "want";

const MAX_PER_SIDE = 4;
const NOTE_KEY = "cardx.trades.new.note";

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 900, color: "#374151" };

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  borderRadius: 12,
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  color: "#111827",
  padding: "0 14px",
  fontSize: 14,
  fontWeight: 800,
  outline: "none",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  height: "auto",
  minHeight: 88,
  padding: "10px 14px",
  lineHeight: "20px",
  resize: "vertical",
  fontFamily: "inherit",
};

const errorTextStyle: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: "#dc2626" };

/**
 * 卡片的參考價值。
 *
 * 我們沒有卡牌行情資料庫，這個數字是從卡片編號推出來的固定值 ——
 * 同一張卡永遠同一個數字，兩邊看到的一樣，拿來當「兩邊差不多嗎」的粗略對照。
 * 跟手機版 /exchange/new 同一套算法，不然同一張卡在兩邊會標不同價。
 */
function cardValue(id: string) {
  const digits = "0123456789";
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const d1 = Number(digits[h % 10]);
  const d2 = Number(digits[(h >>> 4) % 10]);
  const d3 = Number(digits[(h >>> 8) % 10]);
  const base = d1 * 1000 + d2 * 100 + d3 * 10;
  return 200 + (base % 2800);
}

const formatTwd = (n: number) => `NT$${Math.round(n).toLocaleString("en-US")}`;

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zm6.2-1.1L21 21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const pillStyle = (active: boolean): React.CSSProperties => ({
  flex: "0 0 auto",
  height: 32,
  padding: "0 12px",
  borderRadius: 999,
  border: active ? "1px solid #111827" : "1px solid #e5e7eb",
  background: active ? "#111827" : "#ffffff",
  color: active ? "#ffffff" : "#374151",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
});

export default function TradeNewPage() {
  useFeatureGate("exchange");
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [side, setSide] = useState<Side>("give");
  const [giveCards, setGiveCards] = useState<PickCard[]>([]);
  const [wantCards, setWantCards] = useState<PickCard[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [seriesOptions, setSeriesOptions] = useState<SeriesOption[]>([]);
  const [activeSeries, setActiveSeries] = useState("");
  const [cards, setCards] = useState<PickCard[]>([]);
  const [total, setTotal] = useState(0);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [viewingCard, setViewingCard] = useState<PickCard | null>(null);

  const inFlight = useRef(false);
  const cardsLenRef = useRef(0);
  cardsLenRef.current = cards.length;

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(NOTE_KEY);
      if (raw) setNote(raw);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(NOTE_KEY, note);
    } catch {}
  }, [note]);

  useEffect(() => {
    const t = window.setTimeout(() => setQuery(draft.trim()), 400);
    return () => window.clearTimeout(t);
  }, [draft]);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch("/api/limitless/jp-sets?limit=12", { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as { sets?: SeriesOption[] } | null;
        const rows = Array.isArray(json?.sets) ? json!.sets : [];
        setSeriesOptions(rows);
        setActiveSeries((prev) => prev || rows[0]?.id || "");
      } catch {
        setSeriesOptions([]);
      }
    };
    run();
  }, []);

  const fetchCards = useCallback(
    async (offset: number, append: boolean) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setCardsLoading(true);
      setLoadError("");
      try {
        const url = new URL("/api/limitless/jp-cards", window.location.origin);
        url.searchParams.set("limit", "20");
        url.searchParams.set("offset", String(offset));
        if (query) url.searchParams.set("q", query);
        url.searchParams.set("set", activeSeries || "all");
        const res = await fetch(url.toString(), { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
          | { total?: number; cards?: Array<{ id: string; name: string; image: string; series: string }> }
          | null;
        const rows = Array.isArray(json?.cards) ? json!.cards : [];
        const mapped: PickCard[] = rows.map((r) => ({
          id: r.id,
          name: r.name,
          series: r.series,
          image: r.image,
          value: cardValue(r.id),
        }));
        setTotal(typeof json?.total === "number" ? json.total : 0);
        setCards((prev) => (append ? [...prev, ...mapped] : mapped));
      } catch {
        setLoadError("卡牌讀不到，稍後再試一次");
        if (!append) setCards([]);
        setTotal(0);
      } finally {
        setCardsLoading(false);
        inFlight.current = false;
      }
    },
    [activeSeries, query]
  );

  useEffect(() => {
    if (!query && !activeSeries) return;
    setCards([]);
    setTotal(0);
    fetchCards(0, false);
  }, [fetchCards, query, activeSeries]);

  const current = side === "give" ? giveCards : wantCards;
  const setCurrent = side === "give" ? setGiveCards : setWantCards;

  const togglePick = (card: PickCard) => {
    if (current.some((c) => c.id === card.id)) {
      setCurrent(current.filter((c) => c.id !== card.id));
      return;
    }
    if (current.length >= MAX_PER_SIDE) {
      setError(`一邊最多選 ${MAX_PER_SIDE} 張`);
      return;
    }
    setError("");
    setCurrent([...current, card]);
  };

  const giveValue = useMemo(() => giveCards.reduce((s, c) => s + c.value, 0), [giveCards]);
  const wantValue = useMemo(() => wantCards.reduce((s, c) => s + c.value, 0), [wantCards]);

  const save = async () => {
    if (!user) return;
    if (giveCards.length === 0 || wantCards.length === 0) {
      setError("「我拿出」與「我想要」各至少選 1 張");
      return;
    }
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: created, error: createError } = await supabase
        .from("exchange_offers")
        .insert({
          owner_id: user.id,
          status: "active",
          note: note.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (createError || !created?.id) throw createError || new Error("建立交換失敗");
      const offerId = String(created.id);

      const rows = [
        ...giveCards.map((c, idx) => ({
          offer_id: offerId,
          side: "give" as const,
          external_id: c.id,
          name: c.name,
          series: c.series || null,
          image_url: c.image || null,
          value: c.value,
          position: idx,
        })),
        ...wantCards.map((c, idx) => ({
          offer_id: offerId,
          side: "want" as const,
          external_id: c.id,
          name: c.name,
          series: c.series || null,
          image_url: c.image || null,
          value: c.value,
          position: idx,
        })),
      ];

      const { error: cardsError } = await supabase.from("exchange_offer_cards").insert(rows);
      if (cardsError) throw cardsError;

      try {
        window.sessionStorage.removeItem(NOTE_KEY);
      } catch {}

      router.replace(`/trades/${offerId}`);
    } catch {
      setError("貼出失敗，請稍後再試");
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AppShell sidebarItems={defaultSidebarItems}>
        <div style={{ padding: "20px 0 96px" }}>
          <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 16px" }}>
            <div style={{ padding: "80px 0", textAlign: "center", fontSize: 13, fontWeight: 900, color: "#9ca3af" }}>載入中</div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell sidebarItems={defaultSidebarItems}>
        <div style={{ padding: "20px 0 96px" }}>
          <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 16px" }}>
            <Link href="/trades" style={{ color: "#374151", textDecoration: "none", fontSize: 13, fontWeight: 800 }}>
              ← 返回交換
            </Link>
            <div style={{ marginTop: 18, borderRadius: 18, border: "1px solid #e5e7eb", background: "#ffffff", padding: "48px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 950, color: "#111827" }}>登入後才能貼出交換</div>
              <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800, color: "#6b7280" }}>登入完會回到這一頁</div>
              <button
                type="button"
                onClick={() => router.push("/login?next=%2Ftrades%2Fnew")}
                style={{
                  marginTop: 20,
                  height: 42,
                  padding: "0 20px",
                  borderRadius: 12,
                  border: "1px solid rgb(var(--primary))",
                  background: "rgb(var(--primary))",
                  color: "#ffffff",
                  fontSize: 14,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                前往登入
              </button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div style={{ padding: "20px 0 96px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
            <Link href="/trades" style={{ color: "#374151", textDecoration: "none", fontSize: 13, fontWeight: 800 }}>
              ← 返回交換
            </Link>
            <div style={{ color: "#6b7280", fontSize: 13, fontWeight: 800 }}>貼出一則新的交換</div>
          </div>

          <div
            style={{
              borderRadius: 18,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              boxShadow: "0 10px 40px -10px rgba(0,0,0,0.08)",
              padding: "24px 24px 28px",
              display: "grid",
              gap: 18,
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "#111827", letterSpacing: "-0.36px" }}>建立交換</h1>
              <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, color: "#6b7280" }}>
                挑出你拿得出來的卡、和你想換到的卡，各最多 {MAX_PER_SIDE} 張。貼出後別人來跟你要啟動碼就能開單。
              </div>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label htmlFor="trade-note" style={labelStyle}>
                簡易說明（選填）
              </label>
              <textarea
                id="trade-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="卡況、寄送方式、想約什麼時間"
                maxLength={300}
                style={textareaStyle}
              />
            </div>

            {/* 兩側的欄位：切換後下面挑的卡就進這一側 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
              {(["give", "want"] as Side[]).map((s) => {
                const list = s === "give" ? giveCards : wantCards;
                const setList = s === "give" ? setGiveCards : setWantCards;
                const value = s === "give" ? giveValue : wantValue;
                const on = side === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSide(s)}
                    style={{
                      textAlign: "left",
                      padding: 14,
                      borderRadius: 14,
                      border: on ? "2px solid #111827" : "1px solid #e5e7eb",
                      background: on ? "#f9fafb" : "#ffffff",
                      cursor: "pointer",
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 950, color: "#111827" }}>{s === "give" ? "我拿出" : "我想要"}</div>
                      <div style={{ fontSize: 11, fontWeight: 900, color: "#6b7280" }}>
                        {list.length}/{MAX_PER_SIDE} · 約 {formatTwd(value)}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                      {Array.from({ length: MAX_PER_SIDE }).map((_, idx) => {
                        const card = list[idx];
                        if (!card) {
                          return <div key={idx} style={{ aspectRatio: "5 / 7", borderRadius: 10, background: "#f3f4f6" }} />;
                        }
                        return (
                          <div key={card.id} style={{ position: "relative", aspectRatio: "5 / 7", borderRadius: 10, background: "#f3f4f6", overflow: "hidden" }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={card.image} alt={card.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                            <span
                              role="button"
                              tabIndex={0}
                              aria-label={`移除 ${card.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setList(list.filter((c) => c.id !== card.id));
                              }}
                              onKeyDown={(e) => {
                                if (e.key !== "Enter" && e.key !== " ") return;
                                e.preventDefault();
                                e.stopPropagation();
                                setList(list.filter((c) => c.id !== card.id));
                              }}
                              style={{
                                position: "absolute",
                                top: 4,
                                right: 4,
                                width: 22,
                                height: 22,
                                borderRadius: 999,
                                background: "rgba(0,0,0,0.6)",
                                color: "#ffffff",
                                display: "grid",
                                placeItems: "center",
                                fontSize: 14,
                                lineHeight: 1,
                                cursor: "pointer",
                              }}
                            >
                              ×
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: on ? "#111827" : "#9ca3af" }}>
                      {on ? "下面挑的卡會加到這一邊" : "點一下切到這一邊"}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* 卡池 */}
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ position: "relative" }}>
                <div
                  aria-hidden="true"
                  style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#6b7280", pointerEvents: "none", display: "grid", placeItems: "center" }}
                >
                  <SearchIcon />
                </div>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="搜尋卡牌名稱"
                  aria-label="搜尋卡牌"
                  style={{ ...inputStyle, padding: "0 14px 0 40px" }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
                <button type="button" onClick={() => setActiveSeries("")} style={pillStyle(!activeSeries)}>
                  全部
                </button>
                {seriesOptions.map((s) => (
                  <button key={s.id} type="button" onClick={() => setActiveSeries(s.id)} style={pillStyle(activeSeries === s.id)} title={s.name}>
                    {s.id}
                  </button>
                ))}
              </div>

              {loadError ? <div style={errorTextStyle}>{loadError}</div> : null}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))", gap: 10 }}>
                {cards.map((card) => {
                  const selected = current.some((c) => c.id === card.id);
                  return (
                    <div key={card.id} style={{ display: "grid", gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => togglePick(card)}
                        aria-pressed={selected}
                        aria-label={card.name}
                        style={{
                          position: "relative",
                          aspectRatio: "5 / 7",
                          borderRadius: 12,
                          overflow: "hidden",
                          border: selected ? "2px solid #111827" : "1px solid #e5e7eb",
                          background: "#ffffff",
                          padding: 0,
                          cursor: "pointer",
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={card.image} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                        <span
                          aria-hidden
                          style={{
                            position: "absolute",
                            top: 4,
                            right: 4,
                            width: 22,
                            height: 22,
                            borderRadius: 999,
                            background: selected ? "#111827" : "rgba(0,0,0,0.12)",
                            color: selected ? "#ffffff" : "#374151",
                            display: "grid",
                            placeItems: "center",
                            fontSize: 13,
                            fontWeight: 900,
                            lineHeight: 1,
                          }}
                        >
                          {selected ? "✓" : "＋"}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewingCard(card)}
                        style={{
                          border: 0,
                          background: "transparent",
                          padding: 0,
                          cursor: "pointer",
                          fontSize: 11,
                          lineHeight: "14px",
                          fontWeight: 900,
                          color: "#374151",
                          textAlign: "center",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {card.name}
                      </button>
                    </div>
                  );
                })}
              </div>

              {cardsLoading ? (
                <div style={{ padding: "20px 0", textAlign: "center", fontSize: 12, fontWeight: 900, color: "#9ca3af" }}>載入中</div>
              ) : cards.length === 0 ? (
                <div style={{ padding: "28px 0", textAlign: "center", fontSize: 12, fontWeight: 900, color: "#9ca3af" }}>
                  {query ? "找不到這張卡" : "選一個系列或直接搜尋卡名"}
                </div>
              ) : cards.length < total ? (
                <div style={{ display: "grid", placeItems: "center", paddingTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => fetchCards(cardsLenRef.current, true)}
                    style={{
                      height: 38,
                      padding: "0 18px",
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "#f3f4f6",
                      color: "#111827",
                      fontSize: 13,
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    載入更多（{cards.length}/{total}）
                  </button>
                </div>
              ) : (
                <div style={{ padding: "12px 0", textAlign: "center", fontSize: 12, fontWeight: 900, color: "#d1d5db" }}>到底了</div>
              )}
            </div>

            {error ? <div style={errorTextStyle}>{error}</div> : null}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12 }}>
              <Link href="/trades" style={{ color: "#6b7280", textDecoration: "none", fontSize: 13, fontWeight: 800 }}>
                取消
              </Link>
              <button
                className="button-3d button-3d_blue button-3d_sm"
                data-v-c8c96dbe=""
                type="button"
                onClick={save}
                disabled={saving}
                style={{ borderRadius: 8, whiteSpace: "nowrap", opacity: saving ? 0.6 : 1, cursor: saving ? "not-allowed" : "pointer" }}
              >
                <span className="button-3d__outer" data-v-c8c96dbe="">
                  <span className="button-3d__inner" data-v-c8c96dbe="">
                    <span className="button-3d__text" data-v-c8c96dbe="">
                      {saving ? "貼出中…" : "貼出交換"}
                    </span>
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {viewingCard ? (
        <div
          role="presentation"
          onClick={() => setViewingCard(null)}
          style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgba(0,0,0,0.72)", display: "grid", placeItems: "center", padding: 16 }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={viewingCard.name}
            onClick={(e) => e.stopPropagation()}
            style={{ display: "grid", justifyItems: "center", gap: 12, maxWidth: "min(420px, calc(100vw - 32px))" }}
          >
            <div style={{ color: "#ffffff", fontSize: 15, fontWeight: 900, textAlign: "center" }}>{viewingCard.name}</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewingCard.image}
              alt={viewingCard.name}
              style={{ maxWidth: "100%", maxHeight: "72vh", objectFit: "contain", borderRadius: 16, background: "#ffffff" }}
            />
            <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: 800 }}>
              {viewingCard.series ? `${viewingCard.series} · ` : ""}約價值 {formatTwd(viewingCard.value)}
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
