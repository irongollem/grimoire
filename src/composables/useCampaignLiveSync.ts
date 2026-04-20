// Subscribes to postgres_changes for all shared campaign tables so every
// connected client (DM + players) sees updates without waiting for stale time.
// Mounted once in DefaultLayout (DM) and PlayerLayout (players).
import { watch, onUnmounted } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";

export function useCampaignLiveSync() {
  const campaign = useCampaignStore();
  const qc = useQueryClient();
  let channel: ReturnType<typeof supabase.channel> | null = null;

  watch(
    () => campaign.activeCampaignId,
    (campaignId) => {
      if (channel) { supabase.removeChannel(channel); channel = null; }
      if (!campaignId) return;

      const f = `campaign_id=eq.${campaignId}`;
      const invalidate = (key: string) => () => {
        void qc.invalidateQueries({ queryKey: [key] });
      };

      channel = supabase
        .channel(`campaign_live_sync:${campaignId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "notes",           filter: f }, invalidate("notes"))
        .on("postgres_changes", { event: "*", schema: "public", table: "quests",          filter: f }, invalidate("quests"))
        .on("postgres_changes", { event: "*", schema: "public", table: "locations",       filter: f }, invalidate("locations"))
        .on("postgres_changes", { event: "*", schema: "public", table: "factions",        filter: f }, invalidate("factions"))
        .on("postgres_changes", { event: "*", schema: "public", table: "puzzle_rooms",    filter: f }, invalidate("puzzle_rooms"))
        .on("postgres_changes", { event: "*", schema: "public", table: "calendar_events", filter: f }, invalidate("calendar-events"))
        .on("postgres_changes", { event: "*", schema: "public", table: "player_journal",  filter: f }, invalidate("player_journal"))
        .subscribe();
    },
    { immediate: true },
  );

  onUnmounted(() => {
    if (channel) { supabase.removeChannel(channel); channel = null; }
  });
}
