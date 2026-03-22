import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { Spell, SpellInsert, SpellUpdate } from "@/types/spell.types";

const QUERY_KEY = "spells";

async function fetchSpells(): Promise<Spell[]> {
  const all: Spell[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("spells")
      .select("*")
      .order("level", { ascending: true })
      .order("name", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    all.push(...(data as Spell[]));
    if ((data ?? []).length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

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

async function deleteSpell(id: string): Promise<void> {
  const { error } = await supabase.from("spells").delete().eq("id", id);
  if (error) throw error;
}

export function useSpells() {
  return useQuery({ queryKey: [QUERY_KEY], queryFn: fetchSpells, staleTime: Infinity });
}

export function useSpell(id: string) {
  return useQuery({
    queryKey: [QUERY_KEY, id],
    queryFn: () => fetchSpell(id),
    enabled: !!id,
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
  return useMutation({
    mutationFn: deleteSpell,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useImportSrdSpells() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const { fetchSrdSpells } = await import("@/lib/open5eSpellImport");
      const spells = await fetchSrdSpells();

      const allNames = spells.map((s) => s.name);
      const existingNames = new Set<string>();
      const CHUNK = 200;
      for (let i = 0; i < allNames.length; i += CHUNK) {
        const { data } = await supabase
          .from("spells")
          .select("name")
          .eq("source", "srd")
          .in("name", allNames.slice(i, i + CHUNK));
        (data ?? []).forEach((r: { name: string }) => existingNames.add(r.name));
      }

      const toInsert = spells.filter((s) => !existingNames.has(s.name));
      if (toInsert.length === 0) return 0;

      const user = getCurrentUser();
      const withUser = toInsert.map((s) => ({ ...s, user_id: user!.id }));
      const BATCH = 100;
      for (let i = 0; i < withUser.length; i += BATCH) {
        const { error } = await supabase.from("spells").insert(withUser.slice(i, i + BATCH));
        if (error) throw error;
      }
      return toInsert.length;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
