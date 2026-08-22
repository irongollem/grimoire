# Quest runtime navigation

The authored quest graph and the route taken at the table are separate. Runtime
movement goes through `transition_quest_runtime`; clients have read-only access
to `quest_runtime_state` and `quest_beat_transitions`.

## One cursor per quest

`quest_runtime_state` is keyed `(campaign_id, quest_id)` — one live cursor per
chain, not one per campaign ([#755](https://github.com/irongollem/grimoire/issues/755)).

The cursor tracks **narrative position in a chain**, not where the party is
standing, and a party is routinely mid-progress on several at once: a main quest
suspended on "find out who the killer is" while a side chain is walked end to
end, or two givers whose quests converge on the same cave so both advance in the
same scene, with no jump and no return between them.

This is a strict generalisation rather than a mode. A dungeon crawl whose beats
are physical rooms is nearly always one quest — the N=1 case, one cursor, room to
room along authored edges. There is no toggle.

Where the party is *standing* is not a separate concept and must not become one:
it is a property of the focused beat, via its `location_set` attachment.

## Commands

Every command names exactly one chain. There is no target quest — reaching
another quest is navigation to its own Run surface, which writes no runtime state
and needs no reason.

- `start` enters a selected beat and starts a fresh visit path.
- `advance` follows a specific outgoing authored edge.
- `previous` moves backward through actual visit order, including cycles and
  repeated beats. It does not inspect incoming authored edges.
- `jump` enters any non-archived beat **of the same quest**, records a reason,
  and can push the current beat as a return point.
- `return` pops the latest explicit return point.
- `improv` enters an `is_improvised` beat and records why it was created.
- `pause`, `resume` and `end` are lifecycle transitions and history entries, and
  apply to that chain alone. Ending one chain never disturbs another's position.

`end_campaign_quest_session` is the campaign-wide counterpart: it pauses every
running chain at its current beat rather than clearing it, logging each pause
with reason `'Session ended'`. It is the boundary [#758](https://github.com/irongollem/grimoire/issues/758)
calls **End session**.

## Back is undo, not replay

`previous` walks the visit stack, so it retraces the order the party actually
took rather than the authored order: a 1→2→3→4 flow played 1-3-4-2 steps back
2-4-3-1, never 2-1.

Navigating forward from a rewound position **truncates** the abandoned entries.
A DM who steps back to re-read a beat and then advances loses the skipped entry
from the back path. That is intended — Back means "undo my last navigation",
Jump means "take me there" and records why. `quest_beat_transitions` remains the
authoritative log of everything the party did, so nothing is lost.

Do **not** rebuild the back path from `quest_beat_transitions` to "preserve"
truncated entries. It would make the path un-rewindable: you could never step
back out of a beat you had stepped back into.

## Concurrency

Every command takes the version the DM loaded. The database locks that quest's
runtime row, checks the version, updates the cursor, and appends one immutable
history row in the same transaction. A stale co-DM receives a serialization
error and must reload instead of silently replacing the newer position.

Both the lock and the version are per quest, so two co-DMs running two different
chains no longer contend.

## Projections

`get_quest_runtime_context(campaign_id, quest_id)` is the Run-mode projection for
one chain. It returns the current beat, prior visited position, authored outgoing
choices, latest return target, and path so far. History stores quest/beat titles
and edge provenance at the time of movement, so later editing or detaching
authored material does not make the session record unreadable.

`get_campaign_live_quests(campaign_id)` returns the set of chains the party has
open, running first and then paused — the query a single campaign-wide cursor
could not express. It feeds the cockpit's "Also open" rail, the dashboard's
In progress panel ([#756](https://github.com/irongollem/grimoire/issues/756)),
and the proposed `LiveRail` in [session-mode.md](session-mode.md). Treat the
composable wrapping it as the shared entry point rather than re-querying.

Jump pickers use `search_quest_runtime_jump_targets`, scoped to the single quest
whose cursor the jump would move and searching beat titles only. Quest overview
beats are withheld: they sit outside the edge graph, so parking a cursor there
strands the cockpit with no outgoing branches.

## What runtime movement does and does not touch

Runtime navigation never alters player reveal or visibility fields directly, and
the cursor itself is invisible to players — `quest_runtime_state` carries a
single RLS policy gated on `private.is_campaign_dm()`, and
`get_player_visible_quest_beats` exposes no cursor field.

Three deliberate side effects do exist:

- Entering a beat appends a `quest_beat_transitions` row, which the player
  projection folds into `visits` — so a beat that is *already revealed* gains a
  timestamp and a repeat-visit count.
- A wired `quest_objective_effects` row can reveal, complete or fail an
  objective on arrival, and `reveal` sets `is_player_visible`.
- A cursor entering a quest whose status is `undiscovered` or `rumor` promotes it
  to `active` (#756). One-way only: `completed` and `failed` are DM verdicts and
  a revisit never reopens them.

## Quest nesting

`parent_quest_id` is a sort hint and nothing more. A parent's cursor does not
aggregate or reflect its children's progress, and completing every child does not
advance the parent. Sub-quests get an ordinary row here like any other quest.
