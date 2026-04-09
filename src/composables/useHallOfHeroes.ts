import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { HallOfHero, HallOfHeroInsert, HallOfHeroUpdate, NpcInsert } from "@/types/npc.types";

const QUERY_KEY = "hall-of-heroes";

async function fetchHeroes(): Promise<HallOfHero[]> {
  const { data, error } = await supabase
    .from("hall_of_heroes")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data as HallOfHero[];
}

async function fetchHero(id: string): Promise<HallOfHero> {
  const { data, error } = await supabase
    .from("hall_of_heroes")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as HallOfHero;
}

async function createHero(hero: HallOfHeroInsert): Promise<HallOfHero> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("hall_of_heroes")
    .insert({ ...hero, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as HallOfHero;
}

async function updateHero(id: string, update: HallOfHeroUpdate): Promise<HallOfHero> {
  const { data, error } = await supabase
    .from("hall_of_heroes")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as HallOfHero;
}

async function deleteHero(id: string): Promise<void> {
  const { error } = await supabase.from("hall_of_heroes").delete().eq("id", id);
  if (error) throw error;
}

async function importHero(hero: HallOfHero, campaignId: string): Promise<void> {
  const user = getCurrentUser();
  const npc: Omit<NpcInsert, "campaign_id"> & { campaign_id: string; user_id: string } = {
    user_id: user!.id,
    campaign_id: campaignId,
    name: hero.name,
    race: hero.race,
    alignment: hero.alignment,
    age: hero.age,
    occupation: hero.occupation,
    appearance: hero.appearance,
    personality: hero.personality,
    backstory: hero.backstory,
    notes: hero.notes,
    status: hero.status,
    relationship: hero.relationship,
    portrait_url: hero.portrait_url,
    card_art_url: hero.card_art_url,
    portrait_focal_point: hero.portrait_focal_point,
    disguise_name: hero.disguise_name,
    disguise_portrait_url: hero.disguise_portrait_url,
    disguise_portrait_focal_point: hero.disguise_portrait_focal_point,
    is_revealed: hero.is_revealed,
    tags: hero.tags,
    stat_block: hero.stat_block,
    shared_with_players: false,
    player_visible_fields: [],
    scriptorium_doc_id: null,
    linked_monster_id: null,
    player_visible_to: null,
  };
  const { error } = await supabase.from("npcs").insert(npc);
  if (error) throw error;
}

export function useHallOfHeroes() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: fetchHeroes,
  });
}

export function useHallOfHero(id: string | Ref<string>) {
  const idRef = isRef(id) ? id : ref(id);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, idRef.value]),
    queryFn: () => fetchHero(idRef.value),
    enabled: () => !!idRef.value,
  });
}

export function useCreateHero() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hero: HallOfHeroInsert) => createHero(hero),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateHero() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: HallOfHeroUpdate }) =>
      updateHero(id, update),
    onSuccess: (updated) => {
      queryClient.setQueryData([QUERY_KEY], (old: HallOfHero[] | undefined) =>
        old?.map((h) => (h.id === updated.id ? updated : h)),
      );
      queryClient.setQueryData([QUERY_KEY, updated.id], updated);
    },
  });
}

export function useDeleteHero() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteHero,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useImportHero() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: (hero: HallOfHero) => importHero(hero, campaign.activeCampaignId!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["npcs"] }),
  });
}
