import type { Money } from "@/cardx/lib/types";

export function formatMoney(value: Money): string {
  const formatter = new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: value.currency,
    maximumFractionDigits: value.currency === "TWD" ? 0 : 2,
  });
  return formatter.format(value.amount);
}

