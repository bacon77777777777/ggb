"use client";

import type { CardGame } from "@/cardx/lib/types";
import styles from "./CategoryTabs.module.css";

export type CategoryTabValue = CardGame;

type Tab = {
  value: CategoryTabValue;
  label: string;
  icon: string;
  count?: string;
};

const tabs: Tab[] = [
  { value: "pokemon", label: "寶可夢", icon: "🎮", count: "12k" },
  { value: "onepiece", label: "海賊王", icon: "❤️" },
  { value: "yugioh", label: "遊戲王", icon: "🦊" },
  { value: "comic", label: "漫畫", icon: "🍒" },
  { value: "sports", label: "棒球", icon: "🔴" },
  { value: "other", label: "其他", icon: "🎲" },
];

type Props = {
  value: CategoryTabValue;
  onChange: (value: CategoryTabValue) => void;
};

export function CategoryTabs({ value, onChange }: Props) {
  return (
    <div className={styles.container}>
      <div className={styles.wrap} role="tablist" aria-label="分類">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            className={`${styles.tab} ${t.value === value ? styles.tabActive : ""}`}
            role="tab"
            aria-selected={t.value === value}
            onClick={() => onChange(t.value)}
          >
            <span className={styles.icon}>{t.icon}</span>
            <span className={styles.legacy}>{t.label}</span>
            {t.count && <span className={styles.count}>{t.count}</span>}
          </button>
        ))}
      </div>
      <div className={styles.search}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" placeholder="搜尋" />
      </div>
    </div>
  );
}
