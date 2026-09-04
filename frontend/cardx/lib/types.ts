export type CardGame =
  | "pokemon"
  | "onepiece"
  | "yugioh"
  | "sports"
  | "comic"
  | "other";

export type CurrencyCode = "TWD" | "USD";

export type Money = {
  amount: number;
  currency: CurrencyCode;
};

export type ProductListingPreview = {
  id: string;
  title: string;
  imageUrl: string;
  price: Money;
  fmv?: Money;
  isFavorited?: boolean;
  game: CardGame;
};

export type TradePreview = {
  id: string;
  title: string;
  offerSummary: string;
  wantSummary: string;
  updatedAtIso: string;
  game: CardGame;
};

export type PackPreview = {
  id: string;
  title: string;
  imageUrl: string;
  price: Money;
  game: CardGame;
};

export type SidebarItem =
  | { kind: "link"; label: string; href: string; disabled?: boolean }
  | { kind: "divider" };
