# The Campaign Session

The stretch of real time in which a DM is running the game for players who are present. It starts, it runs, it ends.

Design rationale — including why it is a row rather than a preference, and the two boundaries it closes — lives in [`docs/session-mode.md`](../../docs/session-mode.md). Issue: [#758](https://github.com/irongollem/grimoire/issues/758).

## Not to be confused with

Three things in this app are called some variant of "session" or "play". They are unrelated:

| This | Is |
| --- | --- |
| `campaign_session_state` | The live evening. Started and ended by the DM. |
| `session_proposals` | Scheduling — which evening the table has agreed on. |
| `userMode: "player"` / `/play/*` | The DM/Player lens and the player portal. |
| `SessionWidget` on the dashboard | In-world **game day and location**, which advance whether or not the table is sitting. |

Say **session** for the first. Do not say "play mode" — `/play` belongs to the players.

## State

`campaign_session_state` (migration `20260822234841`) mirrors `encounter_state`: `campaign_id` unique, `user_id`, `is_running`, `started_at`, `ended_at`. One live row per campaign, realtime-published, single `_dm_all` RLS policy on `private.is_campaign_dm()`.

DM-only, matching `quest_runtime_state`. Telling players the table is live would be a separate deliberate projection, not a widening of this policy — it does not exist yet.

- **Composable**: `useCampaignSession()` — module-level singleton owning the first read and the commands. It has **no channel of its own**: `campaign_session_state` rides the one campaign subscription in `useCampaignLiveSync`, which calls `adoptCampaignSession()` on each event and `refetchCampaignSession()` on reconnect. It is a hand-written handler rather than a `SYNC_TABLES` entry because it feeds a store ref, not a list query — the same shape, and the same treatment, as the `campaigns` handler beside it.
- **Store mirror**: `useUiStore().sessionRunning`, written only by the composable. `ui.dmMode` is a **read-only computed** over it, so the five consumers below keep the cheap synchronous read they always had while the only way to change it is starting or ending a session.
- **Helpers**: `formatSessionElapsed`, `isSessionStale` (six hours), `ensureCampaignSession` (plain function — callers are event handlers, not component setups, and must not take a subscription they never release).

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

**Start** — the `SessionControl` in the sidebar, top bar and More sheet, or implicitly: `goLive()` on an encounter starts one if none is running, and says so. A DM hitting **Run** is at the table; asking them to say so twice is bookkeeping.

**Run** — `encounter_state.session_id` records which session a combat ran in.

**End** — explicit only, via `end_campaign_session`. It force-ends any running encounter (also the reaper for a combat left `is_running` by a closed tab — nothing cleared that before) and calls `end_campaign_quest_session`, which pauses every open chain at its beat. That RPC shipped with [#755](https://github.com/irongollem/grimoire/issues/755) for exactly this boundary and had no caller until now.

**Stale** — `StaleSessionPrompt` asks once per app load past six hours. An alertdialog, because a toast that times out defaults to "keep broadcasting"; once per load rather than on a timer, because a dialog that fires at 3am is waiting on top of the app in the morning.

## The live rail

`SessionRail` is one region for everything running, replacing three pills that had grown separately in `AppSidebar`'s brand row (dice roller, AI spinner, encounter `Live` pill) plus the soundboard's count badge in the top bar.

They are not peers — combat, open chains and audio all run *inside* a session — so the session is the container and the rest are child rows, ranked: encounter → running chains → audio → AI generation. Only **running** chains appear; a paused one is a prep concern and belongs on the dashboard.

The dice roller stayed in the brand row. It is a tool the DM reaches for, not a thing that is running.

## Player-facing

Nothing. Players see the consequence — reveals arriving in chat — never a control.

## DM Manual

`src/manual/sessions-overview.md` ("Running a Session", Getting Started).
