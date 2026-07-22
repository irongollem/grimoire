import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { RulesetReview, RulesetReviewFlagType } from "@/types/ruleset.types";

const QUERY_KEY = "ruleset_reviews";

async function fetchRulesetReviews(partyMemberId: string): Promise<RulesetReview[]> {
  const { data, error } = await supabase
    .from("ruleset_reviews")
    .select("*")
    .eq("party_member_id", partyMemberId);
  if (error) throw error;
  return (data ?? []) as RulesetReview[];
}

/**
 * Pending ruleset-review rows for one party member — flags a class/subclass,
 * spell, or background choice that a campaign edition change (2014⇄2024)
 * invalidated or newly requires. Rows are written by DB triggers; clients
 * only read them and clear them via `useAcknowledgeRulesetReviews`.
 */
export function useRulesetReviews(memberId: MaybeRefOrGetter<string | null | undefined>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, toValue(memberId)]),
    queryFn: () => fetchRulesetReviews(toValue(memberId)!),
    enabled: () => !!toValue(memberId),
  });
}

/** Deletes a member's ruleset-review rows (optionally filtered by flag type). Idempotent. */
export function useAcknowledgeRulesetReviews() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      partyMemberId,
      flagTypes = null,
    }: {
      partyMemberId: string;
      flagTypes?: RulesetReviewFlagType[] | null;
    }) => {
      const { error } = await supabase.rpc("acknowledge_ruleset_reviews", {
        p_party_member_id: partyMemberId,
        p_flag_types: flagTypes,
      });
      if (error) throw error;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}
