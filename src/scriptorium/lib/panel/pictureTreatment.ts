/*
 * A picture's treatment, carried between its two homes (#1176).
 *
 * A picture is an image node in the text or art furniture on a page, and the
 * Layer control moves it from one to the other. The Illuminator's recipe
 * (`original`, `illuminate`, `bakedFor`) lives under the same names in both,
 * as image attrs and as furniture props, so a conversion copies whichever of
 * them the picture has and never loses a treated picture back to its raw file.
 * Copied by key rather than by shape: the recipe's own shape is not this
 * module's business.
 */

import { hasSteps, type IlluminateSettings } from "@/scriptorium/illuminator/lib/treatment";

export const TREATMENT_KEYS = ["original", "illuminate", "bakedFor"] as const;

/** The treatment keys a picture holds, and nothing else. */
export function pickTreatment(source: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of TREATMENT_KEYS) {
    const value = source[key];
    if (value !== undefined && value !== null) out[key] = value;
  }
  return out;
}

/** A replaced picture is a different picture: the old one's recipe and bake do not apply to it. */
export function withoutTreatment(source: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...source };
  for (const key of TREATMENT_KEYS) delete out[key];
  return out;
}

/** The same, as an attrs patch for a node whose schema knows the keys: each one present is cleared. */
export function clearTreatmentPatch(source: Readonly<Record<string, unknown>>): Record<string, null> {
  const patch: Record<string, null> = {};
  for (const key of TREATMENT_KEYS) if (key in source) patch[key] = null;
  return patch;
}

// ─── Editing a picture's recipe (#1176 story 9b) ────────────────────────────

/** A treated picture's keys as one write: a value to set, or null to remove (furniture props have no null, so they drop the key). */
export type TreatmentPatch = Partial<Record<(typeof TREATMENT_KEYS)[number] | "src", unknown>>;

/**
 * The write for a picture whose recipe is now `next`. The first edit keeps the
 * file as it was as `original`; later edits keep the original they already
 * have. `bakedFor` is left alone, so the bake sees a stale hash and catches up.
 * A recipe with nothing in it is the original picture again.
 */
export function treatmentPatch(source: Readonly<Record<string, unknown>>, next: IlluminateSettings): TreatmentPatch {
  if (!hasSteps(next)) return resetPatch(source);
  const original = typeof source.original === "string" && source.original !== "" ? source.original : source.src;
  return { original, illuminate: next };
}

/** Back to the untouched file: its recipe and bake go, and `original` becomes the picture. */
export function resetPatch(source: Readonly<Record<string, unknown>>): TreatmentPatch {
  const original = source.original;
  const patch: TreatmentPatch = { original: null, illuminate: null, bakedFor: null };
  if (typeof original === "string" && original !== "") patch.src = original;
  return patch;
}

/** A patch applied to furniture props: nulls remove the key, and a recipe is stored as JSON text. */
export function mergeTreatmentPatch(
  props: Readonly<Record<string, string | number>>,
  patch: TreatmentPatch,
): Record<string, string | number> {
  const out: Record<string, string | number> = { ...props };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) delete out[key];
    else if (typeof value === "string" || typeof value === "number") out[key] = value;
    else out[key] = JSON.stringify(value);
  }
  return out;
}
