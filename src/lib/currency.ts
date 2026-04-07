export type CoinKey = "pp" | "gp" | "ep" | "sp" | "cp";

export const COINS: { key: CoinKey; label: string; symbol: string; color: string }[] = [
  { key: "pp", label: "Platinum", symbol: "PP", color: "text-slate-300" },
  { key: "gp", label: "Gold",     symbol: "GP", color: "text-gold-500"  },
  { key: "ep", label: "Electrum", symbol: "EP", color: "text-teal-400"  },
  { key: "sp", label: "Silver",   symbol: "SP", color: "text-slate-400" },
  { key: "cp", label: "Copper",   symbol: "CP", color: "text-amber-600" },
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
