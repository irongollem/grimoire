/**
 * Look after my character (#1059): who is minding whose character at this
 * table, and the two writes a client makes, handing one over and ending it.
 *
 * Every member reads the whole table's hand-overs, because rolls, chat and the
 * party tracker say who is playing for whom. The table rings
 * `character_caretakers` on the campaign channel. Ending a hand-over (or its
 * session ending) moves the caretaker's seat back on the server, which rings
 * `campaign_members`; `usePlayerRemovalGuard` re-reads the player's own seat on
 * that ring.
 */
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { CHARACTER_CARETAKERS_KEY } from "@/lib/campaignLiveSync/registry";
import { activeHandOvers } from "@/lib/player/caretaking";
import { usePlayerSessionState } from "@/composables/campaign/useCampaignSession";
import type { CharacterCaretaker, CharacterCaretakerInsert } from "@/types/caretaker.types";

export { CHARACTER_CARETAKERS_KEY };

const COLUMNS =
  "id, campaign_id, party_member_id, caretaker_user_id, granted_by, session_id, return_member_id, revoked_at, revoked_by, created_at, updated_at";

/** Every hand-over at the table, newest first, and the ones in force now. */
export function useCharacterCaretakers(campaignId: MaybeRefOrGetter<string | null | undefined>) {
  const query = useQuery({
    queryKey: computed(() => [CHARACTER_CARETAKERS_KEY, toValue(campaignId)] as const),
    queryFn: async ({ queryKey: [, id] }): Promise<CharacterCaretaker[]> => {
      if (!id) throw new Error("useCharacterCaretakers fetched without a campaign");
      const { data, error } = await supabase
        .from("character_caretakers")
        .select(COLUMNS)
        .eq("campaign_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CharacterCaretaker[];
    },
    enabled: () => !!toValue(campaignId),
  });

  const sessionState = usePlayerSessionState(() => toValue(campaignId) ?? null);
  const openSessionId = computed(() => sessionState.data.value?.sessionId ?? null);

  // Null until the first reads land: "not loaded" is not "nobody is minding
  // anything", and a control offered on the second would be wrong on the first.
  // `active` also waits for the open session, without which a hand-over filed
  // under the running session would read as lapsed.
  const rows = computed(() => query.data.value ?? null);
  const active = computed(() =>
    rows.value && sessionState.data.value ? activeHandOvers(rows.value, openSessionId.value) : null,
  );

  /** Re-read both halves: a session ending changes which hand-overs are in force without touching a row. */
  async function refresh(): Promise<void> {
    await Promise.all([query.refetch(), sessionState.refetch()]);
  }

  return { ...query, rows, active, openSessionId, refresh };
}

/** Hand a character to another member. The owner or a DM may; the server checks both. */
export function useHandOverCharacter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CharacterCaretakerInsert) => {
      const { error } = await supabase.from("character_caretakers").insert(input);
      if (error) throw error;
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: [CHARACTER_CARETAKERS_KEY, input.campaign_id] });
    },
  });
}

/**
 * End a hand-over: the owner or a DM taking it back, or the caretaker handing
 * it back. The server stamps the time and who did it.
 */
export function useEndHandOver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (handOver: Pick<CharacterCaretaker, "id" | "campaign_id">) => {
      const { error } = await supabase
        .from("character_caretakers")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", handOver.id);
      if (error) throw error;
    },
    onSuccess: (_data, handOver) => {
      void queryClient.invalidateQueries({ queryKey: [CHARACTER_CARETAKERS_KEY, handOver.campaign_id] });
    },
  });
}
