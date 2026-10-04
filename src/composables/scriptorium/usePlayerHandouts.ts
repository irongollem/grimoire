import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import type { ScriptoriumDocument } from "@/types/scriptorium.types";

/**
 * Query-key root for every player-side handout read (#970). The campaign
 * channel's doorbell rings `scriptorium_documents` only when a SHARED document
 * changes (20261004105821), and useCampaignLiveSync maps that ring to this root
 * alone. Never to the DM's own `scriptorium` root: that would refetch the
 * document a DM is typing into.
 */
export const PLAYER_HANDOUTS_KEY = "player-handouts";

// ── Reads ──────────────────────────────────────────────────────────────────────
// RLS is a ceiling, not a filter (CLAUDE.md, Client Reads): both reads name the
// campaign and the recipient themselves, so a stale link to a withdrawn handout
// resolves to "absent" and the list never depends on the policy to narrow it.

const LIST_COLUMNS = "id, title, doc_type, campaign_id, updated_at, created_at";

export type PlayerHandoutSummary = Pick<
  ScriptoriumDocument,
  "id" | "title" | "doc_type" | "campaign_id" | "updated_at" | "created_at"
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

export async function fetchHandout(
  id: string,
  campaignId: string,
  partyMemberId: string,
): Promise<ScriptoriumDocument | null> {
  const { data, error } = await supabase
    .from("scriptorium_documents")
    .select("*")
    .eq("id", id)
    .eq("campaign_id", campaignId)
    .contains("player_visible_to", [partyMemberId])
    .maybeSingle();
  if (error) throw error;
  return data as ScriptoriumDocument | null;
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

/** One full handout, or null when it is withdrawn or was never theirs. */
export function usePlayerHandout(id: MaybeRefOrGetter<string>) {
  const campaign = useCampaignStore();
  const auth = useAuthStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const partyMemberId = computed(() => auth.linkedPartyMemberId);

  return useQuery({
    queryKey: computed(() => [PLAYER_HANDOUTS_KEY, "one", toValue(id), campaignId.value, partyMemberId.value] as const),
    queryFn: ({ queryKey: [, , docId, cid, pid] }) => {
      if (!cid || !pid) throw new Error("usePlayerHandout fetched without a campaign and party member; enabled guarantees both");
      return fetchHandout(docId, cid, pid);
    },
    enabled: () => !!campaignId.value && !!partyMemberId.value,
  });
}
