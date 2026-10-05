import { computed, ref, isRef } from "vue";
import type { Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { Spell, SpellInsert, SpellUpdate } from "@/types/spell.types";
import { deleteUnreferencedByPublicUrl } from "@/lib/storage";
import { useToast } from "@/composables/useToast";
import { isUuid } from "@/lib/library/contentIdentity";

const LIBRARY_QUERY_KEY = "library-spells";

const QUERY_KEY = "spells";

async function fetchSpell(id: string): Promise<Spell> {
  const { data, error } = await supabase.from("spells").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Spell;
}

async function createSpell(spell: SpellInsert): Promise<Spell> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("spells")
    .insert({ ...spell, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as Spell;
}

async function updateSpell(id: string, update: SpellUpdate): Promise<Spell> {
  const { data, error } = await supabase
    .from("spells")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Spell;
}

async function deleteSpell(spell: Spell): Promise<void> {
  const { error } = await supabase.from("spells").delete().eq("id", spell.id);
  if (error) throw error;
  await deleteUnreferencedByPublicUrl({ urls: [spell.image_url] });
}

export function useSpell(id: string | Ref<string>) {
  const idRef = isRef(id) ? id : ref(id);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, idRef.value] as const),
    queryFn: ({ queryKey: [, spellId] }) => fetchSpell(spellId),
    enabled: computed(() => !!idRef.value),
  });
}

export function useLibrarySpell(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [LIBRARY_QUERY_KEY, id.value] as const),
    queryFn: async ({ queryKey: [, spellId] }) => {
      const { data, error } = await supabase
        .from("library_spells")
        .select("*")
        .eq("id", spellId)
        .single();
      if (error) throw error;
      return { ...data, user_id: "" } as Spell;
    },
    enabled: () => !!id.value,
    staleTime: Infinity,
  });
}

/** Resolve an opaque spell ID against explicit shared/custom stores. */
export async function fetchResolvedSpell(spellId: string): Promise<{ spell: Spell; isShared: boolean }> {
  const { data: shared, error: sharedError } = await supabase
    .from("library_spells").select("*").eq("id", spellId).maybeSingle();
  if (sharedError) throw sharedError;
  if (shared) return { spell: { ...shared, user_id: "" } as Spell, isShared: true };
  if (!isUuid(spellId)) throw new Error("Spell not found");
  return { spell: await fetchSpell(spellId), isShared: false };
}

export function resolvedSpellKey(id: string) {
  return ["resolved-spell", id] as const;
}

export function useResolvedSpell(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => resolvedSpellKey(id.value)),
    queryFn: ({ queryKey: [, spellId] }) => fetchResolvedSpell(spellId),
    enabled: () => !!id.value,
  });
}

export function useCreateSpell() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createSpell,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateSpell() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: SpellUpdate }) => updateSpell(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useDeleteSpell() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: deleteSpell,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

