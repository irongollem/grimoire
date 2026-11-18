// The weather where the party stands, as the narrator is told it (#1021 row 20). Pure: no I/O.
//
// The campaign has a weather system (#1086): the same campaign, place and date always give the same sky, worked out
// from the campaign's calendar, which lives with the app. So the page works it out, as it does on the dashboard,
// and sends it along as a handful of fixed words; every one is checked here against the words the weather system
// has, and the sentence the narrator reads is written here. Nothing of the page's own wording goes on.

export const SKY_TEMPERATURES = ["freezing", "cold", "cool", "mild", "warm", "hot", "scorching"] as const;
export const SKY_PRECIPITATION = ["none", "drizzle", "rain", "downpour", "snow", "blizzard", "dust"] as const;
export const SKY_WIND = ["calm", "breeze", "strong", "gale"] as const;
export const SKY_DANGERS = ["avalanche", "flood", "wildfire"] as const;
export const SKY_DANGER_LEVELS = ["moderate", "high"] as const;

export interface Sky {
  temperature: (typeof SKY_TEMPERATURES)[number];
  precipitation: (typeof SKY_PRECIPITATION)[number];
  wind: (typeof SKY_WIND)[number];
  fog: boolean;
  /** What the weather of the last days has made dangerous on this ground. */
  dangers: Array<{ kind: (typeof SKY_DANGERS)[number]; level: (typeof SKY_DANGER_LEVELS)[number] }>;
}

const oneOf = <T extends string>(list: readonly T[], raw: unknown): raw is T => typeof raw === "string" && (list as readonly string[]).includes(raw);

/** The sky as the page sent it, or null when it is not one: a word the weather system does not have, or a made-up danger. */
export function parseSky(raw: unknown): Sky | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!oneOf(SKY_TEMPERATURES, r.temperature) || !oneOf(SKY_PRECIPITATION, r.precipitation) || !oneOf(SKY_WIND, r.wind) || typeof r.fog !== "boolean") return null;
  if (!Array.isArray(r.dangers) || r.dangers.length > SKY_DANGERS.length) return null;
  const dangers: Sky["dangers"] = [];
  for (const d of r.dangers) {
    if (typeof d !== "object" || d === null) return null;
    const { kind, level } = d as Record<string, unknown>;
    if (!oneOf(SKY_DANGERS, kind) || !oneOf(SKY_DANGER_LEVELS, level)) return null;
    dangers.push({ kind, level });
  }
  return { temperature: r.temperature, precipitation: r.precipitation, wind: r.wind, fog: r.fog, dangers };
}

const PRECIPITATION_WORDS: Record<Sky["precipitation"], string> = {
  none: "dry", drizzle: "a drizzle", rain: "rain", downpour: "a downpour", snow: "snow", blizzard: "a blizzard", dust: "dust in the air",
};
const WIND_WORDS: Record<Sky["wind"], string> = { calm: "no wind", breeze: "a breeze", strong: "a strong wind", gale: "a gale" };

/**
 * The weather as a section of what the narrator is told. Short: it is on every turn. It says the sky, what it has
 * made dangerous, and how to use both: as colour and consequence in the telling, never as a report.
 */
export function skySection(sky: Sky): string {
  const parts = [sky.temperature, PRECIPITATION_WORDS[sky.precipitation], WIND_WORDS[sky.wind], ...(sky.fog ? ["fog"] : [])];
  const lines = [`## The weather\nUnder the open sky today: ${parts.join(", ")}. Indoors and underground it is heard or felt at most.`];
  if (sky.dangers.length > 0) {
    lines.push(`The last days' weather has made this ground dangerous: ${sky.dangers.map((d) => `${d.kind} (${d.level} risk)`).join(", ")}.`);
  }
  lines.push(
    "Let it tell: what is wet, cold, slippery or hard to hear, how a road goes, what a fire or a bowstring does. " +
      "A danger named here may strike when the story gives it room, and then it is ruled like anything else: ask for a " +
      "roll, and roll its harm with the roll tool. Do not report the weather; show it once where it matters.",
  );
  return lines.join("\n");
}
