import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type {
  CustomSubclass,
  CustomSubclassInsert,
  CustomSubclassUpdate,
} from "@/levelup/customTypes";
import { fetchOpen5eSubclasses, subclassToInsert, subclassImportUpdateFields } from "@/lib/open5eClassImport";
import { classFeatureIdentity, collectFeatures, ensureClassFeatures } from "@/lib/classFeatureSync";
import { useRuleset } from "@/composables/useRuleset";
import type { RulesetKey } from "@/types/ruleset.types";

const QUERY_KEY = "custom_subclasses";

async function fetchAll(ruleset: RulesetKey): Promise<CustomSubclass[]> {
  const { data, error } = await supabase
    .from("custom_subclasses")
    .select("*")
    .or(`ruleset.is.null,ruleset.eq.${ruleset}`)
    .order("class_name", { ascending: true })
    .order("subclass_name", { ascending: true });
  if (error) throw error;
  return data as CustomSubclass[];
}

async function fetchOne(id: string): Promise<CustomSubclass> {
  const { data, error } = await supabase
    .from("custom_subclasses")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as CustomSubclass;
}

async function fetchByClassAndSubclass(
  className: string,
  subclassName: string,
  ruleset: RulesetKey,
): Promise<CustomSubclass | null> {
  const { data, error } = await supabase
    .from("custom_subclasses")
    .select("*")
    .eq("class_name", className)
    .eq("subclass_name", subclassName)
    .or(`ruleset.is.null,ruleset.eq.${ruleset}`);
  if (error) throw error;
  const matches = (data ?? []) as CustomSubclass[];
  return matches.find(row => !row.source_document_key) ?? matches[0] ?? null;
}

async function createCustomSubclass(input: CustomSubclassInsert): Promise<CustomSubclass> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("custom_subclasses")
    .insert({ ...input, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as CustomSubclass;
}

async function updateCustomSubclass(
  id: string,
  update: CustomSubclassUpdate,
): Promise<CustomSubclass> {
  const { data, error } = await supabase
    .from("custom_subclasses")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as CustomSubclass;
}

async function deleteCustomSubclass(id: string): Promise<void> {
  const { error } = await supabase.from("custom_subclasses").delete().eq("id", id);
  if (error) throw error;
}

export function useAllCustomSubclasses() {
  const { ruleset } = useRuleset();
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, ruleset.value]),
    queryFn: () => fetchAll(ruleset.value),
    staleTime: Infinity,
  });
}

export function useCustomSubclass(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, id.value]),
    queryFn: () => fetchOne(id.value),
    enabled: () => !!id.value,
  });
}

export function useCustomSubclassByClassAndSubclass(
  className: Ref<string>,
  subclassName: Ref<string>,
) {
  const { ruleset } = useRuleset();
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "by-class", ruleset.value, className.value, subclassName.value]),
    queryFn: () => fetchByClassAndSubclass(className.value, subclassName.value, ruleset.value),
    enabled: () => !!className.value && !!subclassName.value,
    staleTime: Infinity,
  });
}

export function useCreateCustomSubclass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCustomSubclass,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateCustomSubclass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: CustomSubclassUpdate }) =>
      updateCustomSubclass(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export interface SubclassImportResult { inserted: number; updated: number }

export function useImportOpen5eSubclasses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<SubclassImportResult> => {
      const user = getCurrentUser();

      const previews = await fetchOpen5eSubclasses();

      // Ensure all referenced class features exist, creating missing ones automatically
      const featureIdentityToId = await ensureClassFeatures(collectFeatures(previews));

      // Resolve features for every preview
      function resolveFeatures(p: typeof previews[number]): Record<string, string[]> {
        const features: Record<string, string[]> = {};
        for (const [level, records] of Object.entries(p.featureRecordsByLevel)) {
          const uuids = records
            .map(record => featureIdentityToId.get(classFeatureIdentity(record)))
            .filter((id): id is string => !!id);
          if (uuids.length) features[level] = uuids;
        }
        return features;
      }

      const { data: existing } = await supabase
        .from("custom_subclasses")
        .select("id, source_document_key, source_record_key")
        .eq("user_id", user!.id)
        .not("source_document_key", "is", null)
        .not("source_record_key", "is", null);

      const existingMap = new Map(
        (existing ?? []).map(r => [`${r.source_document_key}::${r.source_record_key}`, r.id]),
      );
      const identity = (p: typeof previews[number]) => `${p.sourceDocumentKey}::${p.sourceRecordKey}`;

      const toInsert = previews.filter(p => !existingMap.has(identity(p)));
      const toUpdate = previews.filter(p => existingMap.has(identity(p)));

      if (toInsert.length > 0) {
        const rows = toInsert.map(p => ({ ...subclassToInsert(p), features: resolveFeatures(p), user_id: user!.id }));
        const { error } = await supabase.from("custom_subclasses").insert(rows);
        if (error) throw error;
      }

      // Refresh only upstream identity/shell content — never granted_spells,
      // steps, resources, or hp_per_level, which the DM configures by hand
      // after import. See subclassImportUpdateFields's doc comment.
      for (const p of toUpdate) {
        const id = existingMap.get(identity(p))!;
        const { error } = await supabase
          .from("custom_subclasses")
          .update({ ...subclassImportUpdateFields(subclassToInsert(p)), features: resolveFeatures(p) })
          .eq("id", id);
        if (error) throw error;
      }

      return { inserted: toInsert.length, updated: toUpdate.length };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useDeleteCustomSubclass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCustomSubclass,
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: [QUERY_KEY, id] });
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}
