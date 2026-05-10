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

// ── Speed helpers ─────────────────────────────────────────────────────────────

export interface SpeedBlock {
  walk?: number;
  fly?: number;
  swim?: number;
  climb?: number;
  burrow?: number;
  hover?: boolean;
}

export function speedToString(speed: SpeedBlock | string | undefined | null): string {
  if (!speed) return "0 ft.";
  if (typeof speed === "string") return speed;
  const parts: string[] = [];
  if (speed.walk) parts.push(`${speed.walk} ft.`);
  if (speed.fly) parts.push(`fly ${speed.fly} ft.${speed.hover ? " (hover)" : ""}`);
  if (speed.swim) parts.push(`swim ${speed.swim} ft.`);
  if (speed.climb) parts.push(`climb ${speed.climb} ft.`);
  if (speed.burrow) parts.push(`burrow ${speed.burrow} ft.`);
  return parts.join(", ") || "0 ft.";
}

export function parseSpeed(s: SpeedBlock | string | undefined | null): SpeedBlock {
  if (!s) return { walk: 30 };
  if (typeof s === "object") return { ...s };
  const result: SpeedBlock = {};
  for (const part of s.split(",").map((p) => p.trim().toLowerCase())) {
    const m = part.match(/^(fly|swim|climb|burrow)?\s*(\d+)\s*ft\.?(\s*\(hover\))?$/);
    if (!m) continue;
    const val = parseInt(m[2], 10);
    const mode = m[1] || "walk";
    if (mode === "walk") result.walk = val;
    else if (mode === "fly") { result.fly = val; if (m[3]) result.hover = true; }
    else if (mode === "swim") result.swim = val;
    else if (mode === "climb") result.climb = val;
    else if (mode === "burrow") result.burrow = val;
  }
  return Object.keys(result).length ? result : { walk: 30 };
}

// ── Carry weight helpers ───────────────────────────────────────────────────────

/** Parse a D&D weight string like "3 lb.", "1/4 lb.", "0.5 lbs." → pounds as a number. */
export function parseWeightLb(weight: number | string | null | undefined): number {
  if (weight === null || weight === undefined) return 0;
  if (typeof weight === "number") return weight;
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

export function signedNum(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function formatChatTimestamp(iso: string, locale?: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const loc = locale?.trim() || undefined;
  try {
    const time = d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" });
    if (isToday) return time;
    return `${d.toLocaleDateString(loc, { month: "short", day: "numeric" })} ${time}`;
  } catch {
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (isToday) return time;
    return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
  }
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

/**
 * Format a D&D hit points string for display.
 * "3d8+6"        → "19 (3d8+6)"
 * "19 (3d8+6)"   → "19 (3d8+6)"  (already formatted — idempotent)
 * "10"           → "10"           (plain number — returned as-is)
 */
export function formatHitPoints(hp: string | null | undefined): string {
  if (!hp) return "—";
  const s = hp.trim();
  if (/^\d+\s*\(/.test(s)) return s; // already "avg (dice)"
  const m = s.match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (m) {
    const avg = Math.floor(parseInt(m[1], 10) * (parseInt(m[2], 10) + 1) / 2 + (m[3] ? parseInt(m[3], 10) : 0));
    return `${avg} (${s})`;
  }
  return s;
}

/** Parse a D&D challenge rating string ("1/4", "1/2", "5", "0") to a number. */
export function parseCr(cr: string | null | undefined): number {
  if (!cr || cr === "0") return 0;
  if (cr.includes("/")) { const [n, d] = cr.split("/"); return Number(n) / Number(d); }
  return parseFloat(cr) || 0;
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
    return json.slice(0, maxLength);
  }
}
