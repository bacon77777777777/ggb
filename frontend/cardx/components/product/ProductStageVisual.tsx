"use client";

/**
 * 桌機商品頁的「舞台」（老闆 2026-09-04）：左邊那個正方形。
 * - 一番賞／自製賞：放商品圖
 * - 轉蛋／盒玩／抽卡：放機台的上半部——機台是 375×466（750/932）的直式畫面，照舞台寬度縮放後
 *   整台放進正方形（以高度為準、左右置中）；機台上的按鈕不畫、也不接任何操作（純展示）。
 * 機台元件全部動態載入：一件商品只用得到其中一台。
 */
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import type { Database } from "@/types/database.types";
import { asset } from "@/lib/asset";
import { MachineLoadingOverlay } from "@/components/ui/MachineLoadingOverlay";
import { skyGradientCss, skyProgressNow } from "@/lib/oceanSky";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];

const MACHINE_W = 375;
const MACHINE_H = Math.round((375 * 932) / 750);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMachine = ComponentType<any>;

const GACHA_MACHINES: Record<string, AnyMachine> = {
  gacha_classic: dynamic(() => import("@/components/shop/GachaMachineVisual").then((m) => m.GachaMachineVisual), { ssr: false }),
  gacha_modern: dynamic(() => import("@/components/shop/GachaMachineModern").then((m) => m.GachaMachineModern), { ssr: false }),
  gacha_retro: dynamic(() => import("@/components/shop/GachaMachineRetro").then((m) => m.GachaMachineRetro), { ssr: false }),
  gacha_mode2: dynamic(() => import("@/components/shop/GachaMachineMode2").then((m) => m.GachaMachineMode2), { ssr: false }),
  gacha_mode3: dynamic(() => import("@/components/shop/GachaMachineMode3").then((m) => m.GachaMachineMode3), { ssr: false }),
  gacha_mode4: dynamic(() => import("@/components/shop/GachaMachineMode4").then((m) => m.GachaMachineMode4), { ssr: false }),
  gacha_mode5: dynamic(() => import("@/components/shop/GachaMachineMode5").then((m) => m.GachaMachineMode5), { ssr: false }),
};

const BLINDBOX_MACHINES: Record<string, AnyMachine> = {
  blindbox_mode2: dynamic(() => import("@/components/shop/BlindboxMachineMode2").then((m) => m.BlindboxMachineMode2), { ssr: false }),
  blindbox_mode3: dynamic(() => import("@/components/shop/BlindboxMachineMode3").then((m) => m.BlindboxMachineMode3), { ssr: false }),
  blindbox_mode4: dynamic(() => import("@/components/shop/BlindboxMachineMode4").then((m) => m.BlindboxMachineMode4), { ssr: false }),
  blindbox_mode5: dynamic(() => import("@/components/shop/BlindboxMachineMode5").then((m) => m.BlindboxMachineMode5), { ssr: false }),
};

const PackShowcase3D = dynamic(() => import("@/components/card/PackShowcase3D"), { ssr: false });

const PACK_STYLES = ["a", "b", "c", "d", "e"];
function randomPackStyles() {
  return Array.from({ length: 9 }, () => PACK_STYLES[Math.floor(Math.random() * PACK_STYLES.length)]);
}

const noop = () => {};

/** 舞台底部操作列的高度（老闆 2026-09-04：立即開抽放在機台下方、同一個舞台裡） */
const CONTROLS_H = 72;

/**
 * pushSignal：每 +1 推一下機台（轉蛋機晃 200ms，照手機 handlePush）。
 * 有接真抽獎的頁面改傳 machineState／onHoleClick 那組，機台就會照演出走；
 * 沒傳的地方（純展示）維持原本只認 pushSignal 的行為。
 */
