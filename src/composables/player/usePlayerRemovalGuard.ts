// Ejects a player whose own campaign_members row is deleted mid-session (the DM
// removed them from the campaign). Without this, RLS silently starves every
// query and the player stares at blank content instead of being told they were
// removed. Mounted once in PlayerLayout only — the DM layout must never eject
// when it removes a player (that DELETE is someone else's row).
//
// A `campaign_members` ring names the table, never the row, so it cannot say
// whose membership changed. Every ring (and every rejoin of the campaign
// channel, via reconcile) therefore re-reads this user's own row. Realtime
// authorizes a private channel at join, so a just-removed player still hears
// the ring on the open channel; a later rejoin is refused, which surfaces as a
// reconcile or a failed read. Memberships change rarely, so one read per ring
// is cheap.
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { watch, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { supabase } from "@/lib/supabase";
import { reportAsync } from "@/lib/campaignLiveSync/reportAsync";
import { onCampaignJoinFailed, onCampaignReconcile, onCampaignRing } from "@/lib/campaignLiveSync/rings";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import { useQueryClient } from "@tanstack/vue-query";
import { partyListQuery } from "@/composables/party/useParty";
import { useCharacterCaretakers } from "@/composables/party/useCharacterCaretakers";
import { wentBackMessage } from "@/lib/player/playableCharacters";
import type { PartyMember } from "@/types/party.types";
import type { CampaignMember } from "@/types/campaign.types";

export function usePlayerRemovalGuard() {
  const auth = useAuthStore();
  const campaign = useCampaignStore();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const caretakers = useCharacterCaretakers(() => campaign.activeCampaignId);

  let stopListening: (() => void) | null = null;
  let subscribedCampaignId: string | null = null;
  let generation = 0;
  let ejecting = false;

  async function confirmStillMember(campaignId: string, expectedGeneration: number) {
    if (expectedGeneration !== generation || subscribedCampaignId !== campaignId || ejecting) return;
    const userId = auth.user?.id;
    if (!userId) return;
    const { data, error } = await supabase
      .from("campaign_members")
      .select("id, party_member_id")
      .eq("campaign_id", campaignId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (expectedGeneration !== generation || subscribedCampaignId !== campaignId) return;
    if (data) {
      // Ending a hand-over moves the caretaker's seat back on the server (#1059),
      // so a ring can mean the seat moved rather than that anyone left.
      if (data.party_member_id !== (auth.membership?.party_member_id ?? null)) {
        await followSeat(campaignId, auth.membership?.party_member_id ?? null, userId);
      }
      return;
    }
    reportAsync(eject(campaignId, campaign.activeCampaign?.name ?? "the campaign", expectedGeneration));
  }

  async function followSeat(campaignId: string, previousSeat: string | null, userId: string) {
    const roster = queryClient.getQueryData<PartyMember[]>(partyListQuery(campaignId).queryKey);
    const tableMembers = queryClient.getQueryData<CampaignMember[]>(["campaign-members", campaignId]);
    const left = previousSeat === null ? undefined : roster?.find((m) => m.id === previousSeat);
    await auth.refreshMembership(campaignId);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["party"] }),
      queryClient.invalidateQueries({ queryKey: ["my-characters"] }),
      // The session too: the ring that moved the seat is often a session
      // ending, which lapses the hand-over without changing its row.
      caretakers.refresh(),
    ]);
    if (!previousSeat) return;
    // Only a character I was looking after, and no longer am. A seat I moved
    // myself leaves the hand-over in force, so it says nothing.
    const rows = caretakers.rows.value;
    const active = caretakers.active.value;
    if (!rows || !active) return;
    const mine = rows.some((r) => r.party_member_id === previousSeat && r.caretaker_user_id === userId);
    if (!mine || active.some((r) => r.party_member_id === previousSeat)) return;
    const owner = tableMembers?.find((m) => m.user_id === left?.owner_user_id)?.display_name ?? null;
    toast.info(wentBackMessage(left?.name ?? null, owner));
  }

  const stop = watch(
    () => campaign.activeCampaignId,
    (campaignId) => {
      stopListening?.();
      stopListening = null;
      subscribedCampaignId = campaignId;
      const myGeneration = ++generation;
      if (!campaignId) return;

      const check = () => reportAsync(confirmStillMember(campaignId, myGeneration));
      const offRing = onCampaignRing(["campaign_members"], (ring) => {
        if (ring.campaignId === campaignId) check();
      });
      const offReconcile = onCampaignReconcile((id) => {
        if (id === campaignId) check();
      });
      // A player removed while offline is refused on the rejoin and hears
      // neither the ring nor a reconcile, so a failed join asks too. It is
      // best-effort: a join that failed because the network is down fails this
      // read the same way, which is expected and not worth a report, and a real
      // refusal recurs on every rejoin attempt, so the next one asks again.
      const offJoinFailed = onCampaignJoinFailed((id) => {
        if (id === campaignId) confirmStillMember(campaignId, myGeneration).catch(() => undefined);
      });
      stopListening = () => { offRing(); offReconcile(); offJoinFailed(); };
    },
    { immediate: true },
  );

  async function eject(campaignId: string, campaignName: string, expectedGeneration: number) {
    if (ejecting || expectedGeneration !== generation || subscribedCampaignId !== campaignId) return;
    ejecting = true;
    toast.error(`You have been removed from ${campaignName} by the DM.`, 0);
    campaign.clearActiveCampaign();
    if (campaignId) {
      try { safeLocalStorage().removeItem("grimoire_active_campaign"); } catch { /* ignore */ }
    }
    // Re-derive the session's role from whatever membership remains (another
    // campaign, or none) and route to a place that membership can still reach.
    try {
      await auth.refreshMembership();
      if (auth.isPlayer) {
        await router.replace({ name: "play" });
      } else if (auth.isDM) {
        await router.replace({ name: "dashboard" });
      } else {
        await router.replace({ name: "login" });
      }
    } finally {
      ejecting = false;
    }
  }

  onUnmounted(() => {
    stop();
    generation++;
    subscribedCampaignId = null;
    stopListening?.();
    stopListening = null;
  });
}
