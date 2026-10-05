import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { fetchOpen5eClasses } from "@/lib/library/open5eClassImport";
import { fetchOpen5eFeats } from "@/lib/library/open5eFeatImport";
import { mergeImportedFeature, officialIdentity, planOfficialClassContent, unionFeatureMap } from "@/lib/library/officialClassContent";
import type {
  ContentSourceRef,
  ExistingOfficialRow,
  OfficialClassContentPlan,
  PlannedFeatureMap,
  SystemClassRef,
} from "@/lib/library/officialClassContent";
import type { ClassFeatureUpdate } from "@/types/feature.types";
import type { RulesetKey } from "@/types/ruleset.types";

export interface OfficialClassContentImportResult {
  features: { inserted: number; updated: number };
  /** Owned fields left alone because an admin edited them since the last import. */
  keptEditedFields: number;
  /** Existing features the import had nothing to change on (no request sent). */
  featuresUnchanged: number;
  subclasses: { inserted: number; updated: number };
  classes: { inserted: number; updated: number };
  systemClasses: { updated: number };
  /** Existing official rows Open5e no longer lists (kept, never deleted). */
  notListed: OfficialClassContentPlan["notListed"];
  skippedDocuments: string[];
  catalogueWarnings: string[];
}

const INSERT_BATCH = 100;
const UPDATE_CONCURRENCY = 25;
/** PostgREST returns at most this many rows per request. */
const PAGE = 1000;

/** Every row a query returns, a page at a time: official features run to thousands. */
async function readAll<T>(
  read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: Error | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1);
    if (error) throw error;
    if (!data) throw new Error("official class import: a read returned no data and no error");
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

type FeatureMap = Record<string, string[]>;
type ExistingWithMap = ExistingOfficialRow & { features: FeatureMap | null };
type ExistingFeatureRow = ExistingOfficialRow & Record<string, unknown>;

/**
 * Everything the merge compares against: the owned fields and their baseline
 * (`provenance`), plus the columns the import refreshes, so an unchanged row
 * can be skipped without a request.
 */
const FEATURE_COLUMNS =
  "id, source_document_key, source_record_key, ruleset, name, description, prerequisite, mechanics, feat_category, prerequisites, repeatable, ability_increase, provenance, conceptual_key, source_revision, source_license, campaign_id, source, open5e_import, kind" as const;

async function readOfficialFeatures(): Promise<ExistingFeatureRow[]> {
  return readAll<ExistingFeatureRow>((from, to) =>
    supabase.from("class_features").select(FEATURE_COLUMNS).is("user_id", null).order("id").range(from, to),
  );
}

/** The feature map is read too: the import adds to it, it never replaces it. */
async function readOfficialDefinitions(table: "custom_classes" | "custom_subclasses"): Promise<ExistingWithMap[]> {
  return readAll<ExistingWithMap>((from, to) =>
    supabase
      .from(table)
      .select("id, source_document_key, source_record_key, ruleset, features")
      .is("user_id", null)
      .order("id")
      .range(from, to),
  );
}

function resolveMap(map: PlannedFeatureMap, ids: ReadonlyMap<string, string>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [level, identities] of Object.entries(map)) {
    out[level] = identities.map(identity => {
      const id = ids.get(identity);
      if (!id) throw new Error(`official class import: feature ${identity} was planned but has no row`);
      return id;
    });
  }
  return out;
}

/**
 * An update RLS refuses changes nothing and returns no error, so an import
 * run without the admin's rights would report success having written nothing.
 * Every update therefore reads its row back and fails when it is not there.
 */
function requireRow(data: unknown[] | null, table: string, id: string): void {
  if (!data || data.length !== 1) throw new Error(`official class import: ${table} ${id} was not updated (not the admin?)`);
}

/** Runs `task` over `items` UPDATE_CONCURRENCY at a time, so a thousand updates are not a thousand open requests. */
async function inChunks<T>(items: readonly T[], task: (item: T) => PromiseLike<void>): Promise<void> {
  for (let i = 0; i < items.length; i += UPDATE_CONCURRENCY) {
    await Promise.all(items.slice(i, i + UPDATE_CONCURRENCY).map(task));
  }
}

/**
 * The one admin import of official classes, subclasses, class features and
 * feats (#976). Replaces the per-account "Sync from Open5e" buttons: official
 * rows are written with `user_id = null` and read by everyone. RLS lets only
 * the admin do this, so the panel that calls it is admin-only too.
 */
