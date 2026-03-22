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
