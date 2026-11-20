# The Campaign's Canon

The world's larger shape in one place (epic #1226): what is true, what is moving, what the DM keeps back, what has
happened, and what the table added. A DM writes it at a real table first; the generators read it as the **world
block**, and the AI table reads and adds to it last.

Design: the canvas *Campaign Canon* (claude.ai artifact `MAukzQW1bDDG832DT4ZepT`, frames `01 Delta` to `13`, plus
`04b`), approved 19 Nov 2026. The decisions are in the epic's body; read it before changing any of this.

## Parts

| Part | `canon_entries.part` | Built in | Players see |
| --- | --- | --- | --- |
| Premise and tone | `premise`, with a `premise_kind`: `pitch`, `theme`, `table`, `voice`, `look`, `line`, `veil` | story 2 | what the DM shared, never the voice or the look |
| Truths | `truth`, with `knowledge`: `all`, `some`, `secret` | story 2 | known to all; known to some when it is `known_to` their character, or a faction their character is in; never a secret truth |
| What is moving | `force` | story 4 | never |
| How the world works | none: columns of `campaigns` (calendar, today's date, climate, coins) | story 5 | n/a |
| Secrets and open questions | `secret`, `question` | story 3 | a secret once the DM reveals it; never a question |
| Lore, told in passages | `lore` | story 5 | the passages told |
| The Chronicle | none: the session's note (`notes.session_id`) | story 6 | what the DM shared |
| What the table added | none: `story_facts` the AI table filed | story 9 | what the party knows and the DM has not struck |

`private.canon_entry_seen(entry, member)` is the one audience rule: `get_player_canon` and the players' world web
(`private.player_world_ties`) both use it, so a player's journal and their web never disagree. It is total (an absent
entry or member is false, never NULL). The world's name stays `campaigns.setting`; nothing else of the canon may live on
the `campaigns` row, which every member reads (#1228).

## Data

- `canon_entries` (`20261120033038_campaign_canon.sql`): one table for every part; a part differs by a few columns,
  and later stories add their own columns and child tables (a force's steps, a lore entry's passages, a secret's
  clues). RLS: the campaign's DMs read and write; players read only `get_player_canon`, which never returns the reveal
  list and withholds secret blocks in the body. It rings the campaign doorbell (`canon_entries` → `CANON_KEY`,
  `CONNECTIONS_KEY`).
- The world web's seventh kind, `canon` (`from_/to_canon_entry_id` on `world_links`; pairs `canon_person`,
  `canon_faction`, `canon_location`, `canon_deity`, `canon_item`, `canon_canon` in
  `supabase/functions/_shared/worldLinkCatalogue.ts`). A canon entry is always the `from` end. "Known to some" is
  `known_to` links, never free text.
- `campaigns.description` and `campaigns.ai_setting_prompt` are gone: both became `pitch` entries (the description
  shared with the party, as the row was; the setting prompt kept by the DM).

## The world block

`supabase/functions/_shared/worldBlock.ts` builds it from `campaigns.setting`, the premise entries and the truths known
to all; nothing else can enter (no secret, no force, no truth known to some). Every generator appends
`worldBlockText`, which renders lines as "Never include, in any form" and veils as "May happen, but only off the page",
so they bind every suggestion; pictures take `worldImageSetting` (the world, the look and the lines). Edge functions
load it with `loadWorldBlock` (`worldBlockLoad.ts`); the browser's local-key path with `fetchWorldBlock`
(`src/ai/worldBlock.ts`), and only when a local key will run the generation (`captureImageGenerationContext`). The
Chronicler's `{settingPrompt}` placeholder is filled with it.

## The page

`/canon` (`src/views/canon/CanonView.vue`, components in `src/components/canon/`, data in `src/composables/canon/`),
after Notes in the nav. `?entry=<id>` selects and scrolls to an entry; search results and the world web link there.
Premise and tone and the truths autosave; the World field moved here from Campaign settings' Details tab.
The contents column lists the parts I to VII, then, set apart below a rule, "✦ What the table added" with its count of
unreviewed lines as "n new" and the hint "Filled by the Narrator as it invents." (`canonParts.ts`, the only place a part
is added). The header's **Bring in a book** (a button under the page on a phone) opens `/canon/import`.

## Secrets, clues and open questions

Part IV of the page. A secret is a `canon_entries` row with `part = 'secret'` (its title is the statement); its clues
are `canon_clues` rows, each placed at a place, a person or a quest beat (at most one) or nowhere yet. The state is
derived, never stored: **hidden** (no clue found), **partly known** (any clue has `found_at`), **revealed**
(`revealed_at` set). Each state is a word and a shape (empty, half, full circle), never colour alone. Finding every
clue does not reveal a secret: **Reveal to the party** is the DM's button (it asks first, stamps `revealed_at` and
shares the secret with every party member through `player_visible_to`); **Hide again** clears `revealed_at`. Players
read a secret only once revealed, through `get_player_canon`, and never see a clue.

