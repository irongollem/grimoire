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

### Threads, parallel routes and payoff (#850)

A quest held exactly one cursor for as long as generation two existed, and a
route could only ever mean "go here instead of there." The Quest Manager
Redesign (`Quest Manager Redesign.html`, frame `01 Delta`) names the three
places that broke down at the table: a quest can only hold one cursor, a route
cannot say "and also," and a payoff is split across two panels that don't know
about each other. This is additive to the model above — a beat is still an
event, an objective is still state — the fix is that a story can now run more
than one cursor through that same ledger at once.

- **A quest holds N live cursors.** Each is a **thread** (`quest_threads`) —
  its own `quest_runtime_state` row, its own place in the story. A quest is
  born with one, "Main"; a parallel route or the thread bar's "Open a thread"
  opens another. Nothing closes a thread silently: the DM does it, from the
  Threads panel, the thread bar, or the cockpit.
- **A route's `route_kind` says whether it forks or forks off.** `choice`
  moves the cursor and strands every sibling choice, the same as before.
  `parallel` spawns a new thread at its target and leaves the current thread's
  cursor exactly where it was — the layer appears without abandoning the tree.
  Gates apply to both kinds alike. The invariant the composer enforces: **a
  parallel route may never be the only way out of a beat** — a beat needs a
  choice route before it can afford to spend one on a parallel.
