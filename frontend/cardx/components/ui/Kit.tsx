"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

export function PageHeader({
  title,
  iconSrc = "/cardx/placeholder.svg",
  right,
  subtitle,
}: {
  title: string;
  iconSrc?: string;
  right?: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexShrink: 0,
        alignItems: "center",
        alignSelf: "stretch",
        justifyContent: "space-between",
        paddingTop: 4,
        paddingBottom: 4,
        gap: 16,
        flexWrap: "nowrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", width: "auto", minWidth: 0, flex: "1 1 auto" }}>
        <div style={{ display: "flex", alignItems: "center", paddingRight: 1, paddingLeft: 1, overflow: "hidden" }}>
          <img alt="" src={iconSrc} style={{ width: 23, height: 24, overflow: "hidden" }} />
        </div>
        <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
          <h1
            style={{
              display: "flex",
              alignItems: "center",
              margin: "0 0 0 8px",
              width: "auto",
              height: 24,
              lineHeight: "24px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              letterSpacing: "-0.36px",
              color: "#111827",
              fontFamily: 'Montserrat, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", SimHei, Arial, Helvetica, sans-serif',
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            {title}
          </h1>
          {subtitle ? <div style={{ marginLeft: 8, fontSize: 12, fontWeight: 800, color: "#6b7280" }}>{subtitle}</div> : null}
        </div>
      </div>
      {right ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "nowrap", justifyContent: "flex-end", flex: "0 0 auto", minWidth: 0, height: 38 }}>
          {right}
        </div>
      ) : null}
    </div>
  );
}

export function SurfaceCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div style={{ borderRadius: 18, border: 0, background: "#ffffff", boxShadow: "0 0 0 1px #e5e7eb, 0 10px 40px -10px rgba(0,0,0,0.08)", padding: 14, ...style }}>{children}</div>
  );
}

export function SurfaceRowLink({
  href,
  children,
  style,
}: {
  href: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <Link
      href={href}
      style={{
        borderRadius: 16,
        background: "#f3f4f6",
        padding: 12,
        textDecoration: "none",
        color: "inherit",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        ...style,
      }}
    >
      {children}
    </Link>
  );
}

export function Pill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "success" | "danger" | "info";
}) {
  const palette =
    tone === "success"
      ? { bg: "rgba(16, 185, 129, 0.14)", fg: "#047857" }
      : tone === "danger"
        ? { bg: "rgba(220, 38, 38, 0.12)", fg: "#dc2626" }
        : tone === "info"
          ? { bg: "rgba(34, 131, 246, 0.14)", fg: "#1d4ed8" }
          : { bg: "#f3f4f6", fg: "#374151" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 28,
        padding: "0 10px",
        borderRadius: 999,
        background: palette.bg,
        color: palette.fg,
        fontSize: 12,
        fontWeight: 900,
        letterSpacing: "-0.2px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function SecondaryButton({
  children,
  onClick,
  href,
  style,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  style?: CSSProperties;
  disabled?: boolean;
}) {
  const base: CSSProperties = {
    height: 38,
    borderRadius: 12,
    border: 0,
    background: "#f3f4f6",
    color: "#374151",
    fontSize: 13,
    fontWeight: 900,
    cursor: "pointer",
    padding: "0 12px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    opacity: disabled ? 0.55 : 1,
    pointerEvents: disabled ? "none" : undefined,
    ...style,
  };

  if (href) {
    return (
      <Link href={href} style={base}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} style={base} disabled={disabled}>
      {children}
    </button>
  );
}

export function Button3D({
  children,
  color = "red",
  onClick,
  href,
  disabled,
  style,
}: {
  children: ReactNode;
  color?: "red" | "blue" | "green";
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  const className = `button-3d button-3d_${color} button-3d_sm`;
  const rootProps = {
    className,
    "data-v-c8c96dbe": "",
    style: { height: 46, borderRadius: 14, ...style } as CSSProperties,
  };

  const inner = (
    <span className="button-3d__outer" data-v-c8c96dbe="">
      <span className="button-3d__inner" data-v-c8c96dbe="">
        <span className="button-3d__text" data-v-c8c96dbe="">
          {children}
        </span>
      </span>
    </span>
  );

  if (href) {
    return (
      <Link href={href} {...rootProps} aria-disabled={disabled} style={{ ...rootProps.style, opacity: disabled ? 0.55 : rootProps.style.opacity, pointerEvents: disabled ? "none" : undefined }}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} {...rootProps}>
      {inner}
    </button>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 850, color: "#6b7280" }}>{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        style={{
          width: "100%",
          height: 40,
          borderRadius: 12,
          border: 0,
          background: "#f3f4f6",
          color: "#111827",
          padding: "0 12px",
          fontSize: 14,
          fontWeight: 800,
          outline: "none",
        }}
      />
    </div>
  );
}

export function KeyValueRow({
  label,
  value,
}: {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 850, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 950, color: "#111827", textAlign: "right" }}>{value}</div>
    </div>
  );
}

