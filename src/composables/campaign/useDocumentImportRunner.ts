/**
 * The Supabase-backed half of `runImportSweep` (src/lib/documentImport/) —
 * the thin wiring that turns its injected `ImportSweepDeps` into real
 * inserts, lookups and writes, the same way `useDocumentImport.ts` is the
 * thin Supabase/TanStack layer over the rest of the document importer's pure
 * logic.
 *
 * `DocumentImportWizard.vue` (the settings review, one confirm action for
 * every kind it has anything to do) and `QuestPasteImportPanel.vue` (the
 * compact create-quest paste review, #839) both call `runImportSweep` here
 * instead of each wiring their own copy of "insert every kind, then resolve
 * every name reference." This replaced the older `runKind`/`finalizeImport`
 * pair (#893): the old per-kind link resolution could never resolve a link to
 * a kind that hadn't imported yet (an NPC's `location_name`, since `locations`
 * extracts after `npcs`), which is exactly the shape `runImportSweep`'s single
 * post-import linking phase exists to fix. Neither `runKind` nor
 * `finalizeImport` has a caller left — see `context/features/document-import.md`.
 */
import { useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { getEntityKindEntry } from "@/lib/documentImport/entityKinds";
import { isQuotaExceeded } from "@/lib/quotaError";
import { normalizeMonsterReferenceRows } from "@/lib/documentImport/entityMatching";
import { monsterGenerationConcept, monsterGenerationOptionsFromPage } from "@/lib/documentImport/monsterGenerationConcept";
import { useGenerateMonster } from "@/composables/monsters/useGenerateMonster";
import { useEnsureOwnedMonster } from "@/composables/monsters/useMonsters";
import { useEnsureOwnedItem, normalizeLibraryItem } from "@/composables/items/useItems";
import { writeQuestSpine } from "@/lib/quests/spineWrite";
import {
  runImportSweep as runImportSweepCore,
  type AdoptLibraryOutcome,
  type BeatAttachmentWrite,
  type ImportSweepDeps,
  type ImportSweepInput,
  type ImportSweepProgress,
  type ImportSweepReport,
  type LootPlacementWrite,
  type QuestRefWrite,
} from "@/lib/documentImport/importSweep";
import type { InsertRowOutcome } from "@/lib/documentImport/runImportKind";
import { activeImportKey } from "./useDocumentImport";
import type { NameLookupRow } from "@/lib/documentImport/importPlan";
import type { DocumentImport, ImportEntityKind } from "@/types/documentImport.types";
import type { CombatantDef } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";

export type { ImportSweepInput, ImportSweepPhase, ImportSweepProgress, ImportSweepReport, ImportKindOutcome } from "@/lib/documentImport/importSweep";

/** Raw shape of one `resolve_monster_references` row as it comes back over
 *  `supabase.rpc` — the client here is untyped (src/lib/supabase.ts has no
 *  Database generic), so this is the boundary where that untyped response
 *  gets treated as genuinely unknown before `normalizeMonsterReferenceRows`
 *  validates it field by field. This RPC is only ever consulted for
 *  encounter-combatant resolution now — see `entityMatching.ts`'s own doc
 *  comment on `MonsterReferenceMatch` for why it's kept separate from the
 *  `EntityCandidate` model the review surfaces use.
 */
async function fetchMonsterMatchRows(campaignId: string, names: readonly string[]): Promise<unknown[]> {
  const { data, error } = await supabase.rpc("resolve_monster_references", {
    p_campaign_id: campaignId,
    p_names: names as string[],
  });
  if (error || !Array.isArray(data)) return [];
  return data as unknown[];
}

/**
 * Every kind whose target table's `campaign_id` column is nullable — a null
 * value there means "this DM's own, not scoped to any one campaign" (a
 * hand-created NPC before it's assigned anywhere, a personal monster used
 * across every campaign, and so on). `quests` is the one kind that stays
 * campaign-only: a quest with no campaign is meaningless in this app even
 * though several of its siblings tolerate exactly that at the column level
 * (see `mapExtractedFaction`'s own comment on the same asymmetry).
 */
const KINDS_WITH_GLOBAL_ROWS: ReadonlySet<ImportEntityKind> = new Set([
  "monsters",
  "npcs",
  "locations",
  "items",
  "spells",
  "factions",
  "encounters",
]);

/** Turns a caught adoption error into the dep's own outcome shape — the same
 *  `isQuotaExceeded`/message split `insertRow` above already uses, since an
 *  adoption is a `monsters`/`items` insert underneath and can fail the exact
 *  same two ways. */
function adoptFailureOutcome(err: unknown): AdoptLibraryOutcome {
  if (isQuotaExceeded(err)) return { status: "quota_exceeded" };
  return { status: "failed", message: err instanceof Error ? err.message : "Couldn't add this from the library." };
}

function buildDeps(
  importRow: DocumentImport,
  userId: string,
  generateAndCreateMonster: ReturnType<typeof useGenerateMonster>["generateAndCreateMonster"],
  ensureOwnedMonster: ReturnType<typeof useEnsureOwnedMonster>["ensureOwnedMonster"],
  ensureOwnedItem: ReturnType<typeof useEnsureOwnedItem>["ensureOwnedItem"],
  invalidateActiveImport: () => Promise<void>,
): ImportSweepDeps {
  const campaignId = importRow.campaign_id;

  return {
    insertRow: async (kind, row) => {
      const table = getEntityKindEntry(kind).table;
      const { data, error } = await supabase.from(table).insert({ ...row, user_id: userId }).select("id").single();
      if (error) {
        if (isQuotaExceeded(error)) return { status: "quota_exceeded" };
        return { status: "failed", message: error.message };
      }
      return { status: "inserted", id: (data as { id: string }).id };
    },

    generateMonster: async (data): Promise<InsertRowOutcome> => {
      try {
        const nameOverride = typeof data.name === "string" && data.name.trim().length > 0 ? data.name.trim() : undefined;
        const { id, error } = await generateAndCreateMonster(monsterGenerationConcept(data), {
          ...monsterGenerationOptionsFromPage(data),
          nameOverride,
          // The importer never offers a portrait-generation toggle of its
          // own — a bulk import generating art for every hollow monster on
          // the page would be a surprising credit spend the DM never asked
          // for, unlike the Monster Generator panel's opt-out toggle, which
          // is a single deliberate generation the DM is looking at.
          generateImage: false,
        });
        if (!id) return { status: "failed", message: error ?? "Monster generation failed." };
        return { status: "inserted", id };
      } catch (err) {
        if (isQuotaExceeded(err)) return { status: "quota_exceeded" };
        return { status: "failed", message: err instanceof Error ? err.message : "Monster generation failed." };
      }
    },

    // "Choosing a library candidate means add it from the library" —
    // importSweep.ts's `adoptLibraryLinks` is the only caller, once per
    // `link` decision whose candidate is `source: "library"`. Both fetch the
    // shared row directly (untyped `supabase` client, same as every other
    // read in this file) rather than through a Vue Query hook, since this
    // runs inside a plain async sweep step, not a component's render.
    adoptLibraryMonster: async (libraryId): Promise<AdoptLibraryOutcome> => {
      try {
        const { data, error } = await supabase.from("library_monsters").select("*").eq("id", libraryId).single();
        if (error) return { status: "failed", message: error.message };
        const owned = await ensureOwnedMonster({ ...(data as Record<string, unknown>), user_id: "", campaign_id: null } as Monster);
        return { status: "adopted", id: owned.id };
      } catch (err) {
        return adoptFailureOutcome(err);
      }
    },

    adoptLibraryItem: async (libraryId): Promise<AdoptLibraryOutcome> => {
      try {
        const { data, error } = await supabase.from("library_items").select("*").eq("id", libraryId).single();
        if (error) return { status: "failed", message: error.message };
        const owned = await ensureOwnedItem(normalizeLibraryItem(data as Record<string, unknown>));
        return { status: "adopted", id: owned.id };
      } catch (err) {
        return adoptFailureOutcome(err);
      }
    },

    fetchNameLookup: async (targetKind): Promise<readonly NameLookupRow[]> => {
      const targetEntry = getEntityKindEntry(targetKind);
      let query = supabase.from(targetEntry.table).select(`id, ${targetEntry.displayField}`);
      // A DM's own global rows (null campaign_id) are exactly what their
      // list views for this kind already show alongside this campaign's
      // rows, so a link target search that skipped them would miss
      // something the DM can plainly see elsewhere in the app. The null
      // branch names its owner explicitly rather than leaning on RLS: RLS is
      // per-table and not uniform — `spells_select` lets a co-member read
      // another user's global spells — so "only my own global rows" has to
      // be said here, where the query means it.
      query = KINDS_WITH_GLOBAL_ROWS.has(targetKind)
        ? query.or(`campaign_id.eq.${campaignId},and(campaign_id.is.null,user_id.eq.${userId})`)
        : query.eq("campaign_id", campaignId);
      const { data, error } = await query;
      if (error || !data) return [];
      // A row missing an id or a name is not a candidate `findByName` (importPlan.ts)
      // could ever legitimately match — dropped rather than coerced to `""`,
      // which would fabricate a lookup row that either matches nothing (harmless)
      // or, worse, an empty-string heading a document genuinely printed as blank.
      const rows: NameLookupRow[] = [];
      for (const row of data as Record<string, unknown>[]) {
        const id = row.id;
        const name = row[targetEntry.displayField];
        if (typeof id === "string" && id.length > 0 && typeof name === "string") rows.push({ id, name });
      }
      return rows;
    },

    // Best-effort: a link write failing doesn't undo the row it points from,
    // which already landed and is already counted as imported.
    applyLinkResolution: async (resolution) => {
      const { apply, sourceId, targetId } = resolution;
      if (apply.kind === "fk_update") {
        await supabase.from(apply.table).update({ [apply.column]: targetId }).eq("id", sourceId);
      } else {
        await supabase.from(apply.table).insert({
          user_id: userId,
          [apply.sourceColumn]: sourceId,
          [apply.targetColumn]: targetId,
        });
      }
    },

    writeQuestSpine: async (input) => {
      return writeQuestSpine(input, {
        createBeat: async (beat) => {
          const { data, error } = await supabase.from("quest_beats").insert(beat).select().single();
          if (error) throw error;
          return data;
        },
        createBeatEdge: async (edge) => {
          const { data, error } = await supabase.from("quest_beat_edges").insert(edge).select().single();
          if (error) throw error;
          return data;
        },
        createObjective: async (objective) => {
          const { data, error } = await supabase.from("quest_objectives").insert(objective).select().single();
          if (error) throw error;
          return data;
        },
        createConsequence: async (consequence) => {
          const { data, error } = await supabase.from("quest_consequences").insert(consequence).select().single();
          if (error) throw error;
          return data;
        },
      });
    },

    resolveMonsterNames: async (names) => {
      const rows = await fetchMonsterMatchRows(campaignId, names);
      return new Map(normalizeMonsterReferenceRows(rows).map((row) => [row.queryName, { targetId: row.targetId }] as const));
    },

    updateEncounterCombatants: async (encounterId, combatants) => {
      await supabase.from("encounters").update({ combatants: combatants as CombatantDef[] }).eq("id", encounterId);
    },

    updateBeatLocation: async (beatId, locationId) => {
      const { error } = await supabase.from("quest_beats").update({ staged_at_location_id: locationId }).eq("id", beatId);
      if (error) throw error;
    },

    insertBeatAttachment: async (attachment: BeatAttachmentWrite) => {
      const { error } = await supabase.from("quest_beat_attachments").insert(attachment);
      if (error) throw error;
    },

    insertLootPlacement: async (placement: LootPlacementWrite) => {
      const { error } = await supabase.from("loot_placements").insert(placement);
      if (error) throw error;
    },

    insertQuestRef: async (ref: QuestRefWrite) => {
      // A duplicate here (the beat-attachment sync trigger may have already
      // written the same row) is expected — `quest_refs`'s own unique
      // constraint is what makes this safe to just attempt and let the
      // caller's best-effort try/catch absorb.
      const { error } = await supabase.from("quest_refs").insert(ref);
      if (error) throw error;
    },

    updateQuestParent: async (questId, parentQuestId) => {
      const { error } = await supabase.from("quests").update({ parent_quest_id: parentQuestId }).eq("id", questId);
      if (error) throw error;
    },

    persistImportedCounts: async (counts) => {
      await supabase.from("document_imports").update({ imported_counts: counts }).eq("id", importRow.id);
    },

    markComplete: async (counts) => {
      const { error } = await supabase
        .from("document_imports")
        .update({ imported_counts: counts, status: "complete" })
        .eq("id", importRow.id);
      if (error) throw error;
      await invalidateActiveImport();
    },
  };
}

export function useDocumentImportRunner() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  const { generateAndCreateMonster } = useGenerateMonster();
  const { ensureOwnedMonster } = useEnsureOwnedMonster();
  const { ensureOwnedItem } = useEnsureOwnedItem();

  /**
   * Runs the whole sweep for `importRow`: every kind in `input.entitiesByKind`
   * imports first, and only then does one linking phase resolve every name
   * reference — see `runImportSweep`'s own doc comment (`importSweep.ts`) for
   * why that order matters. Throws (rather than silently no-opping) when the
   * row's provenance is missing or the caller isn't signed in, since both are
   * real, actionable failures a UI should surface, not swallow.
   */
  async function runImportSweep(
    importRow: DocumentImport,
    input: ImportSweepInput,
    onProgress?: (progress: ImportSweepProgress) => void,
  ): Promise<ImportSweepReport> {
    if (!importRow.ai_provenance) {
      throw new Error("This document's generation info is missing, so nothing here can be imported.");
    }
    const user = getCurrentUser();
    if (!user) throw new Error("You must be signed in to import.");

    const invalidateActiveImport = () => qc.invalidateQueries({ queryKey: activeImportKey(campaign.activeCampaignId) });
    const deps = buildDeps(importRow, user.id, generateAndCreateMonster, ensureOwnedMonster, ensureOwnedItem, invalidateActiveImport);
    return runImportSweepCore(importRow, input, deps, onProgress);
  }

  return { runImportSweep };
}
