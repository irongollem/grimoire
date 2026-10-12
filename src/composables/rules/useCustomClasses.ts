import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { CustomClass, CustomClassInsert, CustomClassUpdate, SystemClass } from "@/levelup/customTypes";
import { deleteUnreferencedByPublicUrl } from "@/lib/storage";
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

/** A class opened by id: a homebrew row, or a read-only row of the shared
 *  `system_classes` table. Both keys are uuids, so the id's shape cannot say
 *  which table holds it; the custom table is asked first, then the library's. */
export type ClassRecord =
  | { kind: "custom"; cls: CustomClass }
  | { kind: "library"; cls: SystemClass };

export async function fetchClassRecord(id: string): Promise<ClassRecord> {
  const { data: custom, error: customError } = await supabase
    .from("custom_classes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (customError) throw customError;
  if (custom) return { kind: "custom", cls: custom as CustomClass };
  const { data: library, error: libraryError } = await supabase
    .from("system_classes")
    .select("*")
    .eq("id", id)
    .single();
  if (libraryError) throw libraryError;
  return { kind: "library", cls: library as SystemClass };
}

/** Which table a class came from: a `custom_classes` row carries `user_id` (null on a shared book class), a
 *  `system_classes` row has no such column. It says nothing about who may edit it; see `canEditClass`. */
export function isCustomClass(cls: CustomClass | SystemClass): cls is CustomClass {
  return "user_id" in cls;
}

/** Whoever is looking at a class. */
export interface ClassViewer {
  userId: string | null;
  isAdmin: boolean;
}

/**
 * Whether the viewer may edit or delete this class: their own homebrew, or a shared book class (a `custom_classes`
 * row with no owner, such as Black Flag's Mechanist) when they are the admin. That is the `custom_classes` update and
 * delete policy, so the sheet never offers an action RLS would turn into a silent no-op. Everything else is read-only
 * with Duplicate: the library's system classes, a shared book class for anyone else, a DM's class a player reads.
 */
export function canEditClass(cls: CustomClass | SystemClass, viewer: ClassViewer): boolean {
  if (!isCustomClass(cls)) return false;
  if (cls.user_id === null) return viewer.isAdmin;
  return viewer.userId !== null && cls.user_id === viewer.userId;
}

/** The custom-class insert that copies any class the viewer can read, ready to be edited. */
export function customClassCopy(cls: CustomClass | SystemClass): CustomClassInsert {
  return {
    class_name: `${cls.class_name} (copy)`,
    campaign_id: null,
    hit_die: cls.hit_die,
    primary_ability: cls.primary_ability,
    saving_throws: cls.saving_throws,
    armor_proficiencies: cls.armor_proficiencies,
    weapon_proficiencies: cls.weapon_proficiencies,
    subclass_level: cls.subclass_level,
    features: cls.features,
    spell_slots: cls.spell_slots,
    spells_known: cls.spells_known,
    cantrips_known: cls.cantrips_known,
    slot_recovery: cls.slot_recovery,
    caster_type: cls.caster_type,
    prepared_ability: cls.prepared_ability,
    prepared_divisor: cls.prepared_divisor,
    source: null,
    image_url: cls.image_url,
    focal_point: cls.focal_point,
  };
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

async function deleteCustomClass(cls: Pick<CustomClass, "id" | "image_url">): Promise<void> {
  const { error } = await supabase.from("custom_classes").delete().eq("id", cls.id);
  if (error) throw error;
  await deleteUnreferencedByPublicUrl({ urls: [cls.image_url] });
}

/** `enabled` defers the fetch for a surface mounted before it is used (the
 *  archetype generator panel lives in the always-mounted generator cluster). */
export function useAllCustomClasses(enabled: () => boolean = () => true) {
  const { ruleset } = useRuleset();
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, ruleset.value] as const),
    queryFn: ({ queryKey: [, rs] }) => fetchAll(rs),
    staleTime: Infinity,
    enabled,
  });
}

/** A class by id, from whichever table holds it. */
export function useClass(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, id.value] as const),
    queryFn: ({ queryKey: [, cid] }) => fetchClassRecord(cid),
    enabled: () => !!id.value,
  });
}

export function useCustomClassByName(className: Ref<string>) {
  const { ruleset } = useRuleset();
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "by-name", ruleset.value, className.value] as const),
    queryFn: ({ queryKey: [, , rs, name] }) => fetchByName(name, rs),
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

/** Copies a class the viewer cannot edit into their own classes; resolves to the new row. */
export function useDuplicateClass() {
  const { mutateAsync, isPending } = useCreateCustomClass();
  return {
    duplicate: (cls: CustomClass | SystemClass) => mutateAsync(customClassCopy(cls)),
    isPending,
  };
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

export function useAllSystemClasses(enabled: () => boolean = () => true) {
  const { ruleset } = useRuleset();
  return useQuery({
    enabled,
    queryKey: computed(() => ["system_classes", ruleset.value] as const),
    queryFn: async ({ queryKey: [, rs] }): Promise<SystemClass[]> => {
      const { data, error } = await supabase
        .from("system_classes")
        .select("*")
        .eq("ruleset", rs)
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
export function useCampaignSystemClasses(enabled: () => boolean = () => true) {
  const { data: all, isLoading } = useAllSystemClasses(enabled);
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
export function useCampaignCustomClasses(enabled: () => boolean = () => true) {
  const { data: all, isLoading } = useAllCustomClasses(enabled);
  const campaign = useCampaignStore();
  const data = computed(() => allowedCampaignScoped(all.value, campaign.activeCampaignId));
  return { data, all, isLoading };
}

export function useDeleteCustomClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCustomClass,
    onSuccess: (_data, { id }) => {
      // Remove the detail entry immediately so the still-mounted editor doesn't
      // re-fetch a now-deleted row (causing 406s). Invalidate only the list.
      queryClient.removeQueries({ queryKey: [QUERY_KEY, id] });
      queryClient.removeQueries({ queryKey: [QUERY_KEY, "by-name"] });
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}
