# The Interlude — Downtime Activities

Async, card-driven downtime that plays out in the player portal between sessions, whose results become **real campaign entities**. GitHub issue: [#486](https://github.com/irongollem/grimoire/issues/486).

The loop:

> DM grants a downtime credit → player spends a draw on a card → the draw lands `pending` → the DM resolves it on a batch board → the outcome spawns a real, linked, editable NPC.

**Phase 1 shipped one archetype (Carouse), end-to-end. Phase 2 generalised the reward plumbing (NPC → NPC / item / note) and filled the deck to eight archetypes — every one of them is now *data*, not plumbing.**

---

## Design decisions (and why)

| Decision | Rationale |
| --- | --- |
| Credits are **DM-granted only** — no calendar/long-rest automation | Auto-granting from long rests yanks pacing out of the DM's hands. A draw is a gift the DM gives, which is what makes holding one feel like it matters. |
| Draws land `pending`; the **DM resolves** on a batch board | Keeps the DM the author of their world. Async by design — the player spends between sessions, the DM resolves before the next one. |
| Credits are **per character**, not per user | A user may own several `party_members`. Every table keys on `party_member_id`. |
| Balance is **derived**, never stored | `sum(grants) − draws where status <> 'cancelled'`. Cannot drift. A cancelled draw refunds; a resolved one does not. |
| Outcomes **propose** effects; the DM disposes | "The DM decides how dark their world is; we facilitate." Nothing mutates a character until the DM ticks a box. |
| Spending is **confirmed, then the card turns face-down** | A player reported that tapping a card did nothing. It did — the draw landed — but the board said so only in the empty-state line ("Nothing to spend yet…", identical to never having had a credit) and in a `text-2xs` row buried under eight cards. See "Saying that something happened" below. |
| Prepped card backs are a **per-archetype FIFO pile** | Prepped backs are dealt first; when the pile is dry the deck falls back to a random system seed. Same deck serves the winging-it DM and the DM who plots six sessions ahead. |
| Archetype catalog + seeds live in **code, not the DB** | Adding an archetype must be data, never a migration. |

---

## Files

### Data & types

| File | Role |
| --- | --- |
| `src/types/downtime.types.ts` | Vocabularies (`DowntimeRewardType`, `DowntimeDrawStatus`), the `DowntimeEffect` discriminated union, DB row types, `DowntimeActivity`, `DowntimeSeed`, the polymorphic `DowntimeSeedReward` (`npc`/`item`/`note`), `DrawResult` |
| `src/data/downtimeActivities.ts` | The archetype catalog. Eight archetypes (Carouse, Craft, Research, Train, Business, Pit Fighting, Lie Low, Pull a Job). `getDowntimeActivity(key)` returns `null` for unknown keys |
| `src/data/downtimeSeeds.ts` | System seed content + vignettes and proposed effects, keyed by archetype. Each seed's `reward` is `npc`/`item`/`note`. `seedsForActivity(key)` |

### Logic (pure, unit-tested)

| File | Role |
| --- | --- |
| `src/lib/downtime/downtimeDeck.ts` | `drawFromDeck(activityKey, backs, seeds, rng)` — prepped FIFO first, else weighted seed. **RNG is injected**; the function is pure. Also `nextPreppedBack`, `pickWeightedSeed` |
| `src/lib/downtime/downtimeBalance.ts` | `computeBalance(grants, draws)` |
| `src/lib/downtime/downtimeSeedReward.ts` | `npcInsertFromSeed` / `itemInsertFromSeed` / `noteInsertFromSeed` — per-kind clone payloads, `Omit<…,"campaign_id">`. Minted rows are private + hidden from players by default; notes convert Markdown → Tiptap here |
| `src/lib/downtime/downtimeReward.ts` | `downtimeRewardHref` (an `item` is at `/vault/:id`, **not** `/items/:id`), `pendingRewardLabel` (voice-neutral, because the DM board renders it too), `RESOLVABLE_REWARD_TYPES` / `isResolvableRewardType` |
| `src/lib/downtime/downtimeEffects.ts` | `applyCoinEffects` / `applyHpEffects` / `applyConditionEffects` (pure, ticked-only), `isAutoAppliedKind`, `hasApplicableMemberEffect` — the state transforms the app enacts automatically |

Tests: `downtimeDeck.test.ts` (21), `downtimeBalance.test.ts` (7), `downtimeEffects.test.ts` (24), `downtimeSeedReward.test.ts` (13, incl. deck-data invariants), `downtimeReward.test.ts` (7, incl. a guard that every kind a seed can mint is one the boards can name).

### Composable

`src/composables/downtime/useDowntime.ts` — everything under a **single `"downtime"` query-key root**, so one `invalidate("downtime")` string in `useCampaignLiveSync` refreshes all four tables.

- Queries: `useDowntimeGrants`, `useDowntimeDraws`, `useDowntimeOutcomes`, `useDeckBacks`, `useDowntimeBalance`
- Mutations: `useGrantDowntime`, `useSpendDraw`, `useCancelDraw`, `useResolveDraw`, `useApplyEffects`, `useCreateDeckBack`, `useDeleteDeckBack`
- `useResolveDraw` dispatches on `seed.reward.kind`: mints the reward via `createNpc`/`createItem`/`createNote` (an ordinary RLS-checked insert) **before** the RPC, then hands the id in — the definer function never creates entities for the caller. Invalidates `npcs`/`items`/`notes`.
- `useApplyEffects` applies the ticked coin/HP/condition effects in one `party_members` read-modify-write (via the pure `downtimeEffects.ts` transforms). `item` effects stay a DM checklist.
- `previewDraw(activityKey, backs)` binds `Math.random` at the edge

`src/composables/downtime/useDowntimeRewardName.ts` — the **DM-side** reward-name
lookup (`useNpcs`/`useItems`/`useNotes`), shared by `DowntimeBoardView`'s
resolved feed and `DeckBacksPanel`'s prepped pile. It exists because those two
surfaces had each hand-written the same switch and only one of them was right;
see "Naming the reward" below before writing a third copy.

> `useDowntimeBalance` returns `number | null`. **Null means "not knowable yet"** — loading, or this user plays no character here. It is deliberately *not* zero, so the UI hides the board rather than rendering a misleading `0`.

### Components (`src/components/downtime/`)

| File | Used by |
| --- | --- |
| `DowntimeActivityCard.vue` | Player board **and** DM prep panel — one component, props differ. Procedural card face from `accent` + `glyph` when `artUrl` is null. Two-faced: `pendingCount > 0` turns it face-down (`cardTurnStyle` from `lib/motion.ts`) |
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
>
> The reward entity (the cloned NPC) is created **before** `resolve_downtime_draw` as an ordinary RLS-checked insert, and its id passed in — so the definer function never creates entities on the caller's behalf.

Both RPCs: `revoke execute from public, anon; grant execute to authenticated, service_role;`

---

## Verified

The full loop was exercised against the live DB as a real player and DM (JWT claims + `authenticated` role, so RLS and the RPC guards actually run), inside a rolled-back transaction. All twelve assertions passed:

spend blocked at 0 credits · player cannot self-grant · DM grants · player spends · double-spend blocked · player cannot resolve · DM resolves · draw marked resolved · one-shot back consumed · recurring back **not** consumed · double-resolve blocked · balance returns to 0.

---

## Saying that something happened

A spend is asynchronous by design: the player commits, and the outcome arrives
a session later from the DM. That leaves the tap itself with nothing to show,
and the first version showed nothing — the complaint was literally "nothing
happens". Four things now answer the tap, in the order the eye meets them:

1. **A confirm before the spend.** The card is a large art tile, which reads as
   *tap to open*, not *tap to spend a scarce, DM-granted credit only the DM can
   refund*. `useConfirm`, `danger: false`. The activity name leads the *message*
   rather than the title, because `ModalHeader` keeps a title to one line and
   "Spend your draw on Craft & En…" is not a question anyone can answer.
2. **The card turns over.** A real `rotateY` through `transform-3d` +
   `backface-hidden`, at `CARD_TURN_MS` (520ms — longer than any other motion in
   the app, because a turn under ~400ms reads as an instant swap of two faces,
   which is the very "nothing happened" it exists to cure). It turns on confirm,
   optimistically, and the refetched draw takes the state over; a DM's
   cancellation turns it back. Reduced motion zeroes the duration but keeps the
   rotation — the resting face *is* the state, not decoration.
3. **A toast**, naming the activity. Note this is a deliberate departure from
   the crafting precedent's "no toast, on purpose": crafting surfaces its
   outcome inline on the same panel, and this one cannot.
4. **The pending list sits above the board**, not below it, and names each
   activity. It is the answer to "what did my tap do"; under four rows of cards
   nobody ever reached it.

And the balance line distinguishes **"0 draws, one is with your DM"** from
**"0 draws, you never had one"**. Collapsing those two was the actual bug: a
successful spend reported itself in the words of the empty state.

### Naming the reward — the bug Phase 2 left behind

Phase 2 generalised what a draw *mints* (npc → npc/item/note) but not what the
two boards can *name*: both `rewardName` and `rewardHref` began
`if (rewardType !== "npc") return null`, so every item and note reward ever
handed out rendered as **"??? (no longer exists)"** while the row sat intact in
the campaign. Found 5 Sep 2026 on a resolved Craft & Enchant draw whose item,
The Frostbound Clasp, was in the Vault the whole time.

It is worth naming the shape of it, because the vignette's own docstring
already forbade exactly this ("must never be reported as 'no longer exists' —
that's a lie the player can catch out"). The rule was written for the npc path
and then the npc path was the only one that got the code. **A guard that lives
in one branch of a switch is not a guard.**

How it resolves now:

- **DM board** — resolves npc/item/note through `useDowntimeRewardName`, which
  `DeckBacksPanel` shares. The DM owns every row, so an unresolved one of those
  genuinely is deleted and may say so. The three kinds nothing can currently mint report as *pending*
  rather than absent, because nobody looked them up — an unchecked absence is a
  guess, not a fact.
- **Player board** — resolves npc/item against the gated projections. Anything
  else it cannot see is **always** pending, never absent: seed rewards are
  minted hidden, a player cannot tell "withheld" from "deleted", and the reward
  pair is null-together by CHECK, so an id present means a row was created.
- Only a **resolved** reward gets a link, since a link to a deleted id 404s.

## Named limits (current)

- **`gold`, `hp`, and `condition` effects are applied programmatically** (`party_members` carries `cp/sp/ep/gp/pp`, `current_hp`/`max_hp`, and `conditions[]`). Only **`item`** stays a DM checklist: an `item` effect names an `item_id` + qty to drop into inventory, which needs an inventory insert and an item-name the effect doesn't carry, so no seed emits one and the DM hands items over by choice. HP clamps to `[0, max_hp]`; conditions de-dupe case-insensitively.
- **Item rewards mint a catalog `items` row**, they do **not** auto-add to a character's inventory (that would mutate a sheet without a tick, and the Workshop is the intended handoff — a Phase 3 "reuse Workshop" nicety).
- Seed backs are bounded to the reward kinds we can build from a template (`npc`/`item`/`note`); **prepped** backs can point at any of the six `DowntimeRewardType`s (the DB CHECK allows all), and the prep UI (`DeckBacksPanel`) currently offers `npc`/`item`/`note` pickers.
- No AI outcome drafting. No Cardforge export. No conditioned card backs (per-player / per-location).
- **The roll/loot-table engine is not wired behind `drawFromDeck()`, and outcomes are not delivered via drop-chest.** This is the design's *optional* branch — the seed→entity clone path delivers every reward end-to-end without it. Left for a follow-up (see below).
- Seeds are TS templates, not a DB table — and they **stay** that way. Art lives in the `downtime-images` bucket under the `srd/` prefix (migration `20260713000002`), and the URL is a plain string in the data file. **No `srd_*` table is needed**: those exist for monsters/spells because a DM can override *their* canonical art per-campaign, which is deliberately not true of the system deck. (An earlier version of this doc claimed the seeds "must become an `srd_*` table" — that was wrong, and so was the name: `srd/` is only this codebase's label for "canonical, shared, admin-managed". None of this content is System Reference Document material; it is ours.) The real constraint from `CLAUDE.md` stands: **canonical art may never live under a user UUID.**
- Art slots (`portrait_url` on NPC seeds, `image_url` on item seeds) exist and are `null`; cards fall back to their procedural `accent`+`glyph` face, so nothing waits on artwork. Note-yielding seeds have no art slot — `notes` has no image column. Briefs for the 21 images: `context/features/downtime-art-briefs.md`.

## Optional rule + docs

The Interlude is a **campaign-toggleable module**, like Crafting.

- Registered in `src/rules/optionalRules.ts` as `key: "downtime"`, `defaultEnabled: true` (so no existing campaign silently loses it). The Settings → Rules toggle and the Reliquary entry are generated from that registration — no UI edit needed.
- **DM nav** hides via `ruleKey: "downtime"` on the `nav.ts` entry (existing mechanism).
- **Player nav** needed *new* plumbing: `PlayerNavItem` had no `ruleKey` at all, so a player kept seeing the tab for a module the DM had switched off. Added `ruleKey?: string` to `PlayerNavItem` and the filter in `usePlayerNavPrefs()` (the single place every player-nav consumer reads). **This also fixes the same latent bug for Workshop**, which now carries `ruleKey: "crafting"`.
- **Both views refuse to render** when the rule is off (`RuleDisabledNotice.vue`), because a bookmarked `/downtime` or `/play/downtime` still reaches the view and would otherwise let a draw be spent in a module the table isn't using. The crafting reference pattern has no such guard; ours does.

DM Manual page: `src/manual/interlude-overview.md` (section "The Interlude", `section_order: 13`). Manual pages are auto-discovered by a Vite glob — creating the file is the whole registration.

## Phase 2 / 3

- **Phase 2 — shipped.** Polymorphic seed rewards (`npc`/`item`/`note`) with a per-kind clone→create dispatch in `useResolveDraw`; the deck filled to eight archetypes as pure data; automatic `gold`/`hp`/`condition` application via pure `downtimeEffects.ts` transforms; `DeckBacksPanel` prep generalised to `npc`/`item`/`note`. No migration — reward-type CHECKs and the `current_hp`/`conditions` columns already existed. Verified: typecheck clean, 65 unit tests, DB constraint/column confirmation.
- **Phase 2 — deferred (the doc's "optional" branch, tracked for follow-up):** wire `loot_tables`/`roll_tables` behind `drawFromDeck()` (now safe: both rollers gained characterisation tests in `cc5cd6bc`, see [#487](https://github.com/irongollem/grimoire/issues/487) for the sharp edges) so `Pit Fighting → prize` rolls the live Vault; drop-chest delivery for multi-reward outcomes via `sendLootChest()`. The current item-reward path (mint a catalog item template) covers the loop without these.
- **Phase 3 — AI outcome drafting: shipped.** Migration `20260713000001` adds the `downtime` system prompt + the `downtime_generation` credit cost (1 credit, `sort_order` 17). Edge function `supabase/functions/generate-downtime/` is a **text-only** clone of `generate-trap` — the cards render procedural faces, so there is no illustration, no `entity_image` charge, and no remote-image fetch (hence no SSRF surface). It is **owner-only** (not any campaign member, unlike `generate-trap`): only the DM resolves draws, so a player member must never be able to spend the owner's credits.
- **Retrieval grounding (#600, fourth grounded generator).** `generate-downtime` injects the shared campaign-entity block (`_shared/campaignEntityRetrieval.ts` — see world-building.md's "Retrieval grounding" for the mechanism) so a vignette can name the DM's real shops, contacts and locations. Because the steer prompt is optional and usually empty, the semantic query composes `activity_title — character_name — steer` ("Carousing — Wilhelm" retrieves taverns and drinking companions with no steer at all). Grounding is input-side only, like the Chronicler: the vignette is prose and the reward entity is net-new by design (`npcInsertFromSeed`), so nothing resolves back to rows and there is no chip surface. Any retrieval failure degrades to the exact pre-#600 prompt. Downtime seed-reward NPCs/notes created via the resolve path queue their own embeddings (`useDowntime.ts` — direct `createNpc`/`createNote` calls bypass the mutation hooks' embed wiring).
  - Frontend: `src/ai/useDowntimeGeneration.ts` (registered so `isAnyAiGenerating` includes it; local/BYOK branch mirrors the trap generator), and a **Draft** button + optional steer inside `DowntimeResolvePanel`.
  - **A draft returns a `DowntimeSeed`, not a bespoke type** — so it replaces what the deck dealt and travels the *ordinary* resolve path, with zero parallel plumbing.
  - `src/lib/downtime/downtimeAiSeed.ts` is the **airlock**: the model's JSON is untrusted input. It invents effect kinds, hallucinates conditions ("Hungover"), and picks item types that don't exist. Policy: **drop what we can't honour, throw only on what we can't do without** — an unusable draft raises `DowntimeAiParseError` with a message the DM reads; a bogus rarity falls back to `mundane` (never to something powerful); `applied: true` from the model is never trusted. 24 unit tests.
- **Phase 3 — Cardforge deck export: shipped.** 5th `CardSubject` kind (`downtime`) + `useDowntimeCardData.ts` + four style components (Inked/Modern × front/back). Accent is derived from **risk** (`accentForDowntime`: safe→green, risky→amber, dangerous→red) rather than the activity's single hex, because a Card Forge accent needs all three roles (tag/line/text).
  - **Gotcha, resolved once:** every dispatch site keyed on `subject.data.id`, but `DowntimeActivity` has `key` (which is what `downtime_draws.activity_key` stores). Rather than bolt a duplicate `id` onto the activity and invite drift, `cardSubjectId(subject)` in `card.types.ts` owns the mismatch. The store's `kind + "s"` source derivation was also replaced with an explicit `KIND_TO_SOURCE` map — `"downtime"` is not `"downtimes"`, and the silent mis-pluralisation would have dropped a whole bucket on collection load.
- **Phase 3 — canonical art: bucket ready, images pending.** Migration `20260713000002` provisions `downtime-images` with an `srd/`-prefix, admin-only write path (gated on `private.is_app_admin()` — note the older monster/spell policies still say `public.`, predating the relocation in `20260629000002`) and public read. The bucket deliberately has **no per-user upload path**: every image is canonical.
  - The **`srd_*` table idea was dropped, and the earlier claim that one was required was simply wrong.** Those tables exist for monsters/spells so a DM can override *their* canonical art per-campaign; the system deck is not overridable, and the catalog lives in code, so the URL is just a string in the data file.
  - Art slots exist and are `null` — the deck renders procedural faces until the images land. 21 briefs (8 archetype card faces + 6 seed NPC portraits + 7 seed item images) in `context/features/downtime-art-briefs.md`. Note-yielding seeds get none: `notes` has no image column.
