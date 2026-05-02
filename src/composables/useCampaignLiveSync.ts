// Subscribes to postgres_changes for all shared campaign tables so every
// connected client (DM + players) sees updates without waiting for stale time.
// Mounted once in DefaultLayout (DM) and PlayerLayout (players).
// Uses reference counting so both layouts can call it safely — only one
// Supabase channel exists at a time.
import { watch, onUnmounted } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";

let activeChannel: ReturnType<typeof supabase.channel> | null = null;
let refCount = 0;
let stopWatcher: (() => void) | null = null;

export function useCampaignLiveSync() {
  const campaign = useCampaignStore();
  const qc = useQueryClient();

  refCount++;

  // Only the first caller sets up the watcher + channel
  if (refCount === 1) {
    const unwatch = watch(
      () => campaign.activeCampaignId,
      (campaignId) => {
        if (activeChannel) { supabase.removeChannel(activeChannel); activeChannel = null; }
        if (!campaignId) return;

        const f = `campaign_id=eq.${campaignId}`;
        const invalidate = (key: string) => () => {
          void qc.invalidateQueries({ queryKey: [key] });
        };

        activeChannel = supabase
          .channel(`campaign_live_sync:${campaignId}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "notes",           filter: f }, invalidate("notes"))
          .on("postgres_changes", { event: "*", schema: "public", table: "quests",          filter: f }, invalidate("quests"))
          .on("postgres_changes", { event: "*", schema: "public", table: "locations",       filter: f }, invalidate("locations"))
          .on("postgres_changes", { event: "*", schema: "public", table: "factions",        filter: f }, invalidate("factions"))
          .on("postgres_changes", { event: "*", schema: "public", table: "puzzle_rooms",    filter: f }, invalidate("puzzle_rooms"))
          .on("postgres_changes", { event: "*", schema: "public", table: "calendar_events", filter: f }, invalidate("calendar-events"))
          .on("postgres_changes", { event: "*", schema: "public", table: "player_journal",    filter: f }, invalidate("player_journal"))
          .on("postgres_changes", { event: "*", schema: "public", table: "session_proposals",  filter: f }, invalidate("session_proposals"))
          .on("postgres_changes", { event: "*", schema: "public", table: "session_availability", filter: f }, invalidate("session_availability"))
          .subscribe();
      },
      { immediate: true },
    );
    stopWatcher = unwatch;
  }

  onUnmounted(() => {
    refCount--;
    if (refCount <= 0) {
      refCount = 0;
      if (stopWatcher) { stopWatcher(); stopWatcher = null; }
      if (activeChannel) { supabase.removeChannel(activeChannel); activeChannel = null; }
    }
  });
}
