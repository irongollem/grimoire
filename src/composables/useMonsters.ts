import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { SRD_MONSTERS, getSrdMonster } from "@/data/srdMonsters";
import { useSrdMonsterArt } from "@/composables/useSrdMonsterArt";
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
  const user = getCurrentUser();
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
  return useQuery({ queryKey: [QUERY_KEY], queryFn: fetchMonsters, staleTime: Infinity });
}

/** Returns SRD monsters merged with the user's custom monsters, sorted by name.
 *  SRD monsters are overlaid with any custom art the user has uploaded. */
export function useAllMonsters() {
  const query = useMonsters();
  const { data: artMap } = useSrdMonsterArt();
  const data = computed<Monster[]>(() => {
    const custom = query.data.value ?? [];
    const art = artMap.value ?? {};
    const srd = SRD_MONSTERS.map((m) => {
      const a = art[m.id];
      return a
        ? { ...m, image_url: a.image_url, card_art_url: a.card_art_url, portrait_focal_point: a.portrait_focal_point, card_art_focal_point: a.card_art_focal_point }
        : m;
    });
    return [...srd, ...custom].sort((a, b) => a.name.localeCompare(b.name));
  });
  return { data, isLoading: query.isLoading };
}

export function useMonster(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, id.value]),
    queryFn: () => fetchMonster(id.value),
    enabled: () => !!id.value,
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
