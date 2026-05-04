import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { storeToRefs } from "pinia";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import type { SoundboardPage, SoundboardPageUpdate } from "@/types/sound.types";

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
    queryKey: computed(() => [QUERY_KEY, activeCampaignId.value]),
    queryFn: () => fetchPages(activeCampaignId.value!),
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
    mutationFn: async (orderedIds: string[]) => {
      const updates = orderedIds.map((id, index) =>
        supabase.from("soundboard_pages").update({ sort_order: index }).eq("id", id),
      );
      await Promise.all(updates);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, activeCampaignId.value] });
    },
  });
}
