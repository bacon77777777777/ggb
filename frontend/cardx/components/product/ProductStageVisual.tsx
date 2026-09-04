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

/** pushSignal：每 +1 推一下機台（轉蛋機晃 200ms，照手機 handlePush） */export function ProductStageVisual({ product, theme, isSoldOut, controls, pushSignal = 0 }: { product: ProductRow; theme: string | null; isSoldOut: boolean; controls?: ReactNode; pushSignal?: number }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [gachaState, setGachaState] = useState<"idle" | "shaking">("idle");
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
      for (const e of entries) setWidth(Math.round(e.contentRect.width));
    });
    ro.observe(el);
    setWidth(Math.round(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

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
  const stageH = Math.max(0, width - bottomInset);
  const scale = width > 0 ? stageH / MACHINE_H : 0;
  const machineLeft = width > 0 ? Math.round((width - MACHINE_W * scale) / 2) : 0;
  const useCustomPack = p.pack_style === "custom";

  return (
    <div
      ref={boxRef}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "1 / 1",
        overflow: "hidden",
        borderRadius: 16,
        background: kind === "card" ? skyGradientCss(skyProgressNow()) : "#1c2532",
      }}
    >
      {kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={product.name} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: stageH || "100%", objectFit: "contain" }} />
      ) : null}

      {kind !== "image" && scale > 0 ? (
        <div style={{ position: "absolute", top: 0, left: machineLeft, width: MACHINE_W, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <div style={{ position: "relative", width: MACHINE_W, height: MACHINE_H }}>
            {kind === "gacha" && Machine ? (
              <>
                <Machine state={gachaState} shakeRepeats={1} pushSoundMode="manual" hideButtons disableButtons isSoldOut={isSoldOut} onLoaded={() => setLoaded(true)} />
                {/* 蛋箱裡的商品圖：手機版預設就顯示，座標照它（375 寬的機台框） */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt="" style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: 30, width: 232, height: 200, objectFit: "contain", zIndex: 20, pointerEvents: "none" }} />
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
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt="" style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: 112, width: 232, height: 190, objectFit: "contain", zIndex: 20, pointerEvents: "none" }} />
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

      {controls ? (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: CONTROLS_H, zIndex: 40, display: "flex", alignItems: "center", padding: "0 16px", background: "linear-gradient(180deg, rgba(28,37,50,0) 0%, rgba(28,37,50,0.92) 40%, #1c2532 100%)" }}>
          {controls}
        </div>
      ) : null}

      {isSoldOut ? (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: stageH || "100%", zIndex: 30, display: "grid", placeItems: "center", background: "rgba(0,0,0,0.45)" }}>
          <span style={{ padding: "8px 18px", borderRadius: 999, background: "rgba(0,0,0,0.7)", color: "#fff", fontSize: 14, fontWeight: 900 }}>已完抽</span>
        </div>
      ) : null}
    </div>
  );
}
