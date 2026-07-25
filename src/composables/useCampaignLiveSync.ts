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
let detachHealListeners: (() => void) | null = null;

// Every campaign-scoped table whose changes map 1:1 to a single query-cache key.
// Looped into the channel bindings AND reused to reconcile the whole set after a
// reconnect: realtime is only a notification layer, so a dropped or missed event
// must never strand the client on stale data.
const SYNC_TABLES = [
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
  ["party_inventory",         "party-inventory"],
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
] as const;

// Deduped set of every key the sync owns, plus "campaigns" (handled specially
// below). Reconciling these after a gap re-derives state from the DB.
const RECONCILE_KEYS = [...new Set(SYNC_TABLES.map(([, key]) => key)), "campaigns"];

export function useCampaignLiveSync() {
  const campaign = useCampaignStore();
  const qc = useQueryClient();

  refCount++;

  const teardown = () => {
    if (detachHealListeners) { detachHealListeners(); detachHealListeners = null; }
    if (activeChannel) { supabase.removeChannel(activeChannel); activeChannel = null; }
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

        // Self-heal: re-derive every synced key from the DB after any gap in the
        // event stream (socket drop, network loss, a backgrounded tab whose
        // socket the browser froze). invalidateQueries only refetches ACTIVE
        // observers, so the cost is bounded to whatever is currently on screen.
        // Throttled so a wake that fires online + visibilitychange + re-SUBSCRIBED
        // together reconciles once, not three times.
        let lastReconcile = 0;
        const reconcile = () => {
          const now = Date.now();
          if (now - lastReconcile < 2000) return;
          lastReconcile = now;
          sawDrop = false;
          for (const k of RECONCILE_KEYS) void qc.invalidateQueries({ queryKey: [k] });
        };

        // Whether the channel reported an actual problem (error/timeout/close)
        // since the last reconcile. Routine alt-tabbing shouldn't trigger a
        // reconcile burst when the socket never dropped — only genuine gaps
        // (flagged here) or a long-enough background stint should.
        let sawDrop = false;
        // Timestamp the tab went hidden, so a return-to-visible can tell how
        // long the socket was potentially frozen in the background.
        let hiddenAt: number | null = null;
        const HIDDEN_RECONCILE_MS = 5 * 60 * 1000;

        let channel = supabase.channel(`campaign_live_sync:${campaignId}`);
        for (const [table, key] of SYNC_TABLES) {
          channel = channel.on("postgres_changes", { event: "*", schema: "public", table, filter: f }, invalidate(key));
        }
        channel = channel
          // A newly-claimed/crafted item only becomes RLS-visible to a player once
          // its party_inventory row exists, but the ["items"] query is staleTime:Infinity
          // and never refetches on its own — so refresh it on any inventory INSERT,
          // otherwise the item shows no weight/name/stat-block until a full reload.
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "party_inventory", filter: f }, invalidate("items"))
          // campaigns table uses `id` as the campaign identifier (not campaign_id)
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "campaigns", filter: `id=eq.${campaignId}` }, (payload) => {
            const updated = payload.new as import("@/types/campaign.types").Campaign;
            if (updated && campaign.activeCampaign) {
              campaign.activeCampaign = {
                ...campaign.activeCampaign,
                current_year:  updated.current_year,
                current_month: updated.current_month,
                current_day:   updated.current_day,
              };
            }
            void qc.invalidateQueries({ queryKey: ["campaigns"] });
          });

        let hasJoined = false;
        activeChannel = channel.subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            sawDrop = true;
            return;
          }
          if (status !== "SUBSCRIBED") return;
          // First SUBSCRIBED is the initial join (queries fetch on their own).
          // Any later one is a rejoin after a drop — reconcile to recover events
          // missed while disconnected.
          if (hasJoined) reconcile();
          hasJoined = true;
        });

        // Coming back online always implies a possible drop — reconcile unconditionally.
        const onOnline = () => reconcile();
        // Alt-tabbing back shouldn't burst-invalidate every key unless the channel
        // actually reported a problem while away, or the tab was hidden long enough
        // that Supabase realtime could have silently dropped the socket in the
        // background (missed-event safety net).
        const onVisibilityChange = () => {
          if (document.visibilityState === "hidden") {
            hiddenAt = Date.now();
            return;
          }
          const hiddenFor = hiddenAt !== null ? Date.now() - hiddenAt : 0;
          hiddenAt = null;
          if (sawDrop || hiddenFor >= HIDDEN_RECONCILE_MS) reconcile();
        };
        window.addEventListener("online", onOnline);
        document.addEventListener("visibilitychange", onVisibilityChange);
        detachHealListeners = () => {
          window.removeEventListener("online", onOnline);
          document.removeEventListener("visibilitychange", onVisibilityChange);
        };
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
