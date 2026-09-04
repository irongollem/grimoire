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
import { adoptCampaignSession, refetchCampaignSession } from "@/composables/campaign/useCampaignSession";
import type { CampaignSessionState } from "@/types/session.types";
import { useAuthStore } from "@/stores/auth";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Campaign } from "@/types/campaign.types";
import { applyCampaignRealtimeWorld } from "@/lib/campaignLiveSync/campaignRealtimeWorld";
import { dispatchCampaignRealtimePlayer } from "@/lib/campaignLiveSync/campaignRealtimePlayer";
import { dispatchCampaignRealtimeSystem } from "@/lib/campaignLiveSync/campaignRealtimeSystems";

let activeChannel: RealtimeChannelHandle | null = null;
let refCount = 0;
let stopWatcher: (() => void) | null = null;
let clearPendingInvalidations: (() => void) | null = null;

// One registry for every campaign-scoped table. Normal events go through typed
// exact-row reducers; redacted projections, joins, and RLS-dependent shapes use
// targeted invalidation in those reducers. The key is also the recovery root.
// Exported for `campaignSyncTables.test.ts`, which holds this list and the
// delete triggers in migration 20260904230420 to the same set of tables.
export const SYNC_TABLES = [
  ["notes",                   "notes"],
  ["quests",                  "quests"],
  ["locations",               "locations"],
  ["factions",                "factions"],
  ["npcs",                    "npcs"],
  ["companions",              "companions"],
  ["discovered_monsters",     "discovered-monsters"],
  ["pantheons",               "pantheons"],
  ["deities",                 "deities"],
  ["puzzle_rooms",            "puzzle_rooms"],
  ["calendar_events",         "calendar-events"],
  ["player_journal_entries",  "player_journal"],
  ["session_proposals",       "session_proposals"],
  ["session_availability",    "session_availability"],
  ["items",                   "items"],
  ["quest_beat_loot",         "quest_beat_loot"],
  // Chat carries the authoritative claim/removal state for dispatched loot, but
  // it is also the busiest table here — the system reducer filters down to the
  // loot message types before touching any quest cache.
  ["campaign_messages",       "quest_beat_loot"],
  ["npc_inventory",           "npc-inventory"],
  // Membership add/remove + display-name changes — so a player renaming
  // themselves (or being added/removed) propagates to every member's party and
  // chat views. (Ejecting a just-removed player needs the deleted row's user_id,
  // which realtime DELETE only carries under full replica identity — tracked
  // separately.)
  ["campaign_members",        "campaign-members"],
  // Ruleset-review flags — a campaign edition switch (or DM/player acknowledging
  // one) writes/deletes rows here; refresh so the review banners appear/disappear.
  ["ruleset_reviews",         "ruleset_reviews"],
  // Optional rule toggles (turn-timer, random-initiative, ...) — so a DM flipping
  // a rule shows up for already-mounted players without waiting out staleTime.
  ["campaign_rules",          "campaign_rules"],
  // The Interlude — all four downtime tables share the "downtime" key root, so
  // one invalidate string refreshes every downtime query (deduped for reconcile).
  ["downtime_grants",         "downtime"],
  ["downtime_draws",          "downtime"],
  ["downtime_outcomes",       "downtime"],
  ["downtime_deck_backs",     "downtime"],
  // Simulacrum minis gallery — so other members see a mini land (or sculpt
  // progress) without waiting out the query's staleTime.
  ["minis",                   "minis"],
  // Campaign-supplied class option text (e.g. Artificer infusion effects
  // transcribed from the table's sourcebooks) — shared reference content, so
  // one member typing it in must reach everyone at the table.
  ["class_option_texts",      "class-option-texts"],
  // Player writing appended to a document item (a ledger, a contract) — the
  // object is a passed-around prop at the table, so an entry must reach
  // everyone, not just refetch for whoever wrote it.
  ["item_entries",            "item-entries"],
] as const;

/**
 * Which query keys a `campaign_sync` doorbell refreshes, keyed by the table that
 * rang it (migration `20260904230420`).
 *
 * The doorbell carries the *name* of what changed, not the row, so the response
 * is always a refetch. That is the point: the client already knows how to read
 * its own data correctly — RLS, embeds, redacted projections — and a signal
 * cannot get any of that subtly wrong the way a hand-applied row can.
 */
export const SIGNAL_KEYS = new Map<string, readonly string[]>([
  ...SYNC_TABLES.map(([table, key]) => [table, [key]] as [string, readonly string[]]),
  // Not in SYNC_TABLES — it has exact-row handlers below instead of a registry
  // entry. `items` as well: an item leaving the party's inventory leaves the
  // player-visible projection with it.
  ["party_inventory", ["party-inventory", "items"]],
  // The reason the doorbell exists at all (#811). `store_items` has no
  // campaign_id, so it is on no channel for any event; and its rows carry only
  // an item_id, with the name behind it living in the player-visible
  // projection — refresh both, or a shop stocked mid-session lists "Unknown item".
  ["store_items", ["store-items", "items"]],
]);

// Deduped set of every key the sync owns, plus "campaigns" (handled specially
// below). Reconciling these after a gap re-derives state from the DB.
const RECONCILE_KEYS = [...new Set([...SYNC_TABLES.map(([, key]) => key), "party-inventory"]), "campaigns"];

function sortPartyInventory(items: PartyInventoryItem[]): PartyInventoryItem[] {
  return items.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

function upsertPartyInventoryItem(
  items: PartyInventoryItem[] | undefined,
  item: PartyInventoryItem,
): PartyInventoryItem[] | undefined {
  // Do not create a partial cache before its initial query has loaded.
  if (!items) return items;
  const withoutItem = items.filter((existing) => existing.id !== item.id);
  return sortPartyInventory([...withoutItem, item]);
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
                for (const key of keys) invalidate(key)();
              })
              // Party-inventory events have the exact query shape, so apply every
              // normal change directly instead of making every player poll.
              .on("postgres_changes", { event: "INSERT", schema: "public", table: "party_inventory", filter: f }, (payload) => {
                if (campaign.activeCampaignId !== campaignId) return;
                const inserted = payload.new as PartyInventoryItem;
                qc.setQueryData<PartyInventoryItem[]>(["party-inventory", campaignId], (old) =>
                  upsertPartyInventoryItem(old, inserted),
                );
              })
              .on("postgres_changes", { event: "UPDATE", schema: "public", table: "party_inventory", filter: f }, (payload) => {
                if (campaign.activeCampaignId !== campaignId) return;
                const updated = payload.new as PartyInventoryItem;
                qc.setQueryData<PartyInventoryItem[]>(["party-inventory", campaignId], (old) => {
                  return upsertPartyInventoryItem(old, updated);
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
          // The live session (#758). Like `campaigns` below it is one row per
          // campaign feeding a store rather than a list query, so it gets its
          // own handler instead of a SYNC_TABLES entry — but it rides this same
          // subscription, because a second channel per campaign buys nothing.
              .on("postgres_changes", { event: "*", schema: "public", table: "campaign_session_state", filter: f }, (payload) => {
                if (campaign.activeCampaignId !== campaignId) return;
                // DELETE cannot reach a campaign_id-filtered subscription at all
                // (see the doorbell above), so this branch is unreachable today;
                // it stays because the payload shape must still be handled if the
                // row ever arrives by another route. A removed campaign takes its
                // session with it, so the correct reading is "no session".
                adoptCampaignSession(
                  payload.eventType === "DELETE" ? null : (payload.new as CampaignSessionState),
                );
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
