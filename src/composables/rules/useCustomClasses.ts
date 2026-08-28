import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { CustomClass, CustomClassInsert, CustomClassUpdate, SystemClass } from "@/levelup/customTypes";
import { fetchOpen5eBaseClasses, baseClassToInsert, classImportUpdateFields } from "@/lib/library/open5eClassImport";
import { classFeatureIdentity, collectFeatures, ensureClassFeatures } from "@/lib/library/classFeatureSync";
import { useRuleset } from "@/composables/rules/useRuleset";
import { useCampaignStore } from "@/stores/campaign";
import { allowedSystemClasses, allowedCampaignScoped } from "@/lib/campaignContentGating";
import type { RulesetKey } from "@/types/ruleset.types";

const QUERY_KEY = "custom_classes";

async function fetchAll(ruleset: RulesetKey): Promise<CustomClass[]> {
  const { data, error } = await supabase
    .from("custom_classes")
    .select("*")
    .or(`ruleset.is.null,ruleset.eq.${ruleset}`)
    .order("class_name", { ascending: true });
  if (error) throw error;
  return data as CustomClass[];
}

async function fetchOne(id: string): Promise<CustomClass> {
  const { data, error } = await supabase
    .from("custom_classes")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as CustomClass;
}

async function fetchByName(className: string, ruleset: RulesetKey): Promise<CustomClass | null> {
  const { data, error } = await supabase
    .from("custom_classes")
    .select("*")
    .eq("class_name", className)
    .or(`ruleset.is.null,ruleset.eq.${ruleset}`);
  if (error) throw error;
  const matches = (data ?? []) as CustomClass[];
  return matches.find(row => !row.source_document_key) ?? matches[0] ?? null;
}

async function createCustomClass(input: CustomClassInsert): Promise<CustomClass> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("custom_classes")
    .insert({ ...input, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as CustomClass;
}

async function updateCustomClass(id: string, update: CustomClassUpdate): Promise<CustomClass> {
  const { data, error } = await supabase
    .from("custom_classes")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as CustomClass;
}

async function deleteCustomClass(id: string): Promise<void> {
  const { error } = await supabase.from("custom_classes").delete().eq("id", id);
  if (error) throw error;
}

export function useAllCustomClasses() {
  const { ruleset } = useRuleset();
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, ruleset.value]),
    queryFn: () => fetchAll(ruleset.value),
    staleTime: Infinity,
  });
}

export function useCustomClass(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, id.value]),
    queryFn: () => fetchOne(id.value),
    enabled: () => !!id.value,
  });
}

export function useCustomClassByName(className: Ref<string>) {
  const { ruleset } = useRuleset();
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "by-name", ruleset.value, className.value]),
    queryFn: () => fetchByName(className.value, ruleset.value),
    enabled: () => !!className.value,
    staleTime: Infinity,
  });
}

export function useCreateCustomClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCustomClass,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateCustomClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: CustomClassUpdate }) =>
      updateCustomClass(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useAllSystemClasses() {
  const { ruleset } = useRuleset();
  return useQuery({
    queryKey: computed(() => ["system_classes", ruleset.value]),
    queryFn: async (): Promise<SystemClass[]> => {
      const { data, error } = await supabase
        .from("system_classes")
        .select("*")
        .eq("ruleset", ruleset.value)
        .order("class_name", { ascending: true });
      if (error) throw error;
      return data as SystemClass[];
    },
    staleTime: Infinity,
  });
}

/** {@link useAllSystemClasses} narrowed to the SRD classes the DM left enabled
 *  in Campaign Settings (`campaigns.disabled_class_names`). **Every class picker
 *  must use `data`** — DM and player alike (#566). `all` is the ungated list,
 *  for resolving the class a character already has: disabling a class hides it
 *  from the pickers, it does not stop an existing barbarian from levelling. */
export function useCampaignSystemClasses() {
  const { data: all, isLoading } = useAllSystemClasses();
  const campaign = useCampaignStore();
  const data = computed(() =>
    allowedSystemClasses(all.value, campaign.activeCampaign?.disabled_class_names),
  );
  return { data, all, isLoading };
}

/** {@link useAllCustomClasses} narrowed to the campaign's own homebrew — a class
 *  marked exclusive to another campaign must never reach a picker here. The DM's
 *  blocklist doesn't apply: ClassesTab only toggles SRD classes, custom ones are
 *  always available. */
export function useCampaignCustomClasses() {
  const { data: all, isLoading } = useAllCustomClasses();
  const campaign = useCampaignStore();
  const data = computed(() => allowedCampaignScoped(all.value, campaign.activeCampaignId));
  return { data, all, isLoading };
}

export interface ClassImportResult { inserted: number; updated: number }

export function useImportOpen5eClasses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ClassImportResult> => {
      const user = getCurrentUser();

      const [previews, existingResult] = await Promise.all([
        fetchOpen5eBaseClasses(),
        supabase.from("custom_classes")
          .select("id, source_document_key, source_record_key")
          .eq("user_id", user!.id)
          .not("source_document_key", "is", null)
          .not("source_record_key", "is", null),
      ]);

      // Ensure all referenced class features exist in class_features table
      const featureIdentityToId = await ensureClassFeatures(collectFeatures(previews));

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

      const existingMap = new Map((existingResult.data ?? []).map(r => [
        `${r.source_document_key}::${r.source_record_key}`,
        r.id,
      ]));
      const identity = (p: typeof previews[number]) => `${p.sourceDocumentKey}::${p.sourceRecordKey}`;
      const toInsert = previews.filter(p => !existingMap.has(identity(p)));
      const toUpdate = previews.filter(p => existingMap.has(identity(p)));

      if (toInsert.length > 0) {
        const rows = toInsert.map(p => ({ ...baseClassToInsert(p), features: resolveFeatures(p), user_id: user!.id }));
        const { error } = await supabase.from("custom_classes").insert(rows);
        if (error) throw error;
      }

      // Refresh only upstream identity/shell content — never the mechanical
      // fields (spell slots, proficiencies, ASI levels, …) the DM fills in
      // by hand after import. See classImportUpdateFields's doc comment.
      for (const p of toUpdate) {
        const id = existingMap.get(identity(p))!;
        const { error } = await supabase
          .from("custom_classes")
          .update({ ...classImportUpdateFields(baseClassToInsert(p)), features: resolveFeatures(p) })
          .eq("id", id);
        if (error) throw error;
      }

      return { inserted: toInsert.length, updated: toUpdate.length };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

/**
 * Reactive lookup: returns the custom class (user-defined) or system class (SRD)
 * matching the given class name, or null if not found.
 * Custom classes take priority over system classes so user overrides win.
 */
export function useClassByName(className: Ref<string>) {
  const { data: systemClasses } = useAllSystemClasses();
  const { data: customClasses } = useAllCustomClasses();
  return computed(() => {
    const name = className.value;
    if (!name) return null;
    return (customClasses.value ?? []).find(c => c.class_name === name && !c.source_document_key)
      ?? (customClasses.value ?? []).find(c => c.class_name === name)
      ?? (systemClasses.value ?? []).find(c => c.class_name === name)
      ?? null;
  });
}

export function useDeleteCustomClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCustomClass,
    onSuccess: (_data, id) => {
      // Remove the detail entry immediately so the still-mounted editor doesn't
      // re-fetch a now-deleted row (causing 406s). Invalidate only the list.
      queryClient.removeQueries({ queryKey: [QUERY_KEY, id] });
      queryClient.removeQueries({ queryKey: [QUERY_KEY, "by-name"] });
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}
