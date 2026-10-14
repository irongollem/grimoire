/**
 * Look after my character (#1059): what happened to the owner's character while
 * someone else had it. Only the owner hears it; the lines are the ones the
 * caretaker sent for the character (`metadata.for_party_member_id`), read through
 * the chat table's own RLS. Its root, `WHILE_AWAY_KEY`, is refreshed by the
 * `character_caretakers` ring and by `campaign_messages`, so a line sent for
 * the character while the owner watches their Hearth arrives as it is sent;
 * there is no poll.
 */
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCharacterCaretakers } from "@/composables/party/useCharacterCaretakers";
import { WHILE_AWAY_KEY } from "@/lib/campaignLiveSync/registry";
import { usePlayerSessions } from "@/composables/sessions/usePlayerSessions";
import { useCampaignMembers } from "@/composables/campaign/useCampaignMembers";
import { awayHeadline, pickWhileAway, summariseAway, type AwayLine, type WhileAwayHandOver } from "@/lib/hearth/whileAway";
import { useAuthStore } from "@/stores/auth";
import type { PartyMember } from "@/types/party.types";

const LINE_LIMIT = 200;

async function fetchLines(campaignId: string, memberId: string, away: WhileAwayHandOver): Promise<AwayLine[]> {
  let query = supabase
    .from("campaign_messages")
    .select("id, type, message, created_at, metadata")
    .eq("campaign_id", campaignId)
    .eq("user_id", away.handOver.caretaker_user_id)
    .eq("metadata->>for_party_member_id", memberId)
    .gte("created_at", away.handOver.created_at);
  if (away.endedAt) query = query.lte("created_at", away.endedAt);
  const { data, error } = await query.order("created_at", { ascending: false }).limit(LINE_LIMIT);
  if (error) throw error;
  return data as AwayLine[];
}

export function useWhileAway(
  campaignId: MaybeRefOrGetter<string | null | undefined>,
  member: MaybeRefOrGetter<PartyMember | null>,
) {
  const auth = useAuthStore();
  const { rows, openSessionId } = useCharacterCaretakers(campaignId);
  const { data: sessions } = usePlayerSessions();
  const { data: members } = useCampaignMembers();

  const owned = computed(() => {
    const m = toValue(member);
    return m !== null && m.owner_user_id !== null && m.owner_user_id === auth.user?.id;
  });

  const away = computed<WhileAwayHandOver | null>(() => {
    const m = toValue(member);
    // Wait for the labels: a hand-over filed under a session ends with it, and
    // without them it would read as ended at no time and be dropped.
    if (!owned.value || !m || !sessions.value || !rows.value) return null;
    return pickWhileAway(rows.value, m.id, openSessionId.value, sessions.value, new Date());
  });

  const linesQuery = useQuery({
    queryKey: computed(
      () => [WHILE_AWAY_KEY, toValue(campaignId), away.value?.handOver.id ?? null, away.value?.endedAt ?? null] as const,
    ),
    queryFn: () => {
      const cid = toValue(campaignId);
      const m = toValue(member);
      if (!cid || !m || !away.value) throw new Error("useWhileAway fetched without a hand-over");
      return fetchLines(cid, m.id, away.value);
    },
    enabled: () => !!toValue(campaignId) && away.value !== null,
  });

  const summary = computed(() => (linesQuery.data.value ? summariseAway(linesQuery.data.value) : null));

  const headline = computed(() => {
    const m = toValue(member);
    if (!away.value || !m) return null;
    const caretaker =
      members.value?.find((x) => x.user_id === away.value?.handOver.caretaker_user_id)?.display_name ?? "Someone";
    return awayHeadline({
      caretaker,
      character: m.name,
      active: away.value.active,
      session: away.value.session,
      startedAt: away.value.handOver.created_at,
    });
  });

  return { away, headline, summary, isError: linesQuery.isError, isPending: linesQuery.isPending };
}