The Found tick sets `found_at` and `found_session_id` (the open session, null when none runs); unticking clears both.
Clues show where they lie, for the DM only, as a "Canon here" block (`CanonHere.vue`, which also offers lore to tell there: see **Lore, told in passages**) on a place's DM page, an NPC's
sheet and a quest beat's editor, each clue with the same Found tick and a link to `/canon?entry=<secret id>`. A secret wants
three clues, so the party can miss two and still find it. Open questions (`part = 'question'`) are a plain list, each
marked "nobody settles this by invention". `canon_clue` is an MCP kind; `canon_clues` rings the doorbell under the
canon query root.

## What is moving

Part III of the page (frame 06; `ForcesSection.vue`, `ForceDetail.vue`). A force is a `canon_entries` row with
`part = 'force'`: its title says who, `wants` says what it wants in one line, and `clock_size` (2 to 12, or null for no
clock) says how many ticks fill its clock. Only a force may hold either column (23514 otherwise). Its other state lives
in three DM-only tables, all under the canon query root and all ringing the doorbell: `canon_force_steps` (what it does
next, in `sort_order`; `reached_at` and `reached_session_id` stamp the step it has reached), `canon_force_ticks` (each
move of the clock, forward or back, with a note, the open session and the world's date) and `canon_force_quests` (the
quests where the party meets it, once each). Players never read any of it.

- **The clock is the sum of the ticks**, shown clamped to 0..size and never stored, so an undo that deletes a tick moves
  the dial back. Tick forward and Tick back each write a tick (`delta` 1 or -1, an optional note); both disable at the
  clock's ends. **Undo** is on the newest tick only and deletes it.
- A tick carries the running session (null when none runs) and the world's date from the campaign's calendar
  (`current_year/month/day`), only when a calendar was chosen (`calendar_id` set): the stored 1/1/1 of a campaign with
  none is a default, not a day in the story.
- **Reached** on a step stamps `reached_at` and the open session and writes a tick (`delta` 1, "Reached: <step>",
  `step_id` set). Unticking clears both stamps and deletes that tick, so the clock never counts an unreached step.
  **Undo** of a tick that has a `step_id` also unreaches its step (step first, tick deleted after, so a failure loses
  nothing). The step shown as **Now** is the reached step furthest along, earlier reached ones are **Done**, the rest
  **Next**.
- **The world moved**: beside the list (below it on narrow widths) one log of every force's ticks, newest first, each
  naming its force, with Undo on each force's newest tick only (`ForceLog` with `forceName`); each force's detail keeps
  its own. A tick's world date is formatted by the campaign's calendar adapter (`useCalendarStore().adapter.formatDate`).
- Quests are added from the campaign's own quests (a quest already linked is not offered) and each links to its page.
- **Suggest forces** (`suggest-canon` mode `forces`, `canon_force_suggestion`) proposes forces; Accept writes the entry,
  its steps in order, its quest links and, when it names a faction or person the campaign has, an `about` link from the
  force to them, all carrying the run's provenance (`writeAcceptedForce`, `useCanonForces.ts`). Nothing is written
  before Accept.
