/**
 * The live-sync registry: which tables the campaign channel carries and which
 * query roots each one refreshes. It lives in `lib/` rather than next to
 * `useCampaignLiveSync` because two other things need to read it without a
 * composable: query persistence (#999 — a root the channel keeps current is
 * painted from disk and then revalidated) and the registry test.
 *
 * The root-key constants below used to be exported by the composables that own
 * those queries; they moved here so this file depends on nothing in
 * `composables/` (`lib-no-composables`). Those composables import them back.
 */
import { QUEST_BOARD_KEY } from "@/lib/quests/boardKey";
import { SESSION_LEARNED_KEY } from "@/lib/sessions/learned";

export const BEATS_KEY = "quest_beats";
export const THREADS_KEY = "quest_threads";
/** A quest's progress clocks (#1011). */
export const CLOCKS_KEY = "quest_clocks";
export const OBJECTIVES_KEY = "quest_objectives";
export const PLAYER_NPCS_KEY = "player-npcs";
export const PLAYER_NOTES_KEY = "player-notes";
export const PLAYER_FACTIONS_KEY = "player-factions";
export const PLAYER_HANDOUTS_KEY = "player-handouts";
export const BACKLINKS_KEY = "backlinks";
export const RUNTIME_KEY = "quest_runtime_state";
export const RUNTIME_CONTEXT_KEY = "quest_runtime_context";
export const TRANSITIONS_KEY = "quest_beat_transitions";

/** Every cache a runtime move invalidates. Ending a *session* moves the cursors
 *  too — `end_campaign_session` pauses every open chain server-side, so the
 *  client has to be told its runtime views are stale. The quest board is one of
 *  them: it summarises every cursor, so a move made on another device (the
 *  doorbell) or by ending a session must refresh it too. */
export const QUEST_RUNTIME_QUERY_KEYS = [RUNTIME_KEY, RUNTIME_CONTEXT_KEY, TRANSITIONS_KEY, QUEST_BOARD_KEY] as const;

