"use client";

/**
 * 桌機版（768 以上）的頁尾。
 *
 * 為什麼要有這支：主站的頁尾（`components/Footer.tsx`）在 cardx 的路由上是被關掉的
 * （`components/FooterWrapper.tsx` 看到 cardx 路由就 return null），而 cardx 自己的頁尾
 * 原本寫在首頁元件裡、內容還是範本留下的假東西（CardX、support@cardx.example、
 * Discord／Telegram 全連到 /info）。結果是「首頁有一個假頁尾，其他 25 頁完全沒有頁尾」。
 *
 * 這支放進 AppShell，每一頁都吃得到，連結與客服信箱跟主站頁尾同一份。
 */

import Link from "next/link";

const LINKS: { label: string; href: string }[] = [
  { label: "常見問題", href: "/faq" },
  { label: "關於我們", href: "/about" },
  { label: "會員條款", href: "/terms" },
  { label: "隱私權政策", href: "/privacy" },
  { label: "退換貨資訊", href: "/return-policy" },
];

export function CardxFooter() {
  return (
    <footer
      aria-label="頁尾"
      style={{
        marginTop: 40,
        borderTop: "1px solid #e5e7eb",
        background: "#f3f4f6",
        color: "#374151",
      }}
    >
      <div style={{ padding: "16px 24px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 14 }}>
            {LINKS.map((x, i) => (
              <span key={x.href} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                {i > 0 ? <span style={{ color: "#d1d5db" }}>/</span> : null}
                <Link href={x.href} className="cardx-footer-link" style={{ color: "inherit", textDecoration: "none" }}>
                  {x.label}
                </Link>
              </span>
            ))}
          </div>
          <div style={{ fontSize: 14 }}>
            客服信箱：
            <a href="mailto:support@ggb.com.tw" className="cardx-footer-link" style={{ color: "inherit", textDecoration: "none" }}>
              support@ggb.com.tw
            </a>
          </div>
        </div>
        <div style={{ marginTop: 8, textAlign: "center", fontSize: 12, color: "#6b7280" }}>
          © {new Date().getFullYear()} 吉吉比. All Rights Reserved.
        </div>
      </div>
      <style jsx>{`
        .cardx-footer-link:hover {
          color: rgb(var(--primary));
        }
      `}</style>
    </footer>
  );
}

export default CardxFooter;
