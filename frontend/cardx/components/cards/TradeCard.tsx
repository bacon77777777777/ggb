"use client";

import type { TradePreview } from "@/cardx/lib/types";
import styles from "./TradeCard.module.css";

type Props = {
  trade: TradePreview;
};

function formatUpdatedAt(iso: string) {
  const d = new Date(iso);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi} UTC`;
}

export function TradeCard({ trade }: Props) {
  return (
    <article className={styles.card}>
      <div className={styles.title}>{trade.title}</div>
      <div className={styles.row}>
        <div className={styles.label}>提供</div>
        <div className={styles.value}>{trade.offerSummary}</div>
      </div>
      <div className={styles.row}>
        <div className={styles.label}>想要</div>
        <div className={styles.value}>{trade.wantSummary}</div>
      </div>
      <div className={styles.meta}>
        <span>{trade.game}</span>
        <span>{formatUpdatedAt(trade.updatedAtIso)}</span>
      </div>
    </article>
  );
}
