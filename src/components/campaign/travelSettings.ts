import type { Terrain, WayKind, WayOfTravel } from "@/rules/travelSpeed";

/** The words for a way's kind, as a DM would say them. */
export const WAY_KIND_LABELS: Record<WayKind, string> = {
  foot: "On foot",
  ride: "Ridden",
  vehicle: "Pulled or rolled",
  water: "Boat or ship",
  air: "Flies",
};

export const WAY_KINDS = Object.keys(WAY_KIND_LABELS) as WayKind[];

/** A kind whose crew can keep going through the night. */
export const canTravelThroughTheNight = (kind: WayKind): boolean => kind === "water" || kind === "air";

const FRACTIONS: ReadonlyArray<[number, string]> = [
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [1 / 2, "½"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
];

/** A multiplier the way a table would write it: the plain fraction where there is one, else two decimals. */
export function multiplierText(x: number): string {
  const fraction = FRACTIONS.find(([value]) => Math.abs(value - x) < 0.004);
  if (fraction) return `×${fraction[1]}`;
  return `×${Number(x.toFixed(2))}`;
}

/** What a terrain does, in a line: slows everyone, and those who walk or ride on it sink further. */
export function terrainEffectText(t: Terrain): string {
  const everyone = `Slows everyone to ${multiplierText(t.factor)}`;
  return t.sink === 1 ? everyone : `${everyone}, walkers and riders sink to ${multiplierText(t.sink)}`;
}

/** A name made into a key: lowercase a-z, 0-9 and underscores, at most 40, unique against the keys in use. */
export function slugKey(name: string, taken: readonly string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40).replace(/_+$/g, "") || "own";
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `_${n}`;
    const candidate = `${base.slice(0, 40 - suffix.length)}${suffix}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

/** A way's speed in a line: "30 ft", "4 mph", or "Snowbeak's speed (50 ft)" for one that takes a companion's. */
export function waySpeedText(w: WayOfTravel, companion: { name: string; speed: number } | undefined): string {
  if (w.mph !== null && w.mph > 0) return `${Number(w.mph)} mph`;
  if (w.companionId !== null) return companion ? `${companion.name}'s speed (${companion.speed} ft)` : "Its companion is gone";
  return w.speedFeet !== null ? `${w.speedFeet} ft` : "No speed";
}
