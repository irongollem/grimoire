// Ejects a player whose own campaign_members row is deleted mid-session (the DM
// removed them from the campaign). Without this, RLS silently starves every
// query and the player stares at blank content instead of being told they were
// removed. Mounted once in PlayerLayout only — the DM layout must never eject
// when it removes a player (that DELETE is someone else's row).
//
// A DELETE payload cannot tell us *whose* row was removed: with RLS enabled,
// Postgres Changes trims the old record to the primary key, and Realtime does
// not apply the channel filter to DELETE events at all ("Delete events are not
// filterable"). So every campaign_members DELETE lands here, carrying only an
// id, and the authoritative check is the same one a delivery gap uses.
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
        reconcile: () => void confirmStillMember(campaignId, myGeneration),
        // No `filter` — Realtime ignores filters on DELETE, so requesting one
        // would only imply a narrowing that never happens. Memberships are
        // deleted rarely, so re-reading our own row per event is cheap, and it
        // is the only reading that survives a primary-key-only payload.
        bind: (channel) => channel.on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "campaign_members" },
          () => {
            if (myGeneration !== generation || subscribedCampaignId !== campaignId || ejecting) return;
            void confirmStillMember(campaignId, myGeneration);
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
