# The Campaign Session

The stretch of real time in which a DM is running the game for players who are present. It starts, it runs, it ends.

Design rationale — including why it is a row rather than a preference, and the two boundaries it closes — lives in [`docs/session-mode.md`](../../docs/session-mode.md). Issue: [#758](https://github.com/irongollem/grimoire/issues/758).

## Not to be confused with

Three things in this app are called some variant of "session" or "play". They are unrelated:

| This | Is |
| --- | --- |
| `campaign_sessions` | The log of evenings at the table. The one that is open (started, not ended) is the live session. |
| `session_proposals` | Scheduling — which evening the table has agreed on. |
| `userMode: "player"` / `/play/*` | The DM/Player lens and the player portal. |
| `SessionWidget` on the dashboard | In-world **game day and location**, which advance whether or not the table is sitting. Not the **Sessions** widget, which reads the log. |

Say **session** for the first. Do not say "play mode" — `/play` belongs to the players.

## State

`campaign_sessions` (migration `20261006072708`, #985) is a **log**: one row per evening, not one row per campaign. Columns: `number` (nullable integer), `title`, `played_on` (a date, for a session never run through Start), `started_at`, `ended_at`, and the usual ids and timestamps. It replaced `campaign_session_state` (`20260822234841`), which was one row that every Start overwrote: it knew whether a game was running and nothing about the ones before, so `encounter_state.session_id` named the same row for every combat ever run.

- **The number is a label, never a key.** The DM gives it; nothing advances it, and nothing is unique on it, sorts on it alone or joins on it. Two sessions called "2" are legal (a test start, a one-shot, a typo), and so are sessions with no number at all. Sort by `sessionWhen()` (`started_at`, else `played_on`, else `created_at`), never by number.
- **Open means running.** A session is open while `started_at` is set and `ended_at` is not. A partial unique index (`campaign_sessions_one_open`) allows one open row per campaign. A `check` keeps `ended_at` from preceding `started_at`.
- **RLS** is DM-only on all four verbs, through `private.is_campaign_dm(campaign_id)`. Players never read the table (it carries `user_id`).
- **`start_campaign_session(p_campaign_id, p_number, p_title, p_proposal_id)`** inserts the open row and returns it. Called while one is already open it returns that one untouched, so a DM who reopens the app keeps their clock. A `p_proposal_id` writes `session_proposals.session_id` (the scheduled session it became; the link sits on the proposal because the demo copy copies sessions and never proposals). Since `20261006072853` it also attaches the moments shared during prep (see "What the party learned").
- **`merge_campaign_sessions(p_keep, p_absorb)`** (`20261006151947`) folds one row into another: every link moves to `p_keep`, which takes the number, title, `played_on` and run it lacked (two runs span the earlier start to the later end), and `p_absorb` is deleted. `SECURITY DEFINER` so every link moves or none does (an invoker version would strand a row RLS hid, then unlink it on delete); it authorizes on the campaign both rows belong to and refuses a running session. `merge_campaign_sessions.test.sql` holds the list of links it moves equal to the foreign keys into the table, so a new link fails until the merge moves it. The usual cause is the session-log migration: an evening both run through Start and written up as a numbered note became two rows. `useMergeCampaignSessions()` calls it; the log keeps the row that was run.
- **`end_campaign_session(p_campaign_id)`** closes the open row, force-ends any running encounter and calls `end_campaign_quest_session`, as before.
- **Players** read two projections, both `SECURITY DEFINER`, gated on `private.is_campaign_member`, never returning `user_id`: `get_player_session_state(uuid)` (the open session: `is_running`, `started_at`, `session_id`, `number`, `title`; no rows once it ends) and `get_player_sessions(uuid)` (`id`, `number`, `title`, `played_on`, `started_at`, `ended_at` for every session: the labels People and the journal print). Both are in `supabase/tests/definer_refusal_registry.test.sql`.
- **Links to a session**: `notes.session_id` (a session note belongs to a session; `notes.session_num` is gone, so a note's number is its session's), `session_proposals.session_id`, `encounter_state.session_id` (now a real foreign key into the log) and the learned-moment tables below. Every foreign key is `on delete set null`: deleting a session leaves its note, proposal and moments in place, unlinked. `zz_same_campaign_refs` keeps each link inside one campaign.
- **Live sync**, the published-plus-doorbell route. The DM's channel subscribes to the table (`useCampaignLiveSync` has a hand-written handler that calls `adoptLoggedSession()` / `dropLoggedSession()` and invalidates the `campaign-sessions` log query), and every write rings the `campaign_sync` doorbell (`campaign_sessions_signal_insert|update|delete`), which `SIGNAL_KEYS` maps to `player-session-state` and `player-sessions` so a player's live indicator and labels refresh. It is in `live_sync_registry.test.sql`.
- **Demo copy**: `campaign_sessions` is a copied table (tier 1), so a template's session notes keep their numbers and links. Nothing a session references is left uncopied; `location_reveals` and `handout_reveals` are play state and are not copied.
- **Backup and export** carry the log. A backup restores sessions before notes and remaps both links; an older backup's `session_num` becomes sessions the way the migration did. Markdown export writes `session` and `session_title` for a session note.

- **Composable**: `useCampaignSession()` in `src/composables/campaign/` is a module-level singleton owning the first read and the commands (`start(options)`, `end()`). It has **no channel of its own**: the table rides the one campaign subscription in `useCampaignLiveSync`, which calls `adoptLoggedSession()` on each event and `refetchCampaignSession()` on reconnect. It is a hand-written handler rather than a `SYNC_TABLES` entry because it feeds a store ref, not a list query, the same shape as the `campaigns` handler beside it.
- **Store mirror**: `useUiStore().sessionRunning`, written only by the composable. `ui.dmMode` is a **read-only computed** over it, so the five consumers below keep the cheap synchronous read they always had while the only way to change it is starting or ending a session.
- **The log's reads** are in `src/composables/sessions/`: `useCampaignSessions()` (the DM's log, newest first; takes an `enabled` getter so the Start dialog, mounted app-wide, reads it only while open) with its update, create-past and delete mutations, and `usePlayerSessions()` (the player labels).
- **Helpers**: `formatSessionElapsed`, `isSessionStale` (six hours), `ensureCampaignSession` (plain function: callers are event handlers, not component setups, and must not take a subscription they never release).

## What reads it

| Domain | Where |
| --- | --- |
| NPC reveal announces to chat | `NpcRevealControl.vue`, `NpcSheet.vue`, `NpcDetail.vue` |
| Bottom-bar tab pool | `SESSION_TAB_ROUTES` in `lib/nav.ts` → `DmBottomNav.vue` |
| Centre FAB (＋ vs dice) | `DmBottomNav.vue` |
| Quest landing surface + tab label | `QuestDetailView.vue` |
| Soundboard Arrange/Perform | `soundboardBoardMode` in `stores/ui.ts` → `SoundboardView.vue` |

Chat is **NPCs only**. Locations, items, quests and encounters have never announced — out of scope for #133, and now the odd ones out.

**Nothing may write the session as a side effect.** Two paths used to, and both were defects rather than choices: quest creation wrote `dmMode = "prep"` (so improvising a quest at the table silently stopped the broadcast), and `?mode=run` wrote `dmMode = "play"` (so opening a chain from the dashboard silently started one). Both name a surface with `?view=` / `runRequested` now.

## The lifecycle

**Start** opens `SessionStartDialog` (`src/components/layout/`) every time, from the `SessionControl` in the sidebar, top bar and More sheet, and from the Sessions widget. It asks for:

- **Session number**, prefilled with the highest number in the log plus one (`nextSessionNumber`; empty while nothing is numbered). It is a label the DM may change. **Start without a number** clears it, for a test or a one-shot.
- **Title** (optional), prefilled from today's confirmed scheduled session (`todaysScheduledSession`). Only a title that still equals the scheduled one links back to it (`p_proposal_id`).
- A "Last time" line naming the last played session (`lastPlayedSession`).

The prefill is recomputed on each open, so a number set last week never outlives the session that has since taken it.

**Implicit start** — `goLive()` on an encounter calls `ensureCampaignSession`, which starts one if none is running, with no dialog and no number. It says so. A DM hitting **Run** is at the table; asking them to say so twice is bookkeeping. The log flags such a session as unnumbered so the DM can number or delete it.

**Run** — `encounter_state.session_id` records which session a combat ran in, and every learned moment is stamped with the open session (below).

**End** — explicit only, via `end_campaign_session`. It force-ends any running encounter (also the reaper for a combat left `is_running` by a closed tab — nothing cleared that before) and calls `end_campaign_quest_session`, which pauses every open chain at its beat. That RPC shipped with [#755](https://github.com/irongollem/grimoire/issues/755) for exactly this boundary and had no caller until now.

**Stale** — `StaleSessionPrompt` asks once per app load past six hours. An alertdialog, because a toast that times out defaults to "keep broadcasting"; once per load rather than on a timer, because a dialog that fires at 3am is waiting on top of the app in the morning.

## The live rail

`SessionRail` is one region for everything running, replacing three pills that had grown separately in `AppSidebar`'s brand row (dice roller, AI spinner, encounter `Live` pill) plus the soundboard's count badge in the top bar.

They are not peers — combat, open chains and audio all run *inside* a session — so the session is the container and the rest are child rows, ranked: encounter → running chains → audio → AI generation. Only **running** chains appear; a paused one is a prep concern and belongs on the dashboard.

The dice roller stayed in the brand row. It is a tool the DM reaches for, not a thing that is running.

## The touched-this-session list

The docked DM scratchpad lists every entity the DM wrote a note on since the running session began (`dm_note_touches`, read by `useDmNoteTouches`). It is keyed on this session: "This session" while it runs, bounded by `started_at`; "Last session" after it ends, bounded by `ended_at`; no list with no session. See [dm-notes.md](dm-notes.md).

## Player-facing

Two signals, no controls.

- **"⚔️ The session begins."** — posted by `announceSessionStart` on start, from the chrome control or from `goLive()`. Not repeated when an already-running session is re-started, and never allowed to fail the start.
- **`get_player_session_state(uuid)`** — the open session's `is_running`, `started_at`, `session_id`, `number` and `title`. Never `user_id` (which DM started it is not a player's business, and it is a join key into `auth.users`) and never `ended_at` (a closed session projects nothing at all — a player asks one question). The DM-only policy on the table is unchanged; this sits beside it, as `get_player_encounter_state` does for combat.

Read by `usePlayerSessionState`, refreshed by the `campaign_sync` doorbell rather than the table's own events: the campaign channel carries those only for readers RLS lets through, and a player is not one. Every write to the table rings the doorbell (`20260928225909`, re-created for `campaign_sessions` in `20261006072708`), which names the table and nothing else, so a start or end reaches players as it happens. This replaced a 60s poll.

`PlayerLayout` renders it as a quiet "Session live" in the header, and the control, the player chip and Hearth's banner say "Session 15" when the session has a number. It yields to the live-encounter pill — combat is the more urgent thing, and two lit indicators in one corner is the mistake the DM side already made.

## What the party learned

Every moment the table learned something carries the session it belongs to (migration `20261006072853`). Six kinds, and where each one records its session:

| Kind (list heading) | Table | Written when |
| --- | --- | --- |
| People met | `npc_reveals` (`20261005220422`, plus `session_id`, `approximate`) | an NPC, or its location's linked NPCs, is first shared with a party member |
| Places | `location_reveals` (new) | a location is first shared with a party member |
| Handouts | `handout_reveals` (new) | a Scriptorium document is first shared with a party member |
| Creatures discovered | `discovered_monsters` (`session_id`) | the party discovers a monster |
| Quests | `quest_beat_transitions` (`session_id`) | a quest step happens |
| Combat | `encounter_state.session_id` | `goLive()`, read-only on the page |

- **Stamping.** `public.stamp_open_session()` is a `before insert` trigger on each table: if the row has no `session_id` it takes the campaign's open session. It is a trigger function, so it has no `EXECUTE` grant.
- **Prep moments join the next session.** What is shared while no session is open has no session yet; `start_campaign_session` attaches every unstamped, non-approximate moment recorded since the last session ended. "Since" never reaches before `private.session_log_began()`, so older moments are never swept into the first session.
- **Approximate.** `approximate` marks a moment whose time was reconstructed, not recorded: the backfills of `npc_reveals`, `location_reveals` and `handout_reveals` use the entity's `created_at`. Approximate moments are never attached automatically.
- **The DM alone may move one.** `update` is revoked on these tables and `grant update (session_id)` given back, with a `_dm_update` policy: the only change anyone can make to a moment is which session it is in. `quest_beat_transitions` stays append-only in substance for the same reason. The two new reveal tables are written only by triggers, readable by the DM and by the member they belong to.
- **The unsorted list.** Moments before the log began, and anything the DM leaves, have `session_id` null. `/sessions/unsorted` works through them.
- **Live sync.** The page's reads sit under the `session-learned` query root (`SESSION_LEARNED_KEY`, `src/lib/sessions/learned.ts`); `campaignRealtimeWorld.ts` and `campaignRealtimePlayer.ts` invalidate it on the reveal and discovery events.
- **Demo copy.** `location_reveals` and `handout_reveals` are tier 1 with `copy = false`: a demo starts with nothing shared.

`src/lib/sessions/learned.ts` shapes the rows into entries (`LearnedEntry`, one per kind, entity and session, each with the `recordRefs` to update when it moves); `useSessionLearned` reads and moves them, `useShareCandidates` and `useFileShared` back the "forgot to share" correction.

## The Sessions section

A campaign-block nav item, **Sessions**, at the bottom of the block above Settings (`lib/nav.ts`).

| Route | View | Shows |
| --- | --- | --- |
| `/sessions` | `SessionsView` | The log, newest first, one `SessionLogRow` each: label, date, length, what came of it (people met, encounters; `useSessionFacts`), a recap chip. Flags a session without notes ("Write notes") and an unnumbered one ("Number it", "Delete"). Two finished sessions with the same number get a line under the summary ("Session 14 is in the log twice · Merge them", `sessionsSharingANumber`), which merges them after a confirm (below). "Add a past session" (`PastSessionDialog`) logs one played before the log or away from the app. While one is live a `SessionRunningCard` shows on phones. |
| `/sessions/:id` | `SessionDetailView` | `SessionDetailsForm` (number, title and, for a session never run through Start, the "Played on" day, all autosaved; a run session shows its clock line instead, since `started_at` dates it; "Scheduled as" when a proposal points here), `SessionNotePanel` (its note, or "Write the notes", "Draft with the Chronicler", "Link an existing note"), `SessionLearned` (below), and Delete. Deleting a session leaves its note, unlinked. |
| `/sessions/unsorted` | `SessionsUnsortedView` | "Learned outside any session": each moment with a suggested session (`suggestSession` in `learned.ts`), preselected in its row's picker. Ticked rows go either all into one session ("Put them in") or each to its own picker's session ("Follow suggestions", one write per destination). What stays here shows to players under "Before the log". |

On a session's page, `SessionLearned` lists the six kinds with `LearnedKindMark`; each entry moves with **Another session…** (`LearnedSessionSelect`), and **+ Something they learned that you forgot to share** (`SessionLearnedAdd`) shares it now and files it under this session. That share goes through the same write the entity's own Share control makes (`npcShareUpdate` for people), then files the reveal rows it created. Quests are not offered there: a quest begins on its own surface, which stamps the session itself.

A session note links to its session through `NoteSessionPicker` (sessions without a note first, "+ A session that is not in the log yet" to add one in place). `/notes/new` honours `?category=session&session=<id>`; `sessionNoteRoute()` in `src/lib/sessions/sessionRoutes.ts` builds that link. The note editor's dates panel prefills from the last played session, not the highest number.

Code: components in `src/components/sessions/`, views in `src/views/sessions/`, composables in `src/composables/sessions/`, pure logic (labels, prefill, log facts, learned entries) in `src/lib/sessions/`, all with colocated tests. `sessionLabel()` ("Session 15: Into the Mere", "Unnumbered session") and `sessionShortLabel()` are the one place a session is named.

## The Sessions widget

`SessionsWidget.vue` (id `sessions`, picker, `maxInstances: 1`) replaces the old **Last session** widget, which ranked session notes by a hand-typed number. It shows the next session (or the running one with its elapsed time and **End**; otherwise **Start session**, which opens the Start dialog), **Last time** with the recap excerpt, the gaps ("Session 14 has no notes yet", "N things learned outside any session") and a quick line (`SessionQuickLine`, `useAppendSessionLine`) that appends a paragraph to the session's note, creating it linked to the session on first use. It refuses to overwrite a legacy HTML note.

Saved layouts keep their slot: `RENAMED_WIDGET_IDS` in `src/lib/dashboard/savedLayout.ts` maps `latest-session-note` to `sessions`, so a DM's arrangement carries the old widget over under the new one.

## People "Met"

Players' People ledger groups **Met** by session (`buildPeopleGroups` in `src/lib/npcs/peopleLedger.ts`): "Session 14" with its title and date, newest first, two sessions sharing a number kept apart, everyone met outside any session under "Before the log". Labels come from `get_player_sessions`; the ledger waits for them rather than flashing the wrong grouping. See `context/features/npcs.md`.

## DM Manual

`src/manual/sessions-overview.md` ("Running a Session", Running the Table) and `src/manual/running-dm-notes.md` ("DM Notes and the Scratchpad").
