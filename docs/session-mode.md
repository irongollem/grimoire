# Session mode

Design for [#758](https://github.com/irongollem/grimoire/issues/758). Describes
the target model, not what ships today — today's behaviour is
`useUiStore().dmMode`, a `localStorage` string.

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
Everything else in this document falls out of that choice — the elapsed clock,
the cross-device consistency, the stale-session reaper, and the ability to tell
players the table is live are all properties of the row, not features built on
top of it.

RLS gates on `private.is_campaign_dm()`, matching `quest_runtime_state`'s own
choice: a session is a DM concept. Telling players the table is live is a
separate, deliberate projection (see below) — not a widening of this policy.

## The boundary already exists on one side

Issue #755 shipped `end_campaign_quest_session`, which pauses every running chain at
its current beat and logs each pause with reason `'Session ended'` and
provenance `'campaign-session-end'`. Its wrapper, `useEndCampaignQuestSession()`
in `useQuestFlow.ts`, is documented as *"Closing the table for the night."*

Nothing imports it. That is not an oversight — it is a correct implementation of
a boundary the app does not have yet. The quest runtime already knows sessions
end; there is nowhere to hang the control. **End session** is that call site.

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

One `LiveRail` renders this, showing the container and its children. It replaces
four indicators that grew separately: `DiceRoller`, the AI-generating pill and
the encounter `Live` pill all sit in `AppSidebar`'s brand row today, with
`SoundboardWidgetToggle`'s active count in the top bar.

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

Nothing else may write the session as a side effect. `QuestFlowStarter` and
`QuestGeneratorPanel` do today — they force `dmMode = "prep"` so a freshly
created flow lands on its overview — and it means improvising a quest at the
table silently stops the broadcast. The landing surface is named directly with
`?view=overview` instead.

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

The player portal reads the session through a player-safe projection, the way
combat is read through `get_player_encounter_state`.

## Naming

Say **session**. Do not say "play mode".

`/play/*` is the player portal and `userMode: "player"` is the DM/Player lens,
whose control is `ModeToggle.vue` — one letter from `DmModeToggle.vue`, in the
same sidebar. Three switches and two meanings of "play" is what the current
naming produces. A DM starts a *session*; players *play*.

## Related

- [quest-run-mode.md](quest-run-mode.md) — the cockpit a quest opens on while a session is live
- [quest-runtime-navigation.md](quest-runtime-navigation.md) — per-quest cursors, and why there are several at once
- [#759](https://github.com/irongollem/grimoire/issues/759) — the session and prep dashboards
- `context/features/npcs.md` — the reveal broadcast, the one behaviour that shipped with #133
