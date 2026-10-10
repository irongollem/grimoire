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

export function usePlayerRemovalGuard() {
  const auth = useAuthStore();
  const campaign = useCampaignStore();
  const router = useRouter();
  const toast = useToast();

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
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (expectedGeneration !== generation || subscribedCampaignId !== campaignId || data) return;
    reportAsync(eject(campaignId, campaign.activeCampaign?.name ?? "the campaign", expectedGeneration));
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
