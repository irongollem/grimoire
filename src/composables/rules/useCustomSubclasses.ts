import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type {
  CustomSubclass,
  CustomSubclassInsert,
  CustomSubclassUpdate,
} from "@/levelup/customTypes";
import { useRuleset } from "@/composables/rules/useRuleset";
import { useCampaignStore } from "@/stores/campaign";
import { allowedCampaignScoped } from "@/lib/campaignContentGating";
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
    queryKey: computed(() => [QUERY_KEY, ruleset.value] as const),
    queryFn: ({ queryKey: [, rs] }) => fetchAll(rs),
    staleTime: Infinity,
  });
}

/** {@link useAllCustomSubclasses} narrowed to the active campaign — a subclass
 *  the DM marked "Campaign-scoped" for one table must not surface at another's
 *  (#566). **Every subclass picker must use `data`**; `all` stays ungated for
 *  resolving the subclass a character already has. */
export function useCampaignCustomSubclasses() {
  const { data: all, isLoading } = useAllCustomSubclasses();
  const campaign = useCampaignStore();
  const data = computed(() => allowedCampaignScoped(all.value, campaign.activeCampaignId));
  return { data, all, isLoading };
}

export function useCustomSubclass(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, id.value] as const),
    queryFn: ({ queryKey: [, cid] }) => fetchOne(cid),
    enabled: () => !!id.value,
  });
}

export function useCustomSubclassByClassAndSubclass(
  className: Ref<string>,
  subclassName: Ref<string>,
) {
  const { ruleset } = useRuleset();
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "by-class", ruleset.value, className.value, subclassName.value] as const),
    queryFn: ({ queryKey: [, , rs, name, subclassNm] }) => fetchByClassAndSubclass(name, subclassNm, rs),
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
