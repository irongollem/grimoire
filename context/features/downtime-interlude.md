# The Interlude — Downtime Activities

Async, card-driven downtime that plays out in the player portal between sessions, whose results become **real campaign entities**. GitHub issue: [#486](https://github.com/irongollem/grimoire/issues/486).

The loop:

> DM grants a downtime credit → player spends a draw on a card → the draw lands `pending` → the DM resolves it on a batch board → the outcome spawns a real, linked, editable NPC.

**Phase 1 ships exactly one archetype (Carouse), end-to-end.** Every subsequent archetype is *data*, not plumbing.

---

## Design decisions (and why)

| Decision | Rationale |
| --- | --- |
| Credits are **DM-granted only** — no calendar/long-rest automation | Auto-granting from long rests yanks pacing out of the DM's hands. A draw is a gift the DM gives, which is what makes holding one feel like it matters. |
| Draws land `pending`; the **DM resolves** on a batch board | Keeps the DM the author of their world. Async by design — the player spends between sessions, the DM resolves before the next one. |
| Credits are **per character**, not per user | A user may own several `party_members`. Every table keys on `party_member_id`. |
| Balance is **derived**, never stored | `sum(grants) − draws where status <> 'cancelled'`. Cannot drift. A cancelled draw refunds; a resolved one does not. |
| Outcomes **propose** effects; the DM disposes | "The DM decides how dark their world is; we facilitate." Nothing mutates a character until the DM ticks a box. |
| Prepped card backs are a **per-archetype FIFO pile** | Prepped backs are dealt first; when the pile is dry the deck falls back to a random system seed. Same deck serves the winging-it DM and the DM who plots six sessions ahead. |
| Archetype catalog + seeds live in **code, not the DB** | Adding an archetype must be data, never a migration. |

---

## Files

### Data & types
| File | Role |
| --- | --- |
| `src/types/downtime.types.ts` | Vocabularies (`DowntimeRewardType`, `DowntimeDrawStatus`), the `DowntimeEffect` discriminated union, DB row types, `DowntimeActivity`, `DowntimeSeed`, `DrawResult` |
| `src/data/downtimeActivities.ts` | The archetype catalog. Phase 1 = Carouse. `getDowntimeActivity(key)` returns `null` for unknown keys |
| `src/data/downtimeSeeds.ts` | System seed NPC contacts + their vignettes and proposed effects. `seedsForActivity(key)` |

### Logic (pure, unit-tested)
| File | Role |
| --- | --- |
| `src/lib/downtimeDeck.ts` | `drawFromDeck(activityKey, backs, seeds, rng)` — prepped FIFO first, else weighted seed. **RNG is injected**; the function is pure. Also `nextPreppedBack`, `pickWeightedSeed` |
| `src/lib/downtimeBalance.ts` | `computeBalance(grants, draws)` |
| `src/lib/downtimeSeedNpc.ts` | `npcInsertFromSeed(seed)` — the clone payload. Hidden from players by default (`player_visible_to: []`) |

Tests: `downtimeDeck.test.ts` (21), `downtimeBalance.test.ts` (7).

### Composable
`src/composables/useDowntime.ts` — everything under a **single `"downtime"` query-key root**, so one `invalidate("downtime")` string in `useCampaignLiveSync` refreshes all four tables.

- Queries: `useDowntimeGrants`, `useDowntimeDraws`, `useDowntimeOutcomes`, `useDeckBacks`, `useDowntimeBalance`
- Mutations: `useGrantDowntime`, `useSpendDraw`, `useCancelDraw`, `useResolveDraw`, `useApplyGoldEffects`, `useCreateDeckBack`, `useDeleteDeckBack`
- `previewDraw(activityKey, backs)` binds `Math.random` at the edge

> `useDowntimeBalance` returns `number | null`. **Null means "not knowable yet"** — loading, or this user plays no character here. It is deliberately *not* zero, so the UI hides the board rather than rendering a misleading `0`.

### Components (`src/components/downtime/`)
| File | Used by |
| --- | --- |
| `DowntimeActivityCard.vue` | Player board **and** DM prep panel — one component, props differ. Procedural card face from `accent` + `glyph` when `artUrl` is null |
| `DowntimeOutcomeVignette.vue` | Player history **and** DM board |
| `DowntimeResolvePanel.vue` | DM board — one pending draw |
| `DeckBacksPanel.vue` | DM board — "stack the deck" |
| `GrantDowntimeButton.vue` | DM board + party list |

### Views
- **Player** — `src/views/play/PlayerDowntimeView.vue`, route `/play/downtime`, nav in `src/lib/playerNav.ts`. Red unread dots via `useReadItems("downtime_outcome")` (the generic `player_read_items` table; no schema change).
- **DM** — `src/views/downtime/DowntimeBoardView.vue`, route `/downtime`, nav in `src/lib/nav.ts`. Filter state in `useUiStore` (`downtimeFilterStatus`, `downtimeFilterCharacter`, `downtimeHasActiveFilters`, `resetDowntimeFilters`) + a **Clear** button.

Nav entries reuse `IconNavCalendar` — no downtime-specific glyph exists yet.

---

## Schema (`20260710000001_downtime_interlude_phase1.sql`)

| Table | Notes |
| --- | --- |
| `downtime_grants` | Append-only credit ledger. `granted_by`, `amount > 0`, `reason` |
| `downtime_draws` | `status in (pending, resolved, cancelled)`. `activity_key` is deliberately unconstrained — archetypes are code |
| `downtime_deck_backs` | The prepped pile. `(reward_type, reward_id)` polymorphic pair, `is_recurring`, `position`, `consumed_at` |
| `downtime_outcomes` | `draw_id` unique. `proposed_effects jsonb`. `reward_type`/`reward_id` nullable *together* (CHECK) |

All four: RLS on, 4 policies, `updated_at` trigger, in the realtime publication.

**Polymorphic reward** is a `(reward_type, reward_id)` pair rather than six nullable FKs — mirrors `player_read_items(entity_type, entity_id)` and `quest_refs`. Cost: no referential integrity. A deleted target renders as the `"???"` absence marker, never coerced away.

### RLS helper
`private.my_party_member_id(cid uuid)` — which character the caller plays in this campaign. Lives in **`private`** because RLS policies reference it (PostgREST does not expose `private`; `anon`/`authenticated` keep `EXECUTE` so policies resolve — do **not** revoke).

### RPCs
- **`spend_downtime_draw(p_campaign_id, p_activity_key)`** — the only path a player spends a credit. `SECURITY DEFINER`; authorizes internally by deriving the character from `auth.uid()` (never a caller-supplied id), then re-checks the balance under `pg_advisory_xact_lock` before inserting. This closes the double-spend race a client-side check cannot.
- **`resolve_downtime_draw(p_draw_id, p_title, p_vignette, p_reward_type, p_reward_id, p_effects, p_back_id)`** — DM-gated on `private.is_campaign_dm` against the *draw's own* campaign. Inserts the outcome, closes the draw, and consumes a one-shot back atomically.

> Granting needs **no RPC** — a plain insert guarded by an RLS policy is sufficient and keeps the `SECURITY DEFINER` surface minimal.

> The reward entity (the cloned NPC) is created **before** `resolve_downtime_draw` as an ordinary RLS-checked insert, and its id passed in — so the definer function never creates entities on the caller's behalf.

Both RPCs: `revoke execute from public, anon; grant execute to authenticated, service_role;`

---

## Verified

The full loop was exercised against the live DB as a real player and DM (JWT claims + `authenticated` role, so RLS and the RPC guards actually run), inside a rolled-back transaction. All twelve assertions passed:

spend blocked at 0 credits · player cannot self-grant · DM grants · player spends · double-spend blocked · player cannot resolve · DM resolves · draw marked resolved · one-shot back consumed · recurring back **not** consumed · double-resolve blocked · balance returns to 0.

---

## Named limits (Phase 1)

- **Only `gold` effects are applied programmatically** (`party_members` already carries `cp/sp/ep/gp/pp`). `item` / `hp` / `condition` render on the board as a checklist the DM enacts at the table. Phase 2 wires them to real state.
- One archetype (Carouse). No AI outcome drafting. No Cardforge export. No conditioned card backs (per-player / per-location).
- Seeds are TS templates, not a DB table. **The moment we ship curated per-seed artwork this must become an `srd_*` table with the `srd/` storage policy in the same migration** — canonical art may never live under a user UUID.

## Phase 2 / 3

- **Phase 2** — remaining archetypes as pure data; optionally wire `loot_tables`/`roll_tables` behind `drawFromDeck()` (now safe: both rollers gained characterisation tests in `cc5cd6bc`, see [#487](https://github.com/irongollem/grimoire/issues/487) for the sharp edges found); drop-chest delivery for multi-reward outcomes; apply `item`/`hp`/`condition`.
- **Phase 3** — AI outcome drafting (new `generator_type` + `ai_generation_credit_costs` row, edge function modelled on `supabase/functions/generate-trap/index.ts`, frontend via `registerAiGenerator`); `srd_*` seed library with curated art; **Cardforge deck export** (5th `CardSubject` kind + `useDowntimeCardData.ts`).