// One registry for every campaign-scoped table. Normal events go through typed
// exact-row reducers; redacted projections, joins, and RLS-dependent shapes use
// targeted invalidation in those reducers. The key is also the recovery root.
// Exported for `campaignSyncTables.test.ts`, which holds this list equal to
// supabase/tests/live_sync_registry.test.sql, where the database proves each
// table is published and rings the doorbell on delete.
export const SYNC_TABLES = [
  ["notes",                   "notes"],
  ["dm_note_touches",         "dm-note-touches"],
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
  ["loot_placements",         "loot_placements"],
  // A milestone the DM awards (or an award_milestone rule fires) reaches the
  // party screen as it happens; the table is member-readable (#850).
  ["party_milestones",        "party_milestones"],
  // Hall of the Fallen (#982): a fall, a restore or a lit candle reaches every
  // member's wall and party list as it happens.
  ["character_memorials",     "memorials"],
  ["memorial_mourners",       "memorials"],
  // Chat carries the authoritative claim/removal state for dispatched loot, but
  // it is also the busiest table here — the system reducer filters down to the
  // loot message types before touching any quest cache.
  ["campaign_messages",       "loot_placements"],
  ["npc_inventory",           "npc-inventory"],
  // Membership add/remove + display-name changes — so a player renaming
  // themselves (or being added/removed) propagates to every member's party and
  // chat views. (Ejecting a just-removed player needs the deleted row's user_id,
  // which realtime DELETE only carries under full replica identity — tracked
  // separately.)
  ["campaign_members",        "campaign-members"],
  // What a seated character has that its table has not approved (#943). The DM's
  // queue and the player's "waiting" notice both read it, and each changes it
  // for the other: an approval clears the player's flag, a changed choice
  // clears the DM's.
  ["character_content_reviews", "character-content-reviews"],
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

/** One transition writes a cursor, a log row and sometimes a thread, and the
 *  run context joins all three — so any of them refreshes every runtime view.
 *  `BEATS_KEY` is there for the players: a beat is revealed by a visit in the
 *  transition log, not by an edit to the beat row, so no `quest_beats_player`
 *  signal rings when the DM advances; the player's "Story so far" would stay
 *  stale. (Objectives need no entry: achieving one updates its own row, which
 *  rings `quest_objectives_player`.) */
export const QUEST_RUNTIME_SYNC_KEYS = [...QUEST_RUNTIME_QUERY_KEYS, THREADS_KEY, BEATS_KEY] as const;

/** Signals that exist only to refresh a player's projections (20261005 player
 *  live sync). The DM already holds the row events for these tables or reads
 *  them through caches an autosave must not refetch, so the DM skips them. */
export const PLAYER_ONLY_SIGNALS = new Set([
  "locations_player", "quests_player", "quest_beats_player", "quest_objectives_player",
]);

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
  // The quest runtime (20260928225909) rings rather than subscribes: its rows
  // are DM-only quest history, which 20260810000012 keeps out of realtime
  // payloads altogether. These replaced four 5-second polls.
  ["quest_runtime_state", QUEST_RUNTIME_SYNC_KEYS],
  ["quest_threads", QUEST_RUNTIME_SYNC_KEYS],
  // Clocks (#1011) are DM-only quest state like threads, so they ring too. A
  // rule can tick one mid-transition, which is why the runtime views refresh
  // with them: a filled clock may have fired rules that moved the ledger.
  ["quest_clocks", [CLOCKS_KEY, ...QUEST_RUNTIME_SYNC_KEYS]],
  // A step is also a learned moment, listed under its session (#985).
  ["quest_beat_transitions", [...QUEST_RUNTIME_SYNC_KEYS, SESSION_LEARNED_KEY]],
  // Since 20261003105146 the table has no campaign_id, so it cannot be a
  // filtered subscription; a conversion (or an acknowledgement) rings instead.
  ["ruleset_reviews", ["ruleset_reviews"]],
  // A character's classes and spells (#1026) have no campaign_id either, and
  // spells are readable only by their owner and the DM, so both ring through
  // the character rather than subscribing. A DM's level, subclass or terrain
  // edit reaches the player's open sheet, and the reverse. A class change can
  // open a spell-change window (open_level_up_spell_window) and a subclass
  // change regrants spells server-side, which rings `character_spells` too.
  ["character_classes", ["character_classes", "spellChangeWindows"]],
  ["character_spells", ["characterSpells", "characterSpellsDetails", "spellChangeWindows", "spellKnowers"]],
  // Play state (#1033). Each rings rather than subscribes: the rows are
  // owner-only, readable by the DM and one player, DM-only, or carry no
  // campaign_id (places and characters ring through their parent).
  //
  // What a player has been shown. The unsorted-facts count reads all three
  // reveal tables under the "npc-reveals" root, and the session log files every
  // reveal as a learned moment.
  ["handout_reveals", ["session-learned", "npc-reveals"]],
  ["location_reveals", ["session-learned", "npc-reveals"]],
  ["npc_reveals", ["npc-reveals", PLAYER_NPCS_KEY, "session-learned"]],
  ["npc_pc_notes", ["npc_pc_notes"]],
  ["player_npc_ratings", ["player_npc_ratings"]],
  ["npc_favors", ["npc_favors"]],
  ["faction_party_members", ["faction-party-members", "party-member-factions", "player-faction-party-members", PLAYER_FACTIONS_KEY]],
  ["party_member_tracker_state", ["tracker_state"]],
  // A pinned form widens get_player_visible_monsters (Wild Shape candidates).
  ["pinned_forms", ["pinned-forms", "monsters"]],
  // Doors and rooms opened at the table: read through the location_state view,
  // and by players through get_player_visible_site_state.
  ["location_state_events", ["location-state", "player-visible-site-state"]],
  ["location_placements", ["location-placements"]],
  // A fired or dismissed consequence moves the runtime the DM is running, and
  // get_player_visible_quest_beats reads it for the players' story so far.
  ["quest_consequence_events", ["quest_consequence_events", RUNTIME_CONTEXT_KEY, BEATS_KEY, TRANSITIONS_KEY]],
  // A child's request to join reaches the parent waiting on it.
  ["campaign_join_requests", ["family-campaigns"]],
  ["encounters", ["encounters", QUEST_BOARD_KEY, "session-learned"]],
  ["loot_tables", ["loot_tables"]],
  ["roll_tables", ["roll_tables"]],
  ["dungeon_maps", ["dungeon_maps"]],
  ["dungeon_features", ["dungeon_features"]],
  // Campaign content (#1033 wave 2): what the DM writes and the table reads.
  // Rings for the same reasons as the play state above; tables with no
  // campaign_id ring through their parent (signal_parent_change). Transient
  // search results ("global-search", "spellSearch") are left out on purpose:
  // they are re-asked on the next keystroke, and a root listed here is also
  // persisted to disk (lib/queryPersistence/policy.ts).
  ["monsters", ["monsters", "resolved-monster", QUEST_BOARD_KEY, "session-learned"]],
  ["spells", ["spells", "characterSpellsDetails", "itemSpells", "character-content-reviews"]],
  ["species", ["species", "species-by-ids"]],
  ["custom_classes", ["custom_classes"]],
  ["custom_subclasses", ["custom_subclasses"]],
  ["class_features", ["class_features", "character-content-reviews"]],
  ["rules", ["rules"]],
  ["traps", ["traps"]],
  ["crafting_recipes", ["crafting-recipes", "craftable-output-items"]],
  ["crafting_recipe_ingredients", ["crafting-ingredients"]],
  ["crafting_recipe_outputs", ["crafting-outputs", "craftable-output-items"]],
  ["crafting_recipe_modifiers", ["crafting-modifiers"]],
  ["campaign_enabled_sources", ["enabled-sources"]],
  ["campaign_tile_packs", ["user-tile-packs"]],
  ["sounds", ["sounds", QUEST_BOARD_KEY]],
  ["soundboard_pages", ["soundboard_pages"]],
  ["soundboard_playlists", ["soundboard_playlists", QUEST_BOARD_KEY]],
  ["soundboard_playlist_tracks", ["soundboard_playlist_tracks"]],
  ["npc_sets", ["npc_sets"]],
  ["faction_deities", ["faction-deities", "deity-factions"]],
  ["faction_locations", ["faction-locations"]],
  ["faction_items", ["faction-items"]],
  ["faction_npcs", ["faction-npcs", "player-faction-npcs", "npc-factions"]],
  ["faction_relations", ["faction-relations"]],
  // A place's map: the DM's site views, and the players' site state.
  ["location_doors", ["location-doors", "site-doors", "player-visible-site-state"]],
  ["location_map_regions", ["location-map-regions", "player-visible-site-state"]],
  // Quest wiring. Unlike a beat row, none of these is written by an autosaving
  // form, so the DM hears them too (a beat rings `quest_beats_player`, which
  // the DM skips). get_player_visible_quest_beats reads all three of edges,
  // attachments and refs for the players' story so far.
  ["quest_beat_edges", ["quest_beat_edges", QUEST_BOARD_KEY, RUNTIME_CONTEXT_KEY, BEATS_KEY, TRANSITIONS_KEY]],
  ["quest_beat_edge_gates", ["quest_beat_edge_gates"]],
  ["quest_beat_attachments", ["quest_beat_attachments", QUEST_BOARD_KEY, BEATS_KEY, TRANSITIONS_KEY]],
  ["quest_consequences", ["quest_consequences", QUEST_BOARD_KEY, RUNTIME_CONTEXT_KEY]],
  ["quest_refs", ["quest_refs", BEATS_KEY, TRANSITIONS_KEY]],
  // The rest (#1033 wave 3). What stays off a route on purpose is listed with
  // its reason in live_sync_registry.test.sql (live_sync_exempt), which fails
  // on any campaign table that is neither routed nor exempt.
  ["spell_change_windows", ["spellChangeWindows"]],
  ["npc_relationships", ["npc_relationships"]],
  ["campaign_invites", ["campaign-invites"]],
  // One user's own favourites, for their other devices.
  ["player_favourites", ["player_favourites"]],
  // Subscribed on its own channel (usePartyLive), which carries inserts and
  // updates as exact rows. It rings only for what that channel cannot carry: a
  // delete, and a character leaving the campaign (#1026).
  ["party_members", ["party", "my-characters", "offered-characters"]],
  // Players cannot read this table, so its row events reach only the DM; the
  // doorbell (20260928225909) tells players to re-read their projection. The
  // DM's own copy is a store fed by the handler below, not a query.
  ["campaign_sessions", ["player-session-state", "player-sessions"]],
  // Not a table: the name `npcs` rings on insert and update (20260928233302).
  // Players cannot read `npcs` rows, so their subscription to it carries
  // nothing; this tells them to re-read their projection. The DM hears it too
  // and has only preview caches under this root, so the rows they already
  // received are not refetched. A delete still rings as `npcs`.
  ["npcs_player", [PLAYER_NPCS_KEY]],
  // Same shape for notes and factions (secret blocks, #932): players can no
  // longer select either table, because a raw row would carry the DM-only
  // passages. They read `get_player_visible_notes` / `_factions`, which strip
  // them, and hear about changes here. The DM holds only preview caches under
  // these roots, so hearing the signal costs them nothing.
  ["notes_player", [PLAYER_NOTES_KEY]],
  ["factions_player", [PLAYER_FACTIONS_KEY]],
  // Places, quests, beats and objectives are read by players through
  // projections and owner-only policies, so a row event never reaches them;
  // the doorbell tells them to re-read. The roots below also hold the DM's
  // caches, which is why PLAYER_ONLY_SIGNALS makes the DM skip these.
  // Sharing a place can share its linked NPCs, so the People projection re-reads too.
  ["locations_player", ["locations", PLAYER_NPCS_KEY]],
  ["quests_player", ["quests"]],
  ["quest_beats_player", [BEATS_KEY]],
  ["quest_objectives_player", [OBJECTIVES_KEY]],
  // Not in SYNC_TABLES — it has exact-row handlers below instead of a registry
  // entry. `items` as well: an item leaving the party's inventory leaves the
  // player-visible projection with it.
  ["party_inventory", ["party-inventory", "items"]],
  // The reason the doorbell exists at all (#811). `store_items` has no
  // campaign_id, so it is on no channel for any event; and its rows carry only
  // an item_id, with the name behind it living in the player-visible
  // projection — refresh both, or a shop stocked mid-session lists "Unknown item".
  ["store_items", ["store-items", "items"]],
  // A shared handout (#970). Documents ring instead of subscribing: they are
  // large, most are DM-only drafts, and the editor autosaves, so the trigger
  // (20261004105821) rings only when a document a player holds changes. Only
  // the players' root is refreshed; the DM's own `scriptorium` queries back an
  // open editor and must not be refetched underneath it.
  ["scriptorium_documents", [PLAYER_HANDOUTS_KEY, SESSION_LEARNED_KEY]],
  // "Mentioned in" (#972). The index of @mentions is DM-only and rewritten by
  // a trigger only when a source's set of mentions actually changes
  // (20261004221637), so an autosave that leaves them alone rings nothing.
  ["entity_mentions", [BACKLINKS_KEY]],
  // DM notes on deities, species, factions and the rest live in the DM's own
  // private entity_notes rows. Those are per-user and must not travel as
  // payloads, so the table rings the doorbell rather than subscribing.
  ["entity_notes", ["entity-notes", "my-recent-entity-notes"]],
]);

// Deduped set of every key the sync owns, plus "campaigns" (handled specially
// in the composable). Reconciling these after a gap re-derives state from the
// DB, and (#999) these roots are the ones persisted as live campaign data:
// painted from disk on a cold start, then revalidated at once.
export const RECONCILE_KEYS = [...new Set([...SIGNAL_KEYS.values()].flat()), "campaigns", "campaign-sessions"];
