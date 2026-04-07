import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// ── Stat block helpers ─────────────────────────────────────────────────────────

export const STAT_BLOCK_ABILITIES = [
  { key: "str", label: "STR" }, { key: "dex", label: "DEX" },
  { key: "con", label: "CON" }, { key: "int", label: "INT" },
  { key: "wis", label: "WIS" }, { key: "cha", label: "CHA" },
] as const;

export function abilityModifier(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function skillsToString(skills?: Record<string, string>): string {
  if (!skills) return "";
  return Object.entries(skills).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", ");
}

export function skillsToRecord(s: string): Record<string, string> {
  const rec: Record<string, string> = {};
  s.split(",").forEach(entry => {
    const match = entry.trim().match(/^(.+?)\s+([+-]\d+)$/);
    if (match) rec[match[1].trim().replace(/ /g, "_")] = match[2];
  });
  return rec;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Carry weight helpers ───────────────────────────────────────────────────────

/** Parse a D&D weight string like "3 lb.", "1/4 lb.", "0.5 lbs." → pounds as a number. */
export function parseWeightLb(weight: string | null | undefined): number {
  if (!weight) return 0;
  const s = weight.toLowerCase().replace(/lbs?\.?/g, "").trim();
  if (s.includes("/")) {
    const [num, den] = s.split("/").map(Number);
    return den ? num / den : 0;
  }
  return parseFloat(s) || 0;
}

/** Races with the Powerful Build trait (carry capacity × 2). Case-insensitive substring match. */
const POWERFUL_BUILD_RACES = ["goliath", "centaur", "firbolg", "bugbear", "orc"];

export function hasPowerfulBuild(race: string | null | undefined): boolean {
  if (!race) return false;
  const r = race.toLowerCase();
  return POWERFUL_BUILD_RACES.some((rb) => r.includes(rb));
}

/**
 * Effective carry capacity in lbs.
 * override expressions: "*2" → base×2, "+30" → base+30, "-10" → base-10,
 * bare number → absolute value. null → use STR-based default.
 */
export function carryCapacity(
  str: number,
  race: string | null | undefined,
  override: string | null | undefined,
): number {
  const base = str * 15 * (hasPowerfulBuild(race) ? 2 : 1);
  if (!override?.trim()) return base;
  const s = override.trim();
  const n = parseFloat(s.slice(1));
  if (s.startsWith("*") && !isNaN(n)) return Math.round(base * n);
  if (s.startsWith("+") && !isNaN(n)) return Math.round(base + n);
  if (s.startsWith("-") && !isNaN(n)) return Math.round(base - n);
  const abs = parseFloat(s);
  return !isNaN(abs) ? Math.round(abs) : base;
}

export function formatWeightLb(w: number): string {
  return w % 1 === 0 ? `${w} lb` : `${w.toFixed(1)} lb`;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

type TiptapNode = { text?: string; content?: TiptapNode[] };

export function extractTiptapText(json: string | null | undefined, maxLength = 160): string {
  if (!json) return "";
  try {
    const doc = JSON.parse(json) as TiptapNode;
    const texts: string[] = [];
    function walk(node: TiptapNode) {
      if (node.text) texts.push(node.text);
      node.content?.forEach(walk);
    }
    walk(doc);
    return texts.join(" ").slice(0, maxLength);
  } catch {
    return "";
  }
}
