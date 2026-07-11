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
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";

export function usePlayerRemovalGuard() {
  const auth = useAuthStore();
  const campaign = useCampaignStore();
  const router = useRouter();
  const toast = useToast();

  let channel: ReturnType<typeof supabase.channel> | null = null;
  let ejecting = false;

  const stop = watch(
    () => campaign.activeCampaignId,
    (campaignId) => {
      if (channel) { supabase.removeChannel(channel); channel = null; }
      if (!campaignId) return;

      channel = supabase
        .channel(`player_removal_guard:${campaignId}`)
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "campaign_members", filter: `campaign_id=eq.${campaignId}` },
          (payload) => {
            const removedUserId = (payload.old as { user_id?: string } | null)?.user_id;
            if (ejecting || !removedUserId || removedUserId !== auth.user?.id) return;
            ejecting = true;
            void eject(campaign.activeCampaign?.name ?? "the campaign");
          },
        )
        .subscribe();
    },
    { immediate: true },
  );

  async function eject(campaignName: string) {
    const removedCampaignId = campaign.activeCampaignId;
    toast.error(`You have been removed from ${campaignName} by the DM.`, 0);
    campaign.clearActiveCampaign();
    if (removedCampaignId) {
      try { localStorage.removeItem("grimoire_active_campaign"); } catch { /* ignore */ }
    }
    // Re-derive the session's role from whatever membership remains (another
    // campaign, or none) and route to a place that membership can still reach.
    await auth.refreshMembership();
    if (auth.isPlayer) {
      await router.replace({ name: "play" });
    } else if (auth.isDM) {
      await router.replace({ name: "dashboard" });
    } else {
      await router.replace({ name: "login" });
    }
    ejecting = false;
  }

  onUnmounted(() => {
    stop();
    if (channel) { supabase.removeChannel(channel); channel = null; }
  });
}
