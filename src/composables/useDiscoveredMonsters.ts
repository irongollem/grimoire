import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { DiscoveredMonster, DiscoveredMonsterInsert, Monster } from "@/types/monster.types";

const QUERY_KEY = "discovered-monsters";

// ── DM: all discoveries for the active campaign ────────────────────────────

export function useCampaignDiscoveries() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, campaignId.value]),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discovered_monsters")
        .select("*")
        .eq("campaign_id", campaignId.value!)
        .order("monster_name");
      if (error) throw error;
      return data as DiscoveredMonster[];
    },
    enabled: () => !!campaignId.value,
  });
}

/** Returns a Set of monster keys (monster_id or srd_slug) that are discovered. */
export function useDiscoveredKeys() {
  const { data } = useCampaignDiscoveries();
  return computed<Set<string>>(() => {
    const s = new Set<string>();
    for (const d of data.value ?? []) {
      if (d.monster_id) s.add(d.monster_id);
      if (d.srd_slug)   s.add(d.srd_slug);
    }
    return s;
  });
}

// ── Toggle a monster's discovery (share / unshare with whole party) ────────

export function useToggleMonsterDiscovery() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();

  return useMutation({
    mutationFn: async ({
      monster,
      currentDiscovery,
      visibleTo = null,
    }: {
      monster: Monster;
      currentDiscovery: DiscoveredMonster | undefined;
      visibleTo?: string[] | null;
    }) => {
      const campaignId = campaign.activeCampaignId!;
      if (currentDiscovery) {
        await supabase.from("discovered_monsters").delete().eq("id", currentDiscovery.id);
        return null;
      } else {
        const insert: DiscoveredMonsterInsert = {
          campaign_id: campaignId,
          monster_id:  monster.is_srd ? null : monster.id,
          srd_slug:    monster.is_srd ? monster.id : null,
          monster_name: monster.name,
          image_url:   monster.image_url,
          visible_to:  visibleTo,
        };
        const { data, error } = await supabase.from("discovered_monsters").insert(insert).select().single();
        if (error) throw error;
        return data as DiscoveredMonster;
      }
    },
    onMutate: async ({ monster, currentDiscovery, visibleTo = null }) => {
      const queryKey = [QUERY_KEY, campaign.activeCampaignId];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      if (currentDiscovery) {
        queryClient.setQueryData(queryKey, (old: DiscoveredMonster[] | undefined) =>
          (old ?? []).filter((d) => d.id !== currentDiscovery.id),
        );
      } else {
        const optimistic: DiscoveredMonster = {
          id: "optimistic",
          campaign_id: campaign.activeCampaignId!,
          monster_id: monster.is_srd ? null : monster.id,
          srd_slug: monster.is_srd ? monster.id : null,
          monster_name: monster.name,
          image_url: monster.image_url ?? null,
          visible_to: visibleTo,
          reveal_stats: false,
          discovered_at: new Date().toISOString(),
        };
        queryClient.setQueryData(queryKey, (old: DiscoveredMonster[] | undefined) =>
          [...(old ?? []), optimistic],
        );
      }
      return { previous };
    },
    onSuccess: (data) => {
      // Replace the optimistic placeholder with the real record (gives it a proper UUID
      // so subsequent visibility/stats mutations target the correct DB row).
      if (data) {
        const queryKey = [QUERY_KEY, campaign.activeCampaignId];
        queryClient.setQueryData(queryKey, (old: DiscoveredMonster[] | undefined) =>
          (old ?? []).map((d) => (d.id === "optimistic" ? data : d)),
        );
      }
    },
    onError: (_err, _vars, ctx: { previous: unknown } | undefined) => {
      if (ctx?.previous !== undefined)
        queryClient.setQueryData([QUERY_KEY, campaign.activeCampaignId], ctx.previous);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, campaign.activeCampaignId] }),
  });
}

/** Update who can see a specific discovery (null = whole party). */
export function useUpdateDiscoveryVisibility() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async ({ id, visibleTo }: { id: string; visibleTo: string[] | null }) => {
      const { error } = await supabase.from("discovered_monsters").update({ visible_to: visibleTo }).eq("id", id);
      if (error) throw error;
    },
    // Optimistic update: apply immediately so the popover responds without waiting for refetch
    onMutate: async ({ id, visibleTo }) => {
      const queryKey = [QUERY_KEY, campaign.activeCampaignId];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: DiscoveredMonster[] | undefined) =>
        (old ?? []).map((d) => (d.id === id ? { ...d, visible_to: visibleTo } : d)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx: { previous: unknown } | undefined) => {
      if (ctx?.previous !== undefined)
        queryClient.setQueryData([QUERY_KEY, campaign.activeCampaignId], ctx.previous);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, campaign.activeCampaignId] }),
  });
}

/** Toggle whether the full stat block is revealed to players. */
export function useUpdateDiscoveryStats() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async ({ id, revealStats }: { id: string; revealStats: boolean }) => {
      const { error } = await supabase
        .from("discovered_monsters")
        .update({ reveal_stats: revealStats })
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, revealStats }) => {
      const queryKey = [QUERY_KEY, campaign.activeCampaignId];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: DiscoveredMonster[] | undefined) =>
        (old ?? []).map((d) => (d.id === id ? { ...d, reveal_stats: revealStats } : d)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx: { previous: unknown } | undefined) => {
      if (ctx?.previous !== undefined)
        queryClient.setQueryData([QUERY_KEY, campaign.activeCampaignId], ctx.previous);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, campaign.activeCampaignId] }),
  });
}

// ── Player: monsters visible to this player ────────────────────────────────

export function usePlayerDiscoveries() {
  return useQuery({
    queryKey: [QUERY_KEY, "player"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discovered_monsters")
        .select("*")
        .order("monster_name");
      if (error) throw error;
      return data as DiscoveredMonster[];
    },
  });
}
