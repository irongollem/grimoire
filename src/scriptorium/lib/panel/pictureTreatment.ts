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
