import type { Npc } from "./npc.types";
import type { Monster } from "./monster.types";
import type { Item } from "./item.types";
import type { Spell } from "./spell.types";
import type { DowntimeActivity } from "./downtime.types";

export type CardSubject =
  | { kind: "npc"; data: Npc }
  | { kind: "monster"; data: Monster }
  | { kind: "item"; data: Item }
  | { kind: "spell"; data: Spell }
  | { kind: "downtime"; data: DowntimeActivity };

/**
 * A subject's stable identifier.
 *
 * The four entity kinds are DB rows keyed by `id`; a downtime archetype is
 * static catalog data keyed by `key` (which is also what `downtime_draws.
 * activity_key` stores). Rather than bolt a duplicate `id` onto
 * `DowntimeActivity` — inviting it to drift from `activity_key` — the mismatch
 * is resolved in this one place.
 */
export function cardSubjectId(subject: CardSubject): string {
  return subject.kind === "downtime" ? subject.data.key : subject.data.id;
}

export const MONSTER_COLORS: Record<string, string> = {
  aberration: "#3D1A5C",
  beast: "#1A3D1A",
  celestial: "#1A2A5C",
  construct: "#3D3328",
  dragon: "#6B1C1C",
  elemental: "#5C3A1A",
  fey: "#1A3D3A",
  fiend: "#4A1414",
  giant: "#3D2B1A",
  humanoid: "#1C2A4A",
  monstrosity: "#3A3D1A",
  ooze: "#1A3D2C",
  plant: "#1A3D1A",
  undead: "#252535",
};

export const NPC_COLORS: Record<string, string> = {
  ally: "#1C2A4A",
  enemy: "#4A1414",
  neutral: "#333344",
  unknown: "#252535",
};

export const MONSTER_GLYPHS: Record<string, string> = {
  aberration: "⊗",
  beast: "~",
  celestial: "✦",
  construct: "#",
  dragon: "D",
  elemental: "*",
  fey: "+",
  fiend: "X",
  giant: "G",
  humanoid: "/",
  monstrosity: "M",
  ooze: "O",
  plant: "&",
  undead: "U",
};

export const MONSTER_GLYPHS_LONG: Record<string, string> = {
  aberration: "Ab",
  beast: "Be",
  celestial: "Ce",
  construct: "Co",
  dragon: "Dr",
  elemental: "El",
  fey: "Fy",
  fiend: "Fi",
  giant: "Gi",
  humanoid: "Hu",
  monstrosity: "Mo",
  ooze: "Oz",
  plant: "Pl",
  undead: "Un",
};

export function truncateCard(str: string | null | undefined, len: number): string {
  if (!str) return "";
  return str.length > len ? str.slice(0, len - 1) + "…" : str;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;
export const ABILITY_LABELS: Record<string, string> = {
  str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA",
};
