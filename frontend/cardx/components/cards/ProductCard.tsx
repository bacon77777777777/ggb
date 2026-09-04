"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import type { ProductListingPreview } from "@/cardx/lib/types";
import { formatMoney } from "@/cardx/components/ui/money";
import styles from "./ProductCard.module.css";

type Props = {
  product: ProductListingPreview;
};

export function ProductCard({ product }: Props) {
  const router = useRouter();
  const price = formatMoney(product.price);
  const fmv = product.fmv ? formatMoney(product.fmv) : null;

  return (
    <article
      className={styles.card}
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/market/${product.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") router.push(`/market/${product.id}`);
      }}
    >
      <div className={styles.media}>
        <Image
          className={styles.image}
          src={product.imageUrl}
          alt={product.title}
          width={380}
          height={380}
          sizes="(max-width: 520px) 92vw, (max-width: 1023px) 44vw, 28vw"
        />
      </div>
      <div className={styles.body}>
        <div className={styles.titleRow}>
          <div className={styles.title}>{product.title}</div>
          <button
            className={styles.favButton}
            type="button"
            aria-label="收藏"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <span aria-hidden>♡</span>
          </button>
        </div>
        <div className={styles.priceRow}>
          <div className={styles.price}>{price}</div>
          {fmv ? (
            <div className={styles.fmv}>
              <span className={styles.fmvLabel}>FMV</span>
              <span className={styles.fmvValue}>{fmv}</span>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
