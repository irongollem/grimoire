/**
 * Validates one kind's raw `document_imports.extracted[kind]` array into
 * entities a review surface can safely render — dropping anything malformed
 * rather than rendering broken or throwing.
 *
 * `documentImport.types.ts`'s own header explains why there is no single
 * validating gate upstream of this: `extracted` is untrusted model output,
 * constrained by the provider schema but never re-walked field-by-field
 * before it lands on the row. This is that per-field check, run once per
 * kind by whichever surface is about to show the entities.
 *
 * Extracted out of `DocumentImportWizard.vue` (#353) so the compact
 * create-quest paste review (#839) can validate the exact same way rather
 * than re-deriving its own notion of "usable" — a bestiary page pasted into
 * the quest flow needs to drop a malformed monster identically to how the
 * settings wizard would.
 */
import type { ImportConfidence } from "@/types/documentImport.types";

/** One entity, ready to show on a review card or feed into `buildImportPlan`. */
export interface UsableEntity {
  ref: string;
  page: number | null;
  confidence: ImportConfidence;
  data: Record<string, unknown>;
}

/**
 * `raw` is `importRow.extracted[kind]` — `unknown` because the column is
 * opaque jsonb (see the type header). Anything that isn't a well-formed
 * `ExtractedEntity` is dropped and counted, never guessed at: a missing kind,
 * a non-array value, or an entity missing its heading field must not reach
 * the review grid, but the DM should still know something was skipped rather
 * than wonder why a step looks short.
 */
export function sanitizeEntities(raw: unknown, displayField: "name" | "title"): { entities: UsableEntity[]; dropped: number } {
  if (!Array.isArray(raw)) return { entities: [], dropped: 0 };
  const entities: UsableEntity[] = [];
  let dropped = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      dropped++;
      continue;
    }
    const rec = item as Record<string, unknown>;
    const rawData = rec.data;
    if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) {
      dropped++;
      continue;
    }
    const dataRec = rawData as Record<string, unknown>;
    const heading = dataRec[displayField];
    if (typeof heading !== "string" || heading.trim() === "") {
      dropped++;
      continue;
    }
    const ref = typeof rec.ref === "string" && rec.ref.length > 0 ? rec.ref : crypto.randomUUID();
    const page = typeof rec.page === "number" ? rec.page : null;
    const confidence: ImportConfidence = rec.confidence === "partial" ? "partial" : "complete";
    entities.push({ ref, page, confidence, data: dataRec });
  }
  return { entities, dropped };
}
