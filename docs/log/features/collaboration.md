# Features — Collaboration

Shipped features in the **Collaboration** area, newest first. Part of the Grimoire feature log — see the [log index](../index.md).

- [x] **Unified player sharing pattern** — refactored Atlas, Quests, Factions, and Workshop (Crafting) to use the same `PlayerVisibilityToggle` component and DB pattern (`shared_with_players` + `player_visible_to`); replaced Crafting's grant-table system with the per-player visibility column approach; NPCs already implemented this pattern

- [x] **Entity notes** — generic `entity_notes` table keyed by `entity_type + entity_id`; private (author only) or party-shared notes on any entity; shown on faction detail board

- [x] **DM Prep / Play mode toggle** (irongollem/grimoire#133) — DM-only segmented `PREP | PLAY` pill in the sidebar header (and mobile top bar), state in Pinia `useUiStore.dmMode` and persisted to localStorage so a mid-session reload keeps the mode. In **Play** mode, flipping an NPC's `player_visible_to` from empty to at least one player auto-posts a narrative event into campaign chat (`You encounter <name>.`) via a new `sendNarrativeEvent()` helper that emits a `system`-typed message with no sender. **Prep** mode (default) keeps visibility changes silent so the DM can build sessions freely. Transition detection is strictly 0 → ≥1 — adding more players to an already-visible NPC doesn't re-announce. MVP ships NPCs; Locations / Items / Encounter-start follow the same 0→≥1 pattern and can be added in follow-ups.

- [x] **Phase 1**: campaign_members + campaign_invites tables, DM auto-membership, invite link flow (/join/:token), role-based router guard, Campaign Settings UI

- [x] **Phase 3**: encounter_state table, live encounter sync (DM "Go Live" button), PlayerEncounterView (initiative, HP, active combatant), live encounter indicators, state persists across navigation

- [x] **PlayerVisibilityToggle component** — reusable eye-icon button in action bars opening a popover with "All players" toggle + individual party member checkboxes; used in LocationEditor and NpcDetail (replacing the old Players foldout); locations get new `shared_with_players` + `player_visible_to` columns matching the NPC pattern

- [x] **OpenAI image model selection (gpt-image-1.5 vs gpt-image-2)** — localStorage-persisted toggle in `AiTab.vue` (Campaign Settings → AI → Model); `OPENAI_IMAGE_MODEL_KEY` constant in `src/ai/providers/index.ts`; `useChroniclerImageGeneration` respects selected model; default downgraded from gpt-image-2 to gpt-image-1.5 (better cost/quality ratio for DM portrait generation); mini provider continues to use gpt-image-1-mini. `getImageProvider()` factory reads from localStorage with fallback. Cost estimates in docs updated from gpt-image-2 (~$0.05–0.20) to gpt-image-1.5 (~$0.02–0.07).
