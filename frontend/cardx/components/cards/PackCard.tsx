"use client";

import Image from "next/image";
import type { PackPreview } from "@/cardx/lib/types";
import { formatMoney } from "@/cardx/components/ui/money";
import styles from "./PackCard.module.css";

type Props = {
  pack: PackPreview;
};

export function PackCard({ pack }: Props) {
  return (
    <article className={styles.card}>
      <div className={styles.media}>
        <Image
          className={styles.image}
          src={pack.imageUrl}
          alt={pack.title}
          width={520}
          height={292}
          sizes="(max-width: 520px) 92vw, (max-width: 1023px) 44vw, 28vw"
        />
      </div>
      <div className={styles.body}>
        <div className={styles.title}>{pack.title}</div>
        <div className={styles.row}>
          <div className={styles.price}>{formatMoney(pack.price)}</div>
          <div className={styles.tag}>卡包</div>
        </div>
      </div>
    </article>
  );
}
