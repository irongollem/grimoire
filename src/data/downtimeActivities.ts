import type { DowntimeActivity } from "@/types/downtime.types";

/**
 * The Interlude's archetype catalog (#486).
 *
 * Deliberately code, not a DB table: adding an archetype must be data, never a
 * migration. Phase 2 fills out the deck — each archetype is a new entry here
 * plus seeds in `downtimeSeeds.ts`, and nothing else. `rewardType` names what a
 * draw mints on the fly and must be a kind `downtimeSeedReward.ts` can build
 * (npc/item/note); a DM's prepped card back can still override with any type.
 *
 * `accent` + `glyph` drive a procedural card face, so no milestone waits on art.
 */
export const DOWNTIME_ACTIVITIES: DowntimeActivity[] = [
  {
    key: "carouse",
    title: "Carouse",
    hook: "Spend coin, work the room, and see who you stumble home knowing.",
    risk: 2,
    rewardType: "npc",
    accent: "#6B1C1C",
    glyph: "🍷",
    artUrl: null,
  },
  {
    key: "craft",
    title: "Craft & Enchant",
    hook: "Bend metal, brew, or bind magic — and walk away with something made.",
    risk: 1,
    rewardType: "item",
    accent: "#7A4B12",
    glyph: "🔨",
    artUrl: null,
  },
  {
    key: "research",
    title: "Research & Scribe",
    hook: "Chase a name, a place, or a secret through dust and lamplight.",
    risk: 1,
    rewardType: "note",
    accent: "#1E3A5F",
    glyph: "📜",
    artUrl: null,
  },
  {
    key: "train",
    title: "Train",
    hook: "Drill, study, and grind toward a skill you didn't have last season.",
    risk: 1,
    rewardType: "note",
    accent: "#2F5D3A",
    glyph: "🎯",
    artUrl: null,
  },
  {
    key: "business",
    title: "Run a Business",
    hook: "Mind the ledger of a shop, a shrine, or a cell — and see what it brings in.",
    risk: 2,
    rewardType: "note",
    accent: "#6B5510",
    glyph: "🏛️",
    artUrl: null,
  },
  {
    key: "pit-fighting",
    title: "Pit Fighting",
    hook: "Trade blood for coin in the ring, and hope the prize outweighs the bruises.",
    risk: 3,
    rewardType: "item",
    accent: "#5A1414",
    glyph: "🥊",
    artUrl: null,
  },
  {
    key: "lie-low",
    title: "Lie Low",
    hook: "Go quiet, let the heat die down, and mend what the road broke.",
    risk: 1,
    rewardType: "note",
    accent: "#2C3440",
    glyph: "🌙",
    artUrl: null,
  },
  {
    key: "pull-a-job",
    title: "Pull a Job",
    hook: "Case it, crack it, and carry out whatever the score turns out to be.",
    risk: 3,
    rewardType: "item",
    accent: "#3D2159",
    glyph: "🗝️",
    artUrl: null,
  },
];

const BY_KEY: ReadonlyMap<string, DowntimeActivity> = new Map(
  DOWNTIME_ACTIVITIES.map((a) => [a.key, a]),
);

/** Null when the key is unknown — callers render the "???" absence marker. */
export function getDowntimeActivity(key: string): DowntimeActivity | null {
  return BY_KEY.get(key) ?? null;
}

export const RISK_LABELS: Record<DowntimeActivity["risk"], string> = {
  1: "Safe",
  2: "Risky",
  3: "Dangerous",
};
