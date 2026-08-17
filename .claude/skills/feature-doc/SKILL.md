---
name: feature-doc
description: Map changed source paths to the owning context/features/ doc, and check the doc still matches the code. Use before starting work on a feature area, and again before reporting that work is complete.
user-invocable: true
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# /feature-doc — find the doc that owns this code

Arguments: none (uses the current diff), a path, or a feature name.

`context/features/` holds 17 docs covering both the DM and player sides of each
feature, with exact file paths, composables, TypeScript types and DB tables.
Reading the right one before touching a feature is a standing project rule, and
updating it afterwards is the other half.

The rule fails at the **mapping**, not the discipline: 763 components, 17 docs,
and directory names that do not line up one-to-one with feature names. This
skill owns the mapping so you do not have to guess.

## Step 1 — Establish the paths

With no argument, take them from the diff:

```bash
git diff --name-only HEAD && git status --short
```

## Step 2 — Map paths to docs

Directory → doc. Directories appear under both `src/components/` and
`src/views/`; both map the same way.

| Source directory | Doc |
| --- | --- |
| `calendar/`, `notes/`, `campaign/` | `campaign-notes-calendar.md` |
| `locations/`, `quests/`, `factions/` | `world-building.md` |
| `npcs/` | `npcs.md` |
| `party/`, `character-sheet/`, `levelup/`, `species/`, `backgrounds/`, `codex/`, `src/levelup/` | `party-characters.md` |
| `monsters/`, `encounters/` | `combat-encounters.md` |
| `items/`, `inventory/`, `spells/`, `crafting/` | `items-spells-crafting.md` |
| `dungeon-features/`, `traps/`, `puzzles/`, `rules/` (roll & loot tables) | `dungeon-craft.md` |
| `cartographer/`, `src/cartographer/` | `cartographer.md` |
| `downtime/` | `downtime-interlude.md` |
| `simulacrum/`, `minis/` | `simulacrum.md` |
| `scriptorium/`, `cardforge/`, `tokenforge/`, `mint/`, `illuminate/`, `publishing/`, `gallery/` | `publishing-tools.md` |
| `play/`, `player/` | `player-portal.md` |
| `chat/`, `auth/`, `account/` (invites, members, roles, live sync, RLS) | `collaboration.md` |
| `soundboard/` | `soundboard.md` |
| notification emails, `send-notification-email` edge fn | `notifications.md` |
| `deities/`, `pantheons/` | `world-building.md` (setting content) |

Not in the table — check these before concluding there is no doc:

- `admin/`, `billing/`, `dev/`, `spike/`, `common/`, `layout/`, `tiptap/` —
  usually no feature doc. `common/` and `tiptap/` are shared primitives; their
  rules live in `CLAUDE.md`, not a feature doc.
- `src/lib/<feature>/`, `src/rules/`, `src/composables/` — map by **who imports
  them**, not by name. `rg "lib/<name>\"" src/` answers it. CLAUDE.md lists
  several modules that are misnamed relative to their owner (`edgeTreatment` is
  photo edges, not map edges; `npcEncounterSync` is encounter state, not
  realtime transport).
- `supabase/migrations/`, `supabase/functions/` — map by the tables they touch.
- Cross-feature or pointing outside the app → `context/architecture/index.md`,
  which also holds the outage triage table.
- **Any AI generator → also `context/compliance/ai-act.md`**, the Art 50
  transparency register. Non-negotiable for anything AI-touching.

If a path maps to nothing, say so rather than forcing it into the nearest doc.

## Step 3 — Read, and say what you read

Read each mapped doc **before** writing code. Report which docs you read and
the constraints they impose — file paths, composables, types, tables, and the
DM/player split, which is where most surprises live.

## Step 4 — On the way out, check the doc still matches

Run this after the work, not before. For each doc you touched the code for:

- Are the file paths still correct — anything renamed, moved, or deleted?
- New composables, types or DB tables to list?
- Did the DM/player split change? Did a field's visibility change?
- Does any migration version cited in the doc still exist under that name?

Update it in the same session. A drifted doc is worse than no doc: the next
worker trusts it.

There is no changelog. The record of what shipped is git history; the record of
**why** is a comment where the decision lives — the code, the migration, or
this doc.
