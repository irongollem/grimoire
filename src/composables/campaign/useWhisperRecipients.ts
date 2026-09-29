import { computed, ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import { keepPreviousData, useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useCampaignMembers } from "@/composables/campaign/useCampaignMembers";
import { useAuthStore } from "@/stores/auth";
import type { CampaignMember } from "@/types/campaign.types";

/**
 * The user ids the caller may whisper in a campaign (#927). Whether another
 * member is a young player is readable only by that child and their parent, so
 * the browser cannot work it out from the member list; the server answers, and
 * the same rule refuses a hand-made insert (`campaign_messages_insert`).
 */
export async function fetchWhisperRecipients(campaignId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("get_whisper_recipients", {
    p_campaign_id: campaignId,
  });
  if (error) throw error;
  return data as string[];
}

export function useWhisperRecipients() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const { data: members } = useCampaignMembers();

  // The member list is pushed live (`campaign_members` in `SYNC_TABLES`), so
  // keying on who is in it re-runs this query when someone joins or leaves,
  // with no extra invalidation route and no poll.
  const memberSignature = computed(() =>
    (members.value ?? []).map((m) => m.user_id).sort().join(","),
  );

  const query = useQuery({
    queryKey: computed(() => ["whisper-recipients", campaignId.value, memberSignature.value] as const),
    queryFn: ({ queryKey: [, cid] }) => {
      if (cid === null) throw new Error("useWhisperRecipients fetched without a campaign");
      return fetchWhisperRecipients(cid);
    },
    // Wait for the member list: before it loads the signature is empty, and that
    // first RPC would be thrown away the moment the list arrives.
    enabled: () => !!campaignId.value && members.value !== undefined,
    // A member joining or leaving changes the key. Keep the last answer standing
    // while the new one loads, so allowedIds never blinks to empty (which would
    // reset an open whisper). Not across campaigns: another campaign's answer is
    // not this one's.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === campaignId.value ? keepPreviousData(previous) : undefined,
  });

  const allowedIds = computed(() => new Set(query.data.value ?? []));

  /** Only the members the caller may whisper. Empty until the server has answered: failing closed. */
  function whisperable<T extends { user_id: string }>(others: readonly T[]): T[] {
    return others.filter((m) => allowedIds.value.has(m.user_id));
  }

  return { allowedIds, whisperable, query };
}

/**
 * The whisper picker's state, shared by both chat surfaces: who the caller may
 * whisper, the selected target, and the reset that drops a target the server no
 * longer allows. The reset acts only on a settled answer, never on the empty
 * interval while a new member signature is being fetched, or the next message
 * typed as a whisper would post publicly.
 */
export function useWhisperTarget(members: MaybeRefOrGetter<readonly CampaignMember[] | undefined>) {
  const auth = useAuthStore();
  const { allowedIds, whisperable, query } = useWhisperRecipients();
  const whisperTarget = ref("");

  const whisperableMembers = computed(() =>
    whisperable((toValue(members) ?? []).filter((m) => m.user_id !== auth.user?.id)),
  );

  const settled = computed(() => query.isSuccess.value && !query.isPlaceholderData.value);
  watch([allowedIds, settled], ([allowed, isSettled]) => {
    if (isSettled && whisperTarget.value && !allowed.has(whisperTarget.value)) {
      whisperTarget.value = "";
    }
  });

  return { whisperTarget, whisperableMembers };
}
