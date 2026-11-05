import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useIsRuleEnabled } from "@/composables/rules/useOptionalRules";
import { useToast } from "@/composables/useToast";
import { useActiveParty } from "@/composables/party/useActiveParty";
import { useCampaignJackOfAllTrades } from "@/composables/party/useJackOfAllTrades";
import { formatAwarenessUse } from "@/rules/awareness";
import type { AwarenessRoll } from "@/types/party.types";

const KEY = "awareness-rolls";
/** The DM must read the number that was just used before it is gone. */
const TOAST_MS = 15000;

interface UseResultRow {
  member_id: string;
  used_d20: number | null;
  used_d20_second: number | null;
  new_d20: number;
  new_d20_second: number;
}

/**
 * The DM's secret Perception rolls (optional rule `awareness_rolls`), by party
 * member id. Off for players and while the rule is off, so nothing is requested.
 */
export function useAwarenessRolls() {
  const auth = useAuthStore();
  const campaign = useCampaignStore();
  const ruleOn = useIsRuleEnabled("awareness_rolls");
  const enabled = computed(() => auth.isDM && ruleOn.value && !!campaign.activeCampaignId);

  const query = useQuery({
    queryKey: [KEY, computed(() => campaign.activeCampaignId)],
    enabled,
    queryFn: async (): Promise<Map<string, AwarenessRoll>> => {
      const { data, error } = await supabase
        .from("awareness_rolls")
        .select("*")
        .eq("campaign_id", campaign.activeCampaignId!);
      if (error) throw error;
      const rolls = data as AwarenessRoll[];
      return new Map(rolls.map((r) => [r.party_member_id, r]));
    },
  });

  return { enabled, rolls: computed(() => query.data.value), isError: query.isError };
}

/** Uses the waiting roll of the named characters and rolls their next one. */
export function useUseAwarenessRolls() {
  const campaign = useCampaignStore();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: party } = useActiveParty();
  const { jackFor, settled: classRowsSettled } = useCampaignJackOfAllTrades();

  return useMutation({
    mutationFn: async (memberIds: string[]): Promise<UseResultRow[]> => {
      const { data, error } = await supabase.rpc("use_awareness_rolls", {
        p_campaign_id: campaign.activeCampaignId!,
        p_party_member_ids: memberIds,
      });
      if (error) throw error;
      return data as UseResultRow[];
    },
    onSuccess: async (rows) => {
      void queryClient.invalidateQueries({ queryKey: [KEY] });
      // The totals include Jack of All Trades, so they wait for the class rows. The
      // rolls are already used on the server, so a failure here is not a failed use.
      try {
        await classRowsSettled();
      } catch {
        // The class rows query reports its own error; this says what it cost here.
        toast.error("The awareness rolls were used, but their totals could not be read. Reload to see them.");
        return;
      }
      const byId = new Map(party.value?.map((m) => [m.id, m] as const));
      const uses = rows.flatMap((row) => {
        const member = byId.get(row.member_id);
        const used =
          row.used_d20 !== null && row.used_d20_second !== null
            ? { d20: row.used_d20, d20Second: row.used_d20_second }
            : null;
        return member ? [{ name: member.name, member, jack: jackFor(member), used }] : [];
      });
      const text = formatAwarenessUse(uses);
      if (text) toast.info(text, TOAST_MS);
    },
    onError: (cause) => toast.error(toast.fromError(cause, "Could not use the awareness roll.")),
  });
}
