import type { CoinKey } from "@/types/downtime.types";

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

/**
 * Parse freeform price text like "5 gp", "1 gp 5 sp", "150 gold" or "1,500 gp" into structured
 * coins. Thousands separators are part of the number: library costs ("1,500 gp" plate) and
 * invented items' costs are written with them.
 */
export function parseCoinText(text: string): Record<CoinKey, number> {
  const t = text.toLowerCase();
  const match = (pattern: RegExp) => {
    const m = t.match(pattern);
    return m ? parseInt(m[1].replace(/,/g, ""), 10) : 0;
  };
  const n = String.raw`(\d{1,3}(?:,\d{3})+|\d+)`;
  return {
    pp: match(new RegExp(`${n}\\s*pp`)),
    gp: match(new RegExp(`${n}\\s*(?:gp|gold)`)),
    ep: match(new RegExp(`${n}\\s*ep`)),
    sp: match(new RegExp(`${n}\\s*(?:sp|silver)`)),
    cp: match(new RegExp(`${n}\\s*(?:cp|copper)`)),
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
