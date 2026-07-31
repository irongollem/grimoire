export type CoinKey = "pp" | "gp" | "ep" | "sp" | "cp";

export const COINS: { key: CoinKey; label: string; symbol: string; color: string; hexColor: string }[] = [
  { key: "pp", label: "Platinum", symbol: "PP", color: "text-slate-300", hexColor: "#a855f7" },
  { key: "gp", label: "Gold",     symbol: "GP", color: "text-gold-500",  hexColor: "#f59e0b" },
  { key: "ep", label: "Electrum", symbol: "EP", color: "text-teal-400",  hexColor: "#60a5fa" },
  { key: "sp", label: "Silver",   symbol: "SP", color: "text-slate-400", hexColor: "#9ca3af" },
  { key: "cp", label: "Copper",   symbol: "CP", color: "text-amber-600", hexColor: "#b45309" },
];

export function toCP(pp: number, gp: number, ep: number, sp: number, cp: number): number {
  return pp * 1000 + gp * 100 + ep * 50 + sp * 10 + cp;
}

/** Greedy reconversion PP→GP→SP→CP (EP omitted intentionally). */
export function fromCP(totalCp: number): { pp: number; gp: number; ep: number; sp: number; cp: number } {
  const pp = Math.floor(totalCp / 1000); totalCp %= 1000;
  const gp = Math.floor(totalCp / 100);  totalCp %= 100;
  const sp = Math.floor(totalCp / 10);   totalCp %= 10;
  return { pp, gp, ep: 0, sp, cp: totalCp };
}

/** Parse freeform price text like "5 gp", "1 gp 5 sp", "150 gold" into structured coins. */
export function parseCoinText(text: string): Record<CoinKey, number> {
  const t = text.toLowerCase();
  const match = (pattern: RegExp) => { const m = t.match(pattern); return m ? parseInt(m[1]) : 0; };
  return {
    pp: match(/(\d+)\s*pp/),
    gp: match(/(\d+)\s*(?:gp|gold)/),
    ep: match(/(\d+)\s*ep/),
    sp: match(/(\d+)\s*(?:sp|silver)/),
    cp: match(/(\d+)\s*(?:cp|copper)/),
  };
}

/** Format a coin set into a human-readable parts array, e.g. ["5 GP", "3 SP"]. */
export function formatCoinParts(pp: number, gp: number, ep: number, sp: number, cp: number): string[] {
  const parts: string[] = [];
  if (pp) parts.push(`${pp} PP`);
  if (gp) parts.push(`${gp} GP`);
  if (ep) parts.push(`${ep} EP`);
  if (sp) parts.push(`${sp} SP`);
  if (cp) parts.push(`${cp} CP`);
  return parts;
}
