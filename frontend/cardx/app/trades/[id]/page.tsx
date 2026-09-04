"use client";

/**
 * 交換詳情（桌機版，768 以上）—— 真資料
 *
 * 一則交換就是「我拿出這幾張、想換這幾張」。想換的人跟刊登者拿 4 位啟動碼，
 * 輸入後 `create_exchange_order_with_code` 開單，之後的寄送與確認在交換單頁走。
 * 資料表：`exchange_offers` + `exchange_offer_cards`（跟手機版 /exchange/<id> 同一批）。
 *
 * ⚠️ 這頁原本整頁都是 cardx 的 mock：seed 亂數生出來的卡片與 6 筆假提案
 * （@pikacoddy／@mori…）、寫死的「補差：可談」、只存 localStorage 的
 * 接受／拒絕／物流單號／爭議流程。我們的 DB 沒有「提案」這張表 ——
 * 交換是「拿到啟動碼就開單」，不是競標，所以那整塊拿掉；
 * 物流與爭議屬於交換單（exchange_orders），有自己的頁面，不在這裡重做一份。
 *
 * ⚠️ 兩側標題用刊登者的說法（對方拿出／對方想要），不用「你將獲得／你將失去」——
 * 後者要看是誰在看，容易講反。
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureGate } from "@/lib/useFeatureGate";
import { useRequireLogin } from "@/hooks/useRequireLogin";
import { ProductLoadingScreen } from "@/components/ui/ProductLoadingScreen";
import { asset } from "@/lib/asset";
import { ago } from "@/components/market/ui";

const RECENTS_KEY = "cardx.recent.detailVisits";
const AVATAR_FALLBACK = asset("/images/avatar.webp");

type ExchangeCard = {
  id: string;
  name: string;
  series: string;
  image: string;
  value: number;
};

type ExchangeOffer = {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerAvatar: string;
  /** side='give'：刊登者拿出來的 */
  give: ExchangeCard[];
  /** side='want'：刊登者想換到的 */
  want: ExchangeCard[];
  note: string;
  status: string;
  createdAt: string;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
const toCard = (r: any): ExchangeCard => ({
  id: String(r.external_id || ""),
  name: String(r.name || ""),
  series: String(r.series || ""),
  image: String(r.image_url || ""),
  value: typeof r.value === "number" ? r.value : Number(r.value || 0),
});

const sumValue = (cards: ExchangeCard[]) => cards.reduce((s, c) => s + (c.value || 0), 0);
const formatTwd = (n: number) => `NT$${Math.round(n).toLocaleString("en-US")}`;

function pushRecentVisit(entry: {
  kind: "trades";
  id: string;
  ts: number;
  user: string;
  offerTitle: string;
  wantTitle: string;
  offerImageUrl: string;
  wantImageUrl: string;
}) {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(parsed) ? parsed : [];
    const next = [entry, ...list.filter((x) => x && typeof x === "object" && !(x.kind === entry.kind && x.id === entry.id))].slice(0, 200);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {}
}

/** 4 位啟動碼輸入框 */
function CodeInput({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: 4 }).map((_, i) => value[i] || "");

  const setDigit = (index: number, nextDigit: string) => {
    const safe = nextDigit.replace(/\D/g, "").slice(0, 1);
    const next = digits.map((d, i) => (i === index ? safe : d)).join("");
    onChange(next);
    if (safe && index < 3) refs.current[index + 1]?.focus();
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
      {digits.map((d, idx) => (
        <input
          key={idx}
          ref={(el) => {
            refs.current[idx] = el;
          }}
          value={d}
          inputMode="numeric"
          autoComplete="one-time-code"
          onPaste={(e) => {
            const only = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 4);
            if (!only) return;
            e.preventDefault();
            onChange(only);
            refs.current[Math.min(only.length, 3)]?.focus();
          }}
          onChange={(e) => setDigit(idx, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !digits[idx] && idx > 0) refs.current[idx - 1]?.focus();
          }}
          style={{
            width: 52,
            height: 56,
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#ffffff",
            color: "#111827",
            textAlign: "center",
            fontSize: 22,
            fontWeight: 950,
            outline: "none",
          }}
        />
      ))}
    </div>
  );
}

