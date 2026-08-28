import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { TrackerState } from "@/types/rule.types";

const KEY = "tracker_state";

async function fetchTrackerStates(campaignId: string): Promise<TrackerState[]> {
  const { data, error } = await supabase
    .from("party_member_tracker_state")
    .select("*")
    .eq("campaign_id", campaignId);
  if (error) throw error;
  return data as TrackerState[];
}

async function upsertTrackerState(
  state: Omit<TrackerState, "id" | "updated_at">,
): Promise<TrackerState> {
  // Use the appropriate unique constraint depending on the source
  const conflictCol = state.rule_key ? "party_member_id,rule_key" : "party_member_id,rule_id";
  const { data, error } = await supabase
    .from("party_member_tracker_state")
    .upsert(state, { onConflict: conflictCol })
    .select()
    .single();
  if (error) throw error;
  return data as TrackerState;
}

/** Fetches all tracker states for the active campaign (all party members, all rules). */
export function useTrackerStates() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [KEY, campaignId.value]),
    queryFn: () => fetchTrackerStates(campaignId.value!),
    enabled: () => !!campaignId.value,
  });
}

function findTrackerRow(
  rows: TrackerState[],
  partyMemberId: string,
  ruleKey?: string | null,
  ruleId?: string | null,
): TrackerState | undefined {
  return ruleKey
    ? rows.find((r) => r.party_member_id === partyMemberId && r.rule_key === ruleKey)
    : rows.find((r) => r.party_member_id === partyMemberId && r.rule_id === ruleId);
}

/**
 * Returns the current tracker value for a specific party member + rule.
 * Pass either ruleKey (built-in) or ruleId (custom), not both.
 */
export function useTrackerValue(partyMemberId: string, ruleKey?: string, ruleId?: string) {
  const { data } = useTrackerStates();
  return computed(() => {
    const row = findTrackerRow(data.value ?? [], partyMemberId, ruleKey, ruleId);
    return row?.value ?? 0;
  });
}

/** Set a tracker value (upsert). Used by DM buttons and trigger hooks. */
export function useSetTrackerValue() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: (state: Omit<TrackerState, "id" | "updated_at">) => upsertTrackerState(state),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [KEY, campaign.activeCampaignId] }),
  });
}

/** Apply a delta or set an exact value on a tracker. Clamps to [min, max]. */
export function useApplyTrackerDelta() {
  const { data } = useTrackerStates();
  const { mutateAsync: set } = useSetTrackerValue();
  const campaign = useCampaignStore();

  return async (opts: {
    partyMemberId: string;
    ruleKey?: string;
    ruleId?: string;
    delta: number;
    setValue?: number;
    min: number;
    max: number;
  }) => {
    let clamped: number;
    if (opts.setValue !== undefined) {
      clamped = Math.max(opts.min, Math.min(opts.max, opts.setValue));
    } else {
      const rows = data.value ?? [];
      const current = findTrackerRow(rows, opts.partyMemberId, opts.ruleKey, opts.ruleId)?.value ?? 0;
      clamped = Math.max(opts.min, Math.min(opts.max, current + opts.delta));
    }
    await set({
      party_member_id: opts.partyMemberId,
      campaign_id: campaign.activeCampaignId!,
      rule_key: opts.ruleKey ?? null,
      rule_id: opts.ruleId ?? null,
      value: clamped,
    });
  };
}
