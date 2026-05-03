import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";

const KEY = "player_read_items";
// Items not updated after this date are considered pre-read for existing users,
// preventing everything from appearing as "new" on first feature deployment.
const FEATURE_LAUNCH = new Date("2026-05-03");

async function fetchReadMap(campaignId: string, entityType: string): Promise<Map<string, Date>> {
  const user = getCurrentUser();
  if (!user) return new Map();
  const { data, error } = await supabase
    .from("player_read_items")
    .select("entity_id, read_at")
    .eq("user_id", user.id)
    .eq("campaign_id", campaignId)
    .eq("entity_type", entityType);
  if (error) throw error;
  const map = new Map<string, Date>();
  for (const row of data) map.set(row.entity_id, new Date(row.read_at));
  return map;
}

export function useReadItems(entityType: string) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);

  const query = useQuery({
    queryKey: computed(() => [KEY, entityType, campaignId.value]),
    queryFn: () => fetchReadMap(campaignId.value!, entityType),
    enabled: () => !!campaignId.value,
  });

  // updatedAt: provide for re-flagging on DM edit; omit for "never-read only" (e.g. bestiary)
  function isNew(entityId: string, updatedAt?: string): boolean {
    const readAt = query.data.value?.get(entityId);
    if (!readAt) {
      if (!updatedAt) return false;
      return new Date(updatedAt) > FEATURE_LAUNCH;
    }
    if (!updatedAt) return false;
    return new Date(updatedAt) > readAt;
  }

  return { ...query, isNew };
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
      const queryKey = [KEY, entityType, campaign.activeCampaignId];
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<Map<string, Date>>(queryKey);
      qc.setQueryData<Map<string, Date>>(queryKey, (old) => {
        const next = new Map(old ?? []);
        next.set(entityId, new Date());
        return next;
      });
      return { prev, queryKey };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(ctx.queryKey, ctx.prev);
    },
  });
}
