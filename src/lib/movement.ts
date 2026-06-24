/** Movement modes a creature speed string can describe. */
export const MOVEMENT_MODES = [
  "walk",
  "fly",
  "swim",
  "climb",
  "burrow",
  "hover",
] as const;
export type MovementMode = (typeof MOVEMENT_MODES)[number];

/** Mode → icon asset basename in public/assets/movement/. Walk has no icon. */
export const MOVEMENT_ICON: Record<Exclude<MovementMode, "walk">, string> = {
  fly: "flight",
  swim: "swim",
  climb: "climb",
  burrow: "burrow",
  hover: "levitate",
};

export interface Speed {
  mode: MovementMode;
  /** distance number as a string (e.g. "30"); "" for an annotation-only mode. */
  value: string;
}

/**
 * Parse a 5e speed string ("30 ft., fly 60 ft. (hover)") into ordered modes so
 * a card can render each distance next to its movement icon instead of text.
 * A bare distance is walk; "0 ft." walk is dropped when other modes exist.
 */
export function parseSpeed(input: string | null | undefined): Speed[] {
  if (!input) return [];
  const out: Speed[] = [];
  for (const raw of input.split(",")) {
    const s = raw.toLowerCase();
    const value = (s.match(/(\d+)\s*ft/) ?? s.match(/(\d+)/))?.[1] ?? "";
    let mode: MovementMode = "walk";
    if (/\bfly\b/.test(s)) mode = "fly";
    else if (/\bswim\b/.test(s)) mode = "swim";
    else if (/\bclimb\b/.test(s)) mode = "climb";
    else if (/\bburrow\b/.test(s)) mode = "burrow";
    // "(hover)" annotates a fly speed — render it as a single hover icon + value
    // rather than a dangling extra icon.
    if (/hover/.test(s)) mode = "hover";
    if (value || mode !== "walk") out.push({ mode, value });
  }
  const hasNonWalk = out.some((s) => s.mode !== "walk");
  return out.filter((s) => !(s.mode === "walk" && (s.value === "0" || s.value === "") && hasNonWalk));
}