- **A beat's `converge_mode` says how it receives several threads.** `any`
  (the default, and every beat's behaviour before this epic) lets every
  arriving thread proceed on its own. `all` parks each arriving thread
  (`waiting`) until every one of the beat's authored incoming routes has been
  walked by a live or waiting thread, then merges them into the earliest
  arrival and fires the beat's arrival rules exactly once.
- **A payoff can be held instead of fired.** The Advance dialog lets the DM
  untick a consequence before submitting; a held rule still logs its event
  (`held_at` set) but performs nothing, and sits in the cockpit's Held payoff
  panel and the quest card's "Held payoff — not yet fired" until the DM fires
  it from the log.
- **Three verbs the system had no word for, so knowledge, favours and
  milestones stopped living as prose in `outcomes`:** `grant_knowledge` writes
  a shared `player_journal_entries` row (category `discovery`) — the party
  journal the players already read; `owe_favor` writes `npc_favors`, pinned to
  the NPC; `award_milestone` writes `party_milestones`, on the party screen,
  announced to the table by the same broadcast the engine already fires. Same
  table (`quest_consequences`), same delay, same event log, same undo as every
  other verb.

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

|        | Generation one — the quest sheet           | Generation two — the story flow                                                                              |
| ------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Shape  | a record with a checklist                  | a graph you run a cursor through                                                                             |
| Tables | `quests`, `quest_objectives`, `quest_refs` | `quest_beats`, `quest_beat_edges`, `quest_beat_attachments`, `quest_runtime_state`, `quest_beat_transitions` |

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

**A quest also _declares_ its entry (#871, `20260909194207`).** The computed
roots answer "where could the party come in"; they do not answer "where does
the story begin," which the DM knows at prep time and has forgotten by the
table — the cockpit's "Choose a starting beat…" dropdown was the maintainer's
own complaint ("instantly confuses me when I prepped a while ago and forgot
the names"). `quests.entry_beat_id` is that answer: a composite FK onto the
quest's own beats, **defaulted by the database** — `private.settle_quest_entry_beat()`
sets it to the first beat written and reassigns it when the entry is archived
or deleted (roots first, oldest first, the oldest beat when the graph is a
pure cycle), so the generator, the paste import, the hook path and the starter
all get it without being taught. `private.guard_quest_entry_beat()` refuses a
tombstone. It is null only while the quest has no beats at all — legacy data:
`QuestFlowStarter` now writes the rumor beat together with the quest — titled
"The rumor", `visibility: rumored`, because "rumor" is a visibility state and
not a `kind`: the player journal already says a rumour is circulating before
`rumor_text` is written (`hasSomethingToShow`, `playerThreads.ts`). The DM moves it from the overview's **Opens at** field; the story flow
marks the node with an "Entry" chip; the overview's "Opens at" block lists it
first, before the other computed roots. The roots stay as the fallback and as
the override picker's ranking.

**A bridge names where the party comes in.** An `unlock_quest` rule carries
`quest_consequences.entry_beat_id`, a composite FK onto the _target_ quest's
beats (null = the target's own entry) — "Enters at" on both authoring
surfaces, preselected to the target's entry. A sequel entered sideways through
a bridge starts at the beat the bridge lands on, not at its own rumor. The
cockpit reads it from the event log rather than from new state on the quest:
the most recent performed, un-undone `unlock_quest` event targeting the quest
names the rule, and the rule names the beat (`useQuestUnlockEntry`). See **The
run cockpit** for the start order. Neither column is nesting: `parent_quest_id`
stays what it was.

**Where the two still overlap.** Each of these is a fact with two writable homes
and no rule about which wins:

| Generation one holds                         | Generation two also holds                                  | Reconciled by                                                                                                                                                            |
| -------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `quests.reward_*` (coins, pools, items, art) | `loot_placements` rows with `source_type = 'quest_reward'` | **resolved by #799** — the quest-level columns are dropped; `loot_placements` (renamed from `quest_beat_loot` by #830, when rooms gained the same verb) is the only home |
| `quest_refs`                                 | `quest_beat_attachments`                                   | a trigger syncs attachment → ref; nothing syncs back, and removing a placement leaves the ref                                                                            |

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

| Surface              | Component                                                                                                                                                                                                                     | What it says an objective is                                                                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A checklist you tick | Inline in `QuestOverviewLifecycle.vue` (Overview › Quest lifecycle)                                                                                                                                                           | a to-do the DM asserts via `assert_quest_objective_status` — the mark cycles dormant → pending → complete → failed                                                                                                      |
| A rule you author    | `QuestPayoffPanel.vue`'s quick-adds (beat scope, beat page) and `QuestRulesPanel.vue` (quest scope, quest overview — this row's component was `QuestConsequencesPanel.vue` before the Quest Manager Redesign split it in two) | one `quest_consequences` row: a beat/edge condition (beat scope) or an objective-became/quest-settled/location-fact condition (quest scope), doing one of the four ledger verbs or one of the seven world actions alike |

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

### The ledger was written by hand, not extracted (#834, 9 Sep 2026)

#821 and #832 asked for an AI pass that proposes objectives, rules and gates
from a quest's prose — split in two, since 14 of 19 production quests had no
routes at all. Re-measuring one day after epic #850 deployed gave the same
shape: 44 routes in five quests, one rule in the whole database, no gates.
Two facts closed the ticket instead of building it: **every multi-beat quest
belongs to the owner** (the three from any other account have one beat and no
objectives each), and **nothing was AI-generated or imported** — the unwired
seven-beat quest is an artefact of the checklist era, not a shape a quest born
under #850 takes. So the ledger was written in one session, quest by quest,
with the DM pre-approving the batch: 10 routes to give the four spineless
quests a spine, 4 objectives the prose implied, 89 rules, and 0 gates. That
pass is also the re-measurement #834 asked for — and it found the dedupe
defect above. The feature is reopened only if a non-owner DM arrives after
launch with unwired multi-beat prose quests; if the manual surfaces make that
rare, the gap does not exist.

### `quests`

`title`, `status` (`quest_status_enum`: `undiscovered`, `active`,
`completed`, `failed` — **`rumor` was retired by #874**; a rumour is a beat's
`visibility`, see `quest_beats`), `summary`, `giver_npc_id`, `location_id`,
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

`entry_beat_id` (#871) — the beat the story begins at; see "A quest also
declares its entry" above. DB-defaulted, so `QuestInsert` omits it and only
`QuestUpdate` carries it. Restore from a campaign backup nulls it, since the
backup format has never carried the beat graph.

Carries `unique (id, campaign_id)` — the composite every beat-side FK targets.

**`campaign_id` is nullable on the column but not in practice, and #596 leaves
it that way.** `useCreateQuest()` already stamped the active campaign before
that story (`campaign.activeCampaignId!`, no caller opt-out) and still does —
so unlike items/spells/species/locations, there was no accidental-global
default to flip here. #596 also asked for a `CampaignScopeField` "available in
every campaign" control on quests, and that part was **not** added: a quest's
entire beat graph — `quest_beats`, `quest_beat_edges`, `quest_runtime_state`,
`loot_placements` — is keyed through composite `(…, campaign_id)` FKs back to
this row, and `get_player_visible_quests` (migration `20260906225258`)
explicitly filters `where q.campaign_id is not null` before every other
predicate — a quest with no campaign can never reach a player, deliberately,
not as an oversight. `fetchQuests` (`useQuests.ts`) matches with a plain
`.eq("campaign_id", campaignId)`, so it would be invisible DM-side too. Adding
a scope toggle here would let a DM pick an option that quietly breaks the
quest for everyone; the fix that made global visible again for locations does
not apply, because here the invisibility is policy, not a missed filter. A
"quest template reusable across campaigns" is a real, different feature — it
would need its own copy-on-attach mechanism, not a shared row with a null
campaign_id — and is out of scope for #596.

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
`is_improvised`, `improv_reviewed_at`, `read_aloud`, `how_it_plays`,
`converge_mode` (`any` | `all`, #850 — see "Threads, parallel routes and
payoff" above). (`conversion_source_type/_id` were here until #799 dropped them
— see **Dead residue** above.)

**`outcomes` and `consequences` are gone (#850).** Both existed because the
system had no verb for knowledge, favours or milestones; it has the verbs now
(`grant_knowledge`, `owe_favor`, `award_milestone` on `quest_consequences`),
so a free-text column that used to carry that prose is no longer needed. The
migration folded each non-blank value into trailing paragraphs of
`how_it_plays`, under a bold "Outcomes" or "Consequences" label, before
dropping the columns — nothing a DM had written was lost, it just moved into
the one prose field a beat still has.

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
onto the source beat's `outcomes` field at the time; that field is itself gone
now (#850, folded into `how_it_plays` — see `quest_beats` above), so the five
strings live in the beat's read-aloud/prose today rather than in a dedicated
field. The other 39 forks needed no text because the target beat's title
already was the outcome.

**`route_kind` and `thread_label` (#850).** `route_kind` is `choice` (default)
or `parallel` — see "Threads, parallel routes and payoff" in the model above.
`thread_label` is the name a `parallel` route gives the thread it opens
("shown to the DM and on the player thread," frame `02 Story flow`'s Selected
route panel); it is null on a `choice` edge. Neither column reopens the
one-route-per-pair question #795 closed: a parallel route is still a single
edge from source to target, it just spawns a thread instead of moving the
existing one.

### `quest_beat_edge_gates` — whether a route is open (#795)

One optional row per edge: `objective_id` + `status` (`pending` | `complete` |
`failed` — the same set `quest_consequences.on_objective_status` uses, and for
the same reason `dormant` is excluded: a route gated on an objective the party
has never been given would never open). The route is open while the named
objective stands in that status; **absent means always open**, not a default —
and still the shape production has: the hand-wiring pass of 9 Sep 2026 (#834,
below) read every fork's prose and gated none of them, because every one is
decided at the table, not by the ledger.

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

`get_quest_runtime_context(campaign, quest, thread)`'s `outgoing` entries carry
`gate` (the same four fields joined server-side: `objective_id`, `objective`,
`required_status`, `current_status`, `is_open`, or `null`), `effects`
(`quest_consequences` rows keyed by `on_edge_id`, read rather than duplicated
— see #794 above), and, since #850, `route_kind`, `thread_label`,
`converge_mode`, `site` and `payoff`/`loot` — see **The runtime** below for the
full shape. Build mode joins the gate shape client-side, in
`lib/quests/gates.ts#deriveQuestRouteGates`, against `useQuestObjectives` —
`QuestBeatEdge.gate`/`QuestRuntimeChoice.gate` are typed identically
(`QuestRouteGate`) so both surfaces read the same fields.

### `quest_beat_attachments`

Typed placements: `encounter`, `npc`, `faction`, `item`, `monster`, `check`,
`sound`, `audio_scene`, `playlist`, `note`, `handout` — eleven, and the CHECK
admits exactly those.
Polymorphic `ref_id text`, validated by
`private.validate_quest_beat_attachment()` rather than an FK. `'objective'` was
a member of this CHECK until #793 dropped it along with the overview beat it
was backfilled onto (see above).

**`check` (#850) carries its own data instead of pointing at a row.** A skill
check ("Insight DC 15 · Contested by Deception") is prepared on a beat and
rolled at the table (the cockpit's `Roll Insight` action, first in the beat
card's action row). Its `ref_id` is the literal string `'check'` — there is no
row to reference — and the actual content lives in `metadata`: `skill`
(required, non-blank), `dc` (required, a numeric string), `contested_by` and
`note` (both optional). `private.validate_quest_beat_attachment()` validates
the shape directly rather than casting `ref_id` to a uuid, because the cast
handler's error message ("must be a valid UUID") would mislead for a DC.

`'location_set'` was a member of this CHECK until #797 replaced it with
`quest_beats.staged_at_location_id` (below). It carried `metadata.room_ids`, a
jsonb array of descendant ids with no ordering, no per-room state and no
per-room material binding — and the validator only checked that each room
_existed_, never that it sat inside the root. Production held **zero** non-empty
`room_ids` arrays across every attachment type for the whole life of the
feature.

`quest_ref` was allowed by the CHECK and offered by no UI — a beat pointing at a
pointer. #799 removed it at zero rows; see **Dead residue** above.

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

**Since epic #868 (S12), the column also accepts a room directly — no new
column, because `staged_at_location_id` already took any location and a room
_is_ one.** `QuestBeatSitePanel`'s "Opens at" row is what this actually buys:
staging a beat at a specific room inside a site names the party's entry point,
not merely the dungeon. Every reader that used to assume "staged at a site
means staged at a site-tier location" now resolves the site itself first —
the location if it is already site-tier, else its `parent_id` — before doing
anything with rooms, doors or the map: `QuestBeatSitePanel.vue`,
`QuestGraphDesigner.vue`'s `site · N rooms` fact, `QuestBeatDetailView.vue`'s
staged-site caption, `QuestRunCockpit.vue`'s handoff gate, and
`QuestSiteHandoff.vue` itself all repeat this same one-line resolution rather
than sharing a helper, because each already had its own staged-location read
and the fix is the same three lines everywhere.

`private.guard_beat_staging()` enforces campaign scope on insert and update,
with the same predicate every arm of the attachment validator uses: the location
is campaign-scoped to this campaign, or it is personal content belonging to the
writer or to the campaign's owner. A foreign key proves a location exists, not
that this campaign may see it.

`transfer_campaign_ownership` follows staging when a campaign changes hands, and
clones **the staged place and everything beneath it** — the old attachment only
cloned rooms that happened to be listed in `room_ids`, so a room the DM forgot
to list stayed behind with the previous owner.

### `quest_threads` — one live cursor of a quest (#850)

`id`, `campaign_id`, `quest_id`, `label` (1-80 chars, e.g. "Main", "The
petition"), `status` (`live` | `waiting` | `closed` | `merged`),
`opened_by_edge_id` (the parallel route that opened it, null for Main or a
manually-opened thread), `parent_thread_id`, `merged_into_thread_id`,
`created_by`, `created_at`, `closed_at`. `unique (id, quest_id, campaign_id)`
is the composite `quest_runtime_state` targets.

A quest is born with one thread, "Main" — an `after insert on quests` trigger
(`private.create_quest_main_thread`, mirroring the precedent
`create_quest_overview_beat` set) — so `start` always has a thread to point
at, and every quest that predates this migration was backfilled the same way.
`status` progresses `live` → `waiting` (parked at a `converge_mode: 'all'`
beat, waiting for the rest) → `live` again on merge, or → `closed`/`merged`
when the DM ends it or a converge folds it into another. Nothing here closes
on its own; RLS is a single `private.is_campaign_dm` policy.

`src/lib/quests/threads.ts` is where every surface's letter and tone agreement
lives: `orderThreads` (live/waiting first, then closed, then merged; oldest
first within a group — so the first thread a quest ever had keeps letter A for
as long as it lives), `threadLetter` (A, B, C… wrapping to AA past Z),
`threadTone` (gold/info/arcane by order, wrapping at three), and
`threadBadges`/`threadBadge` that combine them. Every surface that paints a
thread — the story flow's swimlanes and party chips, the cockpit's thread bar,
the quest card's spines, the player journal's columns — reads through this
module rather than choosing a letter or colour locally.

### `quest_runtime_state` — the cursor

PK `(campaign_id, quest_id, thread_id)` since `20260908210320` (#850,
superseding the `(campaign_id, quest_id)` PK #755 gave it): **one cursor per
thread**, because a quest now holds as many live cursors as the story has
open at once — there is no thread-less cursor left. Holds `current_beat_id`,
`visit_stack` (undo semantics — moving forward from a rewound position
truncates), `visit_index`, `return_stack`, `status`
(`idle`/`running`/`paused`/`waiting`/`ended` — `waiting` added by #850 for a
thread parked at a converge-all beat, distinct from `paused`: the story
stopped it, not the DM, and it resumes on its own when the last sibling
arrives) and `version` for optimistic concurrency.

The cursor tracks **narrative position in a chain, not where the party is
standing** — its own migration header says so. Clients have no insert/update/delete
grant; it moves only through the RPCs.

### `quest_beat_transitions` — append-only

`transition_kind`: `enter`, `forward`, `previous`, `jump`, `return`, `improv`,
`pause`, `resume`, `end`, and `assert` (#794 — the DM saying "this already
happened" via `assert_quest_objective_status`, with no cursor movement: a
quest and no beat, the one shape that kind of row is allowed). `thread_id`
(#850) names which thread walked — nullable, because an `assert` row and a
handful of pre-#850 rows carry none. `seq`, a `generated always as identity`
column (#850), is the arrival tiebreak a converge-all merge needs:
`created_at` is the transaction's start time, so two threads that each write
their own arrival transition inside the same wall-clock transaction can share
one exactly (#787 hit the identical shape for `quest_consequence_events` and
fixed it the same way). `private.settle_thread_arrival` orders by `seq`, never
by `created_at`, when it picks which waiting thread survives a merge.
Denormalised
title snapshots so history survives edits. No UPDATE/DELETE policies, and both
are revoked from `authenticated`/`anon`.

### `loot_placements` — what a beat or a room _holds_ (#830)

Renamed from `quest_beat_loot` when a site room gained the same verb. Keyed by
**where**: `beat_id` + `quest_id` (set together) **or** `location_id`, exactly
one, enforced by `num_nonnulls(beat_id, location_id) = 1`. A room-homed row
carries no quest at all.

**Do not merge this table into `quest_consequences`.** They are the same shape
at a glance and three measurable things apart:

|                   | `loot_placements`                                     | `quest_consequences`              |
| ----------------- | ----------------------------------------------------- | --------------------------------- |
| fires from        | a **human**, at a moment the graph cannot see         | the **engine**, on a condition    |
| how often         | **once ever** (`dispatched_at`, immutability trigger) | **once per transition**           |
| needs the runtime | no — `dispatch_loot` checks only `is_campaign_dm`     | yes — `transition_id` is NOT NULL |

The tell that the split is real rather than arbitrary: those axes put a _room's_
loot on the loot side without being asked. The verbs are **holds** and **does** —
a beat _holds_ loot the way a chest does, and _does_ consequences.

**The Quest Manager Redesign overturned the surface half of that guidance, not
the data-model half.** This doc used to say "do not build a combined Outcomes
surface over the two" — and the design built exactly that: `QuestPayoffPanel.vue`
(beat page, frame `03 Inspector`) is one list rendering both a beat's
`quest_consequences` rows and its `loot_placements` rows, because at the table
"what this beat gives" is one question a DM asks once, not two panels to check
separately. What the old warning got right, and what still holds, is the
_tables_: they stay two mechanisms with the three axes above, `derivePayoffRows`
(`src/lib/quests/payoff.ts`) merely reads both and renders one list — nothing
was added to either table's action enum to make this work, and a `drop_loot`
action on `quest_consequences` would still be the wrong fix for the same
reason it always was. See **The beat page** under DM surfaces below.

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
homes do not offer the same kinds: a beat's loot quick-adds (`item` and
`riches`, inside `QuestPayoffPanel.vue`'s eight quick-adds — see **The beat
page** below) offer item and currency only (a beat's chest loot arrives via
`source_type = 'encounter_loot'` from the encounter resolver, never authored
by hand here); `LocationLootPanel.vue` (world-building.md, "Loot" on a room)
additionally offers rolling a loot table into a held `loot_chest` —
`source_type = 'loot_table'` — reusing `rollLootTable()` and the
`LootChestAtom`/`LootChestMetadata` shapes the direct-to-chat
`LootTableRollPanel` already established, but holding the roll in
`loot_placements.payload` instead of posting it immediately. That is a
difference in kind, not a few prop values, so the two forms stay separate
rather than one control branching on a home type.

### `quest_consequences` and `quest_consequence_events` — one rule engine (#794)

One rule: **when this becomes that, do this.** Replaces `quest_objective_effects`
(beat/edge → ledger verb) and `quest_triggers`/`quest_trigger_scheduled`
(ledger/settled → world action), which never composed — a beat could complete
an objective, but nothing then watched that completion to fire a calendar
event.

`quest_consequences` is the rule: exactly one **condition** (`on_beat_id`,
`on_edge_id`, `on_objective_id` + `on_objective_status` ∈
`pending`/`complete`/`failed`, `on_quest_settled`, or — since #869 —
`on_location_id` + `on_location_fact`), an **`after_days`** delay, and an
**`action`**:

| action                                                       | kind         | needs                                                              |
| ------------------------------------------------------------ | ------------ | ------------------------------------------------------------------ |
| `raise` `reveal` `complete` `fail`                           | ledger verb  | `target_objective_id`                                              |
| `create_calendar_event` `send_broadcast`                     | world action | `action_payload`                                                   |
| `shift_npc_relationship` (#831, `to` since `20260908210324`) | world action | `target_npc_id` + `action_payload.step` **or** `action_payload.to` |
| `unlock_quest` (#836, `entry_beat_id` since #871)            | world action | `target_quest_id` + optional `entry_beat_id` of that quest         |
| `grant_knowledge` (#850)                                     | world action | `action_payload.text`                                              |
| `owe_favor` (#850)                                           | world action | `target_npc_id` + `action_payload.text`                            |
| `award_milestone` (#850)                                     | world action | `action_payload.text`                                              |

The three #850 verbs join the family exactly like `shift_npc_relationship` and
`unlock_quest` did: same table, same `after_days` delay, same event log, same
undo. `owe_favor` shares `shift_npc_relationship`'s NPC-pair constraint
(`quest_consequences_npc_pair`) — `target_npc_id` is required for either
action and forbidden for every other one, extended by #850 from a
single-action check.

**A rule's identity is its condition, its action and every target it can
name (`20260909192146`).** The #794 uniques carried `quest_objective_effects`'
key forward — (condition, action, `target_objective_id`) — which was the whole
identity of a rule when every action either moved an objective or carried a
payload. `unlock_quest` and the two NPC actions added targets the key did not
know about, so a beat could open one sequel and move one NPC at most; the
second `unlock_quest` on a real opening beat raised `23505` during #834.
Ledger verbs still dedupe on the objective, targeted world actions on their
target, and the four payload-only actions (`create_calendar_event`,
`send_broadcast`, `grant_knowledge`, `award_milestone`) do not dedupe at all —
two pieces of knowledge from one beat are two rules, and the payload is not an
identity. `supabase/tests/quest_consequence_dedupe.test.sql` pins all three.

**Authored on two surfaces now, since the beat scope moved.** A beat/edge
condition (`on_beat_id` or `on_edge_id`) is authored from the beat page's
Payoff list (`QuestPayoffPanel.vue`'s quick-adds — see **The beat page** under
DM surfaces) rather than a standalone editor. An objective-became or
quest-settled condition (`on_objective_id`/`on_objective_status`, or
`on_quest_settled`) is still authored from the quest overview, in
`QuestRulesPanel.vue` — the component this doc used to call
`QuestConsequencesPanel.vue`, before the Quest Manager Redesign folded its
`scope="beat"` half into the Payoff list and left it with exactly one scope
(so the `scope` prop and its beat-only branches are gone, not kept as dead
code paths). Both surfaces still share the same action half: the four ledger
verbs and the now-seven world actions, plus the delay field. A location-fact
condition (below) is authored on the same quest-overview surface as
objective-became and quest-settled, in `QuestRulesPanel.vue` — a place is not
scoped to one beat, so it has no home on the beat page's Payoff list.

**A place's fact is a fourth condition family (#869), closing the frame-15
line #868 deferred: "Cleared can satisfy an objective — a durable Cleared
assertion on a room is a world fact with provenance. An objective may watch
for it, which is the honest version of 'the DM ticks the box twice'."**
`on_location_id` + `on_location_fact` fires the same rule engine, watched by a
trigger on `location_state_events` (`private.fire_location_fact_consequences`,
migration `20260909140236`) rather than authored inline like a beat/edge
condition, because nothing about arriving at a beat or taking a route asserts
a location fact — that only ever happens through the room/door state log
(`mark_arrival_explored`, `dispatch_loot` recording `looted`, or the DM
directly). Three decisions, all in the migration header:

- **Only a `true` assertion fires.** Taking a fact back ("no, not looted after
  all") never un-completes an objective — undo on the ledger is the DM's own
  act, as it is for every other consequence.
- **Only a location fact fires.** A door fact (`unlocked`, `found`) is play
  state of a way out, not of a place, and can never populate this pair.
- **Only the campaign's ACTIVE quests fire.** A fact asserted while a quest is
  undiscovered, a rumour, or already over is not retroactive; when the quest
  later becomes active the rule simply waits for the next assertion, which is
  what "watch" means.

One assert transition per (state event, quest) — the same shape
`assert_quest_objective_status` already uses for a ledger write outside any
beat — gives `quest_consequence_events` its dedupe key and provenance, exactly
as every other condition family does.

**The family is "outcomes", not "rewards", and the word matters.** A reward is
positive by construction; a relationship shift is _signed_ — charm the lady and
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

**The absolute form, `to` (`20260908210324`).** The maintainer's example of
the reward a table actually hands out is "indifferent to helpful" — a stance
_stated_, which a signed step cannot say, and which the step form silently
skipped whenever the NPC still sat at the default `unknown`. `action_payload.to`
names one of the five rungs (never `unknown`); it applies from any stance,
`unknown` included, and records the previous value so `previous` restores
it exactly. Both forms stay: two beats that each nudge the same NPC still
compose through `step`, which "set to helpful" cannot do. A CHECK on
`quest_consequences` pins the payload to one shape or the other, coalesced
on both arms because a payload with neither key made each comparison NULL
and a NULL check passes. The one option list both authoring panels offer
(`RELATIONSHIP_SHIFT_OPTIONS`, `src/lib/quests/consequences.ts`) puts the
five stances first and defaults to "Becomes friendly".

**`unlock_quest` promotes `undiscovered` → `active` and marks the target's
entry beat `rumored` if it was hidden.** That was the one rung with no
trigger: nothing moved a quest _out_ of `undiscovered` except a DM editing it.
It used to promote to a quest-level `rumor` lane, "because the party has
_caused_ the sequel, not met it" — #874 retired that lane (since the redesign a
quest is undiscovered · active · settled, and rumour is a _beat's_ visibility),
so the same meaning now lives where the model says it does: the quest is
active, and what the party knows of it is the rumoured entry beat the journal
renders as "Rumoured: …". Undo restores `undiscovered` **only if the quest is
still `active`** — one the DM has since settled is not yanked back into hiding
by an unrelated step-back — and does not revert the beat's visibility: a rumour
heard is not unheard, and the DM can hide the beat.

**`unlock_quest` deliberately leaves `parent_quest_id` alone.** "Unlocked by"
and "child of" are different relations: one trigger can legitimately open both a
sequel _and_ something unrelated, which is exactly what the maintainer's own
campaign does. Merging them would make every unlocked quest a child of its
trigger, and that is very hard to undo once data exists.

`quest_consequence_events` is the append-only log every rule fires into:
`private.apply_quest_consequences` runs it from both `assert_quest_objective_status`
and `transition_quest_runtime`, in the same transaction as the write that made
the condition true — which is what lets `previous` undo a rule's effect by
replaying the event's `previous_status`/`previous_is_player_visible`, and by
handle for a world action: `calendar_event_id`, `message_id`, and — since
#850 — `journal_entry_id`, `favor_id`, `milestone_id` for the three new verbs.
Every handle follows the same pattern `calendar_event_id`/`message_id` set:
the row a verb wrote, so undo deletes by handle rather than re-deriving what
to remove.

**`held_at` (#850) is the Advance dialog's "hold this back" tick.** A rule the
DM unticks before submitting still logs an event — the record that this beat
or route carried it — with `held_at` set and nothing performed: no objective
moved, no journal entry written, no calendar event created. The cockpit's
Held payoff panel (`QuestRunHeldPayoff.vue`) and the quest card's "Held
payoff — not yet fired" read `held_at is not null and performed_at is null`.
Firing a held event from the log calls the same `perform_quest_consequence`
a due delayed action uses, which clears `held_at` alongside setting
`performed_at` — the one function performs both a due delayed row and a held
one, distinguished only by which column got it there. A held **ledger** verb
is the one case `perform_quest_consequence` records
`previous_status`/`previous_is_player_visible` **at fire time** rather than at
log time (a normal ledger verb moves the objective inline, in
`apply_quest_consequences`, so its previous state is already known when the
event is written) — which is what lets `previous` undo it correctly however
long it sat held.

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

A ledger verb applies **immediately** regardless of `after_days` when it is
not held — only the (now seven) world actions are ever deferred by
`perform_quest_consequence`, which does not know how to perform a ledger verb
that fired inline. `after_days` on a ledger-verb row is authored intent, not
(yet) an enforced wait. The one exception is a **held** ledger verb (#850,
`held_at` above): holding defers it regardless of `after_days`, since holding
means the DM chose not to let it fire with the transition at all.

### `npc_favors` — what an NPC owes the party (#850)

`id`, `campaign_id`, `npc_id`, `quest_id` (nullable — set when the favour came
from a quest rule, null for one the DM typed straight onto the NPC), `text`
(1-500 chars), `source_event_id` (the `quest_consequence_events` row that
wrote it, when one did), `settled_at`, `created_by`, timestamps. Written by
the `owe_favor` consequence or directly by the DM. `settled_at` marks a favour
repaid; a settled row is never deleted — it is the record that it happened,
the same way a completed objective is never un-completed by removing its row.
RLS is DM-only (`npc_favors_dm_all`).

`useNpcFavors(npcId)` / `useCreateNpcFavor` / `useSettleNpcFavor` /
`useDeleteNpcFavor` (`src/composables/npcs/useNpcFavors.ts`) are the data
layer; `NpcFavorsSection.vue` is the surface — the "Favours owed" block on
the NPC sheet's Relations tab (`NpcTabContent.vue`), unsettled favours first
with a Settle button, settled ones struck under a divider, and an inline add
for a favour the DM types straight onto the NPC (`quest_id` null).

### `party_milestones` — what the party earned (#850)

`id`, `campaign_id`, `quest_id` (nullable, same rule as `npc_favors.quest_id`),
`text` (1-500 chars), `source_event_id`, `created_by`, timestamps. Written by
the `award_milestone` consequence or directly by the DM. RLS is DM-write,
**member-read** (`party_milestones_member_select`, `private.is_campaign_member`)
— unlike `npc_favors`, this table is meant for players to see, so every
campaign member can select it directly.

**Both realtime and the doorbell, because they cover different writes.**
`party_milestones` joins the `supabase_realtime` publication, which carries
inserts and updates live — an award reaches the party screen without a
refetch. It also gets `party_milestones_signal_delete`, an `after delete`
trigger calling `public.signal_campaign_change()` — the campaign_sync
doorbell (`20260904230420`) — because a realtime channel never reliably sees
a delete the way it sees an insert or update; every table on the doorbell
covers its deletes this way rather than relying on the publication for them.
`campaignSyncTables.test.ts` (the live-sync registry test) now also reads
doorbell triggers wired by later migrations, so a table born after the
doorbell was introduced can be registered without editing history.
`award_milestone` also posts a 🏅 `campaign_messages` broadcast, so the table
hears about it in chat as well as seeing it appear on the party screen.

`usePartyMilestones()` / `useCreatePartyMilestone` / `useDeletePartyMilestone`
(`src/composables/party/usePartyMilestones.ts`) are the data layer;
`PartyMilestonesPanel.vue` is the surface — a card on the party page
(`PartyView.vue`, between the tracker and the group portrait), newest first,
each row naming the quest it came from, with an inline add for one the DM
grants by hand.

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

`/quests/:id`, `/quests/new` and the beats route are all top-level siblings of
`/quests`: a quest is a full page at every width (see **DM surfaces** below for
why it stopped being a modal on 8 Sep 2026), creating one is the full editor,
and a beat is a full-screen surface in its own right — none of them has a list
to sit over. Static segments outrank `:id`, so `/quests/new` still wins.

**Four ways to start a quest**, all reachable without leaving the quest list:
typing one (`QuestFlowStarter.vue`'s own form — title, starting lane, optional
premise), generating one (`QuestGeneratorPanel.vue`, opened from the list's
"Generate" button), and — since #839 — pasting a page from a book
(`QuestPasteImportPanel.vue`, a `SegmentedControl` mode inside
`QuestFlowStarter.vue` itself). The paste mode does **not** run a second
extraction contract; it drives the same `document_imports` row and the same
`useDocumentImportRunner`/`runImportKind` machinery
`DocumentImportWizard.vue` uses (see `context/features/document-import.md`),
just through one compact confirmation instead of a step per entity kind. The
quest lands first (same `?view=overview` landing `createFlow` already used);
anything else the page yielded (locations, NPCs, monsters…) is a per-group
toggle in that same confirmation, defaulted on. The full step-per-kind wizard
in Campaign Settings → Document Import is unchanged and still the way to
bulk-import a whole chapter.

**Paste a page and Design it appear only while the campaign's AI is on** —
both run the campaign's AI (an extraction, a model conversation), so a DM who
switched it off sees "Type it" alone rather than a mode that only leads to a
refusal, the way the NPC and monster sheets hide their AI buttons.

**The fourth — since #873 — is designing one in conversation** ("Design it",
the third `SegmentedControl` mode: `QuestDesignerPanel.vue`). The DM writes
what the quest is and the stages they see; the model proposes the whole tree
in the #822 representation and, where a fork is genuinely ambiguous, **asks
back** (`QuestDesignQuestionCard.vue` — what it is about, why, two to four
options, free text as the escape hatch) rather than guessing or flattening.
The maintainer's framing, from #823: "asking back questions when it thinks a
fork may need more or less options but isn't sure." Answering revises the
tree in place — `QuestDesignTreePreview.vue` badges each beat new / changed
and lists what was removed, from `diffDesignTrees` (`lib/quests/designer.ts`)
— and an empty question list means the tree is settled. "Create quest" lands
it through `useCreateQuestFromHook` exactly as a generated hook lands, with
`ai_provenance.generatorType = "quest_design"`.

Three decisions, all in the epic and the edge function's header: **turns are
stateless** (nothing in this app holds a conversation and `callText` is one
system + one user message on every provider, so each turn carries the prose,
the previous tree and every answer so far, and the model returns the whole
tree with stable keys — "revise only what the answers affect" is a prompt
rule the client diff makes visible); **a fast model per provider**
(`provider_config.fast_text_model`, null = fall back to `text_model`,
editable on the admin Providers tab, because a back-and-forth cannot wait on
the strongest model each turn); and **priced per exchange with a running
total and a ten-turn budget** (`quest_design_turn`, 1 credit; the budget is
enforced server-side by the `turn` number the client sends), so a DM who
answers eight questions is never surprised by eight charges — they watched
the total climb. Single sitting, create only: editing an existing tree is a
different feature (#834's diff surface, not built), and nothing here touches
runtime, the ledger or an existing quest.

`/quests/:id` is a full page with three permanent tabs — **Overview · Story
flow · Run** — behind one `SegmentedControl`, selected by `?view=overview|work|run`.
With no `?view`, the page opens on Run while a session is live and on Overview
otherwise. Nothing about the tabs depends on session state: the Run tab is
always there, which is how a DM reaches the cockpit to start a session in the
first place (before 8 Sep 2026 the second tab swapped between "Story flow" and
"Run session" with the session, and the cockpit could not be found without one).

**A quest is never a modal.** It was, briefly: `/quests/:id` nested under
`/quests` so the overview could pop over the log the way an NPC sheet does,
with a `questFullScreenId` flag keeping an in-quest tab switch from dropping
the DM onto the list with a popover open. The maintainer's verdict on using it
— "too much data and inconsistent" — retired the whole arrangement the same
day: the route is top-level again, `QuestDetailModal.vue` and the flag are
gone, and every surface is the same kind of page. A link chooses a surface
with `?view=` and never touches broadcasting (`ui.dmMode`); the retired
`?mode=run`, `?mode=details`, `?mode=build` and `?overview=true` shapes are
neither generated nor read.

- **Overview** — `QuestOverviewPanel` → metadata (title, premise/`summary`,
  status, giver, location, parent, tags, sharing — one autosaved editor per
  field), then either a "Write the opening beat" empty state (no beats yet) or
  a read-only list of the graph's root beat(s) linking into Story flow, then
  lifecycle (objectives, quest-wide consequences via `QuestRulesPanel` — see
  below, sub-quests, calendar, and the backfill panel). A beat's own content is
  edited in exactly one place — the story flow's rail, or
  `QuestBeatDetailView` — never here; this surface no longer embeds a second
  beat editor (it did, for the `is_overview` beat, before #793).
- **Story flow** (`view=work`) — `QuestGraphDesigner` + `QuestFlowCanvas`, with
  `QuestGraphOutline` in the rail (and as the sub-`48rem`/screen-reader
  fallback).
- **Run** (`view=run`) — the **run cockpit** (`QuestRunCockpit`), live session
  or not.

**`:contained` follows the graph, not the work tab.** The canvas is a
fixed-viewport surface that scrolls itself; the cockpit is an ordinary long
document. Binding containment to `view === "work"` gave the cockpit the canvas's
contract and made its body an unscrollable `overflow:hidden` box at `lg` and wider
(#776). The binding is `showsGraph`, and it must stay that way.

### The story flow (frame `02 Story flow`)

`QuestGraphDesigner` + `QuestFlowCanvas` compose the graph; a rail beside it
(`min-w-64`/`24rem` column) reads whatever is selected without leaving the
canvas.

- **Swimlanes** (`QuestFlowSwimlanes.vue`, geometry in `lib/quests/swimlanes.ts`)
  are dashed rectangles drawn behind the nodes, one per live or waiting thread,
  transformed with the canvas viewport — framing every beat that thread has
  visited plus wherever its cursor stands now. A thread with nothing to show
  yet gets no lane at all rather than a lane the size of a point. The tag
  reads "party is here" for the oldest live thread, "still running" for every
  other live one, "waiting" for a parked thread.
- **The wire draws its own kind** (`QuestFlowEdge.vue`): solid gold for
  `choice`, a blue double-rail for `parallel`, dashed grey for a closed gate.
  Every edge labels itself rather than carrying DM-authored text — the
  target beat's title is the route's outcome (see `quest_beat_edges` above).
- **A node carries a chip per live thread standing on it** (`QuestFlowNode.vue`),
  plus payoff, loot, converge and site facts, so the graph reads as a state
  board rather than a static flowchart.
- **The rail** (`QuestGraphDesigner.vue`) shows, in order: `QuestThreadsPanel`
  (every thread, its current beat, a Focus button, and Close thread for a live
  one — closing is the DM's call here or in the cockpit, nothing closes
  itself); then, mutually exclusive, `QuestRoutePanel` (a selected edge — its
  `route_kind`/`thread_label` as writable fields, its gate, its payoff, Save/Delete)
  or `QuestSelectedBeatPanel` (a selected beat with no edge selected — prep-gap,
  payoff, loot, converge and site chips, "Open beat", "Preview as players");
  then `QuestGraphOutline` underneath, always present, one row per beat with
  its thread and state.
- **"Add parallel route"** opens the beat composer already carrying
  `parallel: true`. The invariant it and `QuestRoutePanel` both enforce: **a
  parallel route may never be the only way out of a beat** — the Parallel
  option is disabled, with a tooltip explaining why, until the beat already
  has a `choice` route.

**Deletes the beat inspector as a sidebar form.** `QuestBeatInspector.vue` — a
1,500-pixel scrolling form that used to live in this same rail slot — is gone;
everything it did either moved into `QuestSelectedBeatPanel`'s summary chips
(prep gaps, payoff, loot, converge, site) or belongs on the beat page now (see
below), which is the actual inspector.

### The beat page (frame `03 Inspector`)

`QuestBeatDetailView.vue` (`/quests/:id/beats/:beatId`), two columns.

**Left column** — `Beat` (kind, staged-at location with a site room count,
visibility, each saved on the spot as soon as it changes — no separate Save
button), the read-aloud block, then `QuestBeatFields` for the prose;
`QuestBeatAttachmentsPanel` for placements (needed/optional marks, the eleven
attachment types including `check`); `QuestBeatSitePanel` for the site — the
"This beat can become a crawl" empty state when nothing is chosen yet, or,
once staged, the full sheet epic #868 (S12) grew it into.

**`QuestBeatSitePanel`'s picker now offers a site's rooms indented beneath it,
not only the site itself** — the same depth-indented shape every other
location combobox already uses. Picking a room sets **"Opens at"**: the
party's entry point when Run enters the site, versus "the site itself" when
none is chosen and Run opens at the site's own map. Beneath that, three more
rows read the site as it stands right now, computed from the same reachable
subgraph a room's opening point defines (the whole site's rooms when staged at
the site itself, since there's no single entry point yet to walk from):
**"Prepared on the way"** (trap/encounter/puzzle counts reachable from the
opening room — features and loot already have their own rows elsewhere on the
sheet and would double-count here), **"Ambience"** (the resolved theme via
`resolveInheritedTheme()`, walking from the opening room the same way
`usePartyAmbience` does at the table — see world-building.md), and **"Site
readiness"** — `siteReadiness()`, the same five-check module the Atlas place
pane's meter runs (world-building.md), reused here over just this one site's
own data.

**Site readiness is a beat gap.** The Quest Board already renders `has-gaps`
on a beat missing its people or its handouts; a site that cannot actually be
walked (unbound spaces, no ways out) is the same class of gap, so
`deriveQuestBeatPrepGaps` gained a `"site"` kind: it fires when `!bound ||
!waysOut`, with the same caption priority `siteReadiness()` itself uses — an
unbound shape is the cheaper fix, so it leads; a site with everything bound
but no doors at all still can't accept the party. **`useSiteBeatGaps.ts`**
(`composables/quests/`) is what makes this affordable on the story flow
canvas, where several beats can be staged at several different sites at
once: it batches one regions query and one doors query across every staged
site rather than mounting one `useSiteStructure` per site, and
`QuestGraphDesigner.vue` feeds the result into `QuestBeatSiteInput.readiness`
alongside the existing `site · N rooms` fact.

**Right column** — `QuestBeatRoutesPanel` ("Routes out": one card per outgoing
edge, its `route_kind` badge, its thread label if parallel, a site chip if the
target is staged at a room-bearing site, "Add route"); `QuestPayoffPanel`
("Payoff": this beat's `quest_consequences` and `loot_placements` rows as
**one list**, each row tagged `auto` (fires from the engine) or `you dispatch`
(a human action) — see "Threads, parallel routes and payoff" above for why the
tables stay separate while the surface does not — with **eight quick-adds**:
Item, Riches (loot); Influence, Knowledge, Quest, Favour, Milestone, Event
(consequences, one button per action the DM might reach for without opening a
condition form first).

**Deletes** `QuestBeatLootPanel.vue` and the beat-scoped half of
`QuestConsequencesPanel.vue`; the quest-scoped half survives, renamed
`QuestRulesPanel.vue`, mounted on the overview inside `QuestOverviewLifecycle`
exactly where the old panel was.

### The run cockpit (frame `04 Run`)

`QuestRunCockpit.vue` runs **one thread at a time**: the route names which one
(`?thread=`, or the thread bar switching it), defaulting to the quest's oldest
live thread.

**The start card tells, not asks (#871).** Before a thread has a cursor it
used to open on a dropdown of every beat. It now resolves where to start
(`resolveStartBeatId`, `src/lib/quests/entry.ts`) — the beat a performed
bridge named (`useQuestUnlockEntry`), else the quest's declared
`entry_beat_id`, else the sole computed root — and shows that beat's title
with its read-aloud (or rumor text, or the first lines of DM content) so the
DM recognises the scene rather than the name, captioned with the reason
("Where the story begins", "Entered through ‹beat›", "The only way in"), and a
single **Start here**. **Start elsewhere** reveals the old picker, roots ranked
first. Only when nothing resolves (no entry and several roots) does the picker
show first. Below the header:

- **`QuestThreadBar`** — one pill per thread the quest holds (live/waiting
  selectable, closed/merged shown dimmed for context but not clickable), and
  "Open a thread" (a beat picker, a label, an optional reason — the manual
  open path, distinct from a parallel route's automatic one). Switching
  threads is **pure navigation**: no cursor moves, nothing is recorded.
- The current beat: normally `QuestRunBeatCard` (chips, read-aloud, how it
  plays, one action button per placement — `Roll Insight` first when the beat
  carries a `check`) plus `QuestRunHeldPayoff` (loot sitting in
  `loot_placements` with `delivery_state: "held"`, and `quest_consequence_events`
  rows with `held_at` set — both quest-wide, not beat-scoped, since a payoff
  held three beats ago is still the DM's to dispatch today). **When the
  current beat is staged at a site with rooms, this column becomes
  `QuestSiteHandoff` instead** — see below.
- **`QuestRunSessionPanel`** — Previous, Jump, Pause/Resume, End: the
  session-wide commands, kept apart from "what happens next," which are
  outcomes of the current beat rather than of the table. Replaces
  `QuestRunControls`, which was a bar docked to the foot of the whole cockpit;
  this is a card in the left column now, under Held payoff.
- The rail: `QuestRunObjectivesLedger` (gate hints), `QuestRunStorySoFar`
  (this thread's own path, replacing `QuestRunPath`, which read a narrower,
  undifferentiated shape), `QuestRunOpenChains` (other open chains, **sibling
  threads of this quest listed first**, per the design's "Also open" rule),
  and `QuestRunOutcomeStrip` docked to the bottom of the rail column with
  `mt-auto` inside a stretched grid row — **in normal document flow, never
  `sticky` or `fixed`** (the #776 fix; regressing this back into a floating
  bar is the thing not to do).
- **`QuestRunOutcomeStrip`'s Choose no longer transitions on its own click.**
  It opens `QuestAdvanceDialog` preselected on the chosen route — the dialog
  is "the only place a thread is created" now (see below). "Something else…"
  opens the same dialog with its improvise option selected.

Runtime context, live chains and runtime state all poll at 5s; every command
carries `expectedVersion`. `QuestRunContainedTool` opens an attachment in
place: encounters embed `EncounterRunSurface`; objectives get a next-status
button; notes and handouts render their bodies. Despite the name it is also
the prep-time viewer, mounted from `QuestBeatAttachmentsPanel`.

**Audio no longer calls the soundboard store directly (#870).** A `sound` /
`audio_scene` / `playlist` attachment's play/stop/fire button goes through
`requestAudioCue` / `releaseAudioTheme` (`src/lib/audio/audioTriggers.ts`),
the same trigger bus an encounter's theme and a location's ambience use, with
`sourceId = beat:<beatId>:<attachmentId>`. That is what makes a beat's cue the
loudest, most deliberate intent in the room — see soundboard.md's "Who wins
the slot" — rather than a raw store call that could silently stomp whatever
ambience or encounter theme was already running with no way to hand it back.
The button's own "is this active" state reads `useActiveAudioTriggers()`
(a cue owned by _this_ attachment's `sourceId`, not merely "is this playlist
playing somewhere") so it never disagrees with the `CausedByChip`. Leaving the
cockpit (unmount) releases the cue — mirroring `EncounterRunner`, whose battle
music would otherwise follow the DM around the app with nothing left on
screen to stop it.

**Deletes** the path panel (`QuestRunPath.vue`), the site strip
(`QuestRunSitePanel.vue` — "where the party physically is" as a panel
separate from the running beat; the site handoff below is the only place the
cockpit now shows rooms), the run controls bar (`QuestRunControls.vue`), the
run beat editor (`QuestRunBeatEditor.vue`), the loot prepare form in Run, and
`QuestRunTally.vue` (this doc used to note it was unused but present; it is
simply gone now).

### The Advance dialog (frame `05 Advance`)

`QuestAdvanceDialog.vue` — "one dialog carries the whole model: the route
taken, the routes that also open, and which payoffs go out now." One submit
plans the whole transaction (`planAdvance`, `src/lib/quests/advance.ts`)
before sending it as a single `transition_quest_runtime` call (or
`improvise_quest_runtime`, for the open-ended option):

1. **The route taken** — a radio over every `choice` route out of the current
   beat, or "Something else happened" (names an improvised beat in this
   thread; a required title, everything else — kind, reason, DM lead, reveal
   text, push-return, keep-edge — behind an "Add details" toggle, copied
   inline from the deleted `QuestRunImprovPanel.vue`).
2. **Also opens** — every `parallel` route off the beat, ticked by default:
   each spawns its own thread in the same transaction, labelled by the edge's
   `thread_label`. Unticking prepares the layer without opening it yet. Absent
   for the improvise option — an improvised beat has no authored parallel
   routes to spawn.
3. **Payoff from this route** — every `quest_consequences` row on the chosen
   route/target, ticked to fire with the transition, unticked to **hold**
   (logs the event with `held_at` set — see `quest_consequence_events`
   above); every loot row on the target, ticked to dispatch to chat with the
   move, unticked to stay in the cockpit until dispatched later.

The footer previews the plan before submitting: which thread letters will
still be live after this transition (existing ones plus one per spawn), how
many consequences fire, how many loot rows stay held. A `40001` (version
conflict — another device moved this thread first) surfaces as "The session
moved on another device — reopen to advance," via
`isVersionConflictError`.

### Site handoff (frame `06 Site`, reshaped by epic #868 S12)

When the cockpit's current beat is staged at a site with rooms,
`QuestSiteHandoff.vue` takes over the left column. #850 built this as its own
room card and its own `LootPlacementList` mount; #868 replaced both with the
same room surface the Atlas Run action uses, per the maintainer's framing
for that epic: **a room is a zoomed-in beat**, so the cockpit's crawl and the
Atlas's crawl should look like the same crawl, not two components that can
drift.

- **The rooms list** is still `SiteRoomList.vue` (numbered rows,
  click-to-move, the unwritten/Fill affordance, a loot chip), now mounted with
  `run-captions` on — the same frame-08 reachability captions ("Reachable",
  "Not reachable from here", "Secret door — undiscovered", "Party here ·
  `<zone>` active") `SiteRunSurface` shows, computed identically in both
  callers rather than the plain description snippet the handoff used to fall
  back to.
- **The floor plan** (`LocationMap`, run-mode) is unchanged in mechanism, and
  now sits above the room's own stack rather than beside a room-detail column.
- **The current room's stack is `SiteRunRoomStack.vue`** — read-aloud (the
  room's own description), prompt rows for traps, roll tables, encounters and
  undiscovered secret ways out, and the room's payoff via `LocationLootPanel`
  — replacing the handoff's own read-aloud/"Room cleared"/`LocationPlacements`
  composition outright.
- **Ways out of the current room is `SiteRunWaysOut.vue`** — Move / Unlock /
  Reveal per door, replacing nothing (this is genuinely new to the handoff);
  the two door facts land in the append-only state log exactly as they do from
  the Atlas surface, never on the authored `starts_locked`/`is_secret` flags.
  Reachability itself now consults those unlock facts too:
  `computeReachableRoomIds` takes the site's unlocked-door set as a third
  argument, so a door the party has since picked stays open on return without
  needing `starts_locked` touched.
- **Progress** stays `LocationStateControls` on the current room, now in its
  own small card rather than folded into the room article.

**A beat staged directly at a room (#868 S12) still runs the room's _parent_
site.** `QuestSiteHandoff` resolves `siteId` from the staged location the same
way every other #868 S12 reader does — itself if already site-tier, else
`parent_id` — because fetching this component's rooms, doors and map off the
room id directly (as if it were the site) would return zero of everything: a
room has no children of its own. The staged room, when there is one, becomes
`openingRoom` — what "Opens at" in `QuestBeatSitePanel` set — and the position
caption reads "not yet inside — opens at `<room>`" until the party actually
moves there; nothing here moves them on its own.

**A trigger zone can prompt this beat's own advance, and never fires it.**
`SiteMapZoneList.vue` lets a `trigger`-kind zone name a `beat_id` (#868 S12).
When the party's current room falls inside a trigger zone naming _this_ beat
— compared by id, not "any beat in the quest," since `advance` has no target
parameter and can only ever advance the beat already staged here — the
handoff shows "`<beat title>` is staged on this floor — advance?" above the
three-column body, with an Advance button that is the same emit the header's
own Advance button already fires, and a Dismiss that is per-room: walking off
the trigger room and back onto it shows the prompt again, since nothing about
the zone's configuration changed. This is presentation only — nothing about a
token's position ever triggers an advance by itself, the same "prompts, not
automation" rule the site runner holds elsewhere in #868.

**A room's Cleared fact satisfies an objective, since #869.** Frame 15 of the
site sheet: "an objective may watch for it, which is the honest version of the
DM ticking the box twice." It was left out of #868 because
`private.apply_quest_consequences` keys every firing on a beat transition:
`quest_consequence_events` dedupes on `(transition_id, consequence_id)` and
that id is the firing's provenance. A `location_state_events` row is not a
transition — there is no quest, thread or beat to attribute it to, and with
two open chains at one vault it would have to fire for both or pick one. That
was a rule-engine design (a new condition source with its own dedupe key), not
a site story — `20260906225258` rejected `on_location_arrival` for room loot
for the same reason — so it landed separately as #869: a fourth condition
family, `on_location_id`/`on_location_fact`, and a trigger on
`location_state_events` that mints its own `assert` transition per (state
event, quest). See "one rule engine" above for the mechanism and its
decisions, and `QuestRulesPanel.vue` for where a DM authors "when a place…".

**One room surface, two callers.** `SiteRoomList.vue`, `SiteRunWaysOut.vue`
and `SiteRunRoomStack.vue` (`src/components/locations/`) are now shared
verbatim between `QuestSiteHandoff` and `SiteRunSurface`'s Atlas Run action —
before #868, only the room list itself was shared (#850 story H); the room
card and its ways-out were each hand-rolled per caller. There is now exactly
one implementation of "what does the DM see when the party is in this room,"
so the cockpit's crawl and the Atlas's crawl can never quietly disagree again.
Pure derivations shared by both callers (which rooms are unwritten, a room's
list caption, the party's ordinal position, which rooms hold loot) live in
`src/lib/quests/siteHandoff.ts`; the room's own stack (`buildRoomStack`) lives
in `src/lib/locations/roomStack.ts` and is documented in world-building.md's
"The site runner".

Other threads the quest holds are still listed as "paused, not closed" with a
Switch button, unchanged from #850. Three exits, all emits the cockpit owns:
"Show map to players" (toggles `is_map_shared`), "Leave site" (dismisses the
handoff for this visit; nothing here writes `quest_runtime_state`), "Advance
beat" (opens `QuestAdvanceDialog` the normal way).

**The handoff's own gate no longer checks `isSiteType` on the staged location
alone.** `QuestRunCockpit.vue`'s `stagedSiteWithRooms` and
`QuestBeatDetailView.vue`'s staged-site caption both resolve the site first
(itself, or its parent when a room was staged directly) before asking whether
it has rooms — otherwise a beat staged at a room, the entire point of this
story, would fail the site check and never show the handoff at all.

### The quest log (frame `07 Log`)

The Kanban view of `/quests` (`QuestKanbanBoard.vue`, behind the list/kanban
toggle — the plain grid list is untouched by this epic).

- **`QuestFeaturedCard`** — full width above the groups, rendered only when at
  least one quest has a live thread. Premise, an "In session" badge, a
  beats-visited / threads-live statblock, **one spine row per live thread**
  (a segment bar reading done/here/gap/upcoming, the thread's own letter and
  tone), prep-gap chips (one per kind, with a count — "the only alarm" the
  card raises), a "Payoff prepared" chip, Resume run (into the thread that is
  actually running), Story flow.
- **Three groups**, replacing the old five-lane kanban's presentation without
  changing how a card is dropped onto one: **Active** (`active` — the
  "Rumoured" sub-group went with the lane in #874),
  **"Undiscovered — waiting to be unlocked"** (`undiscovered`), **Settled**
  (`completed`/`failed`).
- **`QuestBoardCard`** (every group) now draws **one spine row per live
  thread** the same way the featured card does, rather than a single
  undifferentiated segment bar — a quest can hold more than one cursor, and
  the card has to answer "where is this quest" for each. A quest with no live
  thread yet still shows a plain readiness spine (no thread to attribute it
  to). An undiscovered quest with no beats says so ("no beats yet"); one with
  a rule that unlocks it names the beat, or says "Held payoff — not yet
  fired" when the trigger is a condition with no single beat to name. A
  settled quest shows how its run actually ended ("Session 4 · ledger
  settled" or "one thread closed unfinished"), read from the `end` transition's
  own reason where the DM typed a session number, never a guessed date.
- **The header line** — "N active · N threads live across N quests · N prep
  gaps" — is whole-campaign, not filtered by whatever search or facet is
  active; it is the table's overall state, not a count of the current view.

`src/lib/quests/board.ts#deriveQuestBoardSummaries` computes all of this
per-thread, keyed by `QuestBoardThreadSummary` (id, label, status, current
beat title, its own beat-segment reading) — every card and the featured card
alike read `threadBadges()` (`lib/quests/threads.ts`) over that array for the
letter and tone, never choosing one locally.

### What went

Named once so nobody goes looking for them: `QuestBeatInspector.vue`,
`QuestBeatLootPanel.vue`, `QuestRunBeatEditor.vue`, `QuestRunControls.vue`,
`QuestRunImprovPanel.vue`, `QuestRunPath.vue`, `QuestRunSitePanel.vue`,
`QuestRunTally.vue`. `QuestConsequencesPanel.vue` was renamed rather than
deleted — it is `QuestRulesPanel.vue` now, with its beat-scope branches
removed rather than kept dead.

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

**`PlayerQuestStoryThread` reads by thread now (#850, frame `08 Player`):
"revealed beats only, grouped by thread so parallel actually reads as
parallel."** `get_player_visible_quest_beats` carries four new columns —
`thread_id`, `thread_label`, `is_current` (a live/waiting thread stands on
this beat right now), `payoff` (knowledge granted and loot dropped here,
`revealed` beats only) — and `groupPlayerBeatsByThread`
(`src/lib/quests/playerThreads.ts`) turns that flat, already-resolved list
into ordered columns purely on the client: it does not re-derive thread
identity or re-fold anything, since the RPC already did that in SQL.

- **A thread exists for players only once its first beat is revealed.** Until
  then it folds into Main — a layer opened in secret stays secret, and there
  is no "column 3" hinting at a thread the party has never heard from.
- **Columns**, Main first (or whichever thread's earliest beat comes soonest,
  for a malformed/pre-#850 cache with no Main row): the primary column's
  eyebrow is its bare label, every other column reads "Also following —
  `<label>`".
- **One ordered list per column, not two separate blocks.** A rumoured beat
  renders inline as "_Rumoured:_ `rumor_text`"; a revealed one renders
  `reveal_text` plain — both in the same `story_order` sequence, which
  replaces this doc's older description of a dashed Rumors block sitting
  above a separate Confirmed-journey timeline. `story_order`, not reveal
  time, is still the ordering rule (see the "do not fix" note below).
- **Payoff chips** sit under a beat that carries any: a knowledge chip per
  `grant_knowledge` event fired from a transition into that beat, and a loot
  chip per dispatched `loot_placements` row on it — claimable loot links to
  `/play/chat`, where the actual claim button lives; **held** loot (not yet
  dispatched) never appears here, since that is DM prep, not yet part of the
  party's story.
- **"happening now"** marks the one beat in a column a live or waiting thread
  currently stands on (`is_current`).

Containment is in two places, and the split matters:

- **Server** (`get_player_visible_quest_beats`): only `rumored` and `revealed`
  beats, exposing `player_text` with **no DM-title fallback**.
- **Client** (`PlayerQuestStoryThread.vue`): a revealed beat with empty
  `player_text` is filtered out, so an un-written reveal renders nothing rather
  than an empty entry. The RPC still returns that row — the drop is presentation,
  not a security boundary, and the boundary above is what stops the DM's title
  leaking.

**Threads and cursors stay DM-only tables** (`quest_threads`,
`quest_runtime_state`, `quest_beat_transitions` each carry a single
`private.is_campaign_dm()` policy) — this projection is the one door a
player-facing client has to any of it, the same door beat visibility already
goes through.

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

**Every runtime RPC is thread-scoped since #850** — the lock, the version and
the cursor all belong to a thread, named by `p_thread_id` on every call.
There is no thread-less read path left anywhere in this list.

`transition_quest_runtime(campaign, quest, thread, command, expected_version,
target_beat_id?, edge_id?, reason?, push_return?, provenance?,
spawn_edge_ids?, hold_consequence_ids?, dispatch_loot_ids?)` — commands
`start`, `advance`, `previous`, `jump`, `return`, `improv`, `pause`, `resume`,
`end`, same as before #850, now against one named thread. `advance` walks a
`choice` route on that thread; `p_spawn_edge_ids` walks each named `parallel`
route by **spawning a thread** in the same transaction — its own cursor,
`enter` transition and arrival rules — while the calling thread's cursor does
not move. Arriving at a `converge_mode: 'all'` beat parks the thread
(`private.settle_thread_arrival`): once every one of the beat's authored
incoming routes has been walked by a live-or-waiting thread, the earliest
arrival (by `seq`, never `created_at` — two threads can write their arrival
transition inside the same transaction and tie on timestamp) survives as the
running cursor, every other waiting thread there is folded into it
(`merged`), and the beat's arrival rules fire exactly once, on the
survivor's _original_ arrival transition. A parked thread's own route rules
still fire immediately on walking — the route's rules are the route's, only
the beat's arrival rules wait for the merge. `p_hold_consequence_ids` logs a
rule with `held_at` set instead of performing it; `p_dispatch_loot_ids`
dispatches loot on the target as part of the same move.

`open_quest_thread(campaign, quest, beat, label, reason?)` /
`close_quest_thread(campaign, quest, thread, reason?)` — the thread bar's
manual open/close. Opening writes a fresh thread and cursor with no parent
edge and runs the beat's arrival rules exactly like any other arrival;
closing delegates to the `end` command when the thread has a live cursor
(which also stamps `quest_threads`), and refuses a thread that has already
merged.

`get_quest_runtime_context(campaign, quest, thread)` — one thread's state,
current beat, previous, outgoing edges (each carrying `route_kind`,
`thread_label`, `converge_mode`, `site`, `gate`, `effects`, `payoff`, `loot`),
return target, the most recent **100** transitions (the cockpit polls it),
plus — since #850 — `thread` (this thread's own summary), `threads` (every
sibling thread of the quest, each with its own current beat and status), and
`held` (the quest's held-but-not-fired payoff events).

`get_campaign_live_quests` — one row **per open thread**, running first, each
carrying `thread_id`/`thread_label`/`thread_status` and a `sibling_count` (how
many threads that thread's quest currently has open).

`improvise_quest_runtime`, `search_quest_runtime_jump_targets`,
`end_campaign_quest_session` (pauses every running **thread** at its beat;
a `waiting` thread — parked for a merge — is left waiting, since the story
parked it, not the DM closing the table), `archive_quest_beat(beat_id,
p_replacements)` — `p_replacements` is `[{thread_id, beat_id | null}]`: every
thread whose cursor stands on the beat being archived must be named (a null
`beat_id` ends that thread instead of moving it), or the call raises `23514`
naming the thread. This replaced a single `p_expected_runtime_version` scalar,
which cannot describe "every thread currently on this beat" once a beat can
hold more than one — the `for update` read inside the function's own loop is
the concurrency guard now, catching a thread that arrived after the caller
loaded the page.

`create_quest_beat_with_route`, `dispatch_loot`, `get_loot_placements`
(renamed from `dispatch_quest_beat_loot` / `get_quest_beat_loot` by #830 when
rooms gained the same verb — see `loot_placements` above),
`get_player_visible_quest_beats` (thread-aware since #850 — see **Player
surfaces** above), `get_player_visible_quests`,
`assert_quest_objective_status` (#794 — the DM asserting a status with no
cursor movement), `assert_quest_runtime` (#796, thread-scoped by #850 — see
**Record what already happened** below), `perform_quest_consequence` (#794 —
performs one already-logged event: a due delayed world action on a date the
client computed, **or**, since #850, a held event fired from the log,
including the three new verbs and a held ledger verb; see "one rule engine"
above) and `get_player_visible_site_state` (#798 — the inside of a site as
the party knows it; see below).

### Record what already happened — the backfill panel

`QuestBackfillPanel.vue`, mounted inside `QuestOverviewLifecycle` on the quest's
Overview. The DM ticks the beats the party already played, optionally names the
session, and records them: consequences are applied and the cursor can be placed
at the last one — without ever starting a session. _"Backfilling ten sessions of
history should not mean performing them."_

**Thread-scoped since #850, defaulting to the quest's first live thread.**
The panel records against one named thread (`useQuestThreads`, the first
`status: 'live'` row) — every quest still has exactly one until a parallel
route or the thread bar opens a second, so this has not yet needed a thread
picker of its own; a quest with more than one live thread when the panel is
opened backfills against whichever one happens to sort first, which is worth
knowing before relying on it for a multi-thread quest.

**Every row shows its own state before anything is ticked** — "Playing now" /
"The party is here", "Played · 3d ago", "Recorded · Session 4", "Not played" —
derived in `lib/quests/backfill.ts` (`deriveBeatRecordStates`) from the
transition log and the cursor: the newest transition _to_ a beat decides, an
`assert` reads as recorded, a table kind as played, and the cursor's beat wins.
That is the panel's feedback: after recording, the rows change state in place
rather than a cleared list and a banner. "Select all" picks only unplayed
beats, and ticking a beat already in the record shows a warning that recording
it again appends a second entry. The single Record button became two actions
that say what they do — **Mark as played** (`placeCursor: false`) and **Mark as
played and put the party at “<last selected>”** (`placeCursor: true`). The
first version (7 Sep 2026) had none of this: boxes cleared on success with no
visible change, and re-recording duplicated history silently.

It exists because the graph arrived after most campaigns did. A DM adopting the
beat model mid-campaign has a played history and an empty runtime, and the only
other way to reconcile them was to walk the cockpit through beats the table had
already lived — writing a transition log that claims tonight's session replayed
the whole quest.

Backed by `assert_quest_runtime`, which is DM-gated like the rest and reasons
from the transition log rather than the cursor, so corrections **append as
recorded rather than as played** and re-running one is not a second playthrough.

Undocumented until the #825 review, which is worth noting rather than quietly
fixing: this is a real DM-facing surface with its own `SECURITY DEFINER` RPC,
and the runtime list above enumerated every other one — including
`archive_quest_beat`, which does far less.
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
- **A command names exactly one thread of one chain.** Reaching another quest
  is navigation to its own Run URL, not a runtime write.
- **Ending is per thread.** `end_campaign_quest_session` pauses every running
  thread at its beat rather than clearing it (a `waiting` thread is left
  waiting — the story parked it, not the DM), and is called by
  `end_campaign_session`.
- **Nesting is a sort hint.** A parent's cursor never aggregates its children's.

`promote_quest_on_cursor_arrival` ratchets `quests.status` `undiscovered →
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
response as untrusted and _degrades_ rather than throwing: blank keys, dangling
routes, duplicate pairs and unknown kinds are dropped. **Nothing is ever
manufactured.** A response with no usable spine creates no beat at all; a
fabricated "Opening beat" would let the generation-one shape survive its own
deletion, which is the whole of what epic #780 undid.

The writing lives in `src/lib/quests/spineWrite.ts` (#829), which takes its four
mutations as injected deps because there are now **two producers**:

| Producer                                             | Gets its mutations from | Fills `read_aloud`?                         |
| ---------------------------------------------------- | ----------------------- | ------------------------------------------- |
| `useCreateQuestFromHook` (this generator)            | TanStack mutations      | No — invented prose has no boxed text       |
| `DocumentImportWizard` (#829, pasted adventure page) | plain Supabase inserts  | Yes — a published page marks its boxed text |

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
- **The player thread orders by `story_order`, not by reveal time.** Narrative
  order is the intent; the rationale is in the component.
- **Quests have no save-triggered navigation at all.** Metadata and beat fields
  autosave in place on a debounce; only **delete** navigates, to `/quests`
  (`QuestOverviewLifecycle.vue`). Do not add a post-mutation redirect to an
  autosaving field — there is no save event to hang it on.
- **`?view=run` may choose a surface but must never start a session.** Writing
  `ui.dmMode` as a side effect of a link was a defect, fixed in #758 (the
  query was `?mode=run` then).
- **The cursor is per thread — never add a thread-less read path.**
  `quest_runtime_state`'s PK is `(campaign_id, quest_id, thread_id)`; there is
  no "default thread" special case anywhere in the RPCs, and a new surface
  that reads or writes runtime state without naming a thread is reading the
  wrong shape, not filling a gap.
- **`apply_quest_consequences`'s `p_hold` array is how a rule gets held, not a
  second code path.** A held rule runs through the same condition-matching
  loop as every other rule; it just logs the event with `held_at` set and
  returns before performing it, and before seeding the cascade with an
  objective that never actually moved. Do not special-case "held" outside
  this function.
- **The `seq` tiebreak on `quest_beat_transitions` is not decorative.** Two
  threads can write their own arrival transition inside the same wall-clock
  transaction, so `created_at` can tie between them; `seq`
  (`generated always as identity`) is the one column that says which arrival
  actually happened first, and a converge-all merge depends on it being right.
  Anything that orders arrivals by `created_at` instead will occasionally pick
  the wrong survivor.
- **The Payoff panel is one list over two tables, on purpose.** `QuestPayoffPanel.vue`
  merges `quest_consequences` and `loot_placements` at the surface because
  that is one question at the table ("what does this beat give"), but the
  tables stay separate — see "Threads, parallel routes and payoff" in the
  model and the `loot_placements` section in the data model above for the
  three axes that make the split real. Do not fold them into one table
  because the surface reads as one list.

---

## A departure that needs a decision again

`QuestFlowStarter` sends a newly created quest to `/quests/:id?view=overview` —
the new record's own detail page, and it is not alone: `QuestGeneratorPanel`
does it twice and `QuestPasteImportPanel` once. A fourth,
`QuestGraphDesigner`'s beat command, targets a _beat_ rather than the quest, so
it is a different route and not part of this question. The post-mutation
navigation rule says create should go to the list and explicitly forbids the
detail page; the carve-out that lets NPCs and monsters target their own id is
earned by _route nesting_, and [#844](https://github.com/irongollem/grimoire/issues/844)
nested `/quests/:id` to earn it the same way.

**That nesting is gone (8 Sep 2026) — the quest is a full page, never a
modal — so the carve-out no longer applies and the four call sites are a plain
departure again.** They are kept as they stand, deliberately: a quest is born
with no beats, and the one thing a DM does next is write the opening beat,
which lives on the quest's own page; sending them to the log would make a
freshly hooked quest as hard to get back into as filing a new NPC. Sanction it
in `CLAUDE.md` or send them to the list — but do not re-nest the route to
launder it.

## Design source

The DM surfaces described above implement **`quests/Quest Manager Redesign.html`**,
in the Grimoire project on Claude Design, read through the design-sync tool —
frames `01 Delta` · `02 Story flow` · `03 Inspector` · `04 Run` · `05 Advance`
· `06 Site` · `07 Log` · `08 Player`. That file is the surface spec for the DM
and player surfaces sections above: it is an _incremental_ redesign of what
epic #780 shipped (keep beats, routes, gates, the one consequence mechanism,
loot placements, the site surface) that names the three things the shipped
model still could not say — a quest can only hold one cursor, a route cannot
say "and also," a payoff is split across two panels — and redraws the six
surfaces around them. [EPIC #850](https://github.com/irongollem/grimoire/issues/850)
implemented it; read that epic for the story-by-story breakdown and the wave
gates it shipped under.

**The site-crawl integration is a second, independent design.**
`QuestBeatSitePanel`'s "Opens at"/readiness sheet and `QuestSiteHandoff`'s
adoption of `SiteRunWaysOut`/`SiteRunRoomStack` are not frames of the Quest
Manager Redesign — they implement **`atlas/Sites & Cartographer.html`**
(epic [#868](https://github.com/irongollem/grimoire/issues/868), story S12),
the design that owns the Atlas/site-runner surfaces documented in
world-building.md. The two designs meet at exactly one seam,
`quest_beats.staged_at_location_id`, which #868 widened to accept a room as
well as a site — no schema change, since the column already took any
location.

**It supersedes the surface half of an earlier, fourteen-board canvas** (the
"Quest System Redesign" canvas cited from `CLAUDE.md`) — that canvas's _model_
page (beats are events, objectives are state) is unchanged and still the
opening section of this doc; only its surface boards are superseded, by the
file above. Do not treat the fourteen-board canvas as the current surface
spec for anything DM- or player-facing; treat it as where the model
originated, and the Quest Manager Redesign as where the surfaces that render
it are defined now.

**[EPIC #780](https://github.com/irongollem/grimoire/issues/780)** is the
epic that collapsed two generations into the model at the top of this doc and
made the dungeon a place in the Atlas — the schema and engine #850 builds on.
Its own deletion manifest and phase history (0 the cockpit containment bug and
this doc; 1 the dungeon standalone; 2 the ledger; 3 the join) are historical
record now rather than open work, but the rule it shipped under still applies
to every change in this file: **every change is measured by what it
removes.** A step that cannot delete its predecessor yet is not ready to be
built — not a reason to build it beside.

## DM Manual

`src/manual/worldbuilding-quests.md`.
