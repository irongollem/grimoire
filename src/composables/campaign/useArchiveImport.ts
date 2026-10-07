/**
 * Wiki-export import (#932, story 6): the Supabase/TanStack half of the
 * no-AI import. The pure parts live in `src/lib/archiveImport/` (the reader,
 * the manifest, the sweep); this module is the thin layer that talks to the
 * database and the `import-match` edge function.
 *
 * The row is inserted directly with `status: 'review'` (nothing server-side
 * reads an archive: `import-extract` refuses the kind) and carries only the
 * manifest, never a page body. It exists so the review gets the same dedupe
 * endpoint and the same expiry cleanup as every other import, and so an
 * interrupted review can be picked up again.
 */
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import { useCampaignStore } from "@/stores/campaign";
import { isQuotaExceeded } from "@/lib/quotaError";
import { parseImportMatches } from "@/lib/documentImport/entityMatching";
import { buildImportMatchRequest } from "@/composables/campaign/useImportEntityMatches";
import { buildArchiveManifest, importablePageCount } from "@/lib/archiveImport/archiveManifest";
import { batchEntities, mergeCandidates, type CandidatesByKind, type EntitiesByKind } from "@/lib/archiveImport/archiveMatches";
import {
  runArchiveSweep,
  type ArchiveRecordKind,
  type ArchiveSweepDeps,
  type ArchiveSweepInput,
  type ArchiveSweepProgress,
  type ArchiveSweepReport,
} from "@/lib/archiveImport/archiveSweep";
import type { ArchivePage, ArchivePageKind, ArchiveSource } from "@/lib/archiveImport/types";
import type { LocationType } from "@/types/location.types";
import { isLocationType } from "@/lib/locations/tiers";
import { activeImportKey } from "@/composables/campaign/useDocumentImport";
import type { ArchiveDocumentImport, DocumentImport } from "@/types/documentImport.types";

// ── Create the row ───────────────────────────────────────────────────────────

export interface CreateArchiveImportInput {
  /** The zip's or folder's name. */
  displayName: string;
  source: ArchiveSource;
  pages: readonly ArchivePage[];
  /** The DM's settled kind per page `ref`. */
  kinds: ReadonlyMap<string, ArchivePageKind>;
  rightsAttested: boolean;
}

export function useCreateArchiveImport() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async (input: CreateArchiveImportInput): Promise<ArchiveDocumentImport> => {
      if (!input.rightsAttested) {
        throw new Error("Confirm you have the rights to this material before it can be imported.");
      }
      const user = getCurrentUser();
      if (!user) throw new Error("You must be signed in to start an import.");
      const campaignId = campaign.activeCampaignId;
      if (!campaignId) throw new Error("No active campaign selected.");

      const manifest = buildArchiveManifest(input.source, input.pages, input.kinds);
      const pageCount = importablePageCount(manifest);
      if (pageCount <= 0) throw new Error("Every page is set to skip, so there is nothing to import.");

      const { data, error } = await supabase
        .from("document_imports")
        .insert({
          campaign_id: campaignId,
          source_kind: "archive",
          source_paths: [],
          display_name: input.displayName,
          page_count: pageCount,
          rights_attested_at: new Date().toISOString(),
          status: "review",
          extracted: manifest,
          user_id: user.id,
        })
        .select()
        .single();
      if (error) {
        // `document_imports_insert` raises a raw 42501 when the caller is not the campaign's DM.
        if ((error as { code?: unknown }).code === "42501") {
          throw new Error("Only the campaign's DM can start a document import.");
        }
        throw error;
      }
      return data as ArchiveDocumentImport;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: activeImportKey(campaign.activeCampaignId) }),
  });
}

// ── Dedupe candidates ────────────────────────────────────────────────────────

/**
 * Candidates for every matchable page, in batches (`archiveMatches.ts` says
 * why). Keyed on the row id alone and never re-run on a decision change, like
 * `useImportEntityMatches`; unlike it, a failure of any batch fails the whole
 * check, because a review that silently lacks a third of its candidates would
 * default those pages to "create" and duplicate what the DM already owns.
 */
