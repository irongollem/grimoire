import type { QueryClient, QueryKey } from "@tanstack/vue-query";
import { applyRealtimeRow, type RealtimeRowChange } from "@/lib/campaignLiveSync/realtimeCache";

type WorldTable = "notes" | "quests" | "locations" | "factions" | "npcs" | "companions";
type Row = Record<string, unknown> & { id: string; campaign_id?: string | null };
type Change = RealtimeRowChange<Row>;

interface Context {
  campaignId: string;
  isDM: boolean;
}

const QUEST_STATUSES = new Set(["undiscovered", "rumor", "active", "completed", "failed"]);

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function compareText(left: unknown, right: unknown): number {
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function compareNewest(left: Row, right: Row): number {
  return compareText(right.updated_at, left.updated_at) || compareText(left.id, right.id);
}

function compareName(left: Row, right: Row): number {
  return compareText(left.name, right.name) || compareText(left.id, right.id);
}

function compareCompanion(left: Row, right: Row): number {
  const leftOrder = typeof left.sort_order === "number" ? left.sort_order : 0;
  const rightOrder = typeof right.sort_order === "number" ? right.sort_order : 0;
  return leftOrder - rightOrder || compareName(left, right);
}

/**
 * Event filters are campaign-scoped, but this small guard also protects an old
 * channel callback from changing the newly-selected campaign's cache.
 */
function belongsToCampaign(change: Change, campaignId: string): boolean {
  const eventRow = change.eventType === "DELETE" ? change.old : change.new;
  return eventRow.campaign_id === undefined || eventRow.campaign_id === campaignId;
}

function invalidate(queryClient: QueryClient, predicate: (key: QueryKey) => boolean): void {
  void queryClient.invalidateQueries({ predicate: (query) => predicate(query.queryKey) });
}

function invalidatePlayerQuestCaches(queryClient: QueryClient, campaignId: string, rowId: string): void {
  invalidate(queryClient, (key) => key[0] === "quests" && (
    (key[1] === campaignId && key[2] === "player-visible")
    || (key[1] === "player-one" && key[2] === rowId)
  ));
}

function invalidatePlayerLocationCaches(queryClient: QueryClient, campaignId: string, rowId: string): void {
  invalidate(queryClient, (key) => key[0] === "locations" && (
    (key[1] === campaignId && key[2] === "shared")
    || (key[1] === "player-one" && key[2] === rowId)
  ));
}

function invalidatePlayerNpcCaches(queryClient: QueryClient, campaignId: string): void {
  invalidate(queryClient, (key) => key[0] === "npcs" && (
    (key[1] === "shared" && key[2] === campaignId)
    // The multi-location projection key has no campaign component. There is
    // only one active campaign per client, so these are active-campaign views.
    || key[1] === "shared-by-locations"
  ));
}

function invalidateJoinedCaches(queryClient: QueryClient, roots: readonly string[]): void {
  const rootSet = new Set(roots);
  invalidate(queryClient, (key) => typeof key[0] === "string" && rootSet.has(key[0]));
}

function invalidateGlobalSearch(queryClient: QueryClient): void {
  invalidate(queryClient, (key) => key[0] === "global-search");
}

function applyNotes(queryClient: QueryClient, change: Change, _context: Context): void {
  applyRealtimeRow(queryClient, change, {
    rootKey: "notes",
    include: (key) => key.length === 2 && isString(key[1]),
    // Realtime RLS already decides whether this complete row may reach this
    // client; both DM and player note caches store the same raw row shape.
    matches: (key, row) => key[1] === row.campaign_id || key[1] === row.id,
    compare: compareNewest,
  });
}

function applyQuests(queryClient: QueryClient, change: Change, context: Context): void {
  if (context.isDM) {
    applyRealtimeRow(queryClient, change, {
      rootKey: "quests",
      include: (key) => (
        (key.length === 2 && isString(key[1]) && key[1] !== "player-one")
        || (key.length === 3 && key[1] === context.campaignId && (key[2] === "all" || isString(key[2]) && QUEST_STATUSES.has(key[2])))
        || (key.length === 3 && key[1] === "sub" && isString(key[2]))
      ),
      matches: (key, row) => {
        if (key.length === 2) return key[1] === row.id;
        if (key[1] === "sub") return key[2] === row.parent_quest_id;
        return row.campaign_id === context.campaignId && (key[2] === "all" || key[2] === row.status);
      },
      compare: compareNewest,
    });
  }

  const rowId = change.eventType === "DELETE" ? change.old.id : change.new.id;
  if (rowId) invalidatePlayerQuestCaches(queryClient, context.campaignId, rowId);
  // This cache selects quest title through a join; never splice a raw quest
  // row into it, even for a DM.
  invalidateJoinedCaches(queryClient, ["encounter_quests"]);
}

function applyLocations(queryClient: QueryClient, change: Change, context: Context): void {
  if (context.isDM) {
    applyRealtimeRow(queryClient, change, {
      rootKey: "locations",
      include: (key) => (
        key.length === 2 && isString(key[1]) && key[1] !== "player-one"
      ) || (
        key.length === 3 && key[1] === context.campaignId
          && (key[2] === "all" || key[2] === null || isString(key[2]))
      ),
      matches: (key, row) => {
        if (key.length === 2) return key[1] === row.id;
        if (row.campaign_id !== context.campaignId) return false;
        return key[2] === "all" || key[2] === row.parent_id;
      },
      compare: compareName,
    });
  }

  const rowId = change.eventType === "DELETE" ? change.old.id : change.new.id;
  if (rowId) invalidatePlayerLocationCaches(queryClient, context.campaignId, rowId);
  invalidateJoinedCaches(queryClient, ["faction-locations"]);
}

function applyFactions(queryClient: QueryClient, change: Change, context: Context): void {
  if (context.isDM) {
    applyRealtimeRow(queryClient, change, {
      rootKey: "factions",
      include: (key) => key.length === 2 && isString(key[1]),
      matches: (key, row) => key[1] === row.campaign_id || key[1] === row.id,
      compare: compareName,
    });
  }

  // The player-visible list and these relation queries are all projections or
  // joins. Their visibility and embedded faction shape must come from SQL.
  invalidate(queryClient, (key) => key[0] === "factions" && key[1] === context.campaignId && key[2] === "player-visible");
  invalidateJoinedCaches(queryClient, [
    "npc-factions",
    "deity-factions",
    "party-member-factions",
    "faction-relations",
  ]);
}

function applyNpcs(queryClient: QueryClient, change: Change, context: Context): void {
  if (context.isDM) {
    applyRealtimeRow(queryClient, change, {
      rootKey: "npcs",
      include: (key) => (
        key.length === 2 && isString(key[1]) && key[1] !== "shared"
      ) || (
        key.length === 3 && key[1] === "by-location" && isString(key[2])
      ) || (
        key.length === 3 && key[1] === "by-locations" && Array.isArray(key[2])
      ),
      matches: (key, row) => {
        // Root list and detail cache share a two-part key shape.
        if (key.length === 2) return key[1] === row.campaign_id || key[1] === row.id;
        if (key[1] === "by-location") return key[2] === row.location_id;
        return Array.isArray(key[2]) && key[2].includes(row.location_id);
      },
      compare: compareName,
    });
  }

  invalidatePlayerNpcCaches(queryClient, context.campaignId);
  invalidateJoinedCaches(queryClient, ["faction-npcs"]);
}

function applyCompanions(queryClient: QueryClient, change: Change, _context: Context): void {
  applyRealtimeRow(queryClient, change, {
    rootKey: "companions",
    include: (key) => key.length === 2 && isString(key[1]),
    matches: (key, row) => key[1] === row.campaign_id || key[1] === row.id,
    compare: compareCompanion,
  });
}

/**
 * Reduces one complete campaign-world postgres event into already-loaded
 * exact-row caches. Returns false for tables this module does not own, so the
 * channel can delegate those events to another reducer or invalidation policy.
 */
export function applyCampaignRealtimeWorld(
  queryClient: QueryClient,
  table: string,
  payload: Change,
  context: Context,
): boolean {
  if (!(["notes", "quests", "locations", "factions", "npcs", "companions"] as string[]).includes(table)) {
    return false;
  }
  if (!belongsToCampaign(payload, context.campaignId)) return true;

  switch (table as WorldTable) {
    case "notes":
      applyNotes(queryClient, payload, context);
      invalidateGlobalSearch(queryClient);
      break;
    case "quests":
      applyQuests(queryClient, payload, context);
      invalidateGlobalSearch(queryClient);
      break;
    case "locations":
      applyLocations(queryClient, payload, context);
      invalidateGlobalSearch(queryClient);
      break;
    case "factions":
      applyFactions(queryClient, payload, context);
      break;
    case "npcs":
      applyNpcs(queryClient, payload, context);
      // This is a reduced spell-caster projection rather than a raw NPC row.
      invalidate(queryClient, (key) => key[0] === "npcs" && key[1] === "spell-casters");
      invalidateGlobalSearch(queryClient);
      break;
    case "companions":
      applyCompanions(queryClient, payload, context);
      break;
  }
  return true;
}
