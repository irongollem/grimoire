/**
 * The Supabase-backed half of `runImportKind` (src/lib/documentImport/) —
 * the thin wiring that turns its injected `RunImportKindDeps` into real
 * inserts, lookups and writes, the same way `useDocumentImport.ts` is the
 * thin Supabase/TanStack layer over the rest of the document importer's pure
 * logic.
 *
 * `DocumentImportWizard.vue` (the settings review, one kind per step) and
 * `QuestPasteImportPanel.vue` (the compact create-quest paste review, #839 —
 * every kind it has anything to do for, in one confirm action) both call
 * `runKind` here instead of each wiring their own copy of "insert this row,
 * resolve its links, write its spine." #839 is explicit that a second,
 * smaller review surface is fine; a second copy of this wiring would not be.
 */
import { useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { getEntityKindEntry } from "@/lib/documentImport/entityKinds";
import { isQuotaExceeded } from "@/lib/quotaError";
import { normalizeMonsterMatchRows } from "@/lib/documentImport/entityMatching";
import { writeQuestSpine } from "@/lib/quests/spineWrite";
import {
  runImportKind,
  type RunImportKindDeps,
  type RunImportKindResult,
} from "@/lib/documentImport/runImportKind";
import { activeImportKey } from "./useDocumentImport";
import type { NameLookupRow } from "@/lib/documentImport/importPlan";
import type { AiProvenance } from "@/ai/provenance";
import type {
  DocumentImport,
  DocumentImportStatus,
  ExtractedEntity,
  ImportEntityKind,
} from "@/types/documentImport.types";
import type { CombatantDef } from "@/types/encounter.types";

/** Raw shape of one `resolve_monster_references` row as it comes back over
 *  `supabase.rpc` — the client here is untyped (src/lib/supabase.ts has no
 *  Database generic), so this is the boundary where that untyped response
 *  gets treated as genuinely unknown before `normalizeMonsterMatchRows`
 *  validates it field by field. Mirrors the same helper `DocumentImportWizard.vue`
 *  keeps privately for its own monsters/items *matching* feature (#837/#838),
 *  which this module does not touch — the compact review never offers a
 *  per-entity link-vs-create choice, only `resolveEncounterCombatants`'s own
 *  monster lookup needs this RPC here.
 */
async function fetchMonsterMatchRows(campaignId: string, names: readonly string[]): Promise<unknown[]> {
  const { data, error } = await supabase.rpc("resolve_monster_references", {
    p_campaign_id: campaignId,
    p_names: names as string[],
  });
  if (error || !Array.isArray(data)) return [];
  return data as unknown[];
}

function buildDeps(table: string, campaignId: string, userId: string): RunImportKindDeps {
  return {
    insertRow: async (row) => {
      const { data, error } = await supabase.from(table).insert({ ...row, user_id: userId }).select("id").single();
      if (error) {
        if (isQuotaExceeded(error)) return { status: "quota_exceeded" };
        return { status: "failed", message: error.message };
      }
      return { status: "inserted", id: (data as { id: string }).id };
    },
    fetchNameLookup: async (targetKind): Promise<readonly NameLookupRow[]> => {
      const targetEntry = getEntityKindEntry(targetKind);
      const { data, error } = await supabase
        .from(targetEntry.table)
        .select(`id, ${targetEntry.displayField}`)
        .eq("campaign_id", campaignId);
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
      try {
        if (apply.kind === "fk_update") {
          await supabase.from(apply.table).update({ [apply.column]: targetId }).eq("id", sourceId);
        } else {
          await supabase.from(apply.table).insert({
            user_id: userId,
            [apply.sourceColumn]: sourceId,
            [apply.targetColumn]: targetId,
          });
        }
      } catch {
        // See doc comment above.
      }
    },
    writeQuestSpine: async (input) => {
      await writeQuestSpine(input, {
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
      return new Map(normalizeMonsterMatchRows(rows).map((row) => [row.queryName, row.match] as const));
    },
    updateEncounterCombatants: async (encounterId, combatants) => {
      await supabase.from("encounters").update({ combatants: combatants as CombatantDef[] }).eq("id", encounterId);
    },
  };
}

export function useDocumentImportRunner() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();

  /**
   * Runs one kind's plan for `importRow` — see `runImportKind`'s own doc
   * comment for what that actually does. Throws (rather than silently
   * no-opping) when the row's provenance is missing or the caller isn't
   * signed in, since both are real, actionable failures a UI should surface,
   * not swallow.
   */
  async function runKind<K extends ImportEntityKind>(
    importRow: Pick<DocumentImport, "campaign_id" | "ai_provenance">,
    kind: K,
    entities: readonly ExtractedEntity<K>[],
    selectedRefs: ReadonlySet<string>,
    linkedRefs: ReadonlySet<string> = new Set(),
  ): Promise<RunImportKindResult> {
    const provenance: AiProvenance | null = importRow.ai_provenance;
    if (!provenance) {
      throw new Error("This document's generation info is missing, so nothing here can be imported.");
    }
    const user = getCurrentUser();
    if (!user) throw new Error("You must be signed in to import.");

    const entry = getEntityKindEntry(kind);
    const deps = buildDeps(entry.table, importRow.campaign_id, user.id);
    return runImportKind({ kind, entities, selectedRefs, linkedRefs, campaignId: importRow.campaign_id, provenance }, deps);
  }

  /** Marks a row done — `imported_counts` merged with whatever the caller
   *  already knew (a row a wizard partly reviewed before this ran keeps
   *  those counts) — and invalidates the active-row query so a mounted
   *  surface reading it (either door) drops it immediately rather than on
   *  its next poll. */
  async function finalizeImport(importRowId: string, importedCounts: Partial<Record<ImportEntityKind, number>>): Promise<void> {
    const { error } = await supabase
      .from("document_imports")
      .update({ imported_counts: importedCounts, status: "complete" satisfies DocumentImportStatus })
      .eq("id", importRowId);
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: activeImportKey(campaign.activeCampaignId) });
  }

  return { runKind, finalizeImport };
}
