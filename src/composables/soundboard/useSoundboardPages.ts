import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { storeToRefs } from "pinia";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import { persistReorder } from "@/lib/reorder";
import { isValidLanes } from "@/lib/audio/deck/deckModel";
import type { DeckLane, SoundboardPage, SoundboardPageUpdate } from "@/types/sound.types";

const QUERY_KEY = "soundboard_pages";

async function fetchPages(campaignId: string): Promise<SoundboardPage[]> {
  const { data, error } = await supabase
    .from("soundboard_pages")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data as SoundboardPage[];
}

async function createPage(page: { campaign_id: string; user_id: string; name: string; sort_order: number }): Promise<SoundboardPage> {
  const { data, error } = await supabase
    .from("soundboard_pages")
    .insert(page)
    .select()
    .single();
  if (error) throw error;
  return data as SoundboardPage;
}

async function updatePage(id: string, update: SoundboardPageUpdate): Promise<SoundboardPage> {
  const { data, error } = await supabase
    .from("soundboard_pages")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as SoundboardPage;
}

async function deletePage(id: string): Promise<void> {
  // sounds.page_id set to null via ON DELETE SET NULL
  const { error } = await supabase.from("soundboard_pages").delete().eq("id", id);
  if (error) throw error;
}

export function useSoundboardPages() {
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  return useQuery({
    queryKey: computed(() => [QUERY_KEY, activeCampaignId.value] as const),
    queryFn: ({ queryKey: [, campaignId] }) => {
      if (campaignId === null) throw new Error("useSoundboardPages fetched without a campaign");
      return fetchPages(campaignId);
    },
    enabled: () => !!activeCampaignId.value,
  });
}

export function useCreateSoundboardPage() {
  const qc = useQueryClient();
  const { activeCampaignId } = storeToRefs(useCampaignStore());
  const auth = useAuthStore();

  return useMutation({
    mutationFn: ({ name, sort_order }: { name: string; sort_order: number }) =>
      createPage({
        campaign_id: activeCampaignId.value!,
        user_id: auth.user!.id,
        name,
        sort_order,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, activeCampaignId.value] });
    },
  });
}

export function useUpdateSoundboardPage() {
  const qc = useQueryClient();
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: SoundboardPageUpdate }) =>
      updatePage(id, update),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, activeCampaignId.value] });
    },
  });
}

export function useDeleteSoundboardPage() {
  const qc = useQueryClient();
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  return useMutation({
    mutationFn: (id: string) => deletePage(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, activeCampaignId.value] });
    },
  });
}

export function useReorderSoundboardPages() {
  const qc = useQueryClient();
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  return useMutation({
    mutationFn: async (updates: Array<{ id: string; sort_order: number }>) => {
      await persistReorder("reorder_soundboard_pages", updates);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, activeCampaignId.value] });
    },
  });
}

/**
 * Change one lane's name, rule or feed. Reads the page's lanes from the cache,
 * swaps one, and refuses anything the database CHECK would. A feed moves: giving
 * it to this lane takes it from the lane that had it, since a page has one of each.
 */
export function useUpdatePageLane() {
  const qc = useQueryClient();
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  return useMutation({
    mutationFn: ({ pageId, laneIndex, patch }: { pageId: string; laneIndex: number; patch: Partial<DeckLane> }) => {
      const pages = qc.getQueryData<SoundboardPage[]>([QUERY_KEY, activeCampaignId.value]);
      const page = pages?.find((p) => p.id === pageId);
      if (!page) throw new Error("useUpdatePageLane: page is not loaded");
      const current = page.lanes[laneIndex];
      if (!current) throw new Error(`useUpdatePageLane: no lane ${laneIndex}`);
      const moved = patch.feed !== undefined && patch.feed !== null ? patch.feed : null;
      const lanes = page.lanes.map((lane, i) => {
        if (i === laneIndex) return { ...lane, ...patch };
        return moved !== null && lane.feed === moved ? { ...lane, feed: null } : lane;
      });
      if (!isValidLanes(lanes)) throw new Error("useUpdatePageLane: lanes would be invalid");
      return updatePage(pageId, { lanes });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, activeCampaignId.value] });
    },
  });
}
