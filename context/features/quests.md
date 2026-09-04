# Quests: Story Beats, Objectives and the Run Cockpit

A quest is the thread that connects everything else on the page — NPCs, locations,
encounters, loot, notes and handouts — into something a party is _doing_. It is
prepared in advance, played at the table, and corrected afterwards, and all three
have to be cheap.

This doc has two halves and they must not be confused:

- **The model** is the agreed end state. It is what new work builds toward.
- **Today** is what the code actually does. Some of it contradicts the model.

Where they differ, the difference is named. Do not read a "today" paragraph as a
design decision to preserve, and do not read a "model" paragraph as a description
of shipped behaviour.

---

## The model

> **A beat is an event. An objective is state.**

- An **objective** is what the party is trying to achieve — future tense, the
  players' side, persists across scenes, satisfiable in an order nobody planned.
  It has a life: unknown → known → achieved / failed.
- A **beat** is what _happened_ — past tense, the story's side, a moment that
  changed the situation.

A beat does exactly four things to the ledger: it **raises**, **achieves**,
**fails** or **reveals** objectives.

A beat is not itself a fork. The fork is the set of beats that _could_ follow, and
what decides between them is the objective ledger. "The princess dies" is one beat
that **fails** `Save the princess` and **raises** `Carry the news home` — a
transaction, not an unticked box. That case is the reason a checklist model is not
enough: an objective can end badly _and_ spawn a successor in the same moment.

Four consequences worth stating, because each one is a rule about where things go:

- The quest's **opening beat** is the one that raises the first objectives.
- **Edge labels** are the outcome that opens the route, not DM free text.
- Objectives have **one home**, owned by the quest. Beats _wire_ to it.
- **A dungeon needs no beats inside it.** Walking into room four changes nothing;
  finding the ledger changes everything. Rooms are places, not events.

### The site

A dungeon is a place in the **Atlas**, not part of a story. What is explored,
cleared, looted and unlocked is a fact about the world and outlives any quest.

The constraint that decides this: a party is in **one** place and on **many**
quests at once, and two open chains routinely converge on the same location. Site
state therefore cannot live on a beat — a beat belongs to one quest, and the two
chains would hold contradictory ideas of the same rooms.

Precedent, not invention: `store`/`tavern`/`inn` already unlock their own panel
keyed on `location_type`. `dungeon` unlocks rooms and the flow between them, and
rooms are ordinary `room` child locations the hierarchy already allows.

Rejected, and worth not re-proposing: rooms as beats in a nested sub-graph. It is
the cheapest schema change, but a graph says "then" and a dungeon says "next door
along" — five rooms becomes nine nodes once the corridors joining them must exist,
and every one lands in the player's journal.

---

## Today: two generations, joined by a synthetic beat

Nothing here is broken code. It is two coherent designs built four months apart
that were never asked to agree, plus one auto-created beat holding the seam shut.

|        | Generation one — the quest sheet                             | Generation two — the story flow                                                                                                         |
| ------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Shape  | a record with a checklist                                    | a graph you run a cursor through                                                                                                        |
| Tables | `quests`, `quest_objectives`, `quest_refs`, `quest_triggers` | `quest_beats`, `quest_beat_edges`, `quest_beat_attachments`, `quest_runtime_state`, `quest_beat_transitions`, `quest_objective_effects` |

**The bridge.** Every quest owns exactly one `is_overview` beat, created by an
`after insert on quests` trigger and pinned by a partial unique index. It carries
quest-wide material so generation one's content had somewhere to live inside
generation two. Keeping it alive costs five special cases: the insert trigger,
`private.protect_quest_overview_beat()` refusing to archive or demote it, the
partial unique index, its exclusion from `search_quest_runtime_jump_targets`, and
its exemption from disconnected-staging prep gaps in `deriveQuestBeatPresentations`.

**Where the two overlap.** Each of these is a fact with two writable homes and no
rule about which wins:

| Generation one holds                         | Generation two also holds                                                            | Reconciled by                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `quests.summary` / `description` / `notes`   | the overview beat's `dm_content` / `how_it_plays` / `presentation_hint` / `outcomes` | a one-time copy in `20260810220934`; nothing since                                            |
| `quests.reward_*` (coins, pools, items, art) | `quest_beat_loot` rows with `source_type = 'quest_reward'`                           | the same one-time copy — all four kinds, not just items                                       |
| `quest_refs`                                 | `quest_beat_attachments`                                                             | a trigger syncs attachment → ref; nothing syncs back, and removing a placement leaves the ref |
| `quest_triggers` (fires _from_ an objective) | `quest_objective_effects` (fires _to_ one)                                           | nothing — two ends of one idea                                                                |

