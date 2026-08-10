# Quest story-flow backfill

Migration `20260810202052` makes the visual beat graph the single quest authoring
model. The campaign's small existing quest set is migrated once instead of
maintaining a permanent opt-in and rollback experience.

For each quest that had not enabled flow, the migration:

- creates one hidden discovery overview when summary or description content is
  available;
- creates one hidden, unconnected combat beat for each encounter reference and
  attaches the existing encounter;
- gives staging beats layout coordinates only;
- never creates edges from reference order, timestamps, objectives, or arrays;
- preserves quest fields, objectives, triggers, rewards, references, subquests,
  player sharing, encounters, and all other authoritative entities.

`quests.flow_enabled_at` is now non-null with a database default. New Quest uses
a lightweight starter and opens Build immediately. The full quest sheet remains
available as Details/Edit for quest-level metadata; it is not a competing quest
mode. Conversion provenance columns remain on generated beats so the origin of
backfilled rows stays auditable, but rollback to a second authoring model is no
longer supported.
