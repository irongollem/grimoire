/*
 * Quick edits over a recipe's paper wash (#1176), the way recipeEdits.ts does
 * for edges and colour: each reads the recipe and returns a new one, so the
 * panel and the Illuminator write the same step. Pure.
 */
import { withStep, withoutStep } from "./recipeEdits";
import { WASH_REACH, type IlluminateSettings, type WashSide, type WashStep } from "./treatment";

/** A new wash's starting look, tuned against the prototype. */
export const WASH_DEFAULTS = { from: "left", reach: 0.6, brush: 0.55, dry: 0.65 } as const satisfies Omit<WashStep, "type" | "seed">;

export const WASH_SIDE_OPTIONS: readonly { value: WashSide; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
];

export function newWash(seed: number): WashStep {
  return { type: "wash", ...WASH_DEFAULTS, seed };
}

export function washOf(settings: IlluminateSettings | null): WashStep | null {
  const step = settings?.steps.find((s): s is WashStep => s.type === "wash");
  return step ?? null;
}

/** Turn the wash on with its defaults and a fresh seed, or keep the one there. */
export function setWashOn(settings: IlluminateSettings | null, seed: number): IlluminateSettings {
  return washOf(settings) ? (settings as IlluminateSettings) : withStep(settings, newWash(seed));
}

export function removeWash(settings: IlluminateSettings | null): IlluminateSettings {
  return withoutStep(settings, "wash");
}

export type WashField = "reach" | "brush" | "dry";

/** Move one slider; the reach stays inside what the wash draws. */
export function setWashField(settings: IlluminateSettings | null, field: WashField, value: number, seed: number): IlluminateSettings {
  const wash = washOf(settings) ?? newWash(seed);
  const next = field === "reach" ? Math.min(WASH_REACH.max, Math.max(WASH_REACH.min, value)) : Math.min(1, Math.max(0, value));
  return withStep(settings, { ...wash, [field]: next });
}

export function setWashSide(settings: IlluminateSettings | null, from: WashSide, seed: number): IlluminateSettings {
  return withStep(settings, { ...(washOf(settings) ?? newWash(seed)), from });
}

/** The same wash painted again: only the seed changes. */
export function repaintWash(settings: IlluminateSettings | null, seed: number): IlluminateSettings {
  return withStep(settings, { ...(washOf(settings) ?? newWash(seed)), seed });
}
