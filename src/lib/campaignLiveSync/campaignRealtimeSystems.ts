import type { QueryClient, QueryKey } from "@tanstack/vue-query";
import {
  applyRealtimeRow,
  type RealtimeRow,
  type RealtimeRowChange,
} from "@/lib/campaignLiveSync/realtimeCache";

/** The small amount of session state needed to apply campaign table events safely. */
export interface CampaignRealtimeContext {
  campaignId: string;
  currentUserId: string | null;
  isDM: boolean;
}

/** Supabase's postgres payload shape, kept structural so this module owns no DB types. */
export interface CampaignRealtimeChange {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}

type CampaignRow = Record<string, unknown> & RealtimeRow;
type RuleRow = Record<string, unknown> & { campaign_id: string; rule_key: string };

const isKey = (key: QueryKey, root: string, length: number) =>
  key[0] === root && key.length === length;
const stringAt = (row: Record<string, unknown>, field: string) =>
  typeof row[field] === "string" ? row[field] : "";
const ascending = (field: string) => (left: CampaignRow, right: CampaignRow) =>
  stringAt(left, field).localeCompare(stringAt(right, field));
const descending = (field: string) => (left: CampaignRow, right: CampaignRow) =>
  stringAt(right, field).localeCompare(stringAt(left, field));
const numericAscending = (field: string) => (left: CampaignRow, right: CampaignRow) =>
  Number(left[field] ?? 0) - Number(right[field] ?? 0);

function asRow(change: CampaignRealtimeChange): RealtimeRowChange<CampaignRow> {
  return change as RealtimeRowChange<CampaignRow>;
}

function invalidate(queryClient: QueryClient, queryKey: QueryKey, exact = false) {
  void queryClient.invalidateQueries({ queryKey, exact });
}

/**
 * campaign_rules has a composite primary key, so it cannot use
 * applyRealtimeRow's id-based helper. This still applies only to the exact raw
 * list cache; projection caches are deliberately left alone.
 */
function applyCampaignRule(
  queryClient: QueryClient,
  change: CampaignRealtimeChange,
  campaignId: string,
) {
  const keyOf = (row: Record<string, unknown>) => stringAt(row, "rule_key");
  const row = (change.eventType === "DELETE" ? change.old : change.new) as RuleRow;
  if (row.campaign_id !== campaignId || !keyOf(row)) return;

  for (const query of queryClient.getQueryCache().findAll({ queryKey: ["campaign_rules"] })) {
    if (!isKey(query.queryKey, "campaign_rules", 2) || query.queryKey[1] !== campaignId) continue;
    const current = query.state.data;
    if (!Array.isArray(current)) continue;
    const withoutRule = (current as RuleRow[]).filter((entry) => keyOf(entry) !== keyOf(row));
    queryClient.setQueryData(query.queryKey, change.eventType === "DELETE"
      ? withoutRule
      : [...withoutRule, change.new as RuleRow]);
  }
}

function applyDowntime(
  queryClient: QueryClient,
  table: "downtime_grants" | "downtime_draws" | "downtime_outcomes" | "downtime_deck_backs",
  change: CampaignRealtimeChange,
  context: CampaignRealtimeContext,
) {
  // Player queries are RLS-filtered views of these tables. A payload cannot
  // establish whether another row should be visible, so re-fetch those views.
  if (!context.isDM) {
    invalidate(queryClient, ["downtime"]);
    return;
  }

  const section = {
    downtime_grants: "grants",
    downtime_draws: "draws",
    downtime_outcomes: "outcomes",
    downtime_deck_backs: "backs",
  }[table];
  const compare = table === "downtime_deck_backs" ? numericAscending("position") : descending("created_at");
  applyRealtimeRow(queryClient, asRow(change), {
    rootKey: "downtime",
    include: (key) => isKey(key, "downtime", 3) && key[1] === context.campaignId && key[2] === section,
    matches: (_key, row) => stringAt(row, "campaign_id") === context.campaignId,
    compare,
  });
}

/**
 * Apply one event from a campaign-scoped postgres channel. Returns false only
 * for tables this system does not own, allowing the channel to keep a single
 * explicit fallback for genuinely unsupported tables.
 */