export function ProductStageVisual({
  product, theme, isSoldOut, controls, pushSignal = 0, fillHeight = false,
  machineState, shakeRepeats, pushSoundMode, hasHighTierPending, disableButtons, onHoleClick,
}: {
  product: ProductRow;
  theme: string | null;
  isSoldOut: boolean;
  controls?: ReactNode;
  pushSignal?: number;
  /** 桌機：容器吃父層高度（滿高）而不是正方形，機台照高度 fit、置中 */
  fillHeight?: boolean;
  /** 抽獎演出狀態（useGachaDraw）。沒給就只吃 pushSignal 的晃動 */
  machineState?: "idle" | "shaking" | "spinning" | "dropping" | "waiting" | "result";
  shakeRepeats?: number;
  pushSoundMode?: "manual" | "auto";
  /** 金蛋（大賞或試試看） */
  hasHighTierPending?: boolean;
  disableButtons?: boolean;
  /** 點取物口看結果 */
  onHoleClick?: () => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const width = size.w;
  const [loaded, setLoaded] = useState(false);
  const [gachaState, setGachaState] = useState<"idle" | "shaking">("idle");
  /* 蛋箱裡的商品圖：預設顯示，點一下收起看機台、再點一下回來（跟手機頁同一個手感） */
  const [showProductImage, setShowProductImage] = useState(true);
  useEffect(() => {
    if (!pushSignal) return;
    setGachaState("shaking");
    const t = window.setTimeout(() => setGachaState("idle"), 200);
    return () => window.clearTimeout(t);
  }, [pushSignal]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = product as any;
  const image = product.image_url || asset(`/images/item/${String(product.id).padStart(5, "0")}.jpg`);
  const packStyles = useMemo(randomPackStyles, [product.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    return () => ro.disconnect();
  }, []);

  // 外部有接抽獎就照它的狀態演，沒有就只有「推一下」的晃動
  const liveState = machineState ?? gachaState;

  let kind: "image" | "gacha" | "blindbox" | "card" = "image";
  let Machine: AnyMachine | null = null;
  if (product.type === "gacha") {
    Machine = GACHA_MACHINES[theme || "gacha_classic"] ?? GACHA_MACHINES.gacha_classic;
    kind = "gacha";
  } else if (product.type === "blindbox" && theme && BLINDBOX_MACHINES[theme]) {
    Machine = BLINDBOX_MACHINES[theme];
    kind = "blindbox";
  } else if (product.type === "card") {
    kind = "card";
  }

  // fit 高度（老闆 2026-09-04）：整台機台放進正方形——舞台是正方形，所以照高度縮、左右置中
  const bottomInset = controls ? CONTROLS_H : 0;
  const boxH = fillHeight ? size.h : width; // 滿高模式吃容器實際高度；否則是正方形
  const stageH = Math.max(0, boxH - bottomInset);
  // fit 高度，但寬度不夠時改以寬度為準（窄視窗）；機台在舞台區裡置中
  const scale = width > 0 && stageH > 0 ? Math.min(stageH / MACHINE_H, width / MACHINE_W) : 0;
  const machineLeft = Math.round((width - MACHINE_W * scale) / 2);
  const machineTop = Math.round((stageH - MACHINE_H * scale) / 2);
  const useCustomPack = p.pack_style === "custom";

  return (
    <div
      ref={boxRef}
      style={{
        position: "relative",
        width: "100%",
        ...(fillHeight ? { height: "100%" } : { aspectRatio: "1 / 1" }),
        overflow: "hidden",
        borderRadius: 16,
        background: kind === "card" ? skyGradientCss(skyProgressNow()) : "#f3f4f6",
      }}
    >
      {kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={product.name} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: stageH || "100%", objectFit: "contain" }} />
      ) : null}

      {kind !== "image" && scale > 0 ? (
        <div style={{ position: "absolute", top: machineTop, left: machineLeft, width: MACHINE_W, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <div style={{ position: "relative", width: MACHINE_W, height: MACHINE_H }}>
            {kind === "gacha" && Machine ? (
              <>
                <Machine
                  state={liveState}
                  shakeRepeats={shakeRepeats ?? 1}
                  pushSoundMode={pushSoundMode ?? "manual"}
                  hideButtons
                  disableButtons={disableButtons ?? true}
                  hasHighTierPending={hasHighTierPending}
                  onHoleClick={onHoleClick}
                  isSoldOut={isSoldOut}
                  onLoaded={() => setLoaded(true)}
                />
                {/* 蛋箱裡的商品圖：預設顯示，點一下收起、再點一下又出現（座標照手機版的 375 寬機台框）。
                    收起後留一塊透明的點擊區在原位，不然圖藏起來就沒有東西可以點回來 */}
                <div
                  onClick={() => setShowProductImage((v) => !v)}
                  style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: 30, width: 232, height: 200, zIndex: 20, cursor: "pointer", opacity: showProductImage ? 1 : 0, transition: "opacity 200ms ease-out" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }} />
                </div>
              </>
            ) : null}
            {kind === "blindbox" && Machine ? (
              <>
                <Machine
                  machineState="idle"
                  drawCount={0}
                  boxImageUrl={p.box_image_url ?? undefined}
                  remaining={product.remaining ?? 10}
                  onPush={noop}
                  onPurchase={noop}
                  onTrial={noop}
                  isSoldOut={isSoldOut}
                  onLoaded={() => setLoaded(true)}
                />
                {theme === "blindbox_mode5" ? (
                  <div
                    onClick={() => setShowProductImage((v) => !v)}
                    style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: 112, width: 232, height: 190, zIndex: 20, cursor: "pointer", opacity: showProductImage ? 1 : 0, transition: "opacity 200ms ease-out" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }} />
                  </div>
                ) : null}
              </>
            ) : null}
            {kind === "card" ? (
              <PackShowcase3D
                packStyles={packStyles}
                height={MACHINE_H}
                frontImage={useCustomPack ? p.pack_front_image_url || product.image_url || undefined : undefined}
                backImage={useCustomPack ? p.pack_back_image_url || undefined : undefined}
                onReady={() => setLoaded(true)}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {kind !== "image" ? <MachineLoadingOverlay show={!loaded} /> : null}

      {/* 操作列靠下對齊、底下留 12：內容比 CONTROLS_H 高的時候（按鈕上面多一顆「N 人正在看」）
          多出來的往上溢出蓋到機台（老闆 2026-09-04 說沒關係），按鈕本身才不會被舞台底邊切掉 */}
      {controls ? (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: CONTROLS_H, zIndex: 40, display: "flex", alignItems: "flex-end", padding: "0 16px 12px", background: "linear-gradient(180deg, rgba(243,244,246,0) 0%, rgba(243,244,246,0.92) 40%, #f3f4f6 100%)" }}>
          {controls}
        </div>
      ) : null}

      {isSoldOut ? (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: stageH || "100%", zIndex: 30, display: "grid", placeItems: "center", background: "rgba(249,250,251,0.72)" }}>
          <span style={{ padding: "8px 18px", borderRadius: 999, background: "#111827", color: "#fff", fontSize: 14, fontWeight: 900, boxShadow: "0 10px 40px -10px rgba(0,0,0,0.2)" }}>已完抽</span>
        </div>
      ) : null}
    </div>
  );
}