export function useOfficialClassContentImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<OfficialClassContentImportResult> => {
      const [classes, feats, sources, systemClasses, existingFeatures, existingSubclasses, existingClasses] =
        await Promise.all([
          fetchOpen5eClasses(),
          fetchOpen5eFeats(),
          readAll<ContentSourceRef>((from, to) =>
            supabase.from("content_sources").select("key, open5e_key, is_redistributable").order("key").range(from, to)),
          readAll<SystemClassRef & { features: FeatureMap | null }>((from, to) =>
            supabase.from("system_classes").select("id, ruleset, class_name, features").order("id").range(from, to)),
          readOfficialFeatures(),
          readOfficialDefinitions("custom_subclasses"),
          readOfficialDefinitions("custom_classes"),
        ]);

      const plan = planOfficialClassContent({
        classes,
        feats,
        sources,
        existing: { features: existingFeatures, subclasses: existingSubclasses, classes: existingClasses },
        systemClasses,
      });

      // Features first: subclasses and classes reference them by id.
      const featureIds = new Map<string, string>();
      for (const f of plan.features) if (f.existingId) featureIds.set(f.identity, f.existingId);

      const toInsert = plan.features.filter(f => !f.existingId);
      for (let i = 0; i < toInsert.length; i += INSERT_BATCH) {
        const batch = toInsert.slice(i, i + INSERT_BATCH);
        const { data, error } = await supabase
          .from("class_features")
          .insert(batch.map(f => ({ ...f.insert, user_id: null, campaign_id: null })))
          .select("id, source_document_key, source_record_key, ruleset");
        if (error) throw error;
        for (const row of data as { id: string; source_document_key: string; source_record_key: string; ruleset: RulesetKey | null }[]) {
          featureIds.set(officialIdentity(row.source_document_key, row.source_record_key, row.ruleset), row.id);
        }
      }

      // A refresh never undoes an admin's edit (mergeImportedFeature) and leaves
      // the tags alone. A feature with nothing to change sends no request.
      const currentFeatures = new Map(existingFeatures.map(r => [r.id, r]));
      const featureUpdates = plan.features.filter(f => f.existingId);
      let keptEditedFields = 0;
      let featuresUnchanged = 0;
      await inChunks(featureUpdates, async f => {
        const current = currentFeatures.get(f.existingId!);
        if (!current) throw new Error(`official class import: feature ${f.existingId} was matched but not read`);
        const { update, kept } = mergeImportedFeature(current, { ...f.insert });
        keptEditedFields += kept.length;
        if (Object.keys(update).length === 0) {
          featuresUnchanged++;
          return;
        }
        const { data, error } = await supabase
          .from("class_features")
          .update(update as ClassFeatureUpdate)
          .eq("id", f.existingId!)
          .select("id");
        if (error) throw error;
        requireRow(data, "class_features", f.existingId!);
      });

      async function writeDefinitions<
        P extends { existingId: string | null; insert: object; update: object; featureMap: PlannedFeatureMap },
      >(
        table: "custom_subclasses" | "custom_classes",
        planned: readonly P[],
        current: readonly ExistingWithMap[],
      ) {
        const currentMaps = new Map(current.map(r => [r.id, r.features]));
        const fresh = planned.filter(p => !p.existingId);
        for (let i = 0; i < fresh.length; i += INSERT_BATCH) {
          const rows = fresh.slice(i, i + INSERT_BATCH).map(p => ({
            ...p.insert,
            features: resolveMap(p.featureMap, featureIds),
            user_id: null,
            campaign_id: null,
          }));
          const { error } = await supabase.from(table).insert(rows);
          if (error) throw error;
        }
        const existing = planned.filter(p => p.existingId);
        await inChunks(existing, async p => {
          const { data, error } = await supabase
            .from(table)
            .update({
              ...p.update,
              features: unionFeatureMap(currentMaps.get(p.existingId!) ?? null, resolveMap(p.featureMap, featureIds)),
            })
            .eq("id", p.existingId!)
            .select("id");
          if (error) throw error;
          requireRow(data, table, p.existingId!);
        });
        return { inserted: fresh.length, updated: existing.length };
      }

      const subclassCounts = await writeDefinitions("custom_subclasses", plan.subclasses, existingSubclasses);
      const classCounts = await writeDefinitions("custom_classes", plan.classes, existingClasses);

      // The SRD classes keep their chassis; only their feature map is imported,
      // added to what the row already holds.
      const systemMaps = new Map(systemClasses.map(r => [r.id, r.features]));
      await inChunks(plan.systemClasses, async s => {
        const { data, error } = await supabase
          .from("system_classes")
          .update({ features: unionFeatureMap(systemMaps.get(s.systemClassId) ?? null, resolveMap(s.featureMap, featureIds)) })
          .eq("id", s.systemClassId)
          .select("id");
        if (error) throw error;
        requireRow(data, "system_classes", s.systemClassId);
      });

      return {
        features: { inserted: toInsert.length, updated: featureUpdates.length - featuresUnchanged },
        keptEditedFields,
        featuresUnchanged,
        subclasses: subclassCounts,
        classes: classCounts,
        systemClasses: { updated: plan.systemClasses.length },
        notListed: plan.notListed,
        skippedDocuments: plan.skippedDocuments,
        catalogueWarnings: plan.catalogueWarnings,
      };
    },
    // Prefix keys: the readers add the ruleset or an id after these.
    onSettled: async () => {
      await Promise.all(
        ["class_features", "custom_classes", "custom_subclasses", "system_classes"].map(key =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
}
