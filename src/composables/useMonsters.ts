import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed } from "vue";
import { supabase } from "@/lib/supabase";
import { SRD_MONSTERS, getSrdMonster } from "@/data/srdMonsters";
import type { Monster, MonsterInsert, MonsterUpdate } from "@/types/monster.types";

export { getSrdMonster };

const QUERY_KEY = "monsters";

async function fetchMonsters(): Promise<Monster[]> {
  const all: Monster[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("monsters")
      .select("*")
      .order("name", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    all.push(...(data as Monster[]));
    if ((data ?? []).length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function fetchMonster(id: string): Promise<Monster> {
  const { data, error } = await supabase.from("monsters").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Monster;
}

async function createMonster(monster: MonsterInsert): Promise<Monster> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("monsters")
    .insert({ ...monster, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as Monster;
}

async function updateMonster(id: string, update: MonsterUpdate): Promise<Monster> {
  const { data, error } = await supabase
    .from("monsters")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Monster;
}

async function deleteMonster(id: string): Promise<void> {
  const { error } = await supabase.from("monsters").delete().eq("id", id);
  if (error) throw error;
}

export function useMonsters() {
  return useQuery({ queryKey: [QUERY_KEY], queryFn: fetchMonsters });
}

/** Returns SRD monsters merged with the user's custom monsters, sorted by name. */
export function useAllMonsters() {
  const query = useMonsters();
  const data = computed<Monster[]>(() => {
    const custom = query.data.value ?? [];
    return [...SRD_MONSTERS, ...custom].sort((a, b) => a.name.localeCompare(b.name));
  });
  return { data, isLoading: query.isLoading };
}

export function useMonster(id: string) {
  return useQuery({
    queryKey: [QUERY_KEY, id],
    queryFn: () => fetchMonster(id),
    enabled: !!id,
  });
}

export function useCreateMonster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createMonster,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateMonster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: MonsterUpdate }) =>
      updateMonster(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useDeleteMonster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteMonster,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

/** Clone an SRD monster into the user's own collection. Returns the new Monster. */
export function useCloneSrdMonster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (srdMonster: Monster): Promise<Monster> => {
      const { name, monster_type, size, alignment, habitat, source, tags, stat_block, notes, image_url, card_art_url } = srdMonster;
      return createMonster({ name, monster_type, size, alignment, habitat, source: `${source ?? "SRD 5.1"} (customized)`, tags, stat_block, notes, image_url, card_art_url });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
