/**
 * One `import-match` call per `document_imports` row (#837/#838's successor,
 * see `context/features/document-import.md`) — the dedupe candidates every
 * review surface needs before it can show the DM what already exists.
 *
 * Keyed on the row id ALONE, never on the entities themselves: the DM's own
 * edits to a field in the review card must not trigger a second network
 * round trip — the candidates answer "what did the page's ORIGINAL heading
 * already match," which an edit afterward doesn't change. `staleTime:
 * Infinity` is deliberate for the same reason; this is a snapshot of one
 * extraction, not a value that goes stale on its own.
 */
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import { getEntityKindEntry } from "@/lib/documentImport/entityKinds";
import { parseImportMatches, withDeityCandidates, type EntityCandidate } from "@/lib/documentImport/entityMatching";
import { useAllDeities } from "@/composables/deities/useDeities";
import type { UsableEntity } from "@/lib/documentImport/sanitizeEntities";
import { IMPORT_ENTITY_KINDS, type ImportEntityKind } from "@/types/documentImport.types";

export interface ImportMatchRequestEntity {
  ref: string;
  name: string;
  data: Record<string, unknown>;
}

export type ImportMatchRequestBody = {
  id: string;
  entities: Partial<Record<ImportEntityKind, ImportMatchRequestEntity[]>>;
};

/**
 * Builds the `import-match` request body — one entry per kind that actually
 * has usable entities, each carrying the heading the edge function ranks
 * candidates against (`entityKinds.ts`'s own `displayField`, since `quests`
 * is `title` and everything else is `name`). An entity whose heading is
 * blank or non-string is dropped rather than sent with a fabricated name —
 * `sanitizeEntities` already guarantees this can't happen for real extracted
 * data, but this stays defensive since `data` is still untrusted jsonb.
 *
 * Pure and exported for its own test; `useImportEntityMatches` is the only
 * real caller.
 */
export function buildImportMatchRequest(
  importRowId: string,
  entitiesByKind: Partial<Record<ImportEntityKind, readonly UsableEntity[]>>,
): ImportMatchRequestBody {
  const entities: Partial<Record<ImportEntityKind, ImportMatchRequestEntity[]>> = {};
  for (const kind of IMPORT_ENTITY_KINDS) {
    const list = entitiesByKind[kind];
    if (!list || list.length === 0) continue;
    const entry = getEntityKindEntry(kind);
    const mapped: ImportMatchRequestEntity[] = [];
    for (const entity of list) {
      const name = entity.data[entry.displayField];
      if (typeof name === "string" && name.trim().length > 0) {
        mapped.push({ ref: entity.ref, name, data: entity.data });
      }
    }
    if (mapped.length > 0) entities[kind] = mapped;
  }
  return { id: importRowId, entities };
}

export interface ImportEntityMatches {
  candidatesByKind: Map<ImportEntityKind, Map<string, EntityCandidate[]>>;
  semantic: boolean;
  /** The NPC headings that were sent, so a deity match is judged against what
   *  the match call saw and not against the DM's later edits in the review. */
  npcs: { ref: string; name: string }[];
}

function emptyResult(): ImportEntityMatches {
  return { candidatesByKind: new Map(), semantic: false, npcs: [] };
}

/**
 * Fetches dedupe candidates for one `document_imports` row's whole
 * extraction, once. `importRowId` is typically the row's id the moment it
 * lands on `review`; `entitiesByKind` is read only the first time the query
 * actually runs (its own reactivity is irrelevant to the query key, on
 * purpose — see the file header).
 */
export function useImportEntityMatches(
  importRowId: MaybeRefOrGetter<string | null>,
  entitiesByKind: MaybeRefOrGetter<Partial<Record<ImportEntityKind, readonly UsableEntity[]>>>,
) {
  const hasAnyEntities = computed(() => Object.values(toValue(entitiesByKind)).some((list) => (list?.length ?? 0) > 0));

  const query = useQuery({
    queryKey: computed(() => ["import-match", toValue(importRowId)] as const),
    queryFn: async (): Promise<ImportEntityMatches> => {
      const id = toValue(importRowId);
      if (!id) return emptyResult();
      const body = buildImportMatchRequest(id, toValue(entitiesByKind));
      const { data, error } = await supabase.functions.invoke("import-match", { body });
      if (error) throw new Error(await edgeErrorMessage(error));
      const { matches, semantic } = parseImportMatches(data);
      const npcs = (body.entities.npcs ?? []).map(({ ref, name }) => ({ ref, name }));
      return { candidatesByKind: matches, semantic, npcs };
    },
    enabled: computed(() => toValue(importRowId) !== null && hasAnyEntities.value),
    staleTime: Number.POSITIVE_INFINITY,
    // No automatic retry: the review surface offers an explicit Retry button
    // (`refetch`), and a silent background retry would delay the moment the
    // DM sees "couldn't check for matches" — this is a dedupe safety check,
    // not a background sync where a transient blip is fine to paper over.
    retry: false,
  });

  // The campaign's own deities: a god on the page is a deity the DM already has,
  // not a new NPC. A failed read must not block the import, so the error is not
  // surfaced as the match error; it is only awaited (see isLoading below).
  const deities = useAllDeities();

  const candidatesByKind = computed(() => {
    const data = query.data.value;
    if (!data) return emptyResult().candidatesByKind;
    const rows = deities.data.value;
    if (!rows || rows.length === 0 || data.npcs.length === 0) return data.candidatesByKind;
    const merged = new Map(data.candidatesByKind);
    merged.set("npcs", withDeityCandidates(data.candidatesByKind.get("npcs") ?? new Map(), data.npcs, rows));
    return merged;
  });
  const semantic = computed(() => query.data.value?.semantic ?? false);

  /** One kind's candidates, keyed by ref — the shape every review row needs. */
  function candidatesFor(kind: ImportEntityKind): Map<string, EntityCandidate[]> {
    return candidatesByKind.value.get(kind) ?? new Map();
  }

  return {
    candidatesByKind,
    candidatesFor,
    semantic,
    // Until BOTH have settled: the review seeds each default decision once and
    // never overwrites it, so a god seeded as "Create new" before its deity
    // candidate arrives would stay that way.
    isLoading: computed(() => query.isLoading.value || deities.isLoading.value),
    error: query.error,
    refetch: query.refetch,
  };
}
