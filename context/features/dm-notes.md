# DM Notes and the Scratchpad

The DM's one private note on each entity, always open on the entity's page and saving itself as they type, plus a docked scratchpad that follows the entity on screen. Epic [#983](https://github.com/irongollem/grimoire/issues/983).

A DM note is the DM writing to their future self, and only that. It never reaches a player in any form. There is no sharing toggle.

## Not to be confused with

| This | Is |
| --- | --- |
| DM note (`DmNoteBox`) | The DM's private jotting on one entity. Never shared. |
| Campaign Session Notes ("DM Notes" tab in the player Journal) | Notes the DM writes **for the table** and shares. A different feature; see [campaign-notes-calendar.md](campaign-notes-calendar.md). |
| A character's own "Notes" | Visible to players, unchanged. The DM's private note on a party member is separate. |

## Decisions and why

- **One note per entity, never shared.** The old model had a "DM Notes" field inside some editors, "DM Secrets" on deities, and a shared "party notes" panel on companions and factions. Three shapes for one idea. The maintainer's rule (5 Oct 2026): a DM note is the DM talking to themselves, so no sharing in any form.
- **Always open, on the page, in reading and editing modes, and on phones.** It is no longer a field inside the Edit form. "DM Notes" left every editor, and the deity's "DM Secrets" with it. A note you must open an editor to write is a note you do not write at the table.
- **Autosave replaces Save/Cancel for this field.** `useAutosave` + `AutosaveStatus` ("Saving…" / "Saved"). It follows the Forms-autosave direction in CLAUDE.md. There is no save to navigate after, so no Post-Mutation Navigation applies.
- **Column versus private `entity_notes` row, and why deities and species moved.** The registry (`src/lib/dmNotes/registry.ts`, read its header) decides per type:
  - Nine types keep it in a column on their own table, which only the owner can read: `npcs.notes`, `monsters.notes`, `items.dm_notes`, `traps.notes`, `puzzle_rooms.notes`, `dungeon_features.notes`, `loot_tables.notes`, `roll_tables.notes`, `locations.notes`.
  - Deities, species, factions, companions, quests, encounters, party members and custom spells keep it as the DM's own private `entity_notes` row (`is_private`, not `shared_with_dm`). A spell takes the private row because `spells_select` lets a player read the custom spells of their DM. A library spell has no note: its id is text and the note's campaign is read from `spells`, so the box is shown only on a custom spell the DM can edit, as the monster sheet shows none on a library monster.
  - Deities and species **moved** because players can select those rows: `deities_player_select` returned every column of a deity revealed to a character (and `deities` is realtime-published), and `species_select` lets any campaign member read the DM's species. `deities.dm_notes` and `species.notes` were a REST call away from a player. Migration `20261006093358_dm_notes_scratchpad.sql` copies each non-blank value into the owner's private `entity_notes` row and drops both columns. Companions are readable by every member for the same reason, so they never had a safe column.
  - Heroes went the same way (#989, migration `20261006093359`): `hall_of_heroes` is read by every signed-in account, so its admin-only "DM Notes" column was readable by all of them. A hero is shared, so its note is each DM's own private row; the admin's two notes became the admin's own.
  - Factions, quests, encounters and party members never had a DM-notes column.
  - Only your own monsters, items and species carry a note; library rows are shared and have no owner to write one.
- **The party-note fold (the maintainer's call, 6 Oct 2026).** `EntityNotesPanel` (now deleted) let a DM keep any number of notes on a companion or faction, each private or readable by the party. The scratchpad shows one private note and has no sharing, so the migration joins every note the DM seat wrote on such an entity into one private note: private ones first, then in the order written, empty and plain-text notes included (`private.note_blocks` turns any stored value into Tiptap blocks without failing). A player's notes stay theirs. A DM who wants the table to read something writes it where players read: a session note, a handout, the entity's own description.
- **A note is filed under its entity's campaign, not the active one.** The registry names, for each `entity_notes` type, the table whose `campaign_id` the note takes (`campaignTable`), read once when the note's row is first created. A hero is app-wide and takes none, and a library species takes its own null, so neither is deleted or transferred with whatever campaign happened to be active. Such a note rings no doorbell, so a second device sees it on its next read rather than live. The touch is still recorded in the active campaign: it answers "what did I jot tonight", which is about the session, not the entity.
- **Copies read the note from the database.** Duplicating a monster carries its DM note across through `fetchDmNoteColumn`, because the monster row the page holds predates every autosave since it loaded (see the next point).
- **The page box yields to the panel.** While the docked panel shows an entity, that entity's box on the page collapses to "Open in the scratchpad", so there is only ever one editor per note. Two live editors on one note would race each other's autosave. The yielded box hands its subject away, which flushes any pending edit first.
- **Touched-this-session is keyed on the campaign session.** The panel's "This session" list is every entity whose note the DM wrote since the running session's `started_at`; once the session ends it reads "Last session": the run session in the `campaign_sessions` log (#985) that ended last, bounded by its `started_at` and `ended_at`. The live session is only the log's open row, so the ended one is read from the log (`useCampaignSessions`); a session logged by hand afterwards never ran and has no span. With no session started, there is no list. It is keyed on the session (see [sessions.md](sessions.md)) rather than on a time window so it means what the DM means by "tonight".
- **No entity-root invalidation after an autosave.** Only the note's own read (`["dm-note", ...]`) refreshes. Every screen that shows a DM note reads it through `useDmNote`, so refetching the entity's lists after each autosave would cost a full list read every few seconds of typing at the table (see the comment in `useDmNote.ts`).
- **Written in the hand (Vellum).** A note is the DM's words, not the book's, so its whole text is set in Fondamento in the softer hand ink, like what is typed into an `AppInput` (#1031). `DmNoteBox` carries `data-hand` and the rule lives in `vellum.css`'s Ink section; the placeholder stays in print. Other themes keep their body face.
- **Generators still fill the note.** AI generators that create an NPC, trap, loot table and so on write their DM-notes output into the note. The deity generator creates the deity and then writes its generated secrets as the DM's private note. NPC Quick Create saves the Concept box as the NPC's DM note.

## The box

`src/components/notes/DmNoteBox.vue`, a lock icon, the heading "DM notes", the line "Only you see this", a `RichTextEditor` and the `AutosaveStatus` line. Two variants: `inline` (on the entity's page) and `panel` (inside the scratchpad, no chrome of its own). The composable `src/composables/notes/useDmNote.ts` takes a subject (`type`, `id`, `label`) and exposes `draft`, `status`, `saveError`, `loading` and `revision`. It runs both storage mechanisms at once and gives the inactive one no subject, because the docked panel follows the route and the subject's type can change while the composable lives. The entity travels in the draft, so a save still in the debounce when the subject changes lands on the entity it was typed about, and a draft is not allowed to save until it has hydrated from the server, so it cannot overwrite a note nobody has read yet.

Each autosave also upserts a `dm_note_touches` row (`recordTouch`).

Surfaces: NPC, monster, item, trap, dungeon feature, puzzle, loot table and roll table pages; Atlas place pane; deity, species and faction pages; companion editor; quest Overview tab; encounter detail page and the encounter run screen; party member (the DM's private note, kept apart from the character's own "Notes"); Hall of Heroes hero page (each DM's own note on a shared hero, carried into the NPC when the hero is imported); a custom spell's sheet.

## The docked scratchpad

`DmScratchpad.vue` (the panel), `DmScratchpadToggle.vue` (the "DM notes" button), `src/stores/scratchpad.ts` (state). DM-only: a player or a campaign-less session never sees it, even if the flag was left open when the active campaign changed.

- **Open it** from the **DM notes** button in the top bar or sidebar, from the phone **More** sheet, or with **⌘;** / **Ctrl+;** (`mod+;`, registered globally through `useHotkeys`). **Esc** closes it while it is open.
- **Placement.** On `md` and up it docks to the right edge and slides in with the `motion.ts` transform; on phones it is a bottom sheet (`70dvh`, capped).
- **Docked means it owns its edge.** While open on `md` and up it sets `data-scratchpad-dock` and `--dock-right` on `<html>`. The layout pads by that width, and one unlayered rule in `src/assets/base.css` ends every full-width or right-anchored overlay teleported to `<body>` (modals, generator panels, side sheets, lightboxes, toasts) where the dock begins. So the panel can sit above them all (`md:z-250`, between the modal stack at 200 and toasts at 300) without covering any of them. That matters because the NPC and monster pages are modals on desktop: a panel underneath them would be hidden exactly when the DM opens an NPC. The rule leaves alone popovers positioned by `left`/`top`, which a `right` would stretch, and the soundboard widget's resting position adds the same offset. As a phone sheet it reserves nothing and stays below modals.
- **The shortcut is silent while a modal is open**, like every other global shortcut: an open modal's overlay hotkey layer is a hard cutoff (`useHotkeys`). The toggle button still works.
- **It follows the entity on screen.** Each inline box registers its subject with the store; the panel shows the page's subject. The header reads the kind, then the entity's name.
- **Pin.** The pin button keeps one note while the DM browses elsewhere (tooltip "Pin: keep this note while you browse"; pinned: "Pinned: unpin"). While pinned and the page has moved on, a "Switch to <name>" button returns to following.
- **Empty state.** "Open an NPC, place, item… and its DM notes appear here."
- **The touched list.** "This session" / "Last session", newest first, each row the entity's name, its kind ("Showing now" for the one on the panel) and a time-ago, linking to the entity through the registry's `route`. Roll tables have no detail page, so their link opens the Dungeon Craft roll-tables tab.

## Tables

| Table | Notes |
| --- | --- |
| `entity_notes` | Existing. Private rows (`is_private`) carry the DM note for deity, species, faction, companion, quest, encounter, party member, hero and spell. |
| `dm_note_touches` | New. One row per (user, campaign, entity type, entity id), upserted with a fresh `touched_at` on each save; keeps the entity's label so a deleted entity still reads. RLS on `user_id`. `src/composables/notes/useDmNoteTouches.ts` reads it. |
| notes columns | `npcs.notes`, `monsters.notes`, `items.dm_notes`, `traps.notes`, `puzzle_rooms.notes`, `dungeon_features.notes`, `loot_tables.notes`, `roll_tables.notes`, `locations.notes`. |
| dropped | `deities.dm_notes`, `species.notes`. |

## Live sync

`entity_notes` has no `campaign_id`-readable-by-everyone shape (its rows are per-user and mostly private), so it rings the **`campaign_sync` doorbell** on insert, update and delete rather than subscribing; a note written on one device reaches the DM's other. `dm_note_touches` is subscribed (`SYNC_TABLES` in `useCampaignLiveSync.ts`), so "This session" updates across devices. A touch also refreshes the column note it names (`dmNoteColumnKeyForTouch`): monsters, traps, dungeon features, loot tables and roll tables are not on the channel, so their own rows carry no signal, and the DM's touch is the one that reaches their other device. A co-DM's edit to one of those five columns arrives on the next read. Both are in `supabase/tests/live_sync_registry.test.sql`. See [collaboration.md](collaboration.md).

Because the doorbell rings for whatever campaign a note names, `entity_notes`' insert and update policies require the author to be a member of that campaign (or to name none). Before #983 the foreign key was the only check, so anyone could file a note under any campaign: harmless while nothing listened, but with the doorbell it would let a stranger ring a campaign's members into refetching, and a campaign transfer would hand such a note to the new owner. `supabase/tests/dm_notes_privacy.test.sql` holds the refusal, the session log's write rules and the transfer (including a co-DM who already touched the same entity).

## Privacy

- A note never reaches a player: columns sit on tables only their owner can read, and the rest are private `entity_notes` rows. No player projection includes either.
- A campaign transfer (`transfer_campaign_ownership`) hands the outgoing DM's private notes and touches in that campaign to the new owner. Notes columns already travel with their rows. Where the new owner already keeps a private note on the same entity, the outgoing text is appended to theirs rather than left as a second note the scratchpad would never show.
- A world bundle or PDF exported before #983 carries `species.notes`, the exporter's DM note. `remapSpeciesForImport` drops it: the column is gone, and someone else's DM note is not the importer's to keep.

## Files

- `src/components/notes/DmNoteBox.vue`, `DmScratchpad.vue`, `DmScratchpadToggle.vue` (+ tests)
- `src/composables/notes/useDmNote.ts`, `useDmNoteTouches.ts`, `useEntityNotes.ts`, `useMyEntityNote.ts`
- `src/lib/dmNotes/registry.ts`, `src/stores/scratchpad.ts`, `src/types/dmNote.types.ts`
- `supabase/migrations/20261006093358_dm_notes_scratchpad.sql`
- Manual: `src/manual/running-dm-notes.md`
