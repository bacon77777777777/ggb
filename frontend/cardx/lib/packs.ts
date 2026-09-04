export type PackVendorKey = "pokemon" | "onepiece" | "yugioh" | "basketball" | "baseball" | "comic" | "other";

export type PackTopHit = {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  price: number;
};

export type PackPrizeTier = {
  key: "A" | "B" | "C" | "D";
  label: string;
  count: number;
};

export type PackSimilarItem = {
  id: string;
  title: string;
  imageUrl: string;
  price: number;
  remaining: string;
  game: PackVendorKey;
};

export const PACK_PLACEHOLDER_IMAGE = "/cardx/placeholder.svg";

const games: PackVendorKey[] = ["pokemon", "onepiece", "yugioh", "basketball", "baseball", "comic", "other"];

const vendorLabels: Record<PackVendorKey, string> = {
  pokemon: "寶可夢",
  onepiece: "海賊王",
  yugioh: "遊戲王",
  basketball: "籃球",
  baseball: "棒球",
  comic: "漫畫",
  other: "其他",
};

export function stableSeedFromString(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeHex(seed: number, length: number) {
  let out = "";
  let s = seed >>> 0;
  while (out.length < length) {
    s = Math.imul(s ^ (s >>> 15), 2246822507) >>> 0;
    s = Math.imul(s ^ (s >>> 13), 3266489909) >>> 0;
    const chunk = (s >>> 0).toString(16).padStart(8, "0");
    out += chunk;
  }
  return out.slice(0, length);
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), 1 | x);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function computePrizePositions(txid: string, total: number, tiers: PackPrizeTier[]) {
  const seed = stableSeedFromString(`txid:${txid}`);
  const rand = mulberry32(seed);
  const positions = Array.from({ length: total }, (_, i) => i + 1);
  for (let i = positions.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = positions[i]!;
    positions[i] = positions[j]!;
    positions[j] = tmp;
  }

  const out: Record<string, number[]> = {};
  let cursor = 0;
  for (const t of tiers) {
    const slice = positions.slice(cursor, cursor + t.count);
    slice.sort((a, b) => a - b);
    out[t.key] = slice;
    cursor += t.count;
  }
  return out;
}

export type PackDetail = {
  id: string;
  title: string;
  gameLabel: string;
  imageUrl: string;
  price: number;
  priceMoney: { amount: number; currency: "TWD" };
  payoutPct: number;
  odds: Array<{ tier: string; chance: number }>;
  topHits: PackTopHit[];
  similar: PackSimilarItem[];
  totalPacks: number;
  openedPacks: number;
  soldOut: boolean;
  txid: string;
  txidHash: string;
  prizeTiers: PackPrizeTier[];
  prizePositions: Record<string, number[]> | null;
};

export function makePackDetail(id: string): PackDetail {
  const seed = stableSeedFromString(id);
  const game = games[seed % games.length]!;
  const vendorLabel = vendorLabels[game] ?? "卡包";
  const imageUrl = PACK_PLACEHOLDER_IMAGE;
  const price = 149 + (seed % 5) * 50;
  const payout = 85 + (seed % 10);
  const totalPacks = 80;
  const openedPacks = seed % (totalPacks + 1);
  const soldOut = openedPacks >= totalPacks;
  const txid = makeHex(stableSeedFromString(`txid:${id}`), 64);
  const txidHash = makeHex(stableSeedFromString(`txidHash:${txid}`), 64);
  const prizeTiers: PackPrizeTier[] = [
    { key: "A", label: "A賞", count: 1 },
    { key: "B", label: "B賞", count: 2 },
    { key: "C", label: "C賞", count: 3 },
    { key: "D", label: "D賞", count: totalPacks - 1 - 2 - 3 },
  ];
  const prizePositions = soldOut ? computePrizePositions(txid, totalPacks, prizeTiers) : null;

  const odds = [
    { tier: "Top Hit", chance: 0.5 + (seed % 6) * 0.2 },
    { tier: "S", chance: 2 + (seed % 6) * 0.5 },
    { tier: "A", chance: 12 + (seed % 5) * 2 },
    { tier: "B", chance: 30 + (seed % 6) * 2 },
    { tier: "C", chance: 100 },
  ];
  const oddsNormalized = (() => {
    const fixed = odds.slice(0, -1);
    const sum = fixed.reduce((acc, x) => acc + x.chance, 0);
    const last = Math.max(0.5, 100 - sum);
    return [...fixed, { tier: "C", chance: last }];
  })();

  const topHits: PackTopHit[] = Array.from({ length: 6 }, (_, i) => {
    const base = 1200 + ((seed + i * 97) % 12) * 380;
    return {
      id: `hit_${i + 1}`,
      title: ["2023 Pokémon", "2022 Pokémon", "2021 Pokémon", "2020 Pokémon", "2019 Pokémon", "2018 Pokémon"][i] ?? "Pokémon",
      subtitle: ["超稀有卡", "特選卡", "高評級卡", "限定卡", "收藏卡", "TOP HIT"][i] ?? "Top Hit",
      imageUrl: PACK_PLACEHOLDER_IMAGE,
      price: base,
    };
  });

  const similar: PackSimilarItem[] = Array.from({ length: 8 }, (_, i) => {
    const sid = `pack_${String(((seed + i) % 120) + 1).padStart(3, "0")}`;
    const sseed = stableSeedFromString(sid);
    const sgame = games[sseed % games.length]!;
    const sprice = 149 + (sseed % 5) * 50;
    return {
      id: sid,
      title: `【卡包】${vendorLabels[sgame] ?? "卡包"}（隨機一抽）`,
      imageUrl: PACK_PLACEHOLDER_IMAGE,
      price: sprice,
      remaining: `${1 + (sseed % 78)}/80`,
      game: sgame,
    };
  });

  return {
    id,
    title: `Rookie Pack · ${vendorLabel}`,
    gameLabel: vendorLabel,
    imageUrl,
    price,
    priceMoney: { amount: price, currency: "TWD" as const },
    payoutPct: payout,
    odds: oddsNormalized,
    topHits,
    similar,
    totalPacks,
    openedPacks,
    soldOut,
    txid,
    txidHash,
    prizeTiers,
    prizePositions,
  };
}
