"use client";

import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";

export function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path d="M3 5h18l-7 8v5l-4 2v-7L3 5z" fill="currentColor" opacity="0.88" />
    </svg>
  );
}

export function VendorIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-4.42 0-8 2-8 4.5V21h16v-2.5C20 16 16.42 14 12 14z"
        fill="currentColor"
        opacity="0.88"
      />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PillSelect<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  icon,
  borderless,
  fit,
}: {
  value: T;
  onChange: (next: T) => void;
  options: Array<{ key: T; label: string }>;
  ariaLabel: string;
  icon: ReactNode;
  borderless?: boolean;
  /** 寬度只到最長的那個選項（老闆 2026-09-04：排序下拉不用這麼寬），不用固定寬 */
  fit?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(() => Math.max(0, options.findIndex((o) => o.key === value)));
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.key === value));
  const selectedLabel = options.find((o) => o.key === value)?.label ?? "";

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = wrapRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => setActiveIndex(selectedIndex), 0);
  }, [open, selectedIndex]);

  function ensureActiveVisible(nextIndex: number) {
    const menu = menuRef.current;
    if (!menu) return;
    const row = menu.querySelector<HTMLElement>(`[data-idx="${nextIndex}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }

  function selectIndex(nextIndex: number) {
    const opt = options[nextIndex];
    if (!opt) return;
    onChange(opt.key);
    setOpen(false);
  }

  function onButtonKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen((v) => !v);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      const next = open ? Math.min(activeIndex + 1, options.length - 1) : selectedIndex;
      setActiveIndex(next);
      ensureActiveVisible(next);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const next = open ? Math.max(activeIndex - 1, 0) : selectedIndex;
      setActiveIndex(next);
      ensureActiveVisible(next);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function onMenuKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(activeIndex + 1, options.length - 1);
      setActiveIndex(next);
      ensureActiveVisible(next);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(activeIndex - 1, 0);
      setActiveIndex(next);
      ensureActiveVisible(next);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectIndex(activeIndex);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        flex: "0 1 auto",
        width: fit ? "max-content" : "clamp(160px, 18vw, 220px)",
        minWidth: fit ? 0 : 140,
        maxWidth: fit ? "none" : 240,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 12,
          top: "50%",
          transform: "translateY(-50%)",
          color: "rgba(255, 255, 255, 0.65)",
          pointerEvents: "none",
          display: "grid",
          placeItems: "center",
        }}
      >
        {icon}
      </div>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          right: 12,
          top: "50%",
          transform: "translateY(-50%)",
          color: "rgba(255, 255, 255, 0.7)",
          pointerEvents: "none",
          display: "grid",
          placeItems: "center",
        }}
      >
        <ChevronDownIcon />
      </div>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onKeyDown={onButtonKeyDown}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          height: 38,
          borderRadius: 12,
          border: borderless ? 0 : "1px solid rgba(255, 255, 255, 0.12)",
          background: "rgba(255, 255, 255, 0.06)",
          color: "rgba(255, 255, 255, 0.92)",
          padding: "0 40px 0 44px",
          fontSize: 14,
          fontWeight: 800,
          outline: "none",
          cursor: "pointer",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          userSelect: "none",
        }}
      >
        {fit ? (
          /* 把所有選項疊在同一格、只顯示選中的那個：寬度就是最長的選項，切換時不會跳寬 */
          <span style={{ display: "grid", whiteSpace: "nowrap" }}>
            {options.map((o) => (
              <span key={o.key} style={{ gridArea: "1 / 1", visibility: o.key === value ? "visible" : "hidden" }} aria-hidden={o.key !== value}>
                {o.label}
              </span>
            ))}
          </span>
        ) : (
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedLabel}</span>
        )}
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            right: 0,
            zIndex: 50,
            borderRadius: 14,
            border: "1px solid rgba(255, 255, 255, 0.16)",
            background: "rgba(17, 25, 35, 0.96)",
            boxShadow: "0 14px 40px rgba(0,0,0,0.45)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            padding: 6,
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {options.map((o, idx) => {
            const selected = o.key === value;
            const active = idx === activeIndex;
            return (
              <button
                key={o.key}
                type="button"
                role="option"
                aria-selected={selected}
                data-idx={idx}
                onPointerEnter={() => setActiveIndex(idx)}
                onPointerDown={(e) => {
                  e.preventDefault();
                  selectIndex(idx);
                }}
                style={{
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: "22px 1fr",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 10px",
                  borderRadius: 12,
                  border: active ? "1px solid rgba(255, 255, 255, 0.14)" : "1px solid transparent",
                  background: active ? "rgba(255, 255, 255, 0.07)" : "transparent",
                  color: "rgba(255, 255, 255, 0.92)",
                  fontSize: 15,
                  fontWeight: 850,
                  letterSpacing: "-0.02em",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span style={{ display: "grid", placeItems: "center", color: selected ? "rgba(255, 255, 255, 0.92)" : "transparent" }}>
                  <CheckIcon />
                </span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
