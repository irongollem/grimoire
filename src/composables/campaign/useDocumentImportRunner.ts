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
import { isLocationType } from "@/lib/locations/tiers";
import { isQuotaExceeded } from "@/lib/quotaError";
import { normalizeMonsterReferenceRows } from "@/lib/documentImport/entityMatching";
import { monsterGenerationConcept, monsterGenerationOptionsFromPage } from "@/lib/documentImport/monsterGenerationConcept";
import { useGenerateMonster } from "@/composables/monsters/useGenerateMonster";
import { useQuestSpineWriter } from "@/composables/quests/useQuestSpineWriter";
import { insertQuestRefs } from "@/composables/quests/useQuests";
import { queueQuestEmbedding } from "@/composables/quests/queueQuestEmbedding";
import {
  runImportSweep as runImportSweepCore,
  type BeatAttachmentWrite,
  type ImportSweepDeps,
  type ImportSweepInput,
  type ImportSweepProgress,
  type ImportSweepReport,
  type LootPlacementWrite,
} from "@/lib/documentImport/importSweep";
import type { InsertRowOutcome } from "@/lib/documentImport/runImportKind";
import { activeImportKey } from "./useDocumentImport";
import type { NameLookupRow } from "@/lib/documentImport/importPlan";
import type { AiDocumentImport, ImportEntityKind } from "@/types/documentImport.types";
import type { CombatantDef } from "@/types/encounter.types";
import { itemRefColumns } from "@/lib/itemRef";

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

function buildDeps(
  importRow: AiDocumentImport,
  userId: string,
  generateAndCreateMonster: ReturnType<typeof useGenerateMonster>["generateAndCreateMonster"],
  writeQuestSpine: ImportSweepDeps["writeQuestSpine"],
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
      const id = (data as { id: string }).id;
      // A quest with no spine never reaches `writeSpine`, which queues the rest.
      if (table === "quests") queueQuestEmbedding(id);
      return { status: "inserted", id };
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

    fetchNameLookup: async (targetKind): Promise<readonly NameLookupRow[]> => {
      const targetEntry = getEntityKindEntry(targetKind);
      // `locations` also needs `location_type` on every row — `runLocationsImportKind`
      // (runImportKind.ts) checks it before writing a resolved `parent_name`
      // as `parent_id`, since `guard_location_room_parent` only accepts a
      // parent whose type can actually hold a room. No other kind's lookup
      // has a use for it. Kept as two literal `.select()` calls (rather than
      // one built from a computed string) so the query builder's own
      // template-literal column inference still applies to each.
      let query =
        targetKind === "locations"
          ? supabase.from(targetEntry.table).select(`id, ${targetEntry.displayField}, location_type`)
          : supabase.from(targetEntry.table).select(`id, ${targetEntry.displayField}`);
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
        if (typeof id !== "string" || id.length === 0 || typeof name !== "string") continue;
        const locationType = targetKind === "locations" && isLocationType(row.location_type) ? row.location_type : undefined;
        rows.push(locationType ? { id, name, locationType } : { id, name });
      }
      return rows;
    },

    // Best-effort: a link write failing doesn't undo the row it points from,
    // which already landed and is already counted as imported.
    applyLinkResolutions: async (resolutions) => {
      // Join rows go in one write per table (#951). Each pair is unique, so a
      // pair the DM's own row already holds is skipped by the database rather
      // than refusing the whole write.
      const joinRowsByTable = new Map<string, { onConflict: string; rows: Record<string, string>[] }>();
      const fkUpdates: Promise<unknown>[] = [];
      for (const { apply, sourceId, targetId } of resolutions) {
        if (apply.kind === "fk_update") {
          // Every row gets its own value, so these stay one update per row:
          // sent together rather than one after another.
          fkUpdates.push(Promise.resolve(supabase.from(apply.table).update({ [apply.column]: targetId }).eq("id", sourceId)));
          continue;
        }
        let group = joinRowsByTable.get(apply.table);
        if (!group) {
          group = { onConflict: `${apply.sourceColumn},${apply.targetColumn}`, rows: [] };
          joinRowsByTable.set(apply.table, group);
        }
        group.rows.push({ user_id: userId, [apply.sourceColumn]: sourceId, [apply.targetColumn]: targetId });
      }
      await Promise.allSettled([
        ...fkUpdates,
        ...[...joinRowsByTable].map(([table, { onConflict, rows }]) =>
          supabase.from(table).upsert(rows, { onConflict, ignoreDuplicates: true }),
        ),
      ]);
    },

    writeQuestSpine,

    resolveMonsterNames: async (names) => {
      const rows = await fetchMonsterMatchRows(campaignId, names);
      return new Map(normalizeMonsterReferenceRows(rows).map((row) => [row.queryName, { targetId: row.targetId }] as const));
    },

    updateEncounterCombatants: async (encounterId, combatants) => {
      await supabase.from("encounters").update({ combatants: combatants as CombatantDef[] }).eq("id", encounterId);
    },

    insertBeatAttachments: async (attachments: BeatAttachmentWrite[]) => {
      const { error } = await supabase.from("quest_beat_attachments").insert(attachments);
      if (error) throw error;
    },

    insertLootPlacements: async (placements: LootPlacementWrite[]) => {
      // `LootPlacementWrite.home` is exactly one of the two shapes
      // `loot_placements_one_home`/`loot_placements_beat_pair` (the database)
      // allow — a beat's own loot (`beat_id`+`quest_id`) or a room's own loot
      // (`location_id` alone). Widened into the real row shape here, at the
      // one place this dep actually talks to Supabase.
      const rows = placements.map((placement) => ({
        campaign_id: placement.campaign_id,
        kind: placement.kind,
        // A library pick is stored as a reference, never cloned: the picked
        // id's shape decides which of the two columns carries it.
        ...itemRefColumns(placement.item_ref),
        quantity: placement.quantity,
        label: placement.label,
        beat_id: "beat_id" in placement.home ? placement.home.beat_id : null,
        quest_id: "beat_id" in placement.home ? placement.home.quest_id : null,
        location_id: "location_id" in placement.home ? placement.home.location_id : null,
      }));
      const { error } = await supabase.from("loot_placements").insert(rows);
      if (error) throw error;
    },

    // One request; see `insertQuestRefs` (useQuests.ts).
    insertQuestRefs,

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
  const { writeSpine } = useQuestSpineWriter();

  /**
   * Runs the whole sweep for `importRow`: every kind in `input.entitiesByKind`
   * imports first, and only then does one linking phase resolve every name
   * reference — see `runImportSweep`'s own doc comment (`importSweep.ts`) for
   * why that order matters. Throws (rather than silently no-opping) when the
   * row's provenance is missing or the caller isn't signed in, since both are
   * real, actionable failures a UI should surface, not swallow.
   */
  async function runImportSweep(
    importRow: AiDocumentImport,
    input: ImportSweepInput,
    onProgress?: (progress: ImportSweepProgress) => void,
  ): Promise<ImportSweepReport> {
    if (!importRow.ai_provenance) {
      throw new Error("This document's generation info is missing, so nothing here can be imported.");
    }
    const user = getCurrentUser();
    if (!user) throw new Error("You must be signed in to import.");

    const invalidateActiveImport = () => qc.invalidateQueries({ queryKey: activeImportKey(campaign.activeCampaignId) });
    const deps = buildDeps(importRow, user.id, generateAndCreateMonster, writeSpine, invalidateActiveImport);
    return runImportSweepCore(importRow, input, deps, onProgress);
  }

  return { runImportSweep };
}
