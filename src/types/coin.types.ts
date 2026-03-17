export type CoinMetalId = "copper" | "silver" | "electrum" | "gold" | "platinum";

export interface CoinMetal {
  id: CoinMetalId;
  label: string;
  denom: string; // default denomination abbreviation
  face: string;
  rim: string;
  light: string;
  dark: string;
  text: string;
}

export const COIN_METALS: CoinMetal[] = [
  { id: "copper",   label: "Copper",   denom: "CP", face: "#c08040", rim: "#7a4b1a", light: "#e8a060", dark: "#5a3010", text: "#3d1a00" },
  { id: "silver",   label: "Silver",   denom: "SP", face: "#b8bcc4", rim: "#6c7280", light: "#dcdfe5", dark: "#4c5060", text: "#1a1d25" },
  { id: "electrum", label: "Electrum", denom: "EP", face: "#b8b870", rim: "#7a7a40", light: "#d8d890", dark: "#5a5a28", text: "#2a2a00" },
  { id: "gold",     label: "Gold",     denom: "GP", face: "#d4a017", rim: "#8b6a10", light: "#f0c040", dark: "#6a4800", text: "#3d2800" },
  { id: "platinum", label: "Platinum", denom: "PP", face: "#d0d0dc", rim: "#8a8a9a", light: "#ebebf5", dark: "#5a5a70", text: "#1a1a2a" },
];

export type CoinPrintSizeId = "small" | "standard" | "large";

export const COIN_PRINT_SIZES = [
  { id: "small"    as CoinPrintSizeId, label: "Small",    mm: 24, cols: 7, rows: 10, perSheet: 70  },
  { id: "standard" as CoinPrintSizeId, label: "Standard", mm: 30, cols: 6, rows: 8,  perSheet: 48  },
  { id: "large"    as CoinPrintSizeId, label: "Large",    mm: 38, cols: 5, rows: 7,  perSheet: 35  },
];

export interface CoinMotif {
  id: string;
  label: string;
  symbol: string; // unicode char rendered as SVG text
}

// \uFE0E forces text (not emoji) rendering. Symbols chosen to render cleanly
// as monochrome outlines at large sizes in SVG.
export const COIN_MOTIFS: CoinMotif[] = [
  { id: "none",    label: "None",    symbol: ""         },
  { id: "crown",   label: "Crown",   symbol: "♔\uFE0E" },
  { id: "cross",   label: "Cross",   symbol: "✠\uFE0E" },
  { id: "fleur",   label: "Fleur",   symbol: "⚜\uFE0E" },
  { id: "star",    label: "Star",    symbol: "★\uFE0E" },
  { id: "anchor",  label: "Anchor",  symbol: "⚓\uFE0E" },
  { id: "moon",    label: "Moon",    symbol: "☽\uFE0E" },
  { id: "diamond", label: "Diamond", symbol: "◆\uFE0E" },
  { id: "omega",   label: "Omega",   symbol: "Ω"       },
  { id: "knight",  label: "Knight",  symbol: "♞\uFE0E" },
];

export interface CoinDesign {
  metal: CoinMetalId;
  motif: string;        // motif id
  value: string;
  denomination: string;
  rimText: string;
  printSize: CoinPrintSizeId;
}
