// Ejects a player whose own campaign_members row is deleted mid-session (the DM
// removed them from the campaign). Without this, RLS silently starves every
// query and the player stares at blank content instead of being told they were
// removed. Mounted once in PlayerLayout only — the DM layout must never eject
// when it removes a player (that DELETE is someone else's row).
//
// Relies on campaign_members being published with REPLICA IDENTITY FULL (see
// 20260711000018) so the DELETE payload carries the old row's user_id.
import { watch, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { supabase } from "@/lib/supabase";
import { createRealtimeChannel, type RealtimeChannelHandle } from "@/lib/realtimeChannel";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";

export function usePlayerRemovalGuard() {
  const auth = useAuthStore();
  const campaign = useCampaignStore();
  const router = useRouter();
  const toast = useToast();

  let realtime: RealtimeChannelHandle | null = null;
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
    if (error || expectedGeneration !== generation || subscribedCampaignId !== campaignId || data) return;
    void eject(campaignId, campaign.activeCampaign?.name ?? "the campaign", expectedGeneration);
  }

  const stop = watch(
    () => campaign.activeCampaignId,
    (campaignId) => {
      realtime?.stop();
      realtime = null;
      subscribedCampaignId = campaignId;
      const myGeneration = ++generation;
      if (!campaignId) return;

      realtime = createRealtimeChannel({
        topic: `player_removal_guard:${campaignId}`,
        // Only a delivery gap needs an HTTP read. Normal DELETE events contain
        // the old row (REPLICA IDENTITY FULL), so they can eject immediately.
        reconcile: () => void confirmStillMember(campaignId, myGeneration),
        bind: (channel) => channel.on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "campaign_members", filter: `campaign_id=eq.${campaignId}` },
          (payload) => {
            const removedUserId = (payload.old as { user_id?: string } | null)?.user_id;
            if (myGeneration !== generation || subscribedCampaignId !== campaignId
              || ejecting || !removedUserId || removedUserId !== auth.user?.id) return;
            void eject(campaignId, campaign.activeCampaign?.name ?? "the campaign", myGeneration);
          },
        ),
      });
    },
    { immediate: true },
  );

  async function eject(campaignId: string, campaignName: string, expectedGeneration: number) {
    if (ejecting || expectedGeneration !== generation || subscribedCampaignId !== campaignId) return;
    ejecting = true;
    toast.error(`You have been removed from ${campaignName} by the DM.`, 0);
    campaign.clearActiveCampaign();
    if (campaignId) {
      try { localStorage.removeItem("grimoire_active_campaign"); } catch { /* ignore */ }
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
    realtime?.stop();
    realtime = null;
  });
}
