# Features — Player Portal

Shipped features in the **Player Portal** area, newest first. Part of the Grimoire feature log — see the [log index](../index.md).

- [x] **Player faction portal** — `/play/factions` shows player-visible factions with description, notes panel (players can add private + party notes)

- [x] Adventure Journal — player personal journal with 6 categories, context linking, private/shared entries

- [x] Player character sheet — interactive D&D Beyond-style sheet with ability/save/skill rolls → campaign chat

- [x] **Phase 2**: Player portal (/play/\* routes), presence indicators (online dots), notes/quest visibility flags, party inventory (players read), campaign broadcast system, campaign chat + dice roll log (Supabase Realtime)

- [x] **Phase 4**: Interactive player character sheet (ability/save/skill rolls in campaign chat, HP ±buttons, death save pips, condition toggles), inventory management (My Items, Party Stash, equipped weapons), RLS for player-owned updates, broadcast notifications

- [x] **Phase 4 QoL**: Death save "Roll d20" button (nat 1 = 2 failures, nat 20 = stabilize, auto-increments pips + posts to chat); condition-aware rolls — Poisoned/Blinded/Frightened/Prone/Restrained auto-apply disadvantage to attack rolls; Exhaustion applies disadvantage to ability checks; Dis indicator on conditions header + weapon/spell attack buttons (irongollem/grimoire#40)

- [x] **Turn notifications**: Screen shake + optional audio chime when it becomes the player's turn in a live encounter; audio toggle in player Settings → Combat Notifications (irongollem/grimoire#105)

- [x] **Character sheet — Features tab**: Added "Features" tab to `PlayerCharacterView`; shows all class features grouped by level (derived from static class data), class choices (subclass, invocations, expertise, etc.) as chips, and resource pool current/max with rest-type badges — no new DB columns needed

- [x] **Resource & spell slot tracking**: Features tab now fully interactive — spend/restore buttons on class resources (Ki, Rage, Sorcery Points, etc.), pip buttons on spell slots, short rest (restores short-rest resources + Warlock pact slots) and long rest (restores all) buttons with confirm dialog; optimistic local state, persisted via useUpdatePartyMember

- [x] **Inline feature descriptions**: Added FeatureEntry type (string | {name, description}) to class data; annotated all 13 SRD classes at levels 1–5 with concise descriptions; Features tab shows expandable chevron for described features, inline description panel on tap

- [x] **Unified player notes**: `PlayerNotesWidget` component backed by `entity_notes` table — consistent one-note-per-player + shared party notes UX across all player portal views (NPCs, quests, factions, companions)

- [x] **Rest dialog with hit dice** — short rest: roll hit dice (class-appropriate die, CON bonus) to spend toward healing with live HP preview; long rest: full HP/resource/spell slot restore + half-level dice recovery; `hit_dice_remaining` column on `party_members`; `RestDialog` + `RestButtons` components; all rest types post via `useUpdatePartyMember`

- [x] **Player encounter panel** — "YOUR TURN!" pulsing banner in `PlayerEncounterView` when the active combatant matches the player's linked party member; "MY CHARACTER" section shows Features tab with rest buttons

- [x] **Player live encounter CTA** — green pulsing "Live" button in `PlayerLayout` top bar whenever an encounter is running; toast notification + auto-navigate to `/play/encounter` when the DM hits Go Live mid-session (skips initial data load via `runningLoaded` flag); `usePlayerEncounterLive` subscription moved to `PlayerLayout` so turn/HP/visibility/condition updates stay live regardless of which player page is open

- [x] **Encounter sidebar on tablet+** — `PlayerEncounterPanel` extracted into a standalone component rendered as a persistent left sidebar in `PlayerLayout` on md+ screens; mobile still uses the full-page `/play/encounter` route; auto-opens when DM starts a live encounter (silent on page refresh, toast on mid-session start); "Live" button in top bar toggles the panel; players can freely browse all character-sheet tabs while the encounter stays visible

- [x] **Character sheet header redesign** — inspiration star beside name; LevelUp/Edit as icon buttons in name row; HP tools row separate from readout; condition chips with compact `+` picker (search + click to add, × to remove, click chip title for tooltip); disadvantage badges inline beside HP; Rest/Sleep buttons in stats row; global `cursor: pointer` on all buttons via CSS base layer

- [x] **Sorcerer Metamagic** (irongollem/grimoire#343) — `METAMAGIC_OPTIONS` data file (10 PHB options with SP cost + description); level-up wizard picks at 3/10/17; Features tab Metamagic card with SP cost badge + expandable description; `sorcery_points` resource with `per_level` scaling via migration

- [x] **Artificer Infusions** (irongollem/grimoire#344) — `ARTIFICER_INFUSIONS` data file (15 core + 12 Replicate variants); level-up wizard picks at 2/6/8/10/12; `active_infusions` JSONB column on `party_members`; Features tab Infusions card (unified active/inactive list, inline item picker, learn-in-place form); item-delete cascade trigger clears orphaned infusion links; inventory delete warns about linked infusions

- [x] **Barbarian Rage** (irongollem/grimoire#347) — `rage_active` boolean column on `party_members`; Rage card in Features tab: Enter Rage button (spends rage_uses, sets active flag, level-scaled +2/3/4 damage banner with resistance/advantage reminders), End Rage button, long-rest auto-clears active state

- [x] **Monk Ki Abilities** (irongollem/grimoire#349) — `MONK_KI_ABILITIES` data file (8 core abilities with min_level, ki_cost, timing, description); Ki Abilities reference card in Features tab, gated by monk level, expandable per-ability descriptions showing timing context and ki cost badge

- [x] **Fighter Battle Master** (irongollem/grimoire#350) — `superiority_dice` resource added to Fighter (table scaling: 4/5/6 at levels 3/7/15, short rest); `BATTLE_MASTER_MANEUVERS` data file (16 PHB maneuvers); Battle Master card in Features tab with die-size indicator (d8→d10→d12), inline superiority-dice tracker, known-maneuvers list with expandable descriptions, learn-in-place form; superiority_dice and battle_master_maneuvers filtered from generic Resources/Choices displays

- [x] **Paladin — Lay on Hands + Divine Smite** (irongollem/grimoire#351) — `lay_on_hands` resource (already in Paladin system_class) gets variable-spend UI (numeric HP input with confirm/cancel) instead of ±1 buttons; Divine Smite reference card in Features tab shows radiant damage table by slot level (2d8–5d8) + undead/fiend bonus

- [x] **Warlock Eldritch Invocations** (irongollem/grimoire#345) — `ELDRITCH_INVOCATIONS` data file (29 invocations with min_level, prereqs, grants_spell, spell_uses_per_day); level-up wizard picks at 2(×2)/5/7/9/12/15/18; Pact Boon step at level 3; `addInvocationSpellGrant` auto-adds granted spells (at-will or 1/LR) to `character_spells` on level-up; Features tab Invocations card with Spell/level badges + expandable descriptions; single-pick append steps now disable already-known options

- [x] **Party member modal cleanup + Lore tab** (irongollem/grimoire#313, #314) — `player_description` column added to `party_members` (migration `20260429000001`); `PlayerLoreTab` added to character sheet with About (editable by owner), Identity (age/gender/pronouns/physical), Personality (alignment/deity/traits/ideals/bonds/flaws), Notes, and Background (name/image/description/feature/proficiencies); Skills tab stripped of RP fields — purely mechanical now; `PartyMemberLightbox` replaced full species block with compact name+size chips and shows player description via `RichTextViewer`; `PlayerNotesWidget` "From the Party" section now shows the note author's display name; `useMemberByUserId()` composable extracted from inline duplication in `PlayerJournalView` and `PlayerNotesWidget`

- [x] **Phase 3 — Auto-discovery on end combat** — when DM clicks "End Combat", any monster combatants that reached `revealed` state are automatically inserted into `discovered_monsters` (deduped). DM sees a toast listing what was auto-shared.

- [x] **Companion stat block** — optional full stat block on companions; auto-populated when picking a monster source; ability scores, actions, reactions stored in `stat_block` JSONB

- [x] **Player NPC relevance rating (1–5)** — players rate NPCs 1–5 for personal relevance (stored in localStorage per device); rating pips on player portal card grid and detail lightbox; portal sorts by rating desc (unrated last), with search and relationship filter

- [x] **Player Atlas** — `/play/atlas` lists DM-shared maps; expandable cards show `LocationMap` in view mode (player-visible pins only); clicking a pin auto-expands that child's map if it's also shared

- [x] **Player location notes** — each Atlas card has a `PlayerNotesWidget` (private / shared party notes) using the generic `entity_notes` table with `entity_type="location"`

- [x] **Watch panel on atlas pins** — player can hover/click map pins to expand a pill showing pin actions; "Watch" button always available (shows location art + player summary + notes in a modal); "Go there" button gated on `sharedChildIds` (only navigates if child location is shared)

- [x] **Player notes UX overhaul** — `PlayerNotesWidget` now shows two independent boxes: "My Private Notes" (is_private=true, only author sees) and "My Party Notes" (is_private=false, full party sees); "From the Party" section shows all other members' shared notes; RLS updated so players can see each other's non-private notes (previously only DM↔player was symmetric)

- [x] **Atlas search + type filter** (irongollem/grimoire#200) — player Atlas now has a search bar (matches name, player summary, shared description) and type dropdown so players can skip vague parent containers; DM Atlas search also extended to match description body text and notes

- [x] **Player party page responsive grid** (irongollem/grimoire#214) — replaced fixed-width `w-50` flex-wrap cards with `auto-fill` CSS grid (`minmax(180px, 1fr)`) so party member and NPC cards stretch to fill available screen width

- [x] **Clickable NPCs in quest log** (irongollem/grimoire#207) — NPC names in the player quest detail view are now clickable, opening a lightbox with portrait, name, race/occupation, and player notes; giver NPC in the meta row is also clickable

- [x] **Persist Atlas open state** (irongollem/grimoire#199) — expanded/collapsed locations in the player Atlas now survive navigation within the session via `useUiStore` (`atlasChildrenOpen` + `atlasDetailOpen`)

- [x] **Favourite atlas locations** (irongollem/grimoire#316) — players can star any location; starred locations appear in a pinned "Favourites" section at the top of the Atlas (hidden while searching/filtering); persisted in new `player_favourites` table (extensible to other entity types via `entity_type` column)

- [x] **Player theme override** (irongollem/grimoire#197) — players can override the DM's campaign theme with Light, Dark, or System (browser preference) via a toggle in Settings > Appearance. Listens for `prefers-color-scheme` changes in system mode.

- [x] **Player location quick-view dialog** (irongollem/grimoire#442) — when players click @location entity mention chips in quest/journal/note/chat text, locations now open in a floating dialog overlay rather than navigating away to the Atlas list page; DM still navigates to the location detail page. `playerLocationDialogId` state added to `useUiStore` with `openPlayerLocationDialog()`/`closePlayerLocationDialog()` handlers; `EntityMentionChip.vue` routes location chips through the dialog in player routes (`/play/*`)

- [x] **People search & filters** (irongollem/grimoire#74) — added search input + relationship/status/location filter dropdowns above the People section in the player portal; filter state stored in `useUiStore`; Clear button appears when any filter is active; results show empty state when nothing matches

- [x] **Player nav customisation** — players can choose between Dynamic mode (log-tier scoring: needs ~2× visits to advance a tier, preventing jitter from small score differences) or Custom mode (drag-to-reorder list in Settings, pointer-events based so it works on mobile); mode + custom order persisted in localStorage via singleton `usePlayerNavPrefs` composable; nav item definitions and slot counts (`MOBILE_NAV_SLOTS=4`, `TABLET_NAV_SLOTS=7`) centralised in `src/lib/playerNav.ts`

- [x] **Player encounter view: Wild Shape picker and active form** (irongollem/grimoire#124) — druids see a Wild Shape card above the combatant list when an encounter is live; beast picker filtered by level/CR cap, Circle of Moon detection, no fly/swim before level 8, discovered+pinned beasts only; active form shows AC, speed, rollable trait sections; Revert Form restores original HP/AC via existing store action; non-druid players see nothing

- [x] **Temp HP reflected in life bar** (irongollem/grimoire#273) — HP bars in `PlayerCharacterView` (tablet+) and `PlayerCharacterHeader` (mobile) now render two segments: regular HP in its normal color + a blue extension for temp HP; both segments are proportional to `max_hp + temp_hp` so the bar always fills its container

- [x] **Reference links in player views** (irongollem/grimoire#315) — locations referenced in quest detail (key locations + primary location) render as tappable buttons when the player has access to that location (resolved via `useSharedLocations`), navigating to `/play/atlas?open=<id>` which expands and scrolls to the target; atlas view consumes the `open` query param via `watch` to call `goToLocation` after data loads. NPCs in "People in the Area" on each atlas location panel are now tappable buttons opening a reusable NPC lightbox modal (matching the quest detail NPC lightbox) with portrait, name, race, occupation, and player notes.

- [x] **Party group portrait** — added `party_group_portrait` (text/nullable) column to `parties` table via migration; `PartyView` editor form + `useGroupPortrait` composable for portrait upload/storage; allows DM to set a single party portrait used in AI generation (@party mention token resolves to this portrait). Chronicler image generation enhanced to support `@party` token alongside individual party member mentions, including text description support for group portrait (height, appearance).

- [x] **DM session scheduling** (irongollem/grimoire#298) — `session_proposals` + `session_availability` tables with DM-only RLS; `SchedulingTab.vue` in Campaign Settings lets DM propose dates (date/time, title, notes, duration, min attendance), confirm/cancel/edit, and see per-player availability breakdown; `PlayerSettingsView.vue` shows confirmed sessions and Yes/No response toggles; both tables added to `useCampaignLiveSync` for real-time response updates on the DM screen.

- [x] **Player journal "Share with DM"** (irongollem/grimoire#362) — Added `shared_with_dm boolean default false` to `player_journal_entries`; players can check "Share with DM" on private journal entries in `PlayerJournalView` (both new and edit forms); shared entries appear as an amber badge+count on each `PartyTrackerRow` party card; clicking the badge opens `PlayerJournalDmModal` listing the entries in reverse-chronological order with read tracking (red dot for new/updated entries); DM-side query uses an RLS policy that lets campaign DMs read shared entries across the campaign.
