"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";

type GameKey = "pokemon" | "onepiece" | "yugioh" | "sports" | "comic" | "other";

const RECENTS_KEY = "cardx.recent.detailVisits";

type CardPick = {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  imageUrl: string;
};

type ProposalStatus = "pending" | "needsInfo" | "chatting" | "accepted" | "rejected";

function stableSeedFromString(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

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

function gameLabel(game: GameKey) {
  switch (game) {
    case "pokemon":
      return "寶可夢";
    case "onepiece":
      return "海賊王";
    case "yugioh":
      return "遊戲王";
    case "sports":
      return "運動卡";
    case "comic":
      return "漫畫";
    case "other":
    default:
      return "其他";
  }
}

function makeCardPick(seed: number, idx: number, game: GameKey): CardPick {
  const cardIdx = ((seed + idx * 7) % 11) + 1;
  const img = "/cardx/placeholder.svg";
  const year = 2018 + ((seed + idx * 3) % 7);
  const label = gameLabel(game);
  const titles = ["超稀有卡", "特選卡", "高評級卡", "限定卡", "收藏卡", "TOP HIT"];
  const subtitle = titles[idx % titles.length] ?? "收藏卡";
  const meta = ["日文", "英文", "中文"][((seed + idx) % 3)] ?? "日文";
  return {
    id: `card_${game}_${cardIdx}_${idx}`,
    title: `${year} ${label}`,
    subtitle,
    meta: `${meta} · ${["SAR", "SR", "UR", "R"][((seed + idx) % 4)] ?? "SR"} · ${["CGC 9.5", "PSA 10", "BGS 9.0", "未鑑定"][((seed + idx) % 4)] ?? "PSA 10"}`,
    imageUrl: img,
  };
}

function makeTradeDetail(id: string) {
  const seed = stableSeedFromString(id);
  const games: GameKey[] = ["pokemon", "onepiece", "yugioh", "sports", "comic", "other"];
  const game = games[seed % games.length] ?? "pokemon";
  const user = "@coddy20123";
  const offer = makeCardPick(seed, 0, game);
  const want = makeCardPick(seed, 3, game);

  const seriesByGame: Record<GameKey, Array<{ key: string; label: string }>> = {
    pokemon: [
      { key: "sv", label: "SV 系列" },
      { key: "swsh", label: "劍/盾" },
      { key: "sm", label: "日/月" },
    ],
    onepiece: [
      { key: "op", label: "OP 系列" },
      { key: "promo", label: "Promo" },
    ],
    yugioh: [
      { key: "ocg", label: "OCG" },
      { key: "tcg", label: "TCG" },
    ],
    sports: [
      { key: "nba", label: "NBA" },
      { key: "mlb", label: "MLB" },
    ],
    comic: [
      { key: "jp", label: "日漫" },
      { key: "us", label: "美漫" },
    ],
    other: [
      { key: "misc", label: "其他" },
      { key: "custom", label: "自製" },
    ],
  };

  const picksByGameSeries: Record<string, CardPick[]> = {};
  for (const g of games) {
    for (const s of seriesByGame[g]) {
      const seriesSeed = stableSeedFromString(`${id}:${g}:${s.key}`);
      const picks = Array.from({ length: 12 }, (_, i) => makeCardPick(seriesSeed, i + 1, g));
      picksByGameSeries[`${g}:${s.key}`] = picks;
    }
  }

  const proposalUsers = ["@pikacoddy", "@mori", "@hiro", "@kevin", "@sakura", "@yuki"];
  const proposals = Array.from({ length: 6 }, (_, i) => {
    const fromUser = proposalUsers[i % proposalUsers.length] ?? "@user";
    const pSeed = stableSeedFromString(`${id}:proposal:${fromUser}:${i}`);
    const offered = makeCardPick(pSeed, 1, game);
    const imageCount = (pSeed % 4) + 1;
    const images = Array.from({ length: imageCount }, (_, k) => makeCardPick(pSeed, 4 + k, game).imageUrl);
    const condition = ["全新", "輕微白邊", "明顯刮痕", "需看細圖"][pSeed % 4] ?? "需看細圖";
    const topUp = ["不可", "可談", "可"][Math.floor((pSeed % 30) / 10)] ?? "可談";
    const status: ProposalStatus = (["pending", "needsInfo", "chatting", "accepted", "rejected"] as const)[pSeed % 5] ?? "pending";
    return {
      id: `proposal_${String(i + 1).padStart(3, "0")}`,
      fromUser,
      offered,
      images,
      condition,
      topUp,
      status,
    };
  });

  return {
    id,
    user,
    game,
    offer,
    want,
    seriesByGame,
    picksByGameSeries,
    proposals,
  };
}

type ProposalFilter = "all" | "pending" | "active";

type FlowStatus = "waiting" | "accepted" | "shipping" | "completed" | "rejected" | "disputed";

type FlowState = {
  status: FlowStatus;
  acceptedProposalId?: string | null;
  trackingNumber?: string;
  disputeNote?: string;
  updatedAtIso: string;
};

function flowStateKey(id: string) {
  return `cardx.trade.state.${id}`;
}

function flowStatusLabel(status: FlowStatus) {
  switch (status) {
    case "waiting":
      return "等待提案";
    case "accepted":
      return "已接受";
    case "shipping":
      return "寄送中";
    case "completed":
      return "已完成";
    case "rejected":
      return "已拒絕";
    case "disputed":
    default:
      return "爭議中";
  }
}

function parseFlowState(raw: string | null): FlowState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const rec = parsed as Record<string, unknown>;
    const status: FlowStatus =
      rec.status === "accepted" ||
      rec.status === "shipping" ||
      rec.status === "completed" ||
      rec.status === "rejected" ||
      rec.status === "disputed"
        ? rec.status
        : "waiting";
    return {
      status,
      acceptedProposalId: typeof rec.acceptedProposalId === "string" ? rec.acceptedProposalId : null,
      trackingNumber: typeof rec.trackingNumber === "string" ? rec.trackingNumber : undefined,
      disputeNote: typeof rec.disputeNote === "string" ? rec.disputeNote : undefined,
      updatedAtIso: typeof rec.updatedAtIso === "string" ? rec.updatedAtIso : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function ActionButton({
  tone,
  label,
  onClick,
  disabled,
}: {
  tone: "blue" | "red" | "green";
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className={`button-3d button-3d_${tone} button-3d_sm`}
      data-v-c8c96dbe=""
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{ borderRadius: 8, whiteSpace: "nowrap", opacity: disabled ? 0.55 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
    >
      <span className="button-3d__outer" data-v-c8c96dbe="">
        <span className="button-3d__inner" data-v-c8c96dbe="">
          <span className="button-3d__text" data-v-c8c96dbe="">
            {label}
          </span>
        </span>
      </span>
    </button>
  );
}

const flowSteps: Array<{ key: FlowStatus; label: string }> = [
  { key: "waiting", label: "提案" },
  { key: "accepted", label: "接受" },
  { key: "shipping", label: "寄送" },
  { key: "completed", label: "完成" },
];

export default function TradeDetailPage() {
  return (
    <Suspense fallback={null}>
      <TradeDetailPageInner />
    </Suspense>
  );
}

function TradeDetailPageInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params?.id ?? "trade_001";
  const detail = useMemo(() => makeTradeDetail(id), [id]);

  const [isMobile, setIsMobile] = useState(false);
  const [ritualFlash, setRitualFlash] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [proposalFilter, setProposalFilter] = useState<ProposalFilter>("active");
  const [acceptedProposalId, setAcceptedProposalId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<
    Array<{
      id: string;
      fromUser: string;
      offered: CardPick;
      images: string[];
      condition: string;
      topUp: string;
      status: ProposalStatus;
    }>
  >(() => detail.proposals);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoImages, setPhotoImages] = useState<string[]>([]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [flow, setFlow] = useState<FlowState>({ status: "waiting", acceptedProposalId: null, updatedAtIso: "" });
  const [trackingDraft, setTrackingDraft] = useState("");
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeDraft, setDisputeDraft] = useState("");

  const selectedOffer = detail.want;
  const viewer = searchParams?.get("as")?.trim() || "@coddy20123";
  const isOwner = viewer === detail.user;
  const tradeStatus = acceptedProposalId ? "MATCHED" : "OPEN";
  const canActivate = !submitted && tradeStatus === "OPEN" && !isOwner;

  useEffect(() => {
    pushRecentVisit({
      kind: "trades",
      id: detail.id,
      ts: Date.now(),
      user: detail.user,
      offerTitle: detail.offer.subtitle || detail.offer.title,
      wantTitle: detail.want.subtitle || detail.want.title,
      offerImageUrl: detail.offer.imageUrl,
      wantImageUrl: detail.want.imageUrl,
    });
  }, [
    detail.id,
    detail.offer.imageUrl,
    detail.offer.subtitle,
    detail.offer.title,
    detail.user,
    detail.want.imageUrl,
    detail.want.subtitle,
    detail.want.title,
  ]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(`trade:${id}:acceptedProposalId`);
      if (!stored) return;
      window.setTimeout(() => {
        setAcceptedProposalId(stored);
        setProposals((prev) =>
          prev.map((p) => {
            if (p.id === stored) return { ...p, status: "accepted" };
            if (p.status === "rejected") return p;
            return { ...p, status: "rejected" };
          })
        );
        setFlow((prev) =>
          prev.status === "waiting"
            ? { ...prev, status: "accepted", acceptedProposalId: stored, updatedAtIso: prev.updatedAtIso || new Date().toISOString() }
            : prev
        );
      }, 0);
    } catch {
      return;
    }
  }, [id]);

  useEffect(() => {
    try {
      const stored = parseFlowState(window.localStorage.getItem(flowStateKey(id)));
      if (!stored) return;
      window.setTimeout(() => {
        setFlow(stored);
        setTrackingDraft(stored.trackingNumber ?? "");
        if (stored.acceptedProposalId) {
          const acceptedId = stored.acceptedProposalId;
          setAcceptedProposalId(acceptedId);
          setProposals((prev) =>
            prev.map((p) => {
              if (p.id === acceptedId) return { ...p, status: "accepted" };
              if (p.status === "rejected") return p;
              return { ...p, status: "rejected" };
            })
          );
        }
      }, 0);
    } catch {
      return;
    }
  }, [id]);

  function updateFlow(patch: Partial<FlowState>) {
    setFlow((prev) => {
      const next: FlowState = { ...prev, ...patch, updatedAtIso: new Date().toISOString() };
      try {
        window.localStorage.setItem(flowStateKey(id), JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth <= 900);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

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

  const acceptedProposal = useMemo(() => proposals.find((p) => p.id === acceptedProposalId) ?? null, [acceptedProposalId, proposals]);

  const leftStatusText =
    tradeStatus === "MATCHED"
      ? `狀態：交換中（已確認 ${acceptedProposal?.fromUser ?? "提案"}）`
      : submitted
        ? "狀態：已送出提案（等待對方回覆）"
        : isOwner
          ? "狀態：等待提案"
          : "狀態：可送出提案";
  const rightStatusText = leftStatusText;

  const proposalsFiltered = useMemo(() => {
    if (proposalFilter === "all") return proposals;
    if (proposalFilter === "pending") return proposals.filter((p) => p.status === "pending" || p.status === "needsInfo");
    return proposals.filter((p) => p.status === "pending" || p.status === "needsInfo" || p.status === "chatting");
  }, [proposalFilter, proposals]);

  function statusLabel(s: ProposalStatus) {
    if (s === "pending") return "待回覆";
    if (s === "needsInfo") return "待補資料";
    if (s === "chatting") return "私聊中";
    if (s === "accepted") return "已接受";
    return "已拒絕";
  }

  function acceptProposal(proposalId: string) {
    if (!isOwner) return;
    if (tradeStatus === "MATCHED") return;
    if (flow.status !== "waiting") return;

    setAcceptedProposalId(proposalId);
    setProposals((prev) =>
      prev.map((p) => {
        if (p.id === proposalId) return { ...p, status: "accepted" };
        if (p.status === "rejected") return p;
        return { ...p, status: "rejected" };
      }),
    );
    try {
      window.localStorage.setItem(`trade:${id}:acceptedProposalId`, proposalId);
    } catch {}
    updateFlow({ status: "accepted", acceptedProposalId: proposalId });
  }

  function acceptFirstPendingProposal() {
    const target = proposals.find((p) => p.status === "pending" || p.status === "needsInfo") ?? proposals.find((p) => p.status === "chatting");
    if (!target) return;
    acceptProposal(target.id);
  }

  function rejectTrade() {
    if (!isOwner) return;
    if (flow.status !== "waiting") return;
    setProposals((prev) => prev.map((p) => (p.status === "rejected" ? p : { ...p, status: "rejected" })));
    updateFlow({ status: "rejected" });
  }

  function saveTrackingNumber() {
    const trimmed = trackingDraft.trim();
    if (!trimmed) return;
    if (flow.status !== "accepted" && flow.status !== "shipping") return;
    updateFlow({ status: "shipping", trackingNumber: trimmed });
  }

  function confirmReceived() {
    if (flow.status !== "accepted" && flow.status !== "shipping") return;
    updateFlow({ status: "completed" });
  }

  function submitDispute() {
    if (flow.status === "completed" || flow.status === "rejected" || flow.status === "disputed") return;
    updateFlow({ status: "disputed", disputeNote: disputeDraft.trim() || undefined });
    setDisputeOpen(false);
  }

  function openPhotoViewer(images: string[], idx: number) {
    setPhotoImages(images);
    setPhotoIndex(idx);
    setPhotoOpen(true);
  }

  useEffect(() => {
    if (!photoOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPhotoOpen(false);
      if (e.key === "ArrowLeft") setPhotoIndex((v) => (photoImages.length ? (v - 1 + photoImages.length) % photoImages.length : v));
      if (e.key === "ArrowRight") setPhotoIndex((v) => (photoImages.length ? (v + 1) % photoImages.length : v));
    };
    window.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [photoImages.length, photoOpen]);

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div style={{ padding: "20px 0 96px" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
            <Link href="/trades" style={{ color: "#374151", textDecoration: "none", fontSize: 13, fontWeight: 800 }}>
              ← 返回交換
            </Link>
            <div style={{ color: "#6b7280", fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {detail.user} · {gameLabel(detail.game)}
              {tradeStatus === "MATCHED" ? " · 交換中" : ""}
            </div>
          </div>

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
                  <div style={{ fontSize: 13, fontWeight: 950, color: "#111827", letterSpacing: "0.02em" }}>對方提出</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>{detail.user}</div>
                </div>

                <div style={{ display: "grid", alignContent: "start", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "132px 1fr", gap: 16, alignItems: "center", minWidth: 0 }}>
                    <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", filter: "drop-shadow(0 12px 20px rgba(0,0,0,0.18))" }}>
                      <Image src={detail.offer.imageUrl} alt="" fill sizes="180px" style={{ objectFit: "cover", borderRadius: 12 }} unoptimized />
                    </div>
                    <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
                      <div style={{ fontSize: 24, fontWeight: 950, color: "#111827", lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {detail.offer.subtitle}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {detail.offer.title}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {detail.offer.meta}
                      </div>
                    </div>
                  </div>

                  <div style={{ height: 1, background: "#e5e7eb" }} />

                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>對方想換</div>
                    <div style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 12, alignItems: "center", minWidth: 0 }}>
                      <div style={{ position: "relative", width: 56, height: 56, borderRadius: 12, overflow: "hidden" }}>
                        <Image src={detail.want.imageUrl} alt="" fill sizes="56px" style={{ objectFit: "cover" }} unoptimized />
                      </div>
                      <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {detail.want.subtitle}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {detail.want.title}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {detail.want.meta}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ height: 1, background: "#e5e7eb" }} />

                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>備註</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", lineHeight: "18px" }}>
                      希望能換到同系列，語言不限，鑑定可談。
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>{leftStatusText}</div>
              </div>

              {isMobile ? (
                <div style={{ padding: "0 28px 4px", display: "grid", justifyItems: "center" }}>
                  <button
                    type="button"
                    disabled={!canActivate}
                    onClick={() => {
                      if (!canActivate) return;
                      setRitualFlash(true);
                      window.setTimeout(() => setRitualFlash(false), 520);
                      setConfirmOpen(true);
                    }}
                    aria-label="送出提案"
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
                      <div style={{ fontSize: 12, fontWeight: 950, letterSpacing: "0.02em" }}>{isOwner ? (tradeStatus === "MATCHED" ? "交換中" : "等待提案") : "送出提案"}</div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: canActivate ? "rgba(255,255,255,0.85)" : "#9ca3af" }}>
                        {isOwner ? "STATUS" : canActivate ? "READY" : "LOCKED"}
                      </div>
                    </div>
                  </button>
                </div>
              ) : null}

              <div style={{ padding: sidePad, display: "grid", gridTemplateRows: "auto 1fr auto", gap: 14, opacity: tradeStatus === "MATCHED" && !isOwner ? 0.78 : 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 950, color: "#111827", letterSpacing: "0.02em" }}>你提出</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>{gameLabel(detail.game)}</div>
                </div>

                <div style={{ display: "grid", alignContent: "start", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "132px 1fr", gap: 16, alignItems: "center", minWidth: 0 }}>
                    <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", filter: "drop-shadow(0 12px 20px rgba(0,0,0,0.18))" }}>
                      <Image src={selectedOffer.imageUrl} alt="" fill sizes="180px" style={{ objectFit: "cover", borderRadius: 12 }} unoptimized />
                    </div>
                    <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
                      <div style={{ fontSize: 24, fontWeight: 950, color: "#111827", lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {selectedOffer.subtitle}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {selectedOffer.title}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {selectedOffer.meta}
                      </div>
                    </div>
                  </div>
                  <div style={{ height: 1, background: "#e5e7eb" }} />
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>此交換為指定卡牌，確認後即可送出提案。</div>
                </div>

                <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>{rightStatusText}</div>
              </div>
            </div>

            {!isMobile ? (
              <button
                type="button"
                disabled={!canActivate}
                onClick={() => {
                  if (!canActivate) return;
                  setRitualFlash(true);
                  window.setTimeout(() => setRitualFlash(false), 520);
                  setConfirmOpen(true);
                }}
                aria-label="送出提案"
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: centerButtonSize,
                  height: centerButtonSize,
                  transform: ritualFlash ? "translate(-50%, -50%) scale(1.03)" : "translate(-50%, -50%)",
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
                  <div style={{ fontSize: 12, fontWeight: 950, letterSpacing: "0.02em" }}>{isOwner ? (tradeStatus === "MATCHED" ? "交換中" : "等待提案") : "送出提案"}</div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: isOwner ? "#9ca3af" : canActivate ? "rgba(255,255,255,0.85)" : "#9ca3af" }}>
                    {isOwner ? "STATUS" : canActivate ? "READY" : "LOCKED"}
                  </div>
                </div>
              </button>
            ) : null}
          </div>

          {isOwner ? (
            <div
              style={{
                marginTop: 16,
                borderRadius: 16,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
                padding: "16px 18px",
                display: "grid",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, fontWeight: 950, color: "#111827", letterSpacing: "0.02em" }}>交換進度</div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 900,
                    padding: "3px 10px",
                    borderRadius: 999,
                    whiteSpace: "nowrap",
                    color:
                      flow.status === "completed"
                        ? "#047857"
                        : flow.status === "rejected"
                          ? "#dc2626"
                          : flow.status === "disputed"
                            ? "#b45309"
                            : "#1d4ed8",
                    background:
                      flow.status === "completed"
                        ? "rgba(16, 185, 129, 0.14)"
                        : flow.status === "rejected"
                          ? "rgba(220, 38, 38, 0.12)"
                          : flow.status === "disputed"
                            ? "rgba(245, 158, 11, 0.16)"
                            : "rgba(34, 131, 246, 0.14)",
                  }}
                >
                  {flowStatusLabel(flow.status)}
                </span>
              </div>

              {(() => {
                const currentIdx =
                  flow.status === "completed"
                    ? 3
                    : flow.status === "shipping"
                      ? 2
                      : flow.status === "accepted"
                        ? 1
                        : flow.status === "disputed"
                          ? (flow.trackingNumber ? 2 : 1)
                          : 0;
                const halted = flow.status === "rejected" || flow.status === "disputed";
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 0 }} aria-label="狀態時間軸">
                    {flowSteps.map((step, idx) => {
                      const reached = idx <= currentIdx && flow.status !== "rejected";
                      const isCurrent = idx === currentIdx && !halted;
                      const dotColor = reached ? (isCurrent ? "rgba(12,86,190,0.95)" : "rgba(34,131,246,0.85)") : "#e5e7eb";
                      return (
                        <div key={step.key} style={{ display: "flex", alignItems: "center", flex: idx === flowSteps.length - 1 ? "0 0 auto" : "1 1 auto", minWidth: 0 }}>
                          <div style={{ display: "grid", justifyItems: "center", gap: 6, flex: "0 0 auto" }}>
                            <div
                              style={{
                                width: 14,
                                height: 14,
                                borderRadius: 999,
                                background: dotColor,
                                boxShadow: isCurrent ? "0 0 0 4px rgba(34,131,246,0.22)" : "none",
                              }}
                            />
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 900,
                                whiteSpace: "nowrap",
                                color: reached ? "#111827" : "#6b7280",
                              }}
                            >
                              {step.label}
                            </div>
                          </div>
                          {idx < flowSteps.length - 1 ? (
                            <div
                              aria-hidden="true"
                              style={{
                                flex: "1 1 auto",
                                height: 2,
                                margin: "0 8px 20px",
                                borderRadius: 1,
                                background: idx < currentIdx && flow.status !== "rejected" ? "rgba(34,131,246,0.75)" : "#e5e7eb",
                              }}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {flow.status === "waiting" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <ActionButton
                    tone="blue"
                    label="接受提案"
                    onClick={acceptFirstPendingProposal}
                    disabled={!proposals.some((p) => p.status === "pending" || p.status === "needsInfo" || p.status === "chatting")}
                  />
                  <ActionButton tone="red" label="拒絕" onClick={rejectTrade} />
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>
                    接受後將鎖定此交換，其餘提案自動拒絕；也可在下方列表逐一確認。
                  </div>
                </div>
              ) : null}

              {flow.status === "accepted" || flow.status === "shipping" ? (
                <div style={{ display: "grid", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <label htmlFor="tracking-number" style={{ fontSize: 12, fontWeight: 900, color: "#374151", whiteSpace: "nowrap" }}>
                      物流單號
                    </label>
                    <input
                      id="tracking-number"
                      value={trackingDraft}
                      onChange={(e) => setTrackingDraft(e.target.value)}
                      placeholder="輸入物流單號"
                      style={{
                        width: "min(240px, 100%)",
                        height: 36,
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        background: "#ffffff",
                        color: "#111827",
                        padding: "0 12px",
                        fontSize: 13,
                        fontWeight: 800,
                        outline: "none",
                      }}
                    />
                    <ActionButton
                      tone="blue"
                      label={flow.status === "shipping" ? "更新物流單號" : "填寫物流單號"}
                      onClick={saveTrackingNumber}
                      disabled={!trackingDraft.trim()}
                    />
                    <ActionButton tone="green" label="確認收貨" onClick={confirmReceived} />
                  </div>
                  {flow.status === "shipping" && flow.trackingNumber ? (
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>已寄送 · 單號：{flow.trackingNumber}</div>
                  ) : null}
                  <div>
                    {!disputeOpen ? (
                      <button
                        type="button"
                        onClick={() => setDisputeOpen(true)}
                        style={{
                          border: 0,
                          background: "transparent",
                          padding: 0,
                          cursor: "pointer",
                          color: "#6b7280",
                          fontSize: 12,
                          fontWeight: 800,
                          textDecoration: "underline",
                          textUnderlineOffset: 4,
                        }}
                      >
                        發起爭議
                      </button>
                    ) : (
                      <div style={{ display: "grid", gap: 8 }}>
                        <label htmlFor="dispute-note" style={{ fontSize: 12, fontWeight: 900, color: "#b45309" }}>
                          爭議說明
                        </label>
                        <textarea
                          id="dispute-note"
                          value={disputeDraft}
                          onChange={(e) => setDisputeDraft(e.target.value)}
                          placeholder="描述遇到的問題（例如：卡況與描述不符、久未收到卡牌）"
                          style={{
                            width: "min(480px, 100%)",
                            minHeight: 72,
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                            background: "#ffffff",
                            color: "#111827",
                            padding: "8px 12px",
                            fontSize: 13,
                            fontWeight: 700,
                            lineHeight: "18px",
                            outline: "none",
                            resize: "vertical",
                            fontFamily: "inherit",
                          }}
                        />
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <ActionButton tone="red" label="送出爭議" onClick={submitDispute} />
                          <button
                            type="button"
                            onClick={() => setDisputeOpen(false)}
                            style={{
                              border: 0,
                              background: "transparent",
                              padding: 0,
                              cursor: "pointer",
                              color: "#6b7280",
                              fontSize: 12,
                              fontWeight: 800,
                            }}
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {flow.status === "completed" ? (
                <div style={{ fontSize: 13, fontWeight: 800, color: "#047857" }}>
                  交換已完成，感謝使用 CardX 交換服務。
                  {flow.trackingNumber ? `（單號：${flow.trackingNumber}）` : ""}
                </div>
              ) : null}

              {flow.status === "rejected" ? (
                <div style={{ fontSize: 13, fontWeight: 800, color: "#dc2626" }}>已拒絕目前所有提案，此交換暫時關閉。</div>
              ) : null}

              {flow.status === "disputed" ? (
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#b45309" }}>爭議處理中，客服將於 1-3 個工作天內聯繫雙方。</div>
                  {flow.disputeNote ? (
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>爭議說明：{flow.disputeNote}</div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {confirmOpen ? (
        <div
          role="presentation"
          onClick={() => setConfirmOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            background: "rgba(0,0,0,0.62)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="確認提案"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(560px, calc(100vw - 32px))",
              borderRadius: 16,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
              padding: 16,
              color: "#111827",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 900 }}>確認提案</div>
              <button
                type="button"
                aria-label="關閉"
                onClick={() => setConfirmOpen(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: "#f3f4f6",
                  color: "#374151",
                  display: "grid",
                  placeItems: "center",
                  padding: 0,
                  cursor: "pointer",
                  flex: "0 0 auto",
                }}
              >
                <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
                  ×
                </span>
              </button>
            </div>

            <div style={{ marginTop: 12, height: 1, background: "#e5e7eb" }} />

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>對方提出</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>{detail.offer.subtitle}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>{detail.offer.meta}</div>
              </div>

              <div style={{ height: 1, background: "#e5e7eb" }} />

              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>你提出</div>
                <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>{selectedOffer?.subtitle ?? "—"}</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280" }}>{selectedOffer?.meta ?? "—"}</div>
              </div>
            </div>

            <div style={{ marginTop: 14, display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                style={{
                  height: 40,
                  padding: "0 14px",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  background: "#f3f4f6",
                  color: "#111827",
                  fontSize: 13,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  setSubmitted(true);
                  setConfirmOpen(false);
                }}
                style={{
                  height: 40,
                  padding: "0 14px",
                  borderRadius: 12,
                  border: "1px solid #2283f6",
                  background: "#2283f6",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                送出提案
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isOwner ? (
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 16px" }}>
          <div style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 950, color: "#111827", letterSpacing: "0.02em" }}>收到的提案</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setProposalFilter("active")}
                  style={{
                    border: 0,
                    background: "transparent",
                    padding: 0,
                    cursor: "pointer",
                    color: proposalFilter === "active" ? "#111827" : "#6b7280",
                    fontSize: 12,
                    fontWeight: 900,
                    textDecoration: proposalFilter === "active" ? "underline" : "none",
                    textUnderlineOffset: 5,
                  }}
                >
                  進行中
                </button>
                <div style={{ width: 1, height: 12, background: "#e5e7eb" }} />
                <button
                  type="button"
                  onClick={() => setProposalFilter("pending")}
                  style={{
                    border: 0,
                    background: "transparent",
                    padding: 0,
                    cursor: "pointer",
                    color: proposalFilter === "pending" ? "#111827" : "#6b7280",
                    fontSize: 12,
                    fontWeight: 900,
                    textDecoration: proposalFilter === "pending" ? "underline" : "none",
                    textUnderlineOffset: 5,
                  }}
                >
                  待處理
                </button>
                <div style={{ width: 1, height: 12, background: "#e5e7eb" }} />
                <button
                  type="button"
                  onClick={() => setProposalFilter("all")}
                  style={{
                    border: 0,
                    background: "transparent",
                    padding: 0,
                    cursor: "pointer",
                    color: proposalFilter === "all" ? "#111827" : "#6b7280",
                    fontSize: 12,
                    fontWeight: 900,
                    textDecoration: proposalFilter === "all" ? "underline" : "none",
                    textUnderlineOffset: 5,
                  }}
                >
                  全部
                </button>
              </div>
            </div>

            <div style={{ marginTop: 10, borderTop: "1px solid #e5e7eb" }}>
              {proposalsFiltered.map((p) => {
                const isPending = p.status === "pending" || p.status === "needsInfo";
                const accepted = p.id === acceptedProposalId || p.status === "accepted";
                const statusText = accepted ? "交換中" : tradeStatus === "MATCHED" && p.status !== "accepted" ? "已鎖定" : statusLabel(p.status);
                return (
                  <div
                    key={p.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "150px minmax(0, 1fr) 170px 120px",
                      gap: 12,
                      alignItems: "center",
                      padding: "12px 2px",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.fromUser}
                    </div>

                    <div style={{ minWidth: 0, display: "grid", gap: 2 }}>
                      <div style={{ fontSize: 13, fontWeight: 950, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.offered.subtitle}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        卡況：{p.condition} · 補差：{p.topUp}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                      {p.images.slice(0, 4).map((src, idx) => (
                        <button
                          key={`${p.id}_img_${idx}`}
                          type="button"
                          onClick={() => openPhotoViewer(p.images, idx)}
                          aria-label={`查看照片 ${idx + 1}`}
                          style={{
                            width: 28,
                            height: 28,
                            padding: 0,
                            borderRadius: 8,
                            border: "1px solid #e5e7eb",
                            background: "#f3f4f6",
                            overflow: "hidden",
                            cursor: "pointer",
                            position: "relative",
                          }}
                        >
                          <Image src={src} alt="" fill sizes="28px" style={{ objectFit: "cover" }} unoptimized />
                        </button>
                      ))}
                    </div>

                    <div style={{ display: "grid", justifyItems: "end", gap: 8 }}>
                      {tradeStatus === "OPEN" && isPending ? (
                        <button
                          type="button"
                          onClick={() => acceptProposal(p.id)}
                          style={{
                            height: 32,
                            padding: "0 10px",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                            background: "#f3f4f6",
                            color: "#111827",
                            fontSize: 12,
                            fontWeight: 950,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          確認提案
                        </button>
                      ) : (
                        <div style={{ textAlign: "right", fontSize: 12, fontWeight: 900, color: "#374151" }}>{statusText}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 16px" }}>
          <div style={{ marginTop: 18, borderTop: "1px solid #e5e7eb", paddingTop: 12, color: "#6b7280", fontSize: 12, fontWeight: 800 }}>
            {tradeStatus === "MATCHED"
              ? `此交換已與 ${acceptedProposal?.fromUser ?? "對方"} 鎖定進行中，暫不接受新提案。`
              : "此交換開放提案中。"}
          </div>
        </div>
      )}

      {photoOpen ? (
        <div
          role="presentation"
          onClick={() => setPhotoOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 95,
            background: "rgba(0,0,0,0.72)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="照片預覽"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(980px, calc(100vw - 32px))",
              borderRadius: 16,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
              padding: 12,
              color: "#111827",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>
                {photoImages.length ? `${photoIndex + 1} / ${photoImages.length}` : ""}
              </div>
              <button
                ref={closeRef}
                type="button"
                aria-label="關閉"
                onClick={() => setPhotoOpen(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: "#f3f4f6",
                  color: "#374151",
                  display: "grid",
                  placeItems: "center",
                  padding: 0,
                  cursor: "pointer",
                  flex: "0 0 auto",
                }}
              >
                <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
                  ×
                </span>
              </button>
            </div>

            <div style={{ marginTop: 10, position: "relative", width: "100%", aspectRatio: "16 / 10", borderRadius: 14, overflow: "hidden", background: "#f3f4f6" }}>
              {photoImages[photoIndex] ? (
                <Image src={photoImages[photoIndex]} alt="" fill sizes="980px" style={{ objectFit: "contain" }} unoptimized />
              ) : null}
            </div>

            {photoImages.length > 1 ? (
              <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setPhotoIndex((v) => (photoImages.length ? (v - 1 + photoImages.length) % photoImages.length : v))}
                  style={{
                    height: 36,
                    padding: "0 12px",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "#f3f4f6",
                    color: "#111827",
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  上一張
                </button>
                <button
                  type="button"
                  onClick={() => setPhotoIndex((v) => (photoImages.length ? (v + 1) % photoImages.length : v))}
                  style={{
                    height: 36,
                    padding: "0 12px",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "#f3f4f6",
                    color: "#111827",
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  下一張
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
