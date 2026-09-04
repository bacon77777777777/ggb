"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/cardx/components/layout/AppShell";
import { defaultSidebarItems } from "@/cardx/lib/navigation";
import type { CardGame } from "@/cardx/lib/types";

const MY_TRADES_KEY = "cardx.trades.my.v1";

const gameOptions: Array<{ key: CardGame; label: string }> = [
  { key: "pokemon", label: "寶可夢" },
  { key: "onepiece", label: "海賊王" },
  { key: "yugioh", label: "遊戲王" },
  { key: "sports", label: "運動卡" },
  { key: "comic", label: "漫畫" },
  { key: "other", label: "其他" },
];

type MyTradeRecord = {
  tradeId: string;
  status: "chatting" | "matching" | "completed" | "cancelled";
  updatedAtIso: string;
  title: string;
  game: CardGame;
  offerSummary: string;
  wantSummary: string;
  note?: string;
  createdAtIso: string;
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: "rgba(255,255,255,0.78)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 42,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.92)",
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

const errorTextStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "rgba(255,150,160,0.95)",
};

export default function TradeNewPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [game, setGame] = useState<CardGame>("pokemon");
  const [offerSummary, setOfferSummary] = useState("");
  const [wantSummary, setWantSummary] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ title?: string; offerSummary?: string; wantSummary?: string }>({});
  const [saveFailed, setSaveFailed] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const trimmedTitle = title.trim();
    const trimmedOffer = offerSummary.trim();
    const trimmedWant = wantSummary.trim();
    const nextErrors: typeof errors = {};
    if (!trimmedTitle) nextErrors.title = "請輸入標題";
    if (!trimmedOffer) nextErrors.offerSummary = "請描述你持有的卡牌";
    if (!trimmedWant) nextErrors.wantSummary = "請描述你想交換的卡牌";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const nowIso = new Date().toISOString();
    const record: MyTradeRecord = {
      tradeId: `my_trade_${Date.now().toString(36)}_${Math.floor(Math.random() * 0xffff).toString(36)}`,
      status: "matching",
      updatedAtIso: nowIso,
      title: trimmedTitle,
      game,
      offerSummary: trimmedOffer,
      wantSummary: trimmedWant,
      note: note.trim() || undefined,
      createdAtIso: nowIso,
    };

    try {
      const raw = window.localStorage.getItem(MY_TRADES_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      const list = Array.isArray(parsed) ? parsed : [];
      window.localStorage.setItem(MY_TRADES_KEY, JSON.stringify([record, ...list]));
    } catch {
      setSaveFailed(true);
      return;
    }

    router.push("/trades");
  }

  return (
    <AppShell sidebarItems={defaultSidebarItems}>
      <div style={{ padding: "20px 0 96px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
            <Link href="/trades" style={{ color: "rgba(255,255,255,0.82)", textDecoration: "none", fontSize: 13, fontWeight: 800 }}>
              ← 返回交換
            </Link>
            <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 13, fontWeight: 800 }}>建立新的交換提案</div>
          </div>

          <div
            style={{
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "linear-gradient(180deg, rgba(14,18,26,0.92), rgba(8,10,14,0.92))",
              boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
              padding: "24px 24px 28px",
            }}
          >
            <h1
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 900,
                color: "#ffffff",
                letterSpacing: "-0.36px",
              }}
            >
              建立交換
            </h1>
            <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.60)" }}>
              填寫你持有與想交換的卡牌資訊，送出後即開始配對。
            </div>

            <form onSubmit={handleSubmit} noValidate style={{ marginTop: 18, display: "grid", gap: 16 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label htmlFor="trade-title" style={fieldLabelStyle}>
                  標題 <span style={{ color: "rgba(255,150,160,0.95)" }}>*</span>
                </label>
                <input
                  id="trade-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例如：噴火龍ex 換 古劍豹ex"
                  maxLength={60}
                  style={inputStyle}
                  aria-invalid={!!errors.title}
                />
                {errors.title ? <div style={errorTextStyle}>{errors.title}</div> : null}
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label htmlFor="trade-game" style={fieldLabelStyle}>
                  遊戲分類
                </label>
                <select
                  id="trade-game"
                  value={game}
                  onChange={(e) => setGame(e.target.value as CardGame)}
                  style={{ ...inputStyle, appearance: "none", cursor: "pointer" }}
                >
                  {gameOptions.map((opt) => (
                    <option key={opt.key} value={opt.key} style={{ background: "#10141c", color: "#ffffff" }}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label htmlFor="trade-offer" style={fieldLabelStyle}>
                  我有（描述） <span style={{ color: "rgba(255,150,160,0.95)" }}>*</span>
                </label>
                <textarea
                  id="trade-offer"
                  value={offerSummary}
                  onChange={(e) => setOfferSummary(e.target.value)}
                  placeholder="描述你要拿出來交換的卡牌（名稱、系列、語言、鑑定等）"
                  maxLength={300}
                  style={textareaStyle}
                  aria-invalid={!!errors.offerSummary}
                />
                {errors.offerSummary ? <div style={errorTextStyle}>{errors.offerSummary}</div> : null}
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label htmlFor="trade-want" style={fieldLabelStyle}>
                  我想要（描述） <span style={{ color: "rgba(255,150,160,0.95)" }}>*</span>
                </label>
                <textarea
                  id="trade-want"
                  value={wantSummary}
                  onChange={(e) => setWantSummary(e.target.value)}
                  placeholder="描述你希望換到的卡牌"
                  maxLength={300}
                  style={textareaStyle}
                  aria-invalid={!!errors.wantSummary}
                />
                {errors.wantSummary ? <div style={errorTextStyle}>{errors.wantSummary}</div> : null}
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <label htmlFor="trade-note" style={fieldLabelStyle}>
                  卡況/備註（選填）
                </label>
                <textarea
                  id="trade-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="例如：卡況全新、可補差額、限面交或掛號寄送"
                  maxLength={300}
                  style={{ ...textareaStyle, minHeight: 64 }}
                />
              </div>

              {saveFailed ? <div style={errorTextStyle}>儲存失敗，請確認瀏覽器允許本機儲存後再試一次。</div> : null}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, marginTop: 4 }}>
                <Link href="/trades" style={{ color: "rgba(255,255,255,0.66)", textDecoration: "none", fontSize: 13, fontWeight: 800 }}>
                  取消
                </Link>
                <button
                  className="button-3d button-3d_blue button-3d_sm"
                  data-v-c8c96dbe=""
                  type="submit"
                  style={{ borderRadius: 8, whiteSpace: "nowrap" }}
                >
                  <span className="button-3d__outer" data-v-c8c96dbe="">
                    <span className="button-3d__inner" data-v-c8c96dbe="">
                      <span className="button-3d__text" data-v-c8c96dbe="">
                        送出提案
                      </span>
                    </span>
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
