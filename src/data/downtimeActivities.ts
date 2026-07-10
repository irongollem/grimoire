import type { DowntimeActivity } from "@/types/downtime.types";

/**
 * The Interlude's archetype catalog (#486).
 *
 * Deliberately code, not a DB table: adding an archetype must be data, never a
 * migration. Phase 1 ships Carouse alone — every later archetype is a new entry
 * here plus seeds in `downtimeSeeds.ts`, and nothing else.
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
