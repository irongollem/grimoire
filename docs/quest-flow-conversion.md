# Quest flow conversion and coexistence

Legacy quest sheets and visual story flows intentionally coexist. Migration
`20260810000016` marks flow participation with `quests.flow_enabled_at`; it does
not infer participation from whether a beat happens to exist. Existing quests
stay on their established sheet until a DM previews and confirms conversion.
New quests may opt into Build mode immediately after their normal quest row is
created, so generation, status transitions, objectives, and sharing keep using
the same quest lifecycle.

Conversion is deliberately conservative:

- the optional overview is one hidden discovery beat copied from the existing
  summary or description;
- each existing encounter ref becomes one hidden, unconnected combat beat with
  the same encounter attached;
- staging coordinates are layout only and convey no narrative order;
- no edges are inferred from ref order, timestamps, objective order, or arrays;
- quest fields, objectives and their triggers, rewards, refs, subquests, player
  sharing, and legacy player routes are not rewritten or deleted.

The preview RPC is read-only and reports exact creation and preservation counts.
Conversion uses provenance columns plus a partial unique index, so retries cannot
duplicate generated beats. Rollback deletes only rows carrying conversion
provenance and leaves hand-authored beats and every legacy record intact. Once a
generated beat has runtime history, rollback is refused rather than deleting an
account of what happened at the table.

Legacy retirement is a separate project, not an automatic follow-up. It should
only begin after telemetry or a migration audit proves every active quest has
explicitly enabled flow, generated/imported quest creation enters the same
lifecycle, all legacy fields have a demonstrated home in Build/Run/player views,
and rollback has no remaining operational use. Until then, legacy refs and quest
fields remain authoritative and both routes are supported.
