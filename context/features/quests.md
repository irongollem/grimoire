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
- **A route's identity is the beat it leads to, not a caption on the edge.**
  "Killed Ravishin" and "Came to terms with Ravishin" are two beats, not one
  edge wearing two labels — the beat is already the model's own sentence for
  what the fork did (#795).
- **A route's gate and a route's consequence are different facts, and neither
  implies the other.** The gate (`quest_beat_edge_gates`) says whether the
  road is open right now; `quest_consequences.on_edge_id` (#794) says what
  happens if you take it. A route can have either, both, or neither.
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

## Today: two generations, now meeting at a computed root

Nothing here is broken code. It is two coherent designs built four months apart
that were never asked to fully agree — though the seam between them lost its
sharpest special case in #793.

|        | Generation one — the quest sheet                             | Generation two — the story flow                                                                                                         |
| ------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Shape  | a record with a checklist                                    | a graph you run a cursor through                                                                                                        |
| Tables | `quests`, `quest_objectives`, `quest_refs`                   | `quest_beats`, `quest_beat_edges`, `quest_beat_attachments`, `quest_runtime_state`, `quest_beat_transitions`                            |

`quest_consequences` / `quest_consequence_events` (#794) belong to neither generation — they are the one rule engine both now share, see below.

**The opening beat, not a bridge.** Every quest used to own exactly one
`is_overview` beat, minted by an `after insert on quests` trigger and pinned by a
partial unique index, existing only to give generation one's quest-wide material
somewhere to live inside generation two. #793 deleted the whole apparatus: the
insert trigger, `private.protect_quest_overview_beat()`, the partial unique
index, and its exclusions from `search_quest_runtime_jump_targets` and
disconnected-staging prep gaps in `deriveQuestBeatPresentations` alike.

The opening beat is now an ordinary beat — **a graph root, computed rather than
stored.** `rootBeatIds()` in `lib/quests/graph.ts` returns every non-archived
beat with no incoming edge. A quest may legitimately open from more than one
place (the party can pick the thread up at the tavern or the docks) or from
none yet (no beats authored, or a pure cycle) — both are honest answers, not a
bug to paper over with an invented winner.

**Where the two still overlap.** Each of these is a fact with two writable homes
and no rule about which wins:

| Generation one holds                         | Generation two also holds                                                            | Reconciled by                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `quests.reward_*` (coins, pools, items, art) | `loot_placements` rows with `source_type = 'quest_reward'`                           | **resolved by #799** — the quest-level columns are dropped; `loot_placements` (renamed from `quest_beat_loot` by #830, when rooms gained the same verb) is the only home |
| `quest_refs`                                 | `quest_beat_attachments`                                                             | a trigger syncs attachment → ref; nothing syncs back, and removing a placement leaves the ref |

`quest_triggers` (fired _from_ an objective) and `quest_objective_effects` (fired _to_ one)
were this table's third row until #794: two ends of one idea, reconciled by merging both into
`quest_consequences` — see "one rule engine" in the data model below.

`quests.summary` is the one quest-wide field the model keeps on the quest row on
purpose: a premise is identity, like title and tags, and no beat field means
"premise." #793 gave it its own editor in `QuestOverviewMetadata`, alongside
title/status/giver/location/parent/tags/sharing — it was write-once at creation
before that. `quests.description`/`.notes` are gone outright; the same prose is
now the opening beat's `dm_content`/`how_it_plays`, moved once by #793's
migration and never duplicated again.

**Dead residue — all of it swept by #799.** `quests.flow_enabled_at` was
`NOT NULL DEFAULT now()`, so it was always set: a dead opt-in flag, non-null on
20 of 20 production rows, and the epic's own worked example of a parallel period
with no expiry. `quest_beats.conversion_source_type` / `_id` and their partial
unique index outlived `convert_quest_to_flow`, `preview_quest_flow_conversion`
and `rollback_quest_flow_conversion` (shipped in `20260810000016`, dropped the
same day by `20260810202052`); dropping them lost provenance on 37 beats, which
is a real if small cost taken deliberately. `quest_ref` — a beat pointing at a
pointer, admitted by the CHECK and offered by no UI — went too, at zero rows.
`supabase/tests/quest_flow_conversion.test.sql` survives, trimmed to the three
`hasnt_function` assertions that pin those RPCs staying gone.

### An objective appears in two surfaces that once disagreed, and a third that used to

| Surface              | Component                                                                    | What it says an objective is                                                                    |
| --------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| A checklist you tick | Inline in `QuestOverviewLifecycle.vue` (Overview › Quest lifecycle)          | a to-do the DM asserts via `assert_quest_objective_status` — the mark cycles dormant → pending → complete → failed |
| A rule you author    | `QuestConsequencesPanel.vue`, `scope="beat"` (beat inspector, beat page) and `scope="quest"` (quest overview) | one `quest_consequences` row: a beat/edge condition (beat scope) or an objective-became/quest-settled condition (quest scope), doing one of the four ledger verbs or the two world actions alike |

Until #794 the second row showed only _reveal / complete / fail_ and no status at all —
`quest_objective_effects` couldn't raise a dormant objective or watch one settle. One
table now backs both surfaces' writes, so a beat and the overview checklist can no
longer disagree about what "complete" means, only about _when_ it fires.

A third surface used to exist: `attachment_type = 'objective'` on
`quest_beat_attachments` was a live, addable pointer meaning only "relevant
here," backfilled onto every overview beat once and never synced since. #793
dropped `'objective'` from the attachment CHECK and from the player
projection along with the overview beat it was backfilled onto — one fewer
place an objective's meaning could disagree with itself.

---

## Data model

### `quests`

`title`, `status` (`quest_status_enum`: `undiscovered`, `rumor`, `active`,
`completed`, `failed`), `summary`, `giver_npc_id`, `location_id`,
`parent_quest_id` (sub-quests, no depth limit), `tags`,
`player_visible_to uuid[]` (null = never shared), `started_at` / `resolved_at`
(**`started_at` is never written by anything**), `ai_provenance`.

`description`/`notes` are gone (#793) and the whole `reward_*` family with
`flow_enabled_at` went in #799 — loot is an event, so it belongs to the beat
that grants it.

**`summary` stays, and is now constrained rather than merely intended.** A
premise is quest-level identity: it is the blurb that tells you what a quest is
without opening it, and it appears on the DM quest card, the kanban board, the
player's quest-log card, the player's quest page, and quest search. No beat field
means "premise", and a list card cannot render a graph.

It survived the manifest's deletion line on evidence: 19 of 20 production quests
have one, and the two DMs other than the owner filled it on **every** quest they
made, at 59 and 32 characters — one sentence each. It is the one field every DM
fills, including the two who never authored a beat.

But the intent lived only in a placeholder, a prompt row and a comment, and it
had already regressed — one row held five sentences, because the importer capped
it at the same 600 characters it uses for a character backstory. So #799 added
`quests_summary_is_one_line CHECK (char_length(summary) <= 280 and summary !~
E'[\n\r]')`, with `QUEST_SUMMARY_MAX` shared by the CHECK, the inputs and the
importer. **It is player-facing and rendered raw** — never put a DM secret in it.

Carries `unique (id, campaign_id)` — the composite every beat-side FK targets.

### `quest_objectives`

`description`, `sort_order`, `is_player_visible`, `status` (`dormant` |
`pending` | `complete` | `failed` — `dormant` added by `20260905101454`, #792:
a branch the party has not been sent down yet, not derived, refused paired
with `is_player_visible`). `is_done` was dropped in `20260818212305` after
backfilling `status`; the cycle lives in `lib/quests/objectives.ts`.

**`status` has exactly one writer since #794:** `assert_quest_objective_status`.
A column-level grant revokes it from a plain client `UPDATE` (`description`,
`sort_order` and `is_player_visible` still go straight through PostgREST) —
`transition_quest_runtime` is the only other writer, and both funnel through
`private.apply_quest_consequences` so a status change can never bypass the
consequence engine watching it.

### `quest_beats`

`title` (non-blank, enforced), `dm_content`, `rumor_text`, `reveal_text`,
`visibility` (`hidden` | `rumored` | `revealed`), `kind` (**open text, not an
enum** — conventionally `combat` / `social` / `explore` / `discovery` / `neutral`,
plus the tombstone `archived`), `presentation_hint`, `canvas_x/y`,
`is_improvised`, `improv_reviewed_at`, `read_aloud`, `how_it_plays`, `outcomes`,
`consequences`, `conversion_source_type/_id`.

`kind` still does two jobs at once: a presentation hint, and an `archived`
tombstone every runtime query has to filter out. It used to do a third — an
`overview` marker redundant with the `is_overview` boolean — until #793 retired
both: `kind = 'overview'` rows became `neutral`, and the opening beat is a
computed graph root instead of a stored marker (see "The opening beat, not a
bridge" above).

**Beats have no ordering column.** Author order is `canvas_x/y`; player order is
`story_order`, the longest path from a root, computed in a recursive CTE inside
`get_player_visible_quest_beats`.

### `quest_beat_edges`

`source_beat_id`, `target_beat_id`. Self-links forbidden; unique on
`(quest_id, source_beat_id, target_beat_id)` since `20260906083403` (#795) — one
route per pair, full stop, now that there is no label left for a second edge to
differ on. "Killed him" and "spared him" are two different target beats, not
two labels on one pair. Cycles are valid, and `lib/quests/graph.ts` is
cycle-safe. Also carries `unique (id, quest_id, campaign_id)`, the composite
`quest_beat_edge_gates` targets.

`label` (DM-only free text) was dropped by the same migration. Production had
44 edges and only 5 labels, none of which named an outcome — they named how a
fork got decided at the table ("1-5 on a d6," "Agree"). The five were carried
onto the source beat's `outcomes` field (already rendered above the branch
cards in `QuestRunBeatCard.vue`); the other 39 forks needed no text because the
target beat's title already was the outcome.

### `quest_beat_edge_gates` — whether a route is open (#795)

One optional row per edge: `objective_id` + `status` (`pending` | `complete` |
`failed` — the same set `quest_consequences.on_objective_status` uses, and for
the same reason `dormant` is excluded: a route gated on an objective the party
has never been given would never open). The route is open while the named
objective stands in that status; **absent means always open**, not a default —
every one of the 13 production forks would leave this unset today, since every
one is still decided at the table.

A child table rather than two columns on the edge, so that removing the
objective can drop the gate and keep the route via a plain FK cascade — a
`set null` on two columns would need a trigger to do the same thing without
leaving `status` dangling. RLS is a single `private.is_campaign_dm(campaign_id)`
policy, `for all`, so the client reads and writes it directly with no RPC.

**Enforced inside `transition_quest_runtime`'s `advance` branch, not only drawn
in the cockpit.** A closed route raises `23514`, naming the objective, the
required status, and the current one — so a route the ledger says is shut
genuinely cannot be advanced through. Jump remains the deliberate override; it
already demands a reason and does not consult the gate at all.

`get_quest_runtime_context`'s `outgoing` entries carry `gate` (the same four
fields joined server-side: `objective_id`, `objective`, `required_status`,
`current_status`, `is_open`, or `null`) and `effects` (`quest_consequences`
rows keyed by `on_edge_id`, read rather than duplicated — see #794 above).
Build mode joins the same shape client-side, in
`lib/quests/gates.ts#deriveQuestRouteGates`, against `useQuestObjectives` —
`QuestBeatEdge.gate`/`QuestRuntimeChoice.gate` are typed identically
(`QuestRouteGate`) so both surfaces read the same fields.

### `quest_beat_attachments`

Typed placements: `encounter`, `quest_ref`, `npc`, `faction`,
`item`, `monster`, `sound`, `audio_scene`, `playlist`, `note`, `handout`.
Polymorphic `ref_id text`, validated by
`private.validate_quest_beat_attachment()` rather than an FK. `'objective'` was
a member of this CHECK until #793 dropped it along with the overview beat it
was backfilled onto (see above).

`'location_set'` was a member of this CHECK until #797 replaced it with
`quest_beats.staged_at_location_id` (below). It carried `metadata.room_ids`, a
jsonb array of descendant ids with no ordering, no per-room state and no
per-room material binding — and the validator only checked that each room
_existed_, never that it sat inside the root. Production held **zero** non-empty
`room_ids` arrays across every attachment type for the whole life of the
feature.

`quest_ref` is allowed by the CHECK but deliberately absent from the panel's
`supportedTypes`, so it cannot be created from the UI.

### `quest_beats.staged_at_location_id` — where a beat happens

A beat is an event, and an event happens somewhere. That "somewhere" is a
nullable uuid column with an FK to `locations` and `on delete set null`, so
losing a place unstages its beats instead of taking them with it (#797).

**Singular on purpose.** A beat is one event in one place; a scene spanning two
places is two beats. The evidence: of the ten `location_set` rows production
ever held, nine were written by `backfill_quest_story_flows` at one identical
microsecond onto overview beats, and exactly one was authored by a person — one
beat, one place. Every apparently-plural beat was a former `— overview` beat,
which stood for a whole quest and so accumulated everything the quest touched.

**Not restricted to sites**, despite the story's title. Production stages beats
at two towns and a lake as well as at dungeons, buildings and a store. Being a
site is what unlocks the run surface — a capability of the place, not a
precondition for naming it; `bindableSpaces()` draws that line.

`private.guard_beat_staging()` enforces campaign scope on insert and update,
with the same predicate every arm of the attachment validator uses: the location
is campaign-scoped to this campaign, or it is personal content belonging to the
writer or to the campaign's owner. A foreign key proves a location exists, not
that this campaign may see it.

`transfer_campaign_ownership` follows staging when a campaign changes hands, and
clones **the staged place and everything beneath it** — the old attachment only
cloned rooms that happened to be listed in `room_ids`, so a room the DM forgot
to list stayed behind with the previous owner.

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
`pause`, `resume`, `end`, and `assert` (#794 — the DM saying "this already
happened" via `assert_quest_objective_status`, with no cursor movement: a
quest and no beat, the one shape that kind of row is allowed). Denormalised
title snapshots so history survives edits. No UPDATE/DELETE policies, and both
are revoked from `authenticated`/`anon`.

### `loot_placements` — what a beat or a room *holds* (#830)

Renamed from `quest_beat_loot` when a site room gained the same verb. Keyed by
**where**: `beat_id` + `quest_id` (set together) **or** `location_id`, exactly
one, enforced by `num_nonnulls(beat_id, location_id) = 1`. A room-homed row
carries no quest at all.

**Do not merge this into `quest_consequences`.** They are the same shape at a
glance and three measurable things apart:

| | `loot_placements` | `quest_consequences` |
| --- | --- | --- |
| fires from | a **human**, at a moment the graph cannot see | the **engine**, on a condition |
| how often | **once ever** (`dispatched_at`, immutability trigger) | **once per transition** |
| needs the runtime | no — `dispatch_loot` checks only `is_campaign_dm` | yes — `transition_id` is NOT NULL |

The tell that the split is real rather than arbitrary: those axes put a *room's*
loot on the loot side without being asked. The verbs are **holds** and **does** —
a beat *holds* loot the way a chest does, and *does* consequences. Do not build a
combined "Outcomes" surface over the two: a single heading is exactly how the
next reader notices loot is missing from the action enum and adds `drop_loot`
for consistency.

Dropping a room's loot **is** looting the room — `dispatch_loot` appends the
`looted` fact itself. One way only: a drop implies looted, never the reverse,
since a DM narrating an empty room may still mark it looted by hand.

**Client side.** `useLootPlacements({ questId?, locationId? })` in
`useQuestFlow.ts` is the one read composable for both homes — an optional
filter object, not a positional quest id, since #830 gave it a second
independent dimension to narrow on; pass neither for the whole campaign
(`useQuestBoardSummaries`). `useCreateLootPlacement` / `useDeleteLootPlacement`
/ `useDispatchLoot` are likewise home-agnostic: every mutation carries its own
`campaign_id`, so nothing in the data layer needs to know which home it is
looking at.

The **entries list** (status, claim detail, Drop/Remove, "Open chat card") is
`LootPlacementList.vue` — extracted out of the beat panel when the room panel
needed the identical list, because every action on a row authorises off that
row's own `campaign_id` rather than a beat or a room, which is what made the
extraction sound rather than a props-driven guess. It emits `dropped` after a
successful dispatch so a location-homed caller can invalidate its own
`location_state` cache; the component itself has no idea what a room is.

What stays **per-surface** is the "prepare a new entry" form, because the two
homes do not offer the same kinds: `QuestBeatLootPanel.vue` offers item and
currency only (a beat's chest loot arrives via `source_type = 'encounter_loot'`
from the encounter resolver, never authored by hand here); `LocationLootPanel.vue`
(world-building.md, "Loot" on a room) additionally offers rolling a loot table
into a held `loot_chest` — `source_type = 'loot_table'` — reusing
`rollLootTable()` and the `LootChestAtom`/`LootChestMetadata` shapes the
direct-to-chat `LootTableRollPanel` already established, but holding the roll
in `loot_placements.payload` instead of posting it immediately. That is a
difference in kind, not a few prop values, so the two forms are separate files
rather than one component branching on a home type.

### `quest_consequences` and `quest_consequence_events` — one rule engine (#794)

One rule: **when this becomes that, do this.** Replaces `quest_objective_effects`
(beat/edge → ledger verb) and `quest_triggers`/`quest_trigger_scheduled`
(ledger/settled → world action), which never composed — a beat could complete
an objective, but nothing then watched that completion to fire a calendar
event.

`quest_consequences` is the rule: exactly one **condition** (`on_beat_id`,
`on_edge_id`, `on_objective_id` + `on_objective_status` ∈
`pending`/`complete`/`failed`, or `on_quest_settled`), an **`after_days`**
delay, and an **`action`**:

| action | kind | needs |
| --- | --- | --- |
| `raise` `reveal` `complete` `fail` | ledger verb | `target_objective_id` |
| `create_calendar_event` `send_broadcast` | world action | `action_payload` |
| `shift_npc_relationship` (#831) | world action | `target_npc_id` + `action_payload.step` |
| `unlock_quest` (#836) | world action | `target_quest_id` |

Authored by `QuestConsequencesPanel.vue` — `scope="beat"` on a beat authors the
first two condition kinds, `scope="quest"` on the overview authors the last two.

**The family is "outcomes", not "rewards", and the word matters.** A reward is
positive by construction; a relationship shift is *signed* — charm the lady and
it goes up, embarrass yourself trying and it goes down. Framing the family as
rewards quietly excludes half the cases a DM needs (the guild has marked you,
the shrine is now watched). The corollary is the rule of thumb behind both new
actions: **a free-text field is what you reach for when the system has no verb
for the thing.** "This NPC now helps you" only felt like prose because there
was no action for it — and `npc_relationship` was sitting right there. Ask the
same question of the next one (a faction's standing, a shop's stock) before
adding a `notes` column.

**Two decisions inside `shift_npc_relationship` that look arbitrary and are
not.** It clamps at both ends rather than wrapping or raising, so a rule firing
on an already-`helpful` NPC is a no-op. And `unknown` is skipped entirely: it is
a member of `npc_relationship` but **not a rung on the ladder**, so shifting
from "we have not established this" is meaningless and mapping it to
`indifferent` would invent a stance the DM never set. Every path either shifts
and records `previous_relationship`, or does neither — so undo has a value to
restore or nothing to do, and nothing downstream reads a NULL and guesses.

**`unlock_quest` promotes `undiscovered` → `rumor` and nothing else.** That was
the one rung with no trigger: arrival already moves `rumor` → `active`, but
nothing moved a quest *out* of `undiscovered` except a DM editing it. It
promotes to `rumor` rather than `active` because the party has *caused* the
sequel, not met it. Undo restores the previous status **only if the quest is
still `rumor`** — a party that has since picked it up must not be yanked back
into hiding by an unrelated step-back.

**`unlock_quest` deliberately leaves `parent_quest_id` alone.** "Unlocked by"
and "child of" are different relations: one trigger can legitimately open both a
sequel *and* something unrelated, which is exactly what the maintainer's own
campaign does. Merging them would make every unlocked quest a child of its
trigger, and that is very hard to undo once data exists.

`quest_consequence_events` is the append-only log every rule fires into:
`private.apply_quest_consequences` runs it from both `assert_quest_objective_status`
and `transition_quest_runtime`, in the same transaction as the write that made
the condition true — which is what lets `previous` undo a rule's effect by
replaying the event's `previous_status`/`previous_is_player_visible`, and by
handle (`calendar_event_id`, `message_id`) for a world action.

**The database cannot compute a delayed action's due date itself.**
Per-calendar leap and intercalary rules live only in `src/lib/dayMath.ts`
(#766), and a plpgsql port would be a fifth copy. So a delayed row
(`after_days > 0`) is logged with `fires_on_year/month/day` and left
`performed_at is null`; the client decides `fires_on + after_days` has
arrived and calls `perform_quest_consequence(event_id, year, month, day)` to
perform it. `useDueConsequences` (mounted once in `DefaultLayout.vue`) is the
one place that watches for that — a watcher on the campaign store's own today
fields, not on any one "set today" call site, closes the bug where aging a
campaign forward from `DetailsTab`'s "Current Year" field fired nothing.

A ledger verb applies **immediately** regardless of `after_days` — only the
two world actions are ever deferred; `perform_quest_consequence` does not
know how to perform a ledger verb. `after_days` on a ledger-verb row is
authored intent, not (yet) an enforced wait.

### The rest

`quest_refs`.

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

- **Overview** — `QuestOverviewPanel` → metadata (title, premise/`summary`,
  status, giver, location, parent, tags, sharing — one autosaved editor per
  field), then either a "Write the opening beat" empty state (no beats yet) or
  a read-only list of the graph's root beat(s) linking into Work, then
  lifecycle (objectives, consequences, sub-quests, calendar). A beat's own
  content is edited in exactly one place — the Work-tab inspector or
  `QuestBeatDetailView` — never here; this surface no longer embeds a second
  beat editor (it did, for the `is_overview` beat, before #793).
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

**The cockpit** (`QuestRunCockpit`, #820) expresses three concerns rather than
one long form: `QuestRunSitePanel` (where the party physically is — a compact
sibling of `SiteRunSurface`, reading `campaigns.current_location_id` directly
rather than the running beat's `staged_at_location_id`, because where the party
*is* is a fact about the world, not about the quest currently running — the two
legitimately differ, and the panel shows where the party stands), the beat card plus a rail
(`QuestRunObjectivesLedger`, `QuestRunPath`, `QuestRunOpenChains`), and
`QuestRunOutcomeStrip` — one card per outgoing route plus "Something else…"
(improvise, opening inline in the same column via `v-model:improvise-open`
rather than a separate panel). The strip is docked to the bottom of the rail
column with `mt-auto` inside a stretched grid row — **in normal document
flow, never `sticky` or `fixed`** — which is the #776 fix and the reason it
must not regress back into a floating bar. `QuestRunControls` now holds only
the session-wide commands an outcome strip doesn't own: Previous, Jump,
Pause/Resume, End — also unsticky, in flow. The jump panel and the contained
tool overlay still render in flow above these. Runtime context, live chains
and runtime state all poll at 5s; every command carries `expectedVersion`.

Clicking a room in `QuestRunSitePanel` moves the party and marks it explored
in the same click SiteRunSurface uses (one write to
`campaigns.current_location_id`; the arrival trigger does the rest) — no
reason prompt, and nothing written to `quest_beat_transitions`. That is the
whole distinction the epic is named for: walking around a dungeon is not a
story transition, and only `QuestRunOutcomeStrip`'s Choose or `QuestRunControls`'
Jump ever move a quest's cursor.

`QuestRunContainedTool` opens an attachment in place: encounters embed
`EncounterRunSurface`, audio calls the Soundboard, objectives get a next-status
button, notes and handouts render their bodies.
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
summary, **`PlayerQuestStoryThread`** ("Story so far"), visible objectives with
a progress count, rewards, visible refs, and a `PlayerNotesWidget`. It used to
also show `quest.description` — a DM-authored field with no visibility gate of
its own — until #793 removed the column; the story thread is the player
projection now, and it is already visibility-gated per beat.

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
`dispatch_loot`, `get_loot_placements` (renamed from `dispatch_quest_beat_loot` /
`get_quest_beat_loot` by #830 when rooms gained the same verb — see
`loot_placements` above), `get_player_visible_quest_beats`,
`get_player_visible_quests`, `assert_quest_objective_status` (#794 — the DM
asserting a status with no cursor movement), `perform_quest_consequence`
(#794 — performs one already-logged, delayed world-action event on a date the
client computed; see "one rule engine" above) and
`get_player_visible_site_state` (#798 — the inside of a site as the party knows
it; see below).

**Two of these changed in #798.** `get_player_visible_quest_beats` now also
returns `staged_at_location_id`, populated **only for revealed beats** — a
rumored beat's staging would pin a scene on the player's map before they have
had it. Players have no other route to that column: `quest_beats` carries one
policy, `quest_beats_dm_all`, and it is DM-only. That projection also shed a
dead `location_set` attachment arm that #797 left behind when it deleted the
type — the CHECK, the validator, the rows and the client all lost it, and this
one call site did not, which is precisely the half-deletion this epic exists to
stop.

`get_player_visible_site_state(site_id, preview_party_member_id)` returns one row
per traced region whose space the party has **explored**, with the region's
`cells` and the `cleared`/`looted` facts they established. Unexplored rooms are
absent from the payload rather than flagged in it — filtering on the client would
leave them in the network tab. It checks **both ends** of a region
(`space.campaign_id = site.campaign_id`), because nothing in the schema
guarantees a region's space and site share a campaign; without that predicate a
DM running two tables could show one campaign's rooms to another's players, which
was demonstrated with a working exploit during the #798 audit. See #827 for the
write-side root cause, still open.

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
`generate-quest`. Pro-gated. Produces **exactly 5** hooks — the system prompt says
so, and both the server and the local-key client path load the same prompt row.

Picking one creates the quest, **its story spine**, its objectives and `quest_refs`
for every resolved NPC/location.

### The spine, and its two producers

Until #822 a hook was a paragraph of narration plus a flat checklist. The prompt
had asked for a five-string `objectives` list described as a story arc, which is
a five-beat spine mislabeled — the model had been writing one on every call since
May and the schema had been throwing it away. `20260906175050_rewrite_quest_generator_prompt.sql`
rewrote it to ask for what the schema can actually hold: `beats`, `routes` between
them by key, and `objectives` carrying `raised_by`.

**`raised_by` is the point of it.** An objective named by the opening beat lands
`pending`; one named only by a later beat lands `dormant`, because the party has
not been sent down that branch yet. An unwired objective lands `pending`
conservatively, so a hole in the model's output never hides a goal from the DM.

The planning is pure and lives in `src/lib/quests/spine.ts` — it treats the
response as untrusted and *degrades* rather than throwing: blank keys, dangling
routes, duplicate pairs and unknown kinds are dropped. **Nothing is ever
manufactured.** A response with no usable spine creates no beat at all; a
fabricated "Opening beat" would let the generation-one shape survive its own
deletion, which is the whole of what epic #780 undid.

The writing lives in `src/lib/quests/spineWrite.ts` (#829), which takes its four
mutations as injected deps because there are now **two producers**:

| Producer | Gets its mutations from | Fills `read_aloud`? |
| --- | --- | --- |
| `useCreateQuestFromHook` (this generator) | TanStack mutations | No — invented prose has no boxed text |
| `DocumentImportWizard` (#829, pasted adventure page) | plain Supabase inserts | Yes — a published page marks its boxed text |

Three behaviours in there look arbitrary and are not: beats are created
**sequentially rather than `Promise.all`** (`canvas_x` reads left-to-right in story
order, and a mid-sequence failure must leave the earlier beats behind instead of
losing all of them to fail-fast); the beat/route block is **best-effort** inside a
`try/catch` (a partly wired spine must not undo a quest that already landed); and
routes and consequences are filtered to keys that actually landed.

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
