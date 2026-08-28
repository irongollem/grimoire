import { computed, watch } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { getCurrentUser, supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";

export const LEGACY_NPC_RATING_KEY = "player_npc_rating:";
const QUERY_KEY = "player_npc_ratings";

interface NpcRatingRow {
  npc_id: string;
  rating: number;
}

interface LegacyRatingRow extends NpcRatingRow {
  user_id: string;
  campaign_id: string;
}

export function readLegacyNpcRating(storage: Pick<Storage, "getItem">, npcId: string): number {
  const stored = storage.getItem(LEGACY_NPC_RATING_KEY + npcId) ?? "";
  return /^[1-5]$/.test(stored) ? Number(stored) : 0;
}

export function planLegacyNpcRatingBackfill(
  storage: Pick<Storage, "getItem">,
  npcs: ReadonlyArray<{ id: string }>,
  userId: string,
  campaignId: string,
): LegacyRatingRow[] {
  return npcs.flatMap(({ id: npc_id }) => {
    const rating = readLegacyNpcRating(storage, npc_id);
    return rating > 0 ? [{ user_id: userId, campaign_id: campaignId, npc_id, rating }] : [];
  });
}

async function fetchRatings(campaignId: string): Promise<NpcRatingRow[]> {
  const { data, error } = await supabase
    .from("player_npc_ratings")
    .select("npc_id,rating")
    .eq("campaign_id", campaignId);
  if (error) throw error;
  return data as NpcRatingRow[];
}

// Only needs each NPC's id, so accept any id-bearing row (Npc or PlayerNpc).
export function usePlayerNpcRatings(npcs?: () => { id: string }[]) {
  const campaign = useCampaignStore();
  const queryClient = useQueryClient();
  const campaignId = computed(() => campaign.activeCampaignId);
  const queryKey = computed(() => [QUERY_KEY, campaignId.value]);

  const { data } = useQuery({
    queryKey,
    queryFn: () => fetchRatings(campaignId.value!),
    enabled: () => !!campaignId.value,
  });

  const ratingMap = computed(() => new Map((data.value ?? []).map((row) => [row.npc_id, row.rating])));

  function getRating(npcId: string): number {
    const serverRating = ratingMap.value.get(npcId);
    if (serverRating !== undefined) return serverRating;
    if (typeof localStorage === "undefined") return 0;
    return readLegacyNpcRating(localStorage, npcId);
  }

  const { mutate } = useMutation({
    mutationFn: async ({ npcId, rating }: { npcId: string; rating: number }) => {
      const cid = campaignId.value;
      const user = getCurrentUser();
      if (!cid || !user) throw new Error("Sign in and select a campaign before rating an NPC.");

      if (rating === 0) {
        const { error } = await supabase
          .from("player_npc_ratings")
          .delete()
          .eq("user_id", user.id)
          .eq("npc_id", npcId);
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from("player_npc_ratings")
        .upsert(
          { user_id: user.id, campaign_id: cid, npc_id: npcId, rating },
          { onConflict: "user_id,npc_id" },
        );
      if (error) throw error;
    },
    onMutate: async ({ npcId, rating }) => {
      const key = [QUERY_KEY, campaignId.value];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NpcRatingRow[]>(key) ?? [];
      const legacy = typeof localStorage === "undefined"
        ? null
        : localStorage.getItem(LEGACY_NPC_RATING_KEY + npcId);
      if (typeof localStorage !== "undefined") localStorage.removeItem(LEGACY_NPC_RATING_KEY + npcId);

      queryClient.setQueryData<NpcRatingRow[]>(key, rating === 0
        ? previous.filter((row) => row.npc_id !== npcId)
        : [...previous.filter((row) => row.npc_id !== npcId), { npc_id: npcId, rating }]);
      return { key, previous, legacy, npcId };
    },
    onError: (_error, _variables, context) => {
      if (!context) return;
      queryClient.setQueryData(context.key, context.previous);
      if (context.legacy !== null && typeof localStorage !== "undefined") {
        localStorage.setItem(LEGACY_NPC_RATING_KEY + context.npcId, context.legacy);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, campaignId.value] });
    },
  });

  function setRating(npcId: string, value: number) {
    mutate({ npcId, rating: getRating(npcId) === value ? 0 : value });
  }

  // Upload legacy localhost values only for NPCs the current player can see.
  // Conflict-ignore makes this retry-safe and preserves an existing server value.
  watch(
    () => [campaignId.value, ...(npcs?.() ?? []).map((npc) => npc.id).sort()] as const,
    async ([cid]) => {
      const user = getCurrentUser();
      if (!cid || !user || !npcs || typeof localStorage === "undefined") return;
      const rows = planLegacyNpcRatingBackfill(localStorage, npcs(), user.id, cid);
      if (rows.length === 0) return;

      const { error } = await supabase
        .from("player_npc_ratings")
        .upsert(rows, { onConflict: "user_id,npc_id", ignoreDuplicates: true });
      if (error) return; // Keep local values intact so a later visit can retry.

      try {
        const authoritative = await fetchRatings(cid);
        queryClient.setQueryData([QUERY_KEY, cid], authoritative);
        for (const row of rows) localStorage.removeItem(LEGACY_NPC_RATING_KEY + row.npc_id);
      } catch {
        // The upload succeeded, but retain the local fallback until the server
        // copy can be confirmed readable on a later retry.
      }
    },
    { immediate: true },
  );

  // Backwards-compatible reactive dependency used by existing sort/render code.
  const ratingTick = computed(() => data.value);

  return { getRating, setRating, ratingMap, ratingTick };
}
