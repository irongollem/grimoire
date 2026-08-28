import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { ClassFeature, ClassFeatureInsert, ClassFeatureUpdate } from "@/types/feature.types";
import { useRuleset } from "@/composables/rules/useRuleset";
import type { RulesetKey } from "@/types/ruleset.types";

export type ImportResult = { inserted: number; updated: number };

const QUERY_KEY = "class_features";

async function fetchAll(ruleset: RulesetKey): Promise<ClassFeature[]> {
  const { data, error } = await supabase
    .from("class_features")
    .select("*")
    .or(`ruleset.is.null,ruleset.eq.${ruleset}`)
    .order("name", { ascending: true });
  if (error) throw error;
  return data as ClassFeature[];
}

async function fetchOne(id: string): Promise<ClassFeature> {
  const { data, error } = await supabase
    .from("class_features")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as ClassFeature;
}

async function createFeature(input: ClassFeatureInsert): Promise<ClassFeature> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("class_features")
    .insert({ ...input, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as ClassFeature;
}

async function updateFeature(id: string, update: ClassFeatureUpdate): Promise<ClassFeature> {
  const { data, error } = await supabase
    .from("class_features")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as ClassFeature;
}

async function deleteFeature(id: string): Promise<void> {
  const { error } = await supabase.from("class_features").delete().eq("id", id);
  if (error) throw error;
}

/** Full list — used for EntityCombobox in the archetypes editor. staleTime Infinity since features change rarely. */
export function useAllFeatures() {
  const { ruleset } = useRuleset();
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, ruleset.value]),
    queryFn: () => fetchAll(ruleset.value),
    staleTime: Infinity,
  });
}

export function useFeature(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, id.value]),
    queryFn: () => fetchOne(id.value),
    enabled: () => !!id.value,
  });
}

export function useCreateFeature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createFeature,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateFeature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: ClassFeatureUpdate }) =>
      updateFeature(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useDeleteFeature() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteFeature,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useImportOpen5eFeatures() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ImportResult> => {
      const { fetchOpen5eFeats } = await import("@/lib/library/open5eFeatImport");
      const feats = await fetchOpen5eFeats();
      const user = getCurrentUser();

      if (!user) throw new Error("Not authenticated");
      type ExistingRow = { id: string; source_document_key: string; source_record_key: string };
      const { data: existingData, error: existingError } = await supabase
        .from("class_features")
        .select("id, source_document_key, source_record_key")
        .eq("user_id", user.id)
        .eq("open5e_import", true)
        .not("source_document_key", "is", null)
        .not("source_record_key", "is", null);
      if (existingError) throw existingError;
      const existing = (existingData ?? []) as ExistingRow[];
      const byIdentity = new Map(existing.map(row => [
        `${row.source_document_key}::${row.source_record_key}`,
        row,
      ]));
      const existingFor = (feat: ClassFeatureInsert) =>
        byIdentity.get(`${feat.source_document_key}::${feat.source_record_key}`);

      const toInsert = feats.filter((feat) => !existingFor(feat));
      const INSERT_BATCH = 100;
      for (let i = 0; i < toInsert.length; i += INSERT_BATCH) {
        const batch = toInsert.slice(i, i + INSERT_BATCH).map((f) => ({ ...f, user_id: user.id }));
        const { error } = await supabase.from("class_features").insert(batch);
        if (error) throw error;
      }

      // Update existing rows — refresh prerequisite, feature_type, and description
      // from Open5e; never touch user-edited tags, source override, or campaign_id.
      const toUpdate = feats.filter((feature) => !!existingFor(feature));
      const UPDATE_CONCURRENCY = 25;
      for (let i = 0; i < toUpdate.length; i += UPDATE_CONCURRENCY) {
        await Promise.all(
          toUpdate.slice(i, i + UPDATE_CONCURRENCY).map((f) =>
            supabase
              .from("class_features")
              .update({
                prerequisite: f.prerequisite,
                feature_type: f.feature_type,
                name: f.name,
                description: f.description,
                source: f.source,
                ruleset: f.ruleset,
                conceptual_key: f.conceptual_key,
                source_document_key: f.source_document_key,
                source_record_key: f.source_record_key,
                source_revision: f.source_revision,
                source_license: f.source_license,
                provenance: f.provenance,
              })
              .eq("id", existingFor(f)!.id),
          ),
        );
      }

      return { inserted: toInsert.length, updated: toUpdate.length };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

/**
 * Backfills descriptions on system (user_id = null) class features by fetching
 * them from the Open5e v2 API. Only updates rows that currently have no description.
 * Requires the class_features_system_desc_policy migration to be applied first.
 */
export function useBackfillSystemFeatureDescriptions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ updated: number }> => {
      const { fetchClassFeatureDescriptions } = await import("@/lib/library/open5eClassImport");
      const descMap = await fetchClassFeatureDescriptions();

      // Fetch all system features that currently have no description
      const names = [...descMap.keys()];
      type SystemFeatureRow = { id: string; name: string };
      const rows: SystemFeatureRow[] = [];
      const CHUNK = 200;
      for (let i = 0; i < names.length; i += CHUNK) {
        const { data } = await supabase
          .from("class_features")
          .select("id, name")
          .is("user_id", null)
          .is("description", null)
          .in("name", names.slice(i, i + CHUNK));
        rows.push(...((data ?? []) as SystemFeatureRow[]));
      }

      // Update each missing description in batches
      const CONCURRENCY = 25;
      let updated = 0;
      for (let i = 0; i < rows.length; i += CONCURRENCY) {
        await Promise.all(
          rows.slice(i, i + CONCURRENCY).map((row) => {
            const desc = descMap.get(row.name);
            if (!desc) return Promise.resolve();
            updated++;
            return supabase
              .from("class_features")
              .update({ description: desc })
              .eq("id", row.id);
          }),
        );
      }

      return { updated };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
