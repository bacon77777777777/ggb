"use client";

import Link from "next/link";
import styles from "./Section.module.css";

type Props = {
  title: string;
  href: string;
  children: React.ReactNode;
  icon?: string;
  count?: string;
};

export function Section({ title, href, children, icon, count }: Props) {
  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div className={styles.titleWrap}>
          {icon && <span className={styles.icon}>{icon}</span>}
          <h2 className={styles.title}>{title}</h2>
        </div>
        <div className={styles.actions}>
          <Link className={styles.more} href={href}>
            全部 {count || "100+"}
          </Link>
          <div className={styles.navButtons}>
            <button className={styles.navBtn} aria-label="上一頁">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <button className={styles.navBtn} aria-label="下一頁">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
        </div>
      </div>
      {children}
    </section>
  );
}
