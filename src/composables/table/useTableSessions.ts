import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { useParty } from "@/composables/party/useParty";
import { useLocationNames } from "@/composables/locations/useLocations";

export const TABLE_SESSIONS_KEY = "table-sessions";

export interface TableSittingRow {
  id: string;
  party_member_id: string | null;
  scene_location_id: string | null;
  credits_spent: number;
  created_at: string;
  updated_at: string;
  left_at: string | null;
}

const COLUMNS = "id, party_member_id, scene_location_id, credits_spent, created_at, updated_at, left_at";

/**
 * This account's earlier sittings at the AI table in one campaign, newest first. Both filters are in the query: RLS
 * would also hide other people's conversations, but it is a ceiling, and the day a wider policy lands (a co-DM read)
 * an unfiltered read would list their sittings here too.
 */
export function useTableSessions(campaignId: MaybeRefOrGetter<string | null>) {
  const auth = useAuthStore();
  const userId = computed(() => auth.user?.id ?? null);
  const query = useQuery({
    queryKey: computed(() => [TABLE_SESSIONS_KEY, toValue(campaignId), userId.value] as const),
    queryFn: async ({ queryKey: [, campaign, user] }): Promise<TableSittingRow[]> => {
      if (!campaign || !user) throw new Error("useTableSessions read without a campaign and a signed-in account");
      const { data, error } = await supabase
        .from("agent_sessions")
        .select(COLUMNS)
        .eq("user_id", user)
        .eq("campaign_id", campaign)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as TableSittingRow[];
    },
    enabled: () => !!toValue(campaignId) && !!userId.value,
  });

  // Who was played and where: names come through the readers the rest of the app uses, not a second copy of them.
  const { data: party } = useParty();
  const placeIds = computed(() => [...new Set((query.data.value ?? []).flatMap((s) => (s.scene_location_id ? [s.scene_location_id] : [])))]);
  const placeNames = useLocationNames(placeIds);

  const sittings = computed(() =>
    (query.data.value ?? []).map((s) => ({
      ...s,
      characterName: party.value?.find((m) => m.id === s.party_member_id)?.name ?? null,
      placeName: s.scene_location_id ? (placeNames.value.get(s.scene_location_id) ?? null) : null,
    })),
  );

  return { ...query, sittings };
}