- `canon_force_step` is an MCP kind; `canon` also takes `wants` and `clock_size`. Ticks are not (a tick is written by
  the clock's buttons and undone, never edited).

## How the world works

Part V (frame 11), numbered before Lore. Not entries: the campaign's own columns, moved out of Campaign settings so the
world is written in one place and nothing is kept in both. **How it keeps time** (`campaigns.calendar_id`, with the
custom calendar editor and the "Populate from <setting>" panel that hangs off the saved calendar), **where it is now**
(`current_year`, `current_month`, `current_day`, entered through the calendar adapter's months), **its weather**
(`climate`) and **what it pays with** (`campaigns.currency`, the coins editor). `WorldWorksSection.vue` holds
`WorldTime.vue`, `WorldPopulate.vue` and `WorldCoins.vue` (the old Currency tab, moved). Calendar, today and climate save
as each is changed; the custom calendar saves after a pause and not while the editor flags a problem; the coins keep
their explicit Save because removing a coin converts what players hold. Settings lost the Currency tab (a
`?tab=currency` link falls back to Details) and Details lost calendar, year, climate and Populate.

## Lore, told in passages

Part VI (frames 04 and 04b, which supersedes 04's DM-only secret block). A lore entry is a `canon_entries` row with
`part = 'lore'`, a `lore_kind` (history, legend, culture, magic, place, faith, other), a date in the world
(`world_year`, optional `world_month` and `world_day`: a month needs a year and a day needs a month, entered and shown
through the campaign's calendar adapter, `WorldDateField.vue`) and a picture (`image_url`: upload, or **Paint with AI**
through `EntityImageBlock` with the `lore` image kind in `src/ai/imagePrompt.ts`, `_shared/image-prompt.ts` and the
Gallery's kinds; stored in the `chronicle` bucket). The list orders dated lore by date, then the undated (`sortLore`),
and each row says "told n of m" and shows its picture unless low art is on.

The text is `canon_lore_passages` (`useCanonPassages.ts`): a heading and rich text (secret blocks allowed) per
passage, autosaved. The entry's sharing (`AudienceRevealControl`) tells its first passage, so the first passage reads
"Told with the entry" and is never offered **Tell the party**. A later passage is told on its own: **Tell the party**
sets `told_at`, `told_session_id` (the open session) and `player_visible_to` (every party member); **Take back** asks
first and clears all three. It may come out at one place, person or beat (`WherePicker.vue`, shared with the clue form;
the other two columns are cleared on a move), and shows "Also a clue to" any secret whose clue points at it
(`canon_clues.passage_id`; telling it the first time marks those clues found, in the database). Passages are added,
reordered (renumbered from position) and removed in the entry. The detail takes the page's side column at a desktop, as
every part's does, so a passage's margin sits under its text; below a desktop it opens under the part.

At the table `CanonHere.vue` is one block for everything the canon placed at a place, person or beat: the clues lying
there and the lore passages that come out there and are not yet told (never an entry's first passage), each with
**Tell the party**. AI: "Draft a lore entry" in the part (from a title, kind and steer) and "Split into passages" on an
entry with text (`CanonSuggestions mode="lore"`, `useAcceptLore.ts`; the DM's own text goes to the server-path
function). Nothing is written before Accept, and a split asks before it replaces the entry's passages; it writes the
new ones before it removes the old.

## AI help on each part

Help on a part ships with that part's story, as DM help at a real table (frame 13). `suggest-canon` (server path only,
DM-gated, `canon_premise_suggestion` / `canon_truth_suggestion` at 1 credit, prompt rows `canon_premise` /
`canon_truths`) answers two modes: **Draft from a pitch** proposes premise entries (pitch, themes, at the table, voice,
look) from a few lines, and **Suggest truths** proposes up to eight truths with their marks. The pure check is
`supabase/functions/_shared/canonSuggestions.ts`: lines and veils are never proposed (they are agreed with the
players), a "known to some" truth names only people and factions the campaign has (unknown names are set aside, and a
"some" truth with nobody left is set aside rather than offered). Nothing is written until the DM accepts
(`src/components/canon/CanonSuggestions.vue`); an accepted entry and the `known_to` ties it brings carry
`ai_provenance`. An AI-written entry is marked edited by the database the first time its words change
(`private.canon_entries_mark_edited`), whoever changes them.

## Taking a book apart (story 7)

The document import reads two more kinds, `canon` and `deities`, and takes a Scriptorium book as a source, so a campaign
book comes apart into Atlas, NPCs, factions, Pantheon, Quests and Canon in one pass. Canon rows keep their parts (never
a line or a veil), `known_to` becomes ties, and forces, secrets and lore get their steps, clues and passages. See
document-import.md, "A book taken apart".

## Bring in a book (frame 10; maintainer, 20 Nov 2026)

The document import left Campaign settings for the Canon page: the header action **Bring in a book** opens
`/canon/import` (`CanonImportView`), which hosts `DocumentImportTab` unchanged. The Import Document tab is gone from
Campaign settings and `?tab=import` falls back to Details; every link to it (the compact quest paste) points at the new
route, and `CanonImportView.test.ts` fails if a `/campaign/settings?tab=import` link comes back. See document-import.md.

## Embedding on write

An entry is embedded for the by-meaning lookup on every write that changes its words: `createCanonEntry` and an
`updateCanonEntry` that touches `title`, `body` or `wants`, and `createCanonPassage` / `updateCanonPassage` for a lore
entry's passages (the passage's **entry** is what is embedded, because its one vector folds its passages in). All call
`queueCanonEmbedding(entryId)` (`composables/canon/queueCanonEmbedding.ts`: a 5 s trailing debounce per entry,
fire-and-forget, never rejects). A reorder, a mark change or telling a passage does not queue. A delete never does (the
side table cascades). The document import's client-side writer queues each imported entry and each entry that gets
passages (one call per entry: the bulk `queueEmbeddingsInBackground` does not list the canon among its `many` entities).
Deleting a single passage does not queue its entry (the next edit or the admin backfill does).

## MCP

`canon` is an MCP kind (`supabase/functions/_shared/mcp/registry.ts`), read and written under the DM's own access;
`campaign_overview` returns the world block.

## At the AI table

The Narrator (`agent-turn`, see agent-runtime.md "The canon at the table") carries the world block and a short "Previously" in its standing instructions, looks the rest up by meaning through `canon_lookup` (`canon_embeddings`, `match_campaign_canon`, never the `secret` part), and is shown where the party stands as "Canon here": the clues placed there as lines only, untold lore, who present may say a truth only some know, the open questions, the forces that moved there. It never reads a secret's statement. When it puts an invention on record, TypeSafe's Jev checks it against the truths, the open questions and the secrets (the judge alone reads the secrets); a failed check refuses with the reason and nothing is filed. `bring_out` ticks a clue found or a passage told, once the turn is kept. At the table `search`, `get` and `list` refuse the canon types. Canon entries are embedded by `embed-content` (`entity: "canon"`, one vector per entry, a lore entry's passages folded in; `queueCanonEmbedding` after a canon write, 5 s trailing) and are part of the DM's own campaign search (all parts, secrets too).

## The Chronicle and the notes

Session notes are canon, because they are what happened. A note linked to a session (`notes.session_id`) **is** that session's chronicle entry, kept as a note row so the Chronicler, the read-aloud, the pictures that land in a note and the players' reads keep working on one row; it is read on the Canon page's Chronicle and left out of the DM's `/notes` list. `notes.category` is gone (production held 50 notes, session 21, general 13, lore 12, a few others). Lore moves to the canon as lore entries, but nothing moves by itself: the maintainer used lore and session notes for player characters' backgrounds, so every lore note and every session note not linked to a session sits on a one-time list (`note_sorting`, "Sort your notes" on the Notes page, see campaign-notes-calendar.md) that the DM works through, sending each to a lore entry, a session, a character's backstory, their own note on a character, or keeping it a note.

### The Chronicle page (Part VII, frame 12)

`ChronicleSection` lists the campaign's **sessions**, newest first or from the start (`SegmentedControl`, state in
`useCanonUiStore`), each with the note linked to it (`chronicleItems` in `canonChronicle.ts`; its newest when several are
linked; a note with no session is never shown). An entry (`ChronicleEntry`) carries the session number and title, the day
it was played, its date **in the world** (the note's `session_start_year/month/day` through
`useCalendarStore().adapter.formatDate`), who the note is shared with (`audienceLabel` of `player_visible_to`, "Not shared
yet" when nobody), the note's title as a link, the first picture in it and an excerpt, and "What the party learned" as
chips (`ChronicleLearned`, the read-only `useSessionLearned`, sorted on the Sessions page). A session with no note offers
**Write the chronicle** and **Draft with the Chronicler**, both `sessionNoteRoute()` into the note editor. Entries show ten
at a time, because each reads its own session's learned moments.

**The almanac** (`ChronicleAlmanac`, `almanac()`): one timeline in the world's calendar of lore with a `world_year`, force
ticks that carry a world date (`canon_force_ticks.world_year`, worded by the DM's note or by which way the clock moved) and
every session by its note's world date. Dated events are in world order (a year alone before a month); sessions with no
world date come last, oldest first. Undated lore and ticks are not in it.

### What the table added (frame 03, the list)

`TableAddedSection` lists the facts the Narrator put on record (`story_facts.source = 'table'`), grouped by session, newest
first, each with what it is about (`useFactAbout`, shared with `TableStoryView`) and the DM's answers: **Keep** stamps
`kept_at`, **Edit** files a correction through the story record's "Correct this" (`source = 'correction'`,
`supersedes_id`), **Strike** stamps `struck_at` (the fact never happened; players and the Narrator stop reading it; the
line stays on screen with **Undo**), and the menu's **Make it a truth** files a `truth` entry with the fact's words (known
to all when `known_to_player`, else secret) and keeps the fact. Keep and Strike each clear the other's stamp, because the
table refuses both on one row. A fact is *reviewed* once kept, struck or overtaken by a correction; the count of
unreviewed facts is the contents column's "n new", and the list opens on **New** (New / Kept / Struck / All, in
`useCanonUiStore`). A line acted on stays listed under any filter until the page is left. The story view
(`/table/story`) shows a struck fact struck through as removed, with nothing to do to it, and hides it from a player.
Live through `STORY_RECORD_KEY`; nothing polls.

**A book drawn from the campaign (story 8).** The Scriptorium can draw a setting book from the canon and the Atlas, For the DM or For the players, as chapters of linked entries (`entityEmbed` with `entityType: "canon"` for canon rows), so the book follows the campaign until published. The DM's book sets each secret in a DM box; a players' book is built from, and its preview and PDF resolved from, the Open Book snapshot, never the DM's tables. See publishing-tools.md, "From this campaign".
