/**
 * Pure helpers for the compact "paste a page" review inside the create-quest
 * flow (#839) — turning one extraction result into what that review needs to
 * show: which quest is the headline, and what else the page yielded.
 *
 * #839 is explicit that this is the *same* extraction as the settings
 * importer's, presented differently — a chapter still yields locations,
 * NPCs, monsters, items and factions alongside its quest, and discarding
 * them to keep the flow "about one quest" would throw away most of the
 * value. So this module doesn't narrow the extraction to quests-only; it
 * separates "the one thing this flow leads with" from "everything else,
 * offered as one compact per-group choice" — both built on the same
 * `sanitizeEntities` the settings wizard uses, so a malformed entity is
 * dropped identically on either door.
 */
import { sanitizeEntities, type UsableEntity } from "./sanitizeEntities";
import { getEntityKindEntry } from "./entityKinds";
import { IMPORT_ENTITY_KINDS, type ExtractionResult, type ImportEntityKind } from "@/types/documentImport.types";

export interface PrimaryQuestSelection {
  /** The first usable extracted quest, or null when the page yielded none —
   *  a bestiary or gazetteer page pasted into the create-quest flow is a
   *  real, expected outcome, not an error. */
  entity: UsableEntity | null;
  /** How many *more* usable quests this extraction found beyond the first —
   *  a chapter can describe two. The review surfaces this rather than
   *  silently discarding it, but only ever acts on the first (see this
   *  module's own header and QuestPasteImportPanel.vue's doc comment for
   *  why: offering every quest its own toggle would recreate the
   *  step-per-kind wizard this flow exists to avoid). */
  extraCount: number;
  /** Malformed quest entries dropped by `sanitizeEntities`. */
  dropped: number;
}

/** Picks the headline quest for the compact review — see `PrimaryQuestSelection`. */
export function selectPrimaryQuest(extracted: ExtractionResult): PrimaryQuestSelection {
  const { entities, dropped } = sanitizeEntities(extracted.quests, "title");
  return { entity: entities[0] ?? null, extraCount: Math.max(0, entities.length - 1), dropped };
}

export interface OtherKindGroup {
  kind: Exclude<ImportEntityKind, "quests">;
  label: string;
  entities: UsableEntity[];
}

/**
 * Every non-quest kind the extraction yielded at least one usable entity
 * for, in `IMPORT_ENTITY_KINDS` dependency order — the "also found" groups
 * the compact review offers as per-group toggles. A kind with zero usable
 * entities is omitted entirely rather than shown unchecked, per #839's
 * two-click goal: nothing to bring in means nothing to decide about.
 */
export function summarizeOtherKinds(extracted: ExtractionResult): OtherKindGroup[] {
  const groups: OtherKindGroup[] = [];
  for (const kind of IMPORT_ENTITY_KINDS) {
    if (kind === "quests") continue;
    const entry = getEntityKindEntry(kind);
    const { entities } = sanitizeEntities(extracted[kind], entry.displayField);
    if (entities.length > 0) groups.push({ kind, label: entry.labelPlural, entities });
  }
  return groups;
}

/**
 * A short default name for the staging row, derived from the pasted text
 * itself. The settings importer asks the DM to name the document because a
 * bulk import spans many entities with no obvious title of its own; this
 * flow is about one page the DM is looking at right now, so asking them to
 * separately name "the document" before they've even seen what it contains
 * would be exactly the extra click #839 exists to remove.
 */
export function deriveImportDisplayName(sourceText: string): string {
  const firstLine = sourceText
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) return "Pasted quest";
  const snippet = firstLine.replace(/^#+\s*/, "").slice(0, 60).trim();
  return snippet.length > 0 ? snippet : "Pasted quest";
}
