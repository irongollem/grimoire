import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import type { PlayerHandout, ScriptoriumDocument } from "@/types/scriptorium.types";
import { PLAYER_HANDOUTS_KEY } from "@/lib/campaignLiveSync/registry";

/**
 * Query-key root for every player-side handout read (#970). The campaign
 * channel's doorbell rings `scriptorium_documents` only when a SHARED document
 * changes (20261004105821), and useCampaignLiveSync maps that ring to this root
 * alone. Never to the DM's own `scriptorium` root: that would refetch the
 * document a DM is typing into.
 */

// ── Reads ──────────────────────────────────────────────────────────────────────
// RLS is a ceiling, not a filter (CLAUDE.md, Client Reads): both reads name the
// campaign and the recipient themselves, so a stale link to a withdrawn handout
// resolves to "absent" and the list never depends on the policy to narrow it.

const LIST_COLUMNS = "id, title, doc_type, campaign_id, kind, theme, updated_at, created_at";

export type PlayerHandoutSummary = Pick<
  ScriptoriumDocument,
  "id" | "title" | "doc_type" | "campaign_id" | "kind" | "theme" | "updated_at" | "created_at"
>;

export async function fetchHandouts(campaignId: string, partyMemberId: string): Promise<PlayerHandoutSummary[]> {
  const { data, error } = await supabase
    .from("scriptorium_documents")
    .select(LIST_COLUMNS)
    .eq("campaign_id", campaignId)
    .contains("player_visible_to", [partyMemberId])
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as PlayerHandoutSummary[];
}

/** Not authorized: Postgres insufficient_privilege, which `get_player_handout` raises for a non-holder. */
const NOT_AUTHORIZED = "42501";

/**
 * One handout and one of its chapters, read through `get_player_handout`: the
 * server strips DM-only blocks and Deep halves, so the body never reaches a
 * player's browser (chapters cannot be selected by players at all). Null when
 * the handout is withdrawn or was never theirs, as before.
 */
export async function fetchHandout(id: string, chapterId: string | null): Promise<PlayerHandout | null> {
  const { data, error } = await supabase.rpc("get_player_handout", {
    p_document_id: id,
    ...(chapterId ? { p_chapter_id: chapterId } : {}),
  });
  if (error) {
    if (error.code === NOT_AUTHORIZED) return null;
    throw error;
  }
  return data as unknown as PlayerHandout;
}

/** The handouts shared with the signed-in player in the active campaign. */
export function usePlayerHandouts() {
  const campaign = useCampaignStore();
  const auth = useAuthStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const partyMemberId = computed(() => auth.linkedPartyMemberId);

  return useQuery({
    queryKey: computed(() => [PLAYER_HANDOUTS_KEY, "list", campaignId.value, partyMemberId.value] as const),
    queryFn: ({ queryKey: [, , cid, pid] }) => {
      if (!cid || !pid) throw new Error("usePlayerHandouts fetched without a campaign and party member; enabled guarantees both");
      return fetchHandouts(cid, pid);
    },
    enabled: () => !!campaignId.value && !!partyMemberId.value,
  });
}

/** One handout with one chapter (the first when `chapterId` is empty), or null when withdrawn. */
export function usePlayerHandout(
  id: MaybeRefOrGetter<string>,
  chapterId: MaybeRefOrGetter<string | null | undefined> = null,
) {
  const campaign = useCampaignStore();
  const auth = useAuthStore();

  return useQuery({
    queryKey: () => [PLAYER_HANDOUTS_KEY, "one", toValue(id), toValue(chapterId) ?? "first"] as const,
    queryFn: () => fetchHandout(toValue(id), toValue(chapterId) ?? null),
    enabled: () => !!campaign.activeCampaignId && !!auth.linkedPartyMemberId,
  });
}
