import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";

const KEY = "player_read_items";
// Items not updated after this date are considered pre-read for existing users,
// preventing everything from appearing as "new" on first feature deployment.
const FEATURE_LAUNCH = new Date("2026-05-03");

/** One cache entry holds the markers of every type its caller asked for, keyed
 *  `${entityType}:${entityId}` (type names contain no colon). */
type ReadMap = Map<string, Date>;

function markerKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

async function fetchReadMap(campaignId: string, entityTypes: readonly string[]): Promise<ReadMap> {
  const user = getCurrentUser();
  if (!user) return new Map();
  const { data, error } = await supabase
    .from("player_read_items")
    .select("entity_type, entity_id, read_at")
    .eq("user_id", user.id)
    .eq("campaign_id", campaignId)
    .in("entity_type", [...entityTypes]);
  if (error) throw error;
  const map: ReadMap = new Map();
  for (const row of data) map.set(markerKey(row.entity_type, row.entity_id), new Date(row.read_at));
  return map;
}

/**
 * Read markers for several entity types in ONE request (#999). The player
 * portal's unread dots need four types (quest, puzzle, handout, note); they used
 * to be four queries differing only in `entity_type`. The returned `isNew`
 * takes the type as its first argument, so one entry serves them all.
 */
export function useReadMarkers(entityTypes: readonly string[]) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  // Sorted so the same set of types always lands on the same cache entry.
  const types = [...entityTypes].sort();

  const query = useQuery({
    queryKey: computed(() => [KEY, campaignId.value, types] as const),
    queryFn: ({ queryKey: [, cid, ts] }) => {
      if (!cid) throw new Error("useReadMarkers fetched without a campaign — enabled guarantees it's set");
      return fetchReadMap(cid, ts);
    },
    enabled: () => !!campaignId.value,
  });

  // updatedAt: provide for re-flagging on DM edit; omit for "never-read only" (e.g. bestiary)
  function isNew(entityType: string, entityId: string, updatedAt?: string): boolean {
    const readAt = query.data.value?.get(markerKey(entityType, entityId));
    if (!readAt) {
      if (!updatedAt) return false;
      return new Date(updatedAt) > FEATURE_LAUNCH;
    }
    if (!updatedAt) return false;
    return new Date(updatedAt) > readAt;
  }

  return { ...query, isNew };
}

export function useReadItems(entityType: string) {
  const { isNew, ...query } = useReadMarkers([entityType]);
  return { ...query, isNew: (entityId: string, updatedAt?: string) => isNew(entityType, entityId, updatedAt) };
}

export function useMarkRead() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();

  return useMutation({
    mutationFn: async ({ entityType, entityId }: { entityType: string; entityId: string }) => {
      const user = getCurrentUser();
      if (!user || !campaign.activeCampaignId) return;
      const { error } = await supabase
        .from("player_read_items")
        .upsert(
          {
            user_id: user.id,
            campaign_id: campaign.activeCampaignId,
            entity_type: entityType,
            entity_id: entityId,
            read_at: new Date().toISOString(),
          },
          { onConflict: "user_id,entity_type,entity_id" },
        );
      if (error) throw error;
    },
    onMutate: async ({ entityType, entityId }) => {
      // Every cached marker set for this campaign that covers the type.
      const filters = {
        queryKey: [KEY, campaign.activeCampaignId],
        predicate: (q: { queryKey: readonly unknown[] }) => {
          const types = q.queryKey[2];
          return Array.isArray(types) && types.includes(entityType);
        },
      };
      await qc.cancelQueries(filters);
      const prev = qc.getQueriesData<ReadMap>(filters);
      qc.setQueriesData<ReadMap>(filters, (old) => {
        const next: ReadMap = new Map(old ?? []);
        next.set(markerKey(entityType, entityId), new Date());
        return next;
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      for (const [key, data] of ctx.prev) qc.setQueryData(key, data);
    },
  });
}
