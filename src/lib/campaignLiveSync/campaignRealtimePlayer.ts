import type { Query, QueryClient, QueryKey } from "@tanstack/vue-query";
import {
  applyRealtimeRow,
  type RealtimeRow,
  type RealtimeRowChange,
} from "@/lib/campaignLiveSync/realtimeCache";

/** The identity available to a campaign realtime subscriber. */
export interface CampaignRealtimeContext {
  campaignId: string;
  /** Auth user id. This is deliberately not used for party-member visibility arrays. */
  currentUserId: string | null;
  isDM: boolean;
}

type CampaignRow = RealtimeRow & {
  [key: string]: unknown;
  campaign_id?: string | null;
  name?: string;
  user_id?: string;
  created_at?: string;
  discovered_at?: string;
  harptos_year?: number;
  harptos_month?: number | null;
  harptos_day?: number | null;
  event_type?: string;
  player_visible?: boolean;
  is_private?: boolean;
  shared_with_dm?: boolean;
  linked_quest_id?: string | null;
  linked_encounter_id?: string | null;
  linked_location_id?: string | null;
  linked_note_id?: string | null;
};

export type CampaignRealtimeChange = RealtimeRowChange<CampaignRow>;

function rowId(change: CampaignRealtimeChange): string | undefined {
  return change.eventType === "DELETE" ? change.old.id : change.new.id;
}

function inCampaign(row: CampaignRow, campaignId: string): boolean {
  return row.campaign_id === campaignId;
}

function compareNewest(left: CampaignRow, right: CampaignRow): number {
  return (right.created_at ?? right.discovered_at ?? "").localeCompare(
    left.created_at ?? left.discovered_at ?? "",
  );
}

function compareCalendar(left: CampaignRow, right: CampaignRow): number {
  return (left.harptos_year ?? 0) - (right.harptos_year ?? 0)
    || (left.harptos_month ?? -1) - (right.harptos_month ?? -1)
    || (left.harptos_day ?? -1) - (right.harptos_day ?? -1);
}

function invalidateWhere(queryClient: QueryClient, predicate: (query: Query) => boolean): void {
  void queryClient.invalidateQueries({ predicate });
}

function keyStarts(key: QueryKey, ...parts: unknown[]): boolean {
  return parts.every((part, index) => key[index] === part);
}

function calendarListMatches(key: QueryKey, row: CampaignRow, campaignId: string): boolean {
  if (!inCampaign(row, campaignId)) return false;

  // DM list for one year: [calendar-events, campaignId, year]
  if (key.length === 3 && key[1] === campaignId && typeof key[2] === "number") {
    return row.harptos_year === key[2];
  }
  // DM range: [calendar-events, range, campaignId, startYear, endYear]
  if (key.length === 5 && keyStarts(key, "calendar-events", "range", campaignId)
    && typeof key[3] === "number" && typeof key[4] === "number") {
    return (row.harptos_year ?? -Infinity) >= key[3] && (row.harptos_year ?? Infinity) <= key[4];
  }

  const playerVisible = row.player_visible === true || row.event_type === "session";
  if (!playerVisible) return false;
  // Player list for one year: [calendar-events, player, campaignId, year]
  if (key.length === 4 && keyStarts(key, "calendar-events", "player", campaignId) && typeof key[3] === "number") {
    return row.harptos_year === key[3];
  }
  // Player range: [calendar-events, player, range, campaignId, startYear, endYear]
  if (key.length === 6 && keyStarts(key, "calendar-events", "player", "range", campaignId)
    && typeof key[4] === "number" && typeof key[5] === "number") {
    return (row.harptos_year ?? -Infinity) >= key[4] && (row.harptos_year ?? Infinity) <= key[5];
  }
  // Entity lists: [calendar-events, entity, entityType, entityId]
  if (key.length === 4 && keyStarts(key, "calendar-events", "entity") && typeof key[3] === "string") {
    const linkedId = key[2] === "quest" ? row.linked_quest_id
      : key[2] === "encounter" ? row.linked_encounter_id
        : key[2] === "location" ? row.linked_location_id
          : undefined;
    return linkedId === key[3];
  }
  return false;
}

function isCalendarListKey(key: QueryKey, campaignId: string): boolean {
  return (key.length === 3 && key[0] === "calendar-events" && key[1] === campaignId && typeof key[2] === "number")
    || (key.length === 5 && keyStarts(key, "calendar-events", "range", campaignId)
      && typeof key[3] === "number" && typeof key[4] === "number")
    || (key.length === 4 && keyStarts(key, "calendar-events", "player", campaignId)
      && typeof key[3] === "number")
    || (key.length === 6 && keyStarts(key, "calendar-events", "player", "range", campaignId)
      && typeof key[4] === "number" && typeof key[5] === "number")
    || (key.length === 4 && keyStarts(key, "calendar-events", "entity") && typeof key[3] === "string");
}

