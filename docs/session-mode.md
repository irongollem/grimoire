# Session mode

The design behind [#758](https://github.com/irongollem/grimoire/issues/758),
shipped. `useUiStore().dmMode` survives as a **read-only computed** over the
row below, so the five surfaces that read it never had to change.

A **session** is the stretch of real time in which a DM is running the game for
players who are present. It starts, it runs, it ends. Prep is not its opposite
and not a mode: prep is the app at rest, and needs no name.

## Why it is a row and not a preference

Grimoire already has two "something is running" states, and both are modelled
the same way. The session is the odd one out, and every complaint about the
Prep/Play switch traces to a cell in its column.

|                     | `encounter_state`                  | `quest_runtime_state`      | `dmMode`         |
| ------------------- | ---------------------------------- | -------------------------- | ---------------- |
| Stored              | Postgres + RLS                     | Postgres + RLS             | `localStorage`   |
| Scope               | per campaign                       | per quest (#755)           | **per browser**  |
| Start recorded      | `started_at`                       | transition log             | —                |
| Ends                | `is_running = false`               | `status = 'ended'`/`'paused'` | **never**     |
| Realtime            | yes                                | yes                        | no               |
| A co-DM sees it     | yes                                | yes                        | no               |
| Visible to players  | yes (`get_player_encounter_state`) | no — deliberately DM-only  | no               |

`campaign_session_state` mirrors `encounter_state`: `campaign_id` unique,
`user_id`, `is_running`, `started_at`, `ended_at`, one live row per campaign.
Its events ride the shared campaign channel in `useCampaignLiveSync`, beside
the `campaigns` handler it most resembles — one row per campaign feeding a
store rather than a list query.
Everything else in this document falls out of that choice — the elapsed clock,
the cross-device consistency, the stale-session reaper, and the ability to tell
players the table is live are all properties of the row, not features built on
top of it.

RLS gates on `private.is_campaign_dm()`, matching `quest_runtime_state`'s own
choice: a session is a DM concept. Telling players the table is live is a
separate, deliberate projection (see below) — not a widening of this policy.

## The boundary already exists on one side

Issue #755 shipped `end_campaign_quest_session`, which pauses every running chain
at its current beat and logs each pause with reason `'Session ended'` and
provenance `'campaign-session-end'`. Its client wrapper was documented as
*"Closing the table for the night"* and never had a caller.

That was not an oversight — it was a correct implementation of a boundary the
app did not have. `end_campaign_session` is that caller, and it calls the RPC
directly rather than through the wrapper, so the cascade is atomic with the
session ending. The wrapper is gone; only its cache invalidation survives, as
`QUEST_RUNTIME_QUERY_KEYS`.

## The nesting

Running things are not peers competing for the same corner of the chrome. They
nest, and the data already says so:

```text
session                     the table is sitting there
└── encounter               combat, innermost, one per campaign
└── quest cursor            narrative position, one per quest, several at once
└── audio                   beds and effects
└── AI generation           a draft in flight
```

`SessionRail` renders this, showing the container and its children. It replaced
three indicators that had grown separately in `AppSidebar`'s brand row — the
AI-generating pill, the encounter `Live` pill, and the soundboard's count badge
in the top bar. `DiceRoller` stayed put: it is a tool the DM reaches for, not a
thing that is running.

`useRunningEncounters()` keeps its `anyRunning` / `firstRunning` signatures.
Only the consumer changes.

## Lifecycle

**Start** is either explicit — the **Start session** control — or implicit:
`goLive()` on an encounter upserts a session first if none is running. A DM who
hits **Run** is unambiguously at the table, and asking them to have started a
session separately is the bookkeeping that makes people resent modal apps. The
runner's control says so rather than doing it silently.

**Run.** `encounter_state.session_id` is stamped at `goLive()`, so which
encounters ran in which session is answerable afterwards — a recap for one
column.

**End** is explicit only. Ending combat does *not* end the session: combat is
the innermost thing and the table is still sitting there. Ending the session
ends what it contains, in one RPC — force-end any running encounter, and call
`end_campaign_quest_session` to pause every open chain at its beat. The quest
half already exists; the encounter half also closes an existing bug, since
`encounter_state.is_running` can stay `true` forever when a DM closes the tab
mid-combat and nothing clears it today.

**Stale.** `started_at` gives an elapsed clock, which makes a three-day-old
session self-evidently wrong. Past a threshold the app asks on load rather than
quietly broadcasting. The prompt runs the same cascade, so one reaper covers the
closed-tab case across all three tables.

## What the session changes

Five domains read it. They are unchanged by this design — what changes is where
the state lives and how the DM is told.

| Domain               | Behaviour while live                                        |
| -------------------- | ----------------------------------------------------------- |
| Campaign chat        | Revealing an NPC posts a narrative event                      |
| Bottom-bar tabs      | The play pool (`SESSION_TAB_ROUTES`)                          |
| Centre FAB           | The dice roller, not ＋ create                                |
| Quest detail         | Opens on the run cockpit; the tab reads **Run session**       |
| Soundboard           | **Perform** — pads, artwork, progress, no editing chrome      |

Chat is NPCs only. Locations, items, quests and encounters have never announced;
that was deliberate in #133 and is worth revisiting now that they are the odd
ones out.

Nothing else may write the session as a side effect, and two paths used to.
`QuestFlowStarter` and `QuestGeneratorPanel` forced `dmMode = "prep"` so a
freshly created flow landed on its overview — so improvising a quest at the
table stopped the broadcast. `?mode=run` forced `dmMode = "play"`, so opening a
chain from the dashboard *started* one. Both name a surface now (`?view=` and
`runRequested`), and `dmMode` is read-only, so neither can recur.

## Telling the DM

The whole teaching budget is spent at the boundary. Starting a session is the
one moment a DM will read four lines, so a dismissible sheet enumerates exactly
what changes, once. Nowhere else in the interface lists the five, because
nowhere else is the moment they become true.

The resting control reads **Start session**. While live it is a rail carrying a
pulse, elapsed time, and **End session**.

## Telling the table

`sendCampaignAnnouncement` exists and `SchedulingTab` already posts 📅 messages
to campaign chat. A session-start announcement lands where the consequence
lands, which makes it the strongest available confirmation that broadcasting is
on — and it closes the loop with the dates players confirm in
`session_proposals`.

**Not built.** A session-start announcement and a player-safe projection are
both still open — the players learn a session is running only from the reveals
that arrive in their chat.

## Naming

Say **session**. Do not say "play mode".

`/play/*` is the player portal and `userMode: "player"` is the DM/Player lens,
whose control is `ModeToggle.vue` — which used to sit one letter from
`DmModeToggle.vue` in the same sidebar. That second toggle is gone. A DM starts
a *session*; players *play*.

## Related

- [quest-run-mode.md](quest-run-mode.md) — the cockpit a quest opens on while a session is live
- [quest-runtime-navigation.md](quest-runtime-navigation.md) — per-quest cursors, and why there are several at once
- [#759](https://github.com/irongollem/grimoire/issues/759) — the session and prep dashboards
- `context/features/npcs.md` — the reveal broadcast, the one behaviour that shipped with #133
