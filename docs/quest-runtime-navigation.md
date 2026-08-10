# Quest runtime navigation

The authored quest graph and the route taken at the table are separate. Runtime
movement goes through `transition_quest_runtime`; clients have read-only access
to `quest_runtime_state` and `quest_beat_transitions`.

## Commands

- `start` enters a selected beat and starts a fresh visit path.
- `advance` follows a specific outgoing authored edge.
- `previous` moves backward through actual visit order, including cycles and
  repeated beats. It does not inspect incoming authored edges.
- `jump` enters any non-archived beat in the campaign, records a reason, and can
  push the current beat as a return point.
- `return` pops the latest explicit return point.
- `improv` enters an `is_improvised` beat and records why it was created.
- `pause`, `resume`, and `end` are lifecycle transitions and history entries.

Every command takes the version the DM loaded. The database locks the campaign
runtime row, checks that version, updates the cursor, and appends one immutable
history row in the same transaction. A stale co-DM receives a serialization
error and must reload instead of silently replacing the newer position.

`get_quest_runtime_context` is the Run-mode projection. It returns the current
beat, prior visited position, authored outgoing choices, latest return target,
and path so far. History stores quest/beat titles and edge provenance at the
time of movement, so later editing or detaching authored material does not make
the session record unreadable. Runtime navigation never alters player reveal or
visibility fields.

Jump pickers use `search_quest_runtime_jump_targets`. The server limits results
to non-archived beats in the active campaign and searches both quest and beat
titles; the browser never receives another campaign's prep material.