function CardRow({ card, onOpen }: { card: ExchangeCard; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        display: "grid",
        gridTemplateColumns: "54px minmax(0, 1fr)",
        gap: 12,
        alignItems: "center",
        width: "100%",
        textAlign: "left",
        padding: 10,
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        background: "#ffffff",
        cursor: "pointer",
      }}
    >
      <div style={{ width: 54, aspectRatio: "5 / 7", borderRadius: 8, background: "#f3f4f6", overflow: "hidden" }}>
        {card.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.image} alt={card.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        ) : null}
      </div>
      <div style={{ minWidth: 0, display: "grid", gap: 3 }}>
        <div style={{ fontSize: 13, fontWeight: 950, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {card.name || "—"}
        </div>
        {card.series ? (
          <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {card.series}
          </div>
        ) : null}
        <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>約價值 {formatTwd(card.value)}</div>
      </div>
    </button>
  );
}

export default function TradeDetailPage() {
  useFeatureGate("exchange");
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const requireLogin = useRequireLogin();

  const id = String(params?.id || "");

  const [offer, setOffer] = useState<ExchangeOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [gone, setGone] = useState(false);
  const [notice, setNotice] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  const [activationCode, setActivationCode] = useState<string | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [ritualFlash, setRitualFlash] = useState(false);
  const [viewingCard, setViewingCard] = useState<ExchangeCard | null>(null);

  const isOwner = !!user && !!offer && user.id === offer.ownerId;
  const isActive = offer?.status === "active";
  const canActivate = !!offer && isActive && !isOwner;

  const load = useCallback(async () => {
    if (!id) {
      setGone(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("exchange_offers")
        .select(
          `
            id,
            owner_id,
            status,
            note,
            created_at,
            cards:exchange_offer_cards (
              side,
              external_id,
              name,
              series,
              image_url,
              value,
              position
            )
          `
        )
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      const row = data as any;
      if (!row?.id) {
        setGone(true);
        return;
      }

      const ownerId = String(row.owner_id || "");
      const status = String(row.status || "active");
      // 下架／已刪除的只有刊登者自己看得到
      if (status !== "active" && (!user?.id || user.id !== ownerId)) {
        setGone(true);
        return;
      }

      const cardRows = Array.isArray(row.cards) ? [...row.cards] : [];
      cardRows.sort((a: any, b: any) => (Number(a.position) || 0) - (Number(b.position) || 0));

      let ownerName = "user";
      let ownerAvatar = AVATAR_FALLBACK;
      try {
        const { data: displays } = await supabase.rpc("get_user_displays", { p_ids: [ownerId] });
        const d = Array.isArray(displays) ? (displays[0] as any) : null;
        if (d) {
          ownerName = String(d.name || "user");
          ownerAvatar = String(d.avatar_url || AVATAR_FALLBACK);
        }
      } catch {
        /* 顯示名讀不到就用預設，不擋整頁 */
      }

      setGone(false);
      setOffer({
        id: String(row.id),
        ownerId,
        ownerName,
        ownerAvatar,
        give: cardRows.filter((c: any) => c.side === "give").map(toCard),
        want: cardRows.filter((c: any) => c.side === "want").map(toCard),
        note: String(row.note || ""),
        status,
        createdAt: String(row.created_at || ""),
      });
    } catch {
      setGone(true);
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth <= 900);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (!offer) return;
    pushRecentVisit({
      kind: "trades",
      id: offer.id,
      ts: Date.now(),
      user: `@${offer.ownerName}`,
      offerTitle: offer.give[0]?.name || "",
      wantTitle: offer.want[0]?.name || "",
      offerImageUrl: offer.give[0]?.image || "",
      wantImageUrl: offer.want[0]?.image || "",
    });
  }, [offer]);

  /* 啟動碼只有刊登者本人拿得到（RPC 是 SECURITY DEFINER，會自己檢查） */
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!offer || !user?.id || user.id !== offer.ownerId) {
        setActivationCode(null);
        return;
      }
      try {
        const { data, error } = await createClient().rpc("get_exchange_offer_activation_code", { p_offer_id: offer.id });
        if (error) throw error;
        if (!cancelled) setActivationCode(data == null ? null : String(data));
      } catch {
        if (!cancelled) setActivationCode(null);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [offer, user?.id]);

  const giveValue = useMemo(() => sumValue(offer?.give ?? []), [offer]);
  const wantValue = useMemo(() => sumValue(offer?.want ?? []), [offer]);

  const removeOffer = async () => {
    if (!offer || !isOwner) return;
    setBusy(true);
    try {
      const { error } = await createClient()
        .from("exchange_offers")
        .update({ status: "deleted", updated_at: new Date().toISOString() })
        .eq("id", offer.id);
      if (error) throw error;
      setNotice("已刪除這則交換");
      router.push("/trades");
    } catch {
      setNotice("刪除失敗，請稍後再試");
    } finally {
      setBusy(false);
    }
  };

  const startExchange = async () => {
    if (!offer) return;
    const digits = code.replace(/\D/g, "").slice(0, 4);
    if (digits.length !== 4) {
      setNotice("請輸入 4 位啟動碼");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await createClient().rpc("create_exchange_order_with_code", { p_offer_id: offer.id, p_code: digits });
      if (error) {
        const errCode = typeof (error as any)?.code === "string" ? (error as any).code : "";
        const errMsg = typeof (error as any)?.message === "string" ? (error as any).message : "";
        if (errCode === "22023" || errMsg.includes("invalid_code")) {
          setNotice("啟動碼不對，跟對方再確認一次");
          return;
        }
        if (errCode === "23505" || errMsg.includes("offer_already_started")) {
          setNotice("這則交換已經有人在進行了");
          return;
        }
        throw error;
      }
      const orderId = data == null ? "" : String(data);
      if (!orderId) throw new Error("no order id");
      setCodeOpen(false);
      setCode("");
      router.push(`/exchange-orders/${orderId}`);
    } catch {
      setNotice("啟動失敗，請稍後再試");
    } finally {
      setBusy(false);
    }
  };

  const onActivateClick = () => {
    if (!canActivate) return;
    if (!requireLogin("登入後就可以啟動這筆交換")) return;
    setRitualFlash(true);
    window.setTimeout(() => setRitualFlash(false), 520);
    setCodeOpen(true);
  };

  if (loading) return <ProductLoadingScreen />;

  if (gone || !offer) {
    return (
      <AppShell sidebarItems={defaultSidebarItems}>
        <div style={{ padding: "20px 0 96px" }}>
          <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 16px" }}>
            <Link href="/trades" style={{ color: "#374151", textDecoration: "none", fontSize: 13, fontWeight: 800 }}>
              ← 返回交換
            </Link>
            <div style={{ marginTop: 40, padding: "60px 20px", borderRadius: 18, border: "1px solid #e5e7eb", background: "#ffffff", textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 950, color: "#111827" }}>找不到這則交換</div>
              <div style={{ marginTop: 8, fontSize: 13, fontWeight: 800, color: "#6b7280" }}>可能已經被刊登者收掉了</div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  const stageMinH = isMobile ? 640 : 520;
  const sidePad = 28;
  const centerButtonSize = 96;
  const glowOpacity = ritualFlash ? 1 : 0;

  const buttonBg = canActivate
    ? "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.35), rgba(34,131,246,0.95) 40%, rgba(12,86,190,0.95) 70%, rgba(6,32,70,0.9))"
    : "radial-gradient(circle at 30% 25%, #ffffff, #f3f4f6 40%, #e5e7eb 75%)";
  const buttonShadow = canActivate
    ? "0 14px 30px rgba(12,86,190,0.28), inset 0 0 0 1px rgba(255,255,255,0.22), inset 0 8px 18px rgba(255,255,255,0.22)"
    : "0 6px 16px rgba(0,0,0,0.10), inset 0 0 0 1px #e5e7eb";

  const buttonMain = isOwner ? "你貼的交換" : !isActive ? "已結束" : "啟動交換";
  const buttonSub = isOwner ? "OWNER" : !isActive ? "CLOSED" : "READY";

  const statusText = isOwner
    ? isActive
      ? "狀態：刊登中，等別人拿啟動碼跟你換"
      : "狀態：已結束"
    : isActive
      ? "狀態：開放中，跟對方要 4 位啟動碼就能開單"
      : "狀態：已結束";

  const centerButton = (
    <button
      type="button"
      disabled={!canActivate}
      onClick={onActivateClick}
      aria-label="啟動交換"
      style={{
        width: centerButtonSize,
        height: centerButtonSize,
        transform: ritualFlash ? "scale(1.03)" : undefined,
        transition: "transform 220ms ease",
        borderRadius: 999,
        border: canActivate ? "1px solid rgba(255,255,255,0.22)" : "1px solid #e5e7eb",
        background: buttonBg,
        boxShadow: buttonShadow,
        color: canActivate ? "#ffffff" : "#6b7280",
        cursor: canActivate ? "pointer" : "not-allowed",
        display: "grid",
        placeItems: "center",
        padding: 0,
      }}
    >
      <div style={{ display: "grid", placeItems: "center", gap: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 950, letterSpacing: "0.02em" }}>{buttonMain}</div>
        <div style={{ fontSize: 10, fontWeight: 800, color: canActivate ? "rgba(255,255,255,0.85)" : "#9ca3af" }}>{buttonSub}</div>
      </div>
    </button>
  );

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div style={{ padding: "20px 0 96px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
            <Link href="/trades" style={{ color: "#374151", textDecoration: "none", fontSize: 13, fontWeight: 800 }}>
              ← 返回交換
            </Link>
            <div style={{ color: "#6b7280", fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              @{offer.ownerName}
              {offer.createdAt ? ` · ${ago(offer.createdAt)}貼出` : ""}
            </div>
          </div>

          {notice ? (
            <div
              role="status"
              style={{
                marginBottom: 12,
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                padding: "10px 14px",
                fontSize: 13,
                fontWeight: 900,
                color: "#111827",
              }}
            >
              {notice}
            </div>
          ) : null}

          {/* 刊登者專屬：啟動碼與刪除 */}
          {isOwner ? (
            <div
              style={{
                marginBottom: 16,
                borderRadius: 16,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                padding: "16px 18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 950, color: "#111827" }}>你的啟動碼</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>
                  談好了再把這 4 位數字給對方，他輸入後才會開單。
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 950,
                    letterSpacing: "0.3em",
                    color: "#111827",
                    background: "#f3f4f6",
                    borderRadius: 12,
                    padding: "8px 16px",
                    minWidth: 120,
                    textAlign: "center",
                  }}
                >
                  {activationCode ?? "————"}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={removeOffer}
                  style={{
                    height: 38,
                    padding: "0 14px",
                    borderRadius: 12,
                    border: "1px solid #fecaca",
                    background: "#fee2e2",
                    color: "#dc2626",
                    fontSize: 13,
                    fontWeight: 900,
                    cursor: busy ? "not-allowed" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  刪除這則交換
                </button>
              </div>
            </div>
          ) : null}

          <div
            style={{
              position: "relative",
              minHeight: stageMinH,
              borderRadius: 18,
              overflow: "hidden",
              border: "1px solid #e5e7eb",
              background:
                "radial-gradient(900px 520px at 18% 34%, rgba(34,131,246,0.10), transparent 58%), radial-gradient(900px 520px at 82% 34%, rgba(237,29,73,0.08), transparent 58%), linear-gradient(180deg, #ffffff, #f9fafb)",
              boxShadow: "0 10px 40px -10px rgba(0,0,0,0.08)",
            }}
          >
            {!isMobile ? (
              <>
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "linear-gradient(135deg, rgba(34,131,246,0.10) 0%, rgba(34,131,246,0.02) 44%, rgba(0,0,0,0) 50%, rgba(237,29,73,0.02) 56%, rgba(237,29,73,0.09) 100%)",
                    pointerEvents: "none",
                  }}
                />
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(135deg, transparent 49.35%, rgba(17,24,39,0.10) 50%, transparent 50.65%)",
                    pointerEvents: "none",
                    opacity: 0.9,
                  }}
                />
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "linear-gradient(135deg, transparent 48.4%, rgba(34,131,246,0.0) 49.2%, rgba(34,131,246,0.95) 50%, rgba(34,131,246,0.0) 50.8%, transparent 51.6%)",
                    pointerEvents: "none",
                    opacity: glowOpacity,
                    filter: "blur(0.2px)",
                    transition: "opacity 260ms ease",
                  }}
                />
              </>
            ) : null}

            <div
              style={{
                position: "relative",
                display: "grid",
                gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))",
                minHeight: stageMinH,
              }}
            >
              <div style={{ padding: sidePad, display: "grid", gridTemplateRows: "auto 1fr auto", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 950, color: "#111827", letterSpacing: "0.02em" }}>對方拿出</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>約價值 {formatTwd(giveValue)}</div>
                </div>

                <div style={{ display: "grid", alignContent: "start", gap: 10 }}>
                  {offer.give.length === 0 ? (
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#9ca3af" }}>這則交換沒有填拿出的卡</div>
                  ) : (
                    offer.give.map((c, i) => <CardRow key={`${c.id}_${i}`} card={c} onOpen={() => setViewingCard(c)} />)
                  )}
                </div>

                <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>{statusText}</div>
              </div>

              {isMobile ? <div style={{ padding: "0 28px 4px", display: "grid", justifyItems: "center" }}>{centerButton}</div> : null}

              <div style={{ padding: sidePad, display: "grid", gridTemplateRows: "auto 1fr auto", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 950, color: "#111827", letterSpacing: "0.02em" }}>對方想要</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>約價值 {formatTwd(wantValue)}</div>
                </div>

                <div style={{ display: "grid", alignContent: "start", gap: 10 }}>
                  {offer.want.length === 0 ? (
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#9ca3af" }}>這則交換沒有填想要的卡</div>
                  ) : (
                    offer.want.map((c, i) => <CardRow key={`${c.id}_${i}`} card={c} onOpen={() => setViewingCard(c)} />)
                  )}
                </div>

                <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>
                  想換的話先跟 @{offer.ownerName} 談，談好了跟他要啟動碼。
                </div>
              </div>
            </div>

            {!isMobile ? (
              <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>{centerButton}</div>
            ) : null}
          </div>

          <div
            style={{
              marginTop: 16,
              borderRadius: 16,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              padding: "16px 18px",
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  flex: "0 0 auto",
                  background: `#f3f4f6 url(${offer.ownerAvatar || AVATAR_FALLBACK}) center / cover no-repeat`,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 950, color: "#111827" }}>@{offer.ownerName}</div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#9ca3af" }}>{offer.createdAt ? `${ago(offer.createdAt)}貼出` : ""}</div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>簡易說明</div>
              <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, color: "#374151", lineHeight: "20px", wordBreak: "break-word" }}>
                {offer.note || "刊登者沒有留說明。"}
              </div>
            </div>

            <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280", lineHeight: "18px" }}>
              啟動之後雙方各自寄出、各自確認收到，過程都在交換單那一頁走。卡況與寄送方式請先跟對方談清楚。
            </div>
          </div>
        </div>
      </div>

      {codeOpen ? (
        <div
          role="presentation"
          onClick={() => setCodeOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", padding: 16 }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="輸入啟動碼"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(460px, calc(100vw - 32px))",
              borderRadius: 16,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
              padding: 18,
              color: "#111827",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 950 }}>輸入 4 位啟動碼</div>
            <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, color: "#6b7280" }}>
              跟 @{offer.ownerName} 談好之後，他會把這 4 位數字給你。
            </div>
            <div style={{ marginTop: 16 }}>
              <CodeInput value={code} onChange={setCode} />
            </div>
            <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setCodeOpen(false)}
                style={{ height: 40, padding: "0 14px", borderRadius: 12, border: "1px solid #e5e7eb", background: "#f3f4f6", color: "#111827", fontSize: 13, fontWeight: 900, cursor: "pointer" }}
              >
                取消
              </button>
              <button
                type="button"
                disabled={busy || code.replace(/\D/g, "").length !== 4}
                onClick={startExchange}
                style={{
                  height: 40,
                  padding: "0 16px",
                  borderRadius: 12,
                  border: "1px solid #2283f6",
                  background: "#2283f6",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 900,
                  cursor: busy || code.replace(/\D/g, "").length !== 4 ? "not-allowed" : "pointer",
                  opacity: busy || code.replace(/\D/g, "").length !== 4 ? 0.55 : 1,
                }}
              >
                {busy ? "處理中…" : "確認啟動"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
            {viewingCard.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={viewingCard.image}
                alt={viewingCard.name}
                style={{ maxWidth: "100%", maxHeight: "72vh", objectFit: "contain", borderRadius: 16, background: "#ffffff" }}
              />
            ) : null}
            <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: 800 }}>
              {viewingCard.series ? `${viewingCard.series} · ` : ""}約價值 {formatTwd(viewingCard.value)}
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