export function useArchiveEntityMatches(
  importRowId: MaybeRefOrGetter<string | null>,
  entities: MaybeRefOrGetter<EntitiesByKind>,
) {
  const hasAny = computed(() => Object.values(toValue(entities)).some((list) => (list?.length ?? 0) > 0));
  const query = useQuery({
    queryKey: computed(() => ["archive-import-match", toValue(importRowId)] as const),
    queryFn: async (): Promise<CandidatesByKind> => {
      const id = toValue(importRowId);
      const merged: CandidatesByKind = new Map();
      if (!id) return merged;
      for (const batch of batchEntities(toValue(entities))) {
        const { data, error } = await supabase.functions.invoke("import-match", { body: buildImportMatchRequest(id, batch) });
        if (error) throw new Error(await edgeErrorMessage(error));
        mergeCandidates(merged, parseImportMatches(data).matches);
      }
      return merged;
    },
    enabled: computed(() => toValue(importRowId) !== null && hasAny.value),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  return {
    candidatesByKind: computed(() => query.data.value ?? new Map() as CandidatesByKind),
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

// ── The sweep ────────────────────────────────────────────────────────────────

const LOCATION_TYPE_CHUNK = 100;

function buildDeps(userId: string): ArchiveSweepDeps {
  return {
    insertRow: async (table, row) => {
      // A beat's owner is its `created_by` column (defaulted to the caller); every other table takes `user_id`.
      const payload = table === "quest_beats" ? row : { ...row, user_id: userId };
      const { data, error } = await supabase.from(table).insert(payload).select("id").single();
      if (error) {
        if (isQuotaExceeded(error)) return { status: "quota_exceeded" };
        return { status: "failed", message: error.message };
      }
      return { status: "inserted", id: (data as { id: string }).id };
    },
    updateRow: async (table, id, patch) => {
      const { error } = await supabase.from(table).update(patch).eq("id", id);
      return error ? { ok: false, message: error.message } : { ok: true };
    },
    locationTypes: async (ids) => {
      const types = new Map<string, LocationType>();
      for (let i = 0; i < ids.length; i += LOCATION_TYPE_CHUNK) {
        const { data, error } = await supabase
          .from("locations")
          .select("id, location_type")
          .in("id", ids.slice(i, i + LOCATION_TYPE_CHUNK));
        if (error) throw error;
        for (const row of (data ?? []) as { id: string; location_type: unknown }[]) {
          if (isLocationType(row.location_type)) types.set(row.id, row.location_type);
        }
      }
      return types;
    },
  };
}

export interface ArchiveSweepRun {
  report: ArchiveSweepReport;
  /** Set when every row was written but the import row could not be marked complete. */
  finishError: string | null;
}

const COUNT_KEYS: Record<ArchiveRecordKind, keyof ArchiveDocumentImport["imported_counts"]> = {
  npc: "npcs",
  location: "locations",
  faction: "factions",
  item: "items",
  quest: "quests",
  note: "notes",
};

export function useRunArchiveSweep() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();

  async function runSweep(
    importRow: Pick<DocumentImport, "id" | "campaign_id">,
    input: Omit<ArchiveSweepInput, "campaignId">,
    onProgress?: (progress: ArchiveSweepProgress) => void,
  ): Promise<ArchiveSweepRun> {
    const user = getCurrentUser();
    if (!user) throw new Error("You must be signed in to import.");
    const report = await runArchiveSweep({ ...input, campaignId: importRow.campaign_id }, buildDeps(user.id), onProgress);

    const counts: ArchiveDocumentImport["imported_counts"] = {};
    for (const kind of Object.keys(COUNT_KEYS) as ArchiveRecordKind[]) counts[COUNT_KEYS[kind]] = report.perKind[kind].created;

    const { error } = await supabase
      .from("document_imports")
      .update({ imported_counts: counts, status: "complete" })
      .eq("id", importRow.id);
    await qc.invalidateQueries({ queryKey: activeImportKey(campaign.activeCampaignId) });
    return { report, finishError: error ? error.message : null };
  }

  return { runSweep };
}