function applyCalendarLists(queryClient: QueryClient, context: CampaignRealtimeContext, change: CampaignRealtimeChange): void {
  applyRealtimeRow(queryClient, change, {
    rootKey: "calendar-events",
    // DELETE payloads commonly contain only an id, but must still be removed
    // from every exact list cache in this campaign.
    include: (key) => isCalendarListKey(key, context.campaignId),
    matches: (key, row) => calendarListMatches(key, row, context.campaignId),
    compare: compareCalendar,
  });

  // Singular caches have a different shape, so only invalidate the affected
  // record rather than attempting to synthesize filtering/move behaviour.
  const id = rowId(change);
  if (!id) return;
  invalidateWhere(queryClient, (query) =>
    keyStarts(query.queryKey, "calendar-events", "by-id", id)
    // A link can be added, removed, or moved. Invalidate loaded linked-note
    // projections regardless of whether the relevant id lives in old or new.
    || keyStarts(query.queryKey, "calendar-events", "linked-note"),
  );
}

function applyJournalLists(queryClient: QueryClient, context: CampaignRealtimeContext, change: CampaignRealtimeChange): void {
  applyRealtimeRow(queryClient, change, {
    rootKey: "player_journal",
    include: (key) => key[0] === "player_journal" && (
      (key.length === 3 && keyStarts(key, "player_journal", "mine", context.campaignId))
      || (key.length === 3 && keyStarts(key, "player_journal", "shared", context.campaignId))
      || (context.isDM && key.length === 3 && keyStarts(key, "player_journal", "dm-shared", context.campaignId))
    ),
    matches: (key, row) => {
      if (!inCampaign(row, context.campaignId)) return false;
      if (key.length === 3 && keyStarts(key, "player_journal", "mine", context.campaignId)) {
        return !!context.currentUserId && row.user_id === context.currentUserId;
      }
      if (key.length === 3 && keyStarts(key, "player_journal", "shared", context.campaignId)) {
        return row.is_private === false && !!context.currentUserId && row.user_id !== context.currentUserId;
      }
      return context.isDM && key.length === 3 && keyStarts(key, "player_journal", "dm-shared", context.campaignId)
        && row.shared_with_dm === true;
    },
    compare: compareNewest,
  });
}

function applyDmRawRows(
  queryClient: QueryClient,
  context: CampaignRealtimeContext,
  change: CampaignRealtimeChange,
  rootKey: string,
  include: (key: QueryKey, row: CampaignRow) => boolean,
  compare: (left: CampaignRow, right: CampaignRow) => number,
): void {
  if (!context.isDM) return;
  applyRealtimeRow(queryClient, change, {
    rootKey,
    include: (key) => include(key, { ...change.new, id: rowId(change) ?? change.new.id }),
    matches: (key, row) => inCampaign(row, context.campaignId) && include(key, row),
    compare,
  });
}

/**
 * Reduces the campaign tables that cannot be handled by a generic cache-key
 * invalidation. It returns `true` when the table was recognized, including when
 * the safe action is a narrow projection invalidation rather than a raw-row write.
 */
export function dispatchCampaignRealtimePlayer(
  queryClient: QueryClient,
  context: CampaignRealtimeContext,
  table: string,
  change: CampaignRealtimeChange,
): boolean {
  switch (table) {
    case "discovered_monsters": {
      applyDmRawRows(queryClient, context, change, "discovered-monsters",
        (key) => key.length === 2 && keyStarts(key, "discovered-monsters", context.campaignId), compareNewest);
      // This RPC joins discoveries to custom monsters and redacts fields, so a
      // discovery payload must never be written into it directly.
      invalidateWhere(queryClient, (query) =>
        keyStarts(query.queryKey, "monsters", "player-visible", context.campaignId)
        || keyStarts(query.queryKey, "discovered-monsters", "player", context.campaignId),
      );
      return true;
    }

    case "pantheons": {
      applyDmRawRows(queryClient, context, change, "pantheons",
        (key, row) => key.length === 2 && (keyStarts(key, "pantheons", context.campaignId)
          || keyStarts(key, "pantheons", row.id)),
        (left, right) => String(left.name ?? "").localeCompare(String(right.name ?? "")));
      // A deity cache contains `pantheon: { id, name }`, not raw deity rows.
      invalidateWhere(queryClient, (query) => keyStarts(query.queryKey, "deities"));
      if (!context.isDM) {
        invalidateWhere(queryClient, (query) => keyStarts(query.queryKey, "pantheons", context.campaignId));
      }
      return true;
    }

    case "deities": {
      // Every deity query selects a pantheon join. Refresh just the active
      // campaign list rather than injecting an incomplete joined value.
      invalidateWhere(queryClient, (query) => {
        const key = query.queryKey;
        return keyStarts(key, "deities", context.campaignId)
          || keyStarts(key, "deities", rowId(change));
      });
      return true;
    }

    case "puzzle_rooms": {
      applyDmRawRows(queryClient, context, change, "puzzle_rooms",
        (key, row) => key.length === 1 || (key.length === 2 && keyStarts(key, "puzzle_rooms", row.id)),
        (left, right) => String(left.name ?? "").localeCompare(String(right.name ?? "")));
      // Player caches come from a SECURITY DEFINER projection that strips secrets.
      invalidateWhere(queryClient, (query) =>
        keyStarts(query.queryKey, "puzzle_rooms", "player", context.campaignId)
        || keyStarts(query.queryKey, "puzzle_rooms", "player-one", context.campaignId),
      );
      return true;
    }

    case "calendar_events":
      applyCalendarLists(queryClient, context, change);
      return true;

    case "player_journal_entries":
      applyJournalLists(queryClient, context, change);
      return true;

    default:
      return false;
  }
}
