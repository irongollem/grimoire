// Subscribes to postgres_changes for all shared campaign tables so every
// connected client (DM + players) sees updates without waiting for stale time.
// Mounted once in DefaultLayout (DM) and PlayerLayout (players).
// Uses reference counting so both layouts can call it safely — only one
// Supabase channel exists at a time.
import { watch, onUnmounted } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import {
  createRealtimeChannel,
  type RealtimeChannelHandle,
} from "@/lib/realtimeChannel";
import { useCampaignStore } from "@/stores/campaign";
import { adoptLoggedSession, dropLoggedSession, refetchCampaignSession } from "@/composables/campaign/useCampaignSession";
import type { CampaignSession } from "@/types/session.types";
import { useAuthStore } from "@/stores/auth";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Campaign } from "@/types/campaign.types";
import { RECONCILE_KEYS, PLAYER_ONLY_SIGNALS, SIGNAL_KEYS, SYNC_TABLES } from "@/lib/campaignLiveSync/registry";
import { applyCampaignRealtimeWorld } from "@/lib/campaignLiveSync/campaignRealtimeWorld";
import { DM_NOTE_COLUMN_TABLES, dmNoteColumnKeyForTouch } from "@/lib/dmNotes/registry";
import { dispatchCampaignRealtimePlayer } from "@/lib/campaignLiveSync/campaignRealtimePlayer";
import { dispatchCampaignRealtimeSystem } from "@/lib/campaignLiveSync/campaignRealtimeSystems";

let activeChannel: RealtimeChannelHandle | null = null;
let refCount = 0;
let stopWatcher: (() => void) | null = null;
let clearPendingInvalidations: (() => void) | null = null;

