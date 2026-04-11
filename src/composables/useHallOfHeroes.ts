import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { listSettings } from "@/settings/index";
import type { HallOfHero, HallOfHeroInsert, HallOfHeroUpdate, NpcInsert } from "@/types/npc.types";
import { removeStorageImages } from "@/composables/useImageUpload";

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

async function deleteHero(hero: HallOfHero): Promise<void> {
  const { error } = await supabase.from("hall_of_heroes").delete().eq("id", hero.id);
  if (error) throw error;
  await removeStorageImages("asset-images", hero.portrait_url, hero.card_art_url, hero.disguise_portrait_url);
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

// ── Populate Hall of Heroes from all settings ─────────────────────────────────

function normaliseHeroName(name: string): string {
  return name.toLowerCase().replace(/['\u2018\u2019`\-_.,"!?]/g, "").replace(/\s+/g, " ").trim();
}

function toTiptap(text: string): string {
  return JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
}

/** Sync all setting heroes into hall_of_heroes.
 *  - New entries are inserted.
 *  - Existing entries get all fields refreshed EXCEPT portrait_url / card_art_url
 *    / focal_point (art is preserved so you can add images without them being overwritten).
 *  Returns { inserted, updated }. */
export function usePopulateAllSettingHeroes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ inserted: number; updated: number }> => {
      const user = getCurrentUser();
      const settings = listSettings();

      const { data: existing, error: fetchError } = await supabase
        .from("hall_of_heroes")
        .select("id, name, setting, portrait_url, card_art_url");
      if (fetchError) throw fetchError;

      // Key: "setting:normalised_name"
      type ExistingRow = { id: string; name: string; setting: string; portrait_url: string | null; card_art_url: string | null };
      const existingMap = new Map<string, ExistingRow>(
        (existing ?? []).map((r: ExistingRow) => [
          `${r.setting}:${normaliseHeroName(r.name)}`,
          r,
        ]),
      );

      const toInsert: (HallOfHeroInsert & { user_id: string })[] = [];
      const toUpdate: { id: string; update: Partial<HallOfHeroInsert> }[] = [];

      for (const setting of settings) {
        for (const h of setting.heroes) {
          const key = `${setting.id}:${normaliseHeroName(h.name)}`;
          const existing = existingMap.get(key);

          const fields = {
            name: h.name,
            setting: setting.id,
            race: h.race,
            alignment: h.alignment,
            age: null,
            occupation: h.occupation,
            appearance: null,
            personality: h.personality ? toTiptap(h.personality) : null,
            backstory: h.backstory ? toTiptap(h.backstory) : null,
            notes: null,
            status: h.status,
            relationship: h.relationship,
            tags: h.tags,
            stat_block: null,
            is_revealed: true,
            disguise_name: null,
            disguise_portrait_url: null,
            disguise_portrait_focal_point: null,
            portrait_focal_point: null,
          };

          if (!existing) {
            toInsert.push({
              ...fields,
              portrait_url: h.portrait_url,
              card_art_url: null,
              user_id: user!.id,
            });
          } else {
            // Refresh all data fields; only fill in portrait/card_art if the DB row still has none
            const update: Partial<HallOfHeroInsert> = { ...fields };
            if (!existing.portrait_url && h.portrait_url) update.portrait_url = h.portrait_url;
            if (!existing.card_art_url) update.card_art_url = null;
            toUpdate.push({ id: existing.id, update });
          }
        }
      }

      const [insertResult] = await Promise.all([
        toInsert.length
          ? supabase.from("hall_of_heroes").insert(toInsert).select("id")
          : Promise.resolve({ data: [], error: null }),
        ...toUpdate.map(({ id, update }) =>
          supabase.from("hall_of_heroes").update(update).eq("id", id),
        ),
      ]);

      if (insertResult.error) throw insertResult.error;

      return {
        inserted: (insertResult.data ?? []).length,
        updated: toUpdate.length,
      };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
