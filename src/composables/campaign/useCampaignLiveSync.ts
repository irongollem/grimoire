// Listens to the campaign's doorbell so every connected client (DM + players)
// sees updates without waiting for stale time. Mounted once in DefaultLayout
// (DM) and PlayerLayout (players). Uses reference counting so both layouts can
// call it safely, and only one Supabase channel exists at a time.
//
// The channel is a private Broadcast topic, `doorbellTopic(id)`. The database rings
// it once per transaction, at commit, with the name of what changed, never a row (migration 20261009233206). Each ring is turned
// into a refetch of the queries that read that signal, so the client reads its
// own data through its own RLS. This replaced row subscriptions, whose Realtime poller was
// 91% of all database time (#999 4.2).
import { watch, onUnmounted } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import {
  createRealtimeChannel,
  type RealtimeChannelHandle,
} from "@/lib/campaignLiveSync/realtimeChannel";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { refetchCampaignSession } from "@/composables/campaign/useCampaignSession";
import { useAuthStore } from "@/stores/auth";
import type { Campaign } from "@/types/campaign.types";
import { RECONCILE_KEYS, SIGNAL_KEYS } from "@/lib/campaignLiveSync/registry";
import { reportAsync } from "@/lib/campaignLiveSync/reportAsync";
import { doorbellTopic, emitCampaignJoinFailed, emitCampaignReconcile, emitCampaignRing } from "@/lib/campaignLiveSync/rings";
import { DM_NOTE_COLUMN_TABLES } from "@/lib/dmNotes/registry";

let activeChannel: RealtimeChannelHandle | null = null;
let refCount = 0;
let stopWatcher: (() => void) | null = null;
let clearPendingInvalidations: (() => void) | null = null;

export function useCampaignLiveSync() {
  const campaign = useCampaignStore();
  const auth = useAuthStore();
  const qc = useQueryClient();

  refCount++;

  const teardown = () => {
    if (clearPendingInvalidations) {
      clearPendingInvalidations();
      clearPendingInvalidations = null;
    }
    if (activeChannel) { activeChannel.stop(); activeChannel = null; }
  };

  // The campaign row arrives as a ring too, and a ring carries no row, so the
  // one row is read again and merged into the store's copy and the list cache.
  const refreshCampaignRow = async (campaignId: string) => {
    const { data, error } = await supabase.from("campaigns").select("*").eq("id", campaignId).maybeSingle();
    if (error) throw error;
    if (!data || campaign.activeCampaignId !== campaignId) return;
    const updated = data as Campaign;
    if (campaign.activeCampaign) {
      campaign.activeCampaign = { ...campaign.activeCampaign, ...updated };
    }
    qc.setQueryData<Campaign[]>(["campaigns"], (old) =>
      old?.map((entry) => entry.id === updated.id ? { ...entry, ...updated } : entry),
    );
  };

  // Only the first caller sets up the watcher + channel
  if (refCount === 1) {
    const unwatch = watch(
      () => campaign.activeCampaignId,
      (campaignId) => {
        teardown();
        if (!campaignId) return;

        // Coalesce bursts of rings (a bulk write can ring several signals that
        // share a key root) into a single refetch per key.
        const pendingKeys = new Set<string>();
        let flushTimer: ReturnType<typeof setTimeout> | null = null;
        const invalidate = (key: string) => {
          pendingKeys.add(key);
          if (flushTimer) clearTimeout(flushTimer);
          flushTimer = setTimeout(() => {
            flushTimer = null;
            const keys = [...pendingKeys];
            pendingKeys.clear();
            for (const k of keys) void qc.invalidateQueries({ queryKey: [k] });
          }, 250);
        };
        clearPendingInvalidations = () => {
          if (flushTimer) clearTimeout(flushTimer);
          flushTimer = null;
          pendingKeys.clear();
        };

        // Self-heal: re-derive every synced key from the DB after any gap in the
        // ring stream (socket drop, network loss, a backgrounded tab whose
        // socket the browser froze). A ring is not replayed, so a missed one is
        // only recovered here. invalidateQueries only refetches ACTIVE
        // observers, so the cost is bounded to whatever is currently on screen.
        activeChannel = createRealtimeChannel({
          topic: doorbellTopic(campaignId),
          isPrivate: true,
          reconcile: () => {
            for (const k of RECONCILE_KEYS) void qc.invalidateQueries({ queryKey: [k] });
            // Not queries, so invalidation cannot reach them: re-read directly.
            reportAsync(refetchCampaignSession(campaignId));
            reportAsync(refreshCampaignRow(campaignId));
            emitCampaignReconcile(campaignId);
          },
          // The heal only reconciles after a successful rejoin, which a player
          // removed while offline never gets: the join policy refuses them. So a
          // failed join tells the removal guard directly.
          onStatus: (status) => {
            if (status === "CHANNEL_ERROR") emitCampaignJoinFailed(campaignId);
          },
          bind: (channel) => channel.on("broadcast", { event: "ring" }, ({ payload }) => {
            if (campaign.activeCampaignId !== campaignId) return;
            const ring = emitCampaignRing(campaignId, payload);
            // Every tab refreshes on every ring, the one its own request caused
            // included: a mutation's side effects (a craft that inserts
            // inventory, a purchase) reach the caller only this way.
            if (!ring) return;
            const { table } = ring;

            // A DM note column rides on the entity's own row, and a ring names
            // no row, so every open note of that table re-reads.
            if (DM_NOTE_COLUMN_TABLES.has(table)) void qc.invalidateQueries({ queryKey: ["dm-note", table] });
            // A DM's touch restamps whatever note they just saved, which
            // reaches their other device where the entity's own table is not
            // a signal. The touch names no note here, so all of them re-read.
            if (table === "dm_note_touches") void qc.invalidateQueries({ queryKey: ["dm-note"] });

            // The live session (#758) is the one open row of the session log. It
            // feeds a store rather than a query, so it is re-read, and the log
            // list with it. Players cannot read the table; they refetch their
            // projection through the keys below.
            if (table === "campaign_sessions") {
              void qc.invalidateQueries({ queryKey: ["campaign-sessions"] });
              if (auth.isDM) reportAsync(refetchCampaignSession(campaignId));
            }
            if (table === "campaigns") reportAsync(refreshCampaignRow(campaignId));

            const keys = SIGNAL_KEYS.get(table);
            if (keys) for (const key of keys) invalidate(key);
          }),
        });
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
      teardown();
    }
  });
}
