/**
 * The session episodes' scene, in the local demo copy only.
 *
 * The DM starts a session on camera, so no session may be open when a take
 * begins (there is one open session per campaign, and the app asks about any
 * older than six hours). Two ended sessions are written so the log and the
 * "Start session 3" button look lived-in, the DM fixture's dashboards get a
 * deliberate layout, and the chat is swept of what earlier takes posted
 * ("The session begins.", rolls, casts), so it does not fill with old lines.
 *
 * `teardownSession` is the episode teardown: it ends whatever the take left
 * open and removes what the take wrote.
 */
import { runSqlFile } from "../../lib/dev-campaign-io.ts";
import { quote } from "../../lib/dev-db.ts";
import { demoCampaignId, localDb, playerCharacter } from "./demo.ts";

/** Every widget id the layout may name, so none of them lands on the "add a widget" shelf as unknown. */
const KNOWN = [
  "prep-gaps", "quests", "session", "unidentified", "next-session", "party", "recent-npcs", "pinned-notes",
  "live-encounter", "stats", "dm-screen-card", "roll-table", "conditions", "monster-pull", "quest-consequences",
  "shared-journal", "initiative-mini", "encounter-gaps", "store-restock", "recent-monsters", "soundboard-scenes",
  "rules-search", "cursed-items", "quest-activity", "deity-lookup", "rule-tracker", "jump-to", "quick-create",
  "upcoming-events", "quest-loot", "downtime-queue", "table-vitals", "death-saves", "quick-dice", "sessions", "weather",
];

type Entry = { id: string; width: "cell" | "wide" | "full"; height: 1 | 2 };

/** The prep dashboard: the party across the top, then what a DM reaches for before the evening. */
const PREP: Entry[] = [
  { id: "party", width: "full", height: 2 },
  { id: "quests", width: "cell", height: 2 },
  { id: "soundboard-scenes", width: "cell", height: 2 },
  { id: "sessions", width: "cell", height: 2 },
  { id: "quick-dice", width: "cell", height: 1 },
  { id: "next-session", width: "cell", height: 1 },
  { id: "pinned-notes", width: "wide", height: 1 },
];

/** The session dashboard: the same hand, with the live encounter banner first (it hides itself until combat starts). */
const LIVE: Entry[] = [
  { id: "live-encounter", width: "full", height: 1 },
  { id: "party", width: "full", height: 2 },
  { id: "quests", width: "cell", height: 2 },
  { id: "soundboard-scenes", width: "cell", height: 2 },
  { id: "quick-dice", width: "cell", height: 1 },
  { id: "sessions", width: "cell", height: 2 },
];

function layoutSql(owner: string, campaign: string, surface: "prep" | "session", entries: Entry[]): string {
  const layout = { known: KNOWN, widgets: entries.map((e) => ({ ...e, key: e.id })) };
  return `insert into public.dashboard_layouts (user_id, campaign_id, surface, layout)
          values (${owner}, ${campaign}, ${quote(surface)}, ${quote(JSON.stringify(layout))}::jsonb)
          on conflict (user_id, campaign_id, surface) do update set layout = excluded.layout;`;
}

/** Chat lines a take leaves behind: the session announcements, and every roll or cast posted while filming. */
function sweepChatSql(campaign: string, since: string): string {
  return `delete from public.campaign_messages
           where campaign_id = ${campaign}
             and (message like '⚔️ The session%' or created_at >= ${since}::timestamptz);`;
}

/**
 * When the last take that did not tear down began: the start of the session it
 * opened on camera (the scene writes sessions 1 and 2; a take starts the 3rd).
 * Read before setup deletes the sessions. Null when every take tore down, and
 * then only the session announcements are swept: a fixed cutoff date here once
 * deleted every chat line a developer had posted in the local demo since it.
 */
function leftoverTakeStartSql(campaign: string): string {
  return `(select min(started_at) from public.campaign_sessions where campaign_id = ${campaign} and number > 2)`;
}

/** The NPC the player episode reveals on camera goes back to hidden, with its reveal rows. */
function hideRevealedNpcSql(campaign: string): string {
  return `update public.npcs set player_visible_to = '{}', player_visible_fields = '{}'
           where campaign_id = ${campaign} and name = 'Sister Ribbon';
          delete from public.npc_reveals where campaign_id = ${campaign};`;
}

let takeStarted: string | null = null;

export function setupSession(): void {
  const campaignId = demoCampaignId();
  const c = quote(campaignId);
  const owner = `(select user_id from public.campaigns where id = ${c})`;
  takeStarted = new Date().toISOString();
  runSqlFile(
    localDb(),
    `begin;
     update public.party_members set current_hp = max_hp, temp_hp = 0 where id = ${quote(playerCharacter(campaignId).id)};
     ${sweepChatSql(c, leftoverTakeStartSql(c))}
     delete from public.campaign_sessions where campaign_id = ${c};
     insert into public.campaign_sessions (campaign_id, user_id, number, title, played_on, started_at, ended_at)
     values (${c}, ${owner}, 1, 'The Pulled Sugar Inn', current_date - 21,
             (current_date - 21)::timestamptz + interval '18 hours', (current_date - 21)::timestamptz + interval '22 hours'),
            (${c}, ${owner}, 2, 'The Locked Workshop', current_date - 14,
             (current_date - 14)::timestamptz + interval '18 hours', (current_date - 14)::timestamptz + interval '22 hours 30 minutes');
     ${layoutSql(owner, c, "prep", PREP)}
     ${layoutSql(owner, c, "session", LIVE)}
     ${hideRevealedNpcSql(c)}
     commit;`,
  );
}

/** After the last shot: ends any open session and removes what the take wrote, so the real app is left as it was. */
export function teardownSession(): void {
  const campaignId = demoCampaignId();
  const c = quote(campaignId);
  runSqlFile(
    localDb(),
    `begin;
     update public.campaign_sessions set ended_at = now() where campaign_id = ${c} and started_at is not null and ended_at is null;
     delete from public.campaign_sessions where campaign_id = ${c} and number > 2;
     ${sweepChatSql(c, quote(takeStarted ?? new Date(Date.now() - 3_600_000).toISOString()))}
     ${hideRevealedNpcSql(c)}
     commit;`,
  );
}