function sortPartyInventory(items: PartyInventoryItem[]): PartyInventoryItem[] {
  return items.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

function upsertPartyInventoryItem(
  items: PartyInventoryItem[] | undefined,
  item: PartyInventoryItem,
  isUpdate: boolean,
): PartyInventoryItem[] | undefined {
  // Do not create a partial cache before its initial query has loaded.
  if (!items) return items;
  const cached = items.find((existing) => existing.id === item.id);
  // An UPDATE payload omits any column Postgres left unchanged and stored
  // out-of-line (TOAST) — `notes` is free text and can exceed that threshold.
  // Merge over the cached item rather than trusting the payload as complete.
  const merged = isUpdate && cached ? { ...cached, ...item } : item;
  const withoutItem = items.filter((existing) => existing.id !== item.id);
  return sortPartyInventory([...withoutItem, merged]);
}

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

  // Only the first caller sets up the watcher + channel
  if (refCount === 1) {
    const unwatch = watch(
      () => campaign.activeCampaignId,
      (campaignId) => {
        teardown();
        if (!campaignId) return;

        const f = `campaign_id=eq.${campaignId}`;
        // Coalesce bursts of realtime events (bulk reorders, multi-row inserts
        // emit one event per row) into a single refetch per key — otherwise a
        // 50-row write storms every connected client with 50 refetches.
        const pendingKeys = new Set<string>();
        let flushTimer: ReturnType<typeof setTimeout> | null = null;
        const invalidate = (key: string) => () => {
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
        // event stream (socket drop, network loss, a backgrounded tab whose
        // socket the browser froze). invalidateQueries only refetches ACTIVE
        // observers, so the cost is bounded to whatever is currently on screen.
        activeChannel = createRealtimeChannel({
          topic: `campaign_live_sync:${campaignId}`,
          reconcile: () => {
            for (const k of RECONCILE_KEYS) void qc.invalidateQueries({ queryKey: [k] });
            // Not a query, so invalidation cannot reach it — re-read the row.
            void refetchCampaignSession(campaignId);
          },
          bind: (initialChannel) => {
            let channel = initialChannel;
            for (const [table, key] of SYNC_TABLES) {
              channel = channel.on("postgres_changes", { event: "*", schema: "public", table, filter: f }, (payload) => {
                if (campaign.activeCampaignId !== campaignId) return;
                // A DM note column rides on the entity's own row; whatever the
                // reducers below do with that row, the open note re-reads.
                if (DM_NOTE_COLUMN_TABLES.has(table)) {
                  const row = (payload.new ?? payload.old) as { id?: string } | null;
                  if (row?.id) void qc.invalidateQueries({ queryKey: ["dm-note", table, row.id] });
                }
                // The DM's own touch names the note they just saved, which
                // reaches their other device even where the entity's table is
                // not on this channel (dmNoteColumnKeyForTouch).
                if (table === "dm_note_touches") {
                  const touch = payload.new as { entity_type?: string; entity_id?: string } | null;
                  const key = touch?.entity_type && touch.entity_id
                    ? dmNoteColumnKeyForTouch(touch.entity_type, touch.entity_id)
                    : null;
                  if (key) void qc.invalidateQueries({ queryKey: key });
                }
                const change = {
                  eventType: payload.eventType,
                  new: payload.new,
                  old: payload.old,
                };
                const context = {
                  campaignId,
                  currentUserId: auth.user?.id ?? null,
                  isDM: auth.isDM,
                };
                const handled = applyCampaignRealtimeWorld(qc, table, change as never, context)
                  || dispatchCampaignRealtimePlayer(qc, context, table, change as never)
                  || dispatchCampaignRealtimeSystem(qc, table, change as never, context);
                if (!handled) invalidate(key)();
              });
            }
            return channel
              // The doorbell (migration 20260904230420). Every subscription here
              // is filtered on campaign_id, and Realtime matches that filter
              // against the changed row — which, for a DELETE on an RLS table, is
              // trimmed to the primary key before it is sent. No campaign_id in
              // the payload means no match, so *no delete has ever arrived* on
              // any of these tables; `replica identity full` cannot change it.
              // A trigger writes the fact of the change to a row that can be
              // filtered, and this refetches what it names.
              .on("postgres_changes", { event: "*", schema: "public", table: "campaign_sync", filter: f }, (payload) => {
                if (campaign.activeCampaignId !== campaignId) return;
                // INSERT for a campaign's first-ever signal, UPDATE thereafter.
                const changed = (payload.new as { changed_table?: string } | null)?.changed_table;
                const keys = changed ? SIGNAL_KEYS.get(changed) : undefined;
                if (!keys) return;
                if (changed && auth.isDM && PLAYER_ONLY_SIGNALS.has(changed)) return;
                for (const key of keys) invalidate(key)();
              })
              // Party-inventory events have the exact query shape, so apply every
              // normal change directly instead of making every player poll.
              .on("postgres_changes", { event: "INSERT", schema: "public", table: "party_inventory", filter: f }, (payload) => {
                if (campaign.activeCampaignId !== campaignId) return;
                const inserted = payload.new as PartyInventoryItem;
                qc.setQueryData<PartyInventoryItem[]>(["party-inventory", campaignId], (old) =>
                  upsertPartyInventoryItem(old, inserted, false),
                );
              })
              .on("postgres_changes", { event: "UPDATE", schema: "public", table: "party_inventory", filter: f }, (payload) => {
                if (campaign.activeCampaignId !== campaignId) return;
                const updated = payload.new as PartyInventoryItem;
                qc.setQueryData<PartyInventoryItem[]>(["party-inventory", campaignId], (old) => {
                  return upsertPartyInventoryItem(old, updated, true);
                });
              })
              // No DELETE handler here on purpose. A filtered delete never
              // arrives (see the doorbell above), and the doorbell names only the
              // table, so a removed item is refetched rather than spliced out.
          // A newly-claimed/crafted item only becomes RLS-visible to a player once
          // its party_inventory row exists, but the ["items"] query is staleTime:Infinity
          // and never refetches on its own — so refresh it on any inventory INSERT,
          // otherwise the item shows no weight/name/stat-block until a full reload.
              .on("postgres_changes", { event: "INSERT", schema: "public", table: "party_inventory", filter: f }, invalidate("items"))
          // The live session (#758) is the one open row of the session log. It
          // feeds a store rather than only a list query, so it gets its own
          // handler instead of a SYNC_TABLES entry — but it rides this same
          // subscription, because a second channel per campaign buys nothing.
              .on("postgres_changes", { event: "*", schema: "public", table: "campaign_sessions", filter: f }, (payload) => {
                if (campaign.activeCampaignId !== campaignId) return;
                // The log changed (a number edited, a past session added): the
                // list re-reads. Any event, whatever it was about.
                void qc.invalidateQueries({ queryKey: ["campaign-sessions"] });
                // DELETE cannot reach a campaign_id-filtered subscription at all
                // (see the doorbell above), so that branch is unreachable today;
                // it stays because the payload shape must still be handled if the
                // row ever arrives by another route.
                if (payload.eventType === "DELETE") {
                  const gone = payload.old as Partial<CampaignSession>;
                  if (gone.id) dropLoggedSession(gone.id);
                  return;
                }
                // Only an open row is the live session, and only the row that
                // closes the adopted one clears it: `adoptLoggedSession` knows.
                adoptLoggedSession(payload.new as CampaignSession);
              })
          // campaigns table uses `id` as the campaign identifier (not campaign_id)
              .on("postgres_changes", { event: "UPDATE", schema: "public", table: "campaigns", filter: `id=eq.${campaignId}` }, (payload) => {
                if (campaign.activeCampaignId !== campaignId) return;
                const updated = payload.new as Campaign;
                if (updated && campaign.activeCampaign) {
                  campaign.activeCampaign = {
                    ...campaign.activeCampaign,
                    ...updated,
                  };
                }
                qc.setQueryData<Campaign[]>(["campaigns"], (old) =>
                  old?.map((entry) => entry.id === updated.id ? { ...entry, ...updated } : entry),
                );
              });
          },
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
