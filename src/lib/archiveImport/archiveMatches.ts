/**
 * Dedupe for a wiki export (#932): which existing rows a page might be, asked
 * of the same `import-match` edge function the AI import uses.
 *
 * The edge function takes at most 300 entities per request (`MAX_TOTAL_ENTITIES`
 * in `supabase/functions/import-match/matching.ts`) and refuses the whole
 * request past it, while an archive may carry two thousand pages, so the
 * entities go in sequential batches and the answers are merged. Sequential,
 * not parallel: the function is rate limited per user (30 a minute), and eight
 * batches is well inside that one after another.
 *
 * Only a name and a short excerpt of the body travel: the name tier is what
 * finds a duplicate, and sending whole pages would embed every one of them
 * for no better answer. Notes are not matched (nothing to dedupe against).
 */
import type { EntityCandidate } from "@/lib/documentImport/entityMatching";
import type { UsableEntity } from "@/lib/documentImport/sanitizeEntities";
import type { ImportEntityKind } from "@/types/documentImport.types";
import { plainTextOf } from "./pageBuild";
import type { ArchivePage, ArchivePageKind } from "./types";

/** Mirrors `MAX_TOTAL_ENTITIES` in the edge function. */
export const IMPORT_MATCH_MAX_ENTITIES = 300;
const EXCERPT_CHARS = 400;

export const IMPORT_KIND_FOR_PAGE_KIND: Partial<Record<ArchivePageKind, ImportEntityKind>> = {
  npc: "npcs",
  location: "locations",
  faction: "factions",
  quest: "quests",
  item: "items",
};

export type EntitiesByKind = Partial<Record<ImportEntityKind, UsableEntity[]>>;
export type CandidatesByKind = Map<ImportEntityKind, Map<string, EntityCandidate[]>>;

function excerptOf(page: ArchivePage): string {
  const text = page.body.content
    .map((node) => plainTextOf(node))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, EXCERPT_CHARS);
}

/** The entities to send, by import kind, for every page the DM settled as a matchable kind. */
export function entitiesForMatching(pages: readonly { page: ArchivePage; kind: ArchivePageKind }[]): EntitiesByKind {
  const out: EntitiesByKind = {};
  for (const { page, kind } of pages) {
    const importKind = IMPORT_KIND_FOR_PAGE_KIND[kind];
    if (!importKind) continue;
    const excerpt = excerptOf(page);
    const data: Record<string, unknown> =
      importKind === "quests" ? { title: page.title, ...(excerpt ? { summary: excerpt } : {}) } : { name: page.title, ...(excerpt ? { description: excerpt } : {}) };
    (out[importKind] ??= []).push({ ref: page.ref, page: null, confidence: "complete", data });
  }
  return out;
}

/** Splits entities into requests of at most `size`, keeping kinds together as far as the cap allows. */
export function batchEntities(byKind: EntitiesByKind, size: number = IMPORT_MATCH_MAX_ENTITIES): EntitiesByKind[] {
  const batches: EntitiesByKind[] = [];
  let current: EntitiesByKind = {};
  let count = 0;
  for (const [kind, list] of Object.entries(byKind) as [ImportEntityKind, UsableEntity[]][]) {
    for (const entity of list) {
      if (count === size) {
        batches.push(current);
        current = {};
        count = 0;
      }
      (current[kind] ??= []).push(entity);
      count++;
    }
  }
  if (count > 0) batches.push(current);
  return batches;
}

/** Folds one batch's candidates into the running result. */
export function mergeCandidates(into: CandidatesByKind, batch: CandidatesByKind): CandidatesByKind {
  for (const [kind, byRef] of batch) {
    const target = into.get(kind) ?? new Map<string, EntityCandidate[]>();
    for (const [ref, candidates] of byRef) target.set(ref, candidates);
    into.set(kind, target);
  }
  return into;
}