**Dead residue.** `quests.flow_enabled_at` is `NOT NULL DEFAULT now()`, so it is
always set — a dead opt-in flag. `quest_beats.conversion_source_type` / `_id` and
their partial unique index outlive `convert_quest_to_flow`,
`preview_quest_flow_conversion` and `rollback_quest_flow_conversion`, which shipped
in `20260810000016` and were dropped the same day by `20260810202052`.

### An objective appears in three surfaces that disagree

| Surface              | Component                                                    | What it says an objective is                                                         |
| -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| A checklist you tick | `QuestObjectivesList.vue` (Overview › Quest lifecycle)       | a to-do the DM maintains — the mark cycles pending → complete → failed               |
| A rule you author    | `QuestBeatObjectivesPanel.vue` (beat inspector, beat page)   | a variable the graph writes — shows _reveal / complete / fail_, and no status at all |
| A thing you attached | `QuestBeatAttachmentsPanel.vue`, `QuestRunContainedTool.vue` | prepared material, like a sound cue                                                  |

The third is a live, addable `attachment_type = 'objective'` pointer whose only
meaning is "relevant here". It was backfilled onto every overview beat once and
nothing has synced it since.

---

## Data model

### `quests`

`title`, `status` (`quest_status_enum`: `undiscovered`, `rumor`, `active`,
`completed`, `failed`), `summary`, `description` (Tiptap JSON in text), `notes`
(DM-only), `giver_npc_id`, `location_id`, `parent_quest_id` (sub-quests, no depth
limit), `rewards`, `reward_pp/gp/ep/sp/cp`, `reward_currency_pools`,
`reward_item_ids`, `reward_art_objects`, `tags`, `player_visible_to uuid[]`
(null = never shared), `started_at` / `resolved_at` (**`started_at` is never
written by anything**), `ai_provenance`, `flow_enabled_at`.

Carries `unique (id, campaign_id)` — the composite every beat-side FK targets.

### `quest_objectives`

`description`, `sort_order`, `is_player_visible`, `status` (`pending` |
`complete` | `failed`). `is_done` was dropped in `20260818212305` after backfilling
`status`; the cycle lives in `lib/quests/objectives.ts`.

### `quest_beats`

`title` (non-blank, enforced), `dm_content`, `rumor_text`, `reveal_text`,
`visibility` (`hidden` | `rumored` | `revealed`), `kind` (**open text, not an
enum** — conventionally `combat` / `social` / `explore` / `discovery` / `neutral`,
plus `overview` and the tombstone `archived`), `presentation_hint`, `canvas_x/y`,
`is_improvised`, `improv_reviewed_at`, `read_aloud`, `how_it_plays`, `outcomes`,
`consequences`, `is_overview`, `conversion_source_type/_id`.

`kind` is doing three jobs at once: a presentation hint, an `overview` marker
redundant with the later `is_overview` boolean, and an `archived` tombstone every
runtime query has to filter out.

**Beats have no ordering column.** Author order is `canvas_x/y`; player order is
`story_order`, the longest path from a root, computed in a recursive CTE inside
`get_player_visible_quest_beats`.

### `quest_beat_edges`

`source_beat_id`, `target_beat_id`, `label`. Self-links forbidden; unique on
`(quest_id, source, target, label)`, so one pair may be linked twice under
different labels. Cycles are valid, and `lib/quests/graph.ts` is cycle-safe.

### `quest_beat_attachments`

Typed placements: `encounter`, `objective`, `quest_ref`, `location_set`, `npc`,
`faction`, `item`, `monster`, `sound`, `audio_scene`, `playlist`, `note`,
`handout`. Polymorphic `ref_id text`, validated by
`private.validate_quest_beat_attachment()` rather than an FK.

`location_set` is the current dungeon shape: `ref_id` is the root location and
`metadata.room_ids` a jsonb array of descendants. It has **no ordering, no
per-room state and no per-room material binding**, and the validator checks that a
room _exists_, never that it sits inside the root — the picker's BFS over
`parent_id` is the only thing enforcing that.

`quest_ref` is allowed by the CHECK but deliberately absent from the panel's
`supportedTypes`, so it cannot be created from the UI.

### `quest_runtime_state` — the cursor