export function dispatchCampaignRealtimeSystem(
  queryClient: QueryClient,
  table: string,
  change: CampaignRealtimeChange,
  context: CampaignRealtimeContext,
): boolean {
  switch (table) {
    case "quest_beat_loot":
    case "campaign_messages":
      // Loot state is a secured join over both tables. Re-read it rather than
      // putting raw chat metadata into a DM-only projection, and refresh board
      // aggregates derived from the same rows.
      invalidate(queryClient, ["quest_beat_loot"]);
      invalidate(queryClient, ["quest_beats", "board"]);
      return true;

    case "session_proposals":
      applyRealtimeRow(queryClient, asRow(change), {
        rootKey: "session_proposals",
        include: (key) => isKey(key, "session_proposals", 2) && key[1] === context.campaignId,
        matches: (_key, row) => stringAt(row, "campaign_id") === context.campaignId,
        compare: ascending("proposed_date"),
      });
      return true;

    case "session_availability":
      applyRealtimeRow(queryClient, asRow(change), {
        rootKey: "session_availability",
        include: (key) => (isKey(key, "session_availability", 2)
          || (isKey(key, "session_availability", 3) && key[1] === "campaign")),
        matches: (key, row) => stringAt(row, "campaign_id") === context.campaignId
          && (key[1] === "campaign" || key[1] === stringAt(row, "session_proposal_id")),
      });
      return true;

    case "items":
      applyRealtimeRow(queryClient, asRow(change), {
        rootKey: "items",
        include: (key) => isKey(key, "items", 1)
          || (isKey(key, "items", 2) && key[1] !== "player-visible"),
        matches: (key, row) => key.length === 1 || key[1] === row.id,
        compare: ascending("name"),
      });
      // get_player_visible_items is a SECURITY DEFINER projection. Never put a
      // base table row in it (it deliberately strips fields such as dm_notes).
      invalidate(queryClient, ["items", "player-visible"], true);
      // Search results are a cross-table RPC projection, not an item-row cache.
      invalidate(queryClient, ["global-search"]);
      return true;

    case "npc_inventory":
      applyRealtimeRow(queryClient, asRow(change), {
        rootKey: "npc-inventory",
        include: (key) => isKey(key, "npc-inventory", 2),
        matches: (key, row) => stringAt(row, "campaign_id") === context.campaignId
          && key[1] === stringAt(row, "npc_id"),
        compare: ascending("name"),
      });
      return true;

    case "campaign_members": {
      applyRealtimeRow(queryClient, asRow(change), {
        rootKey: "campaign-members",
        include: (key) => isKey(key, "campaign-members", 2) && key[1] === context.campaignId,
        matches: (_key, row) => stringAt(row, "campaign_id") === context.campaignId,
        compare: ascending("joined_at"),
      });
      // This is the current user's RLS-filtered membership projection; an
      // insert/delete can change the campaigns and player-character fan-out. A
      // DELETE payload is trimmed to the primary key by RLS, so `user_id` is
      // only knowable for INSERT/UPDATE — a removal has to invalidate blind.
      const affectedUserId = change.eventType === "DELETE"
        ? context.currentUserId
        : stringAt(change.new, "user_id");
      if (affectedUserId && affectedUserId === context.currentUserId) {
        invalidate(queryClient, ["my-memberships"], true);
        invalidate(queryClient, ["campaigns"]);
        invalidate(queryClient, ["my-characters"]);
      }
      return true;
    }

    case "ruleset_reviews":
      applyRealtimeRow(queryClient, asRow(change), {
        rootKey: "ruleset_reviews",
        include: (key) => isKey(key, "ruleset_reviews", 2),
        matches: (key, row) => key[1] === stringAt(row, "party_member_id"),
      });
      return true;

    case "campaign_rules":
      applyCampaignRule(queryClient, change, context.campaignId);
      return true;

    case "downtime_grants":
    case "downtime_draws":
    case "downtime_outcomes":
    case "downtime_deck_backs":
      applyDowntime(queryClient, table, change, context);
      return true;

    case "minis":
      applyRealtimeRow(queryClient, asRow(change), {
        rootKey: "minis",
        // ["minis", "for", source_table, source_id] is a newest-ready
        // projection, and must be invalidated rather than filled with any row.
        include: (key) => isKey(key, "minis", 2),
        matches: (key, row) => key[1] === stringAt(row, "campaign_id") || key[1] === row.id,
        compare: descending("created_at"),
      });
      if (change.eventType === "DELETE") {
        // A DELETE payload carries only the primary key (RLS trims the old
        // record), so the deleted mini's source is unknowable here. Invalidate
        // every projection rather than silently leaving a stale one behind.
        invalidate(queryClient, ["minis", "for"]);
      } else {
        const sourceTable = stringAt(change.new, "source_table");
        const sourceId = stringAt(change.new, "source_id");
        if (sourceTable && sourceId) invalidate(queryClient, ["minis", "for", sourceTable, sourceId], true);
      }
      return true;

    case "class_option_texts":
      applyRealtimeRow(queryClient, asRow(change), {
        rootKey: "class-option-texts",
        include: (key) => isKey(key, "class-option-texts", 4) && key[1] === context.campaignId,
        matches: (key, row) => stringAt(row, "campaign_id") === context.campaignId
          && key[2] === stringAt(row, "class_name")
          && key[3] === stringAt(row, "choice_key"),
      });
      return true;

    default:
      return false;
  }
}