PK `(campaign_id, quest_id)` since `20260822224306` (#755): **one cursor per
chain**, because a party is routinely mid-progress on several. Holds
`current_beat_id`, `visit_stack` (undo semantics — moving forward from a rewound
position truncates), `visit_index`, `return_stack`, `status`
(`idle`/`running`/`paused`/`ended`) and `version` for optimistic concurrency.

The cursor tracks **narrative position in a chain, not where the party is
standing** — its own migration header says so. Clients have no insert/update/delete
grant; it moves only through the RPCs.

### `quest_beat_transitions` — append-only

`transition_kind`: `enter`, `forward`, `previous`, `jump`, `return`, `improv`,
`pause`, `resume`, `end`. Denormalised title snapshots so history survives edits.
No UPDATE/DELETE policies, and both are revoked from `authenticated`/`anon`.

### The rest

`quest_beat_loot` (with `dispatch_message_id` into `campaign_messages`),
`quest_objective_effects` (`reveal`/`complete`/`fail`, triggered by exactly one of
`trigger_beat_id` or `trigger_edge_id`), `quest_objective_effect_events` (the undo
journal for the above), `quest_refs`, `quest_triggers`, `quest_trigger_scheduled`.

Types live in `src/types/quest.types.ts`. There is **no `QuestFlow` domain type** —
"flow" in this codebase means the rendered graph, and `lib/quests/flow.ts` holds
Vue Flow view-model wrappers only.

---

## DM surfaces

| Route                       | Component                                       |
| --------------------------- | ----------------------------------------------- |
| `/quests`                   | `views/quests/QuestsView.vue` → `QuestList.vue` |
| `/quests/new`               | `QuestDetailView.vue` → `QuestFlowStarter.vue`  |
| `/quests/:id`               | `QuestDetailView.vue`                           |
| `/quests/:id/beats/:beatId` | `views/quests/QuestBeatDetailView.vue`          |

`/quests/:id` has two peer surfaces behind a `SegmentedControl`, selected by
`?view=`:

- **Overview** — `QuestOverviewPanel` → metadata, the overview beat's fields,
  attachments, loot, lifecycle (objectives, consequences, sub-quests, calendar).
- **Work** — the **story flow** (`QuestGraphDesigner` + `QuestFlowCanvas`, with
  `QuestGraphOutline` as the sub-`48rem` and screen-reader fallback), or the **run
  cockpit** (`QuestRunCockpit`) when a session is running or `?mode=run` asked.

Legacy query translations still honoured: `?overview=true`, `?mode=details`,
`?edit=true` → overview; `?mode=build` → work. `?mode=run` is _not_ legacy —
`QuestChainRow` and `QuestRunOpenChains` generate it every time.

**`:contained` follows the graph, not the work tab.** The canvas is a
fixed-viewport surface that scrolls itself; the cockpit is an ordinary long
document. Binding containment to `view === "work"` gave the cockpit the canvas's
contract and made its body an unscrollable `overflow:hidden` box at `lg` and wider
(#776). The binding is `showsGraph`, and it must stay that way.

**The cockpit** (`QuestRunCockpit`) is the beat card, a right rail (`QuestRunPath`,
`QuestRunOpenChains`), the jump and improv panels in flow, the contained tool
overlay, and `QuestRunControls` — a `sticky bottom-2` bar carrying the branch
cards, Previous / Jump / Something else, and Pause / End. Runtime context, live
chains and runtime state all poll at 5s; every command carries `expectedVersion`.

`QuestRunContainedTool` opens an attachment in place: encounters embed
`EncounterRunSurface`, audio calls the Soundboard, objectives get a next-status
button, notes and handouts render their bodies, `location_set` renders root + rooms.
Despite the name it is also the prep-time viewer, mounted from
`QuestBeatAttachmentsPanel`.

---

## Player surfaces

| Route                         | Component                                |
| ----------------------------- | ---------------------------------------- |
| `/play/quests`                | redirect → `/play/journal?tab=quest-log` |
| `/play/journal?tab=quest-log` | `PlayerJournalQuestLogTab.vue`           |
| `/play/quests/:id`            | `views/play/PlayerQuestDetailView.vue`   |

The detail view gates on `player_visible_to` being non-empty, then shows title and
status, giver (NPC lightbox) and primary location (link only if actually shared),
summary and description, **`PlayerQuestStoryThread`** ("Story so far"), visible
objectives with a progress count, rewards, visible refs, and a
`PlayerNotesWidget`.

`PlayerQuestStoryThread` renders a dashed **Rumors** block for `rumored` beats and
a **Confirmed journey** timeline for `revealed` ones, ordered by `story_order`
rather than reveal time — narrative order, not the order the DM happened to
disclose things.

Containment is in two places, and the split matters:

- **Server** (`get_player_visible_quest_beats`): only `rumored` and `revealed`
  beats, exposing `player_text` with **no DM-title fallback**.
- **Client** (`PlayerQuestStoryThread.vue`): a revealed beat with empty
  `player_text` is filtered out, so an un-written reveal renders nothing rather
  than an empty entry. The RPC still returns that row — the drop is presentation,
  not a security boundary, and the boundary above is what stops the DM's title
  leaking.

The runtime cursor is invisible to players — `quest_runtime_state` has a single
`private.is_campaign_dm()` policy.

DM preview: `QuestPlayerPreviewDrawer` renders the real player projection for a
chosen party member, and "Open actual player route" enters `ui.dmPreviewMode`.

---

## The runtime

DM-gated `SECURITY DEFINER` with `set search_path = public, private`, **except
`create_quest_beat_with_route`**, which is `SECURITY INVOKER` and leans on the
caller's own RLS (it still revokes from `public`/`anon` and grants only to
`authenticated`):

`get_quest_runtime_context` (returns state, current beat, previous, outgoing edges,
return target, and the most recent **100** transitions — the cockpit polls it),
`get_campaign_live_quests`, `transition_quest_runtime` (commands: `start`,
`advance`, `previous`, `jump`, `return`, `improv`, `pause`, `resume`, `end`),
`improvise_quest_runtime`, `search_quest_runtime_jump_targets`,
`end_campaign_quest_session`, `archive_quest_beat`, `create_quest_beat_with_route`,
`dispatch_quest_beat_loot`, `get_quest_beat_loot`, `get_player_visible_quest_beats`,
`get_player_visible_quests`.

Semantics not to re-litigate (from #755):

- **Back is undo, truncation included.** Navigating forward from a rewound
  position drops the abandoned entries. `quest_beat_transitions` stays the
  authoritative log — do **not** rebuild the back path from it, which would make it
  un-rewindable.
- **A command names exactly one chain.** Reaching another quest is navigation to
  its own Run URL, not a runtime write.
- **Ending is per chain.** `end_campaign_quest_session` pauses every running chain
  at its beat rather than clearing it, and is called by `end_campaign_session`.
- **Nesting is a sort hint.** A parent's cursor never aggregates its children's.

`promote_quest_on_cursor_arrival` ratchets `quests.status` `undiscovered|rumor →
active` on arrival, never demotes, never touches `completed`/`failed`.

---

## AI quest generator

`QuestGeneratorPanel.vue` (a `fixed` drawer mounted globally via
`AiGeneratorPanels.vue`), `src/ai/useQuestGeneration.ts`, edge function
`generate-quest`. Pro-gated. Produces **exactly 5** hooks — the seeded system prompt
(`20260507000001_ai_system_prompts.sql`) says so twice and both the server and the
local-key client path load the same prompt row. Picking one creates the quest, its
objectives and `quest_refs` for every resolved NPC/location.

Retrieval grounding (#600) is documented in
[world-building.md](world-building.md#retrieval-grounding-for-ai-generators-600) — that section is
the canonical home for the campaign-entity retrieval specifics and should stay
there.

---

## Do not "fix" these

- **`quest_beats.kind` is open text, deliberately.** It is a presentation hint and
  explicitly does not constrain attachments. Do not narrow it to an enum.
- **`QuestRunTally` is not used by the cockpit.** Its `QuestRun*` name is a
  leftover; the consumers are `QuestGraphDesigner` and `QuestGraphOutline`.
- **The player thread orders by `story_order`, not by reveal time.** Narrative
  order is the intent; the rationale is in the component.
- **Quests have no save-triggered navigation at all.** Metadata and beat fields
  autosave in place on a debounce; only **delete** navigates, to `/quests`
  (`QuestOverviewLifecycle.vue`). Do not add a post-mutation redirect to an
  autosaving field — there is no save event to hang it on.
- **`?mode=run` may choose a surface but must never start a session.** Writing
  `ui.dmMode` as a side effect of a link was a defect, fixed in #758.

---

## One departure worth a decision

`QuestFlowStarter` sends a newly created quest to `/quests/:id?view=overview` — the
new record's own detail page. The post-mutation navigation rule says create should
go to the list and explicitly forbids the detail page, and `/quests/:id` is a
standalone route, so it does not qualify for the nested-detail carve-out that NPCs
and monsters have.

It is deliberate rather than an oversight: the graph-first lifecycle means New Quest
creates a lightweight shell whose entire point is to open in the designer, and
bouncing to a list to click straight back in would be worse. But it is **not
currently written down as a sanctioned exception**, which means the next reader is
entitled to "fix" it. Either bless it in CLAUDE.md's Sanctioned Exceptions or change
it — this doc records the state, it does not settle it.

## In flight: the redesign

**[EPIC #780](https://github.com/irongollem/grimoire/issues/780)** collapses the
two generations into the model at the top of this doc and makes the dungeon a place
in the Atlas. Read the epic before starting any quest work — it carries the model
definition and the **deletion manifest**, which is its acceptance test.

Phases: **0** the cockpit containment bug (#776) and this doc (#782); **1** the
dungeon standalone (#783–#791) — _ships with zero references to quest tables_;
**2** the ledger (#792–#796), where the legacy dies; **3** the join (#797–#799).

The rule the whole plan rests on: **every change is measured by what it removes.**
Generation two forked because it shipped beside its predecessor and nothing was
ever deleted. If a step cannot delete its predecessor yet, that is the signal it is
not ready to be built — not a reason to build it beside.

## DM Manual

`src/manual/worldbuilding-quests.md`.
