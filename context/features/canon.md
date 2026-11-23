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
| Who and what lives here | none: `campaign_peoples`, `campaign_habitats` and what hangs off them (a truth may carry a `habitat_id`) | #1255 item 31 | n/a |
| Secrets and open questions | `secret`, `question` | story 3 | a secret once the DM reveals it; never a question |
| Lore, told in passages | `lore` | story 5 | the passages told |
| Backstories | `backstory`, one per character (`party_member_id`) | story 10 | their own character's, always; another's when the DM shares it or any passage was told to them; only the passages told to them |
| The Chronicle | none: the session's note (`notes.session_id`) | story 6 | what the DM shared |
| What the table added | none: `story_facts` the AI table filed | story 9 | what the party knows and the DM has not struck |

The player's journal draws every row `get_player_canon` returns (`groupPlayerWorld`): the shared premise under "The
campaign" (pitch, themes, at the table, lines and veils, each line or veil saying which it is in words), the truths,
"Secrets revealed", the lore and the Chronicle. Until #1255 it drew only truths and lore, so a revealed secret and a
shared pitch reached nobody.

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
- `canon_arcs` (`20261123154815_canon_story_tools.sql`, #1255 item 11): the story's arcs, each a `name` (1 to 80
  characters) and one line of `summary`, in the DM's `sort_order`; DM-only, rings the doorbell (`canon_arcs` →
  `CANON_KEY`). `canon_entries.arc_id` names the arc an entry belongs to (`on delete set null`, so deleting an arc leaves
  its entries in no arc; never set on a premise entry, 23514). Read by `useCanonArcs` under `[CANON_KEY, "arcs",
  campaignId]`.
- `canon_entry_quests` (`20261123135952_canon_entry_quests.sql`, #1255 items 12 and 13): which quests a canon entry matters
  in, once each per (entry, quest) (23505). It began as `canon_force_quests` ("where the party meets it") and was renamed and
  widened, never copied: a force, a secret, a truth, lore or a backstory may be tied to a quest, a premise entry or an
  open question may not (23514). DMs read and write, players read none of it; it rings the doorbell (`canon_entry_quests`
  → `CANON_KEY`) and is read once for the campaign with the forces' data (`useCanonForceData().quests`, written by
  `useCanonEntryQuests`).
- `campaign_peoples` (`20261123124451_campaign_peoples.sql`, #1255 item 30): who lives in the world, one row per people
  with its `percent` share. A people is a record the campaign already has, never typed: exactly one of `species_id`
  (a DM-written species), `library_species_id` (a shared book's), `monster_id` (a DM-written creature) or
  `library_monster_id` (a shared book's). One row per people per campaign; a library id that names nothing is refused
  (23503); the shares of a campaign may not pass 100, checked at commit by a deferred constraint trigger (23514). The
  view `campaign_peoples_named` (invoker) gives `kind`, `record_id`, `from_library` and the record's `name`, and leaves out
  a row whose record is gone. DMs read and write; it rings the doorbell (`campaign_peoples` → `CANON_KEY`).
- `campaign_habitats`, `campaign_habitat_places`, `campaign_habitat_life` (`20261123154815_canon_story_tools.sql` section 5,
  #1255 item 31): the ecology. A habitat is a kind of country (`name` 1 to 80 characters, a rich-text `description`,
  `sort_order`); `campaign_habitat_places` ties it to the Atlas places it covers, a place in at most one habitat (23505);
  `campaign_habitat_life` is what lives there as shares, exactly one of `monster_id` (the DM's creature) or
  `library_monster_id` (a shared book's; a missing id is 23503), a creature once per habitat (23505), the shares of a
  habitat not passing 100, checked at commit (23514). The view `campaign_habitat_life_named` (invoker) adds the
  creature's `name`, null for one this reader may not read, and keeps the row so totals add up. `canon_entries.habitat_id`
  (a truth only, 23514 otherwise) is a truth that belongs to a habitat. DM-only; all ring the doorbell under
  `CANON_KEY`.
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
Chronicler's `{settingPrompt}` placeholder is filled with it. It also carries `## Peoples of the world` (who lives
there, as shares, largest first, with "do not default to humans"; see "How the world works"), left out when the DM
listed none. Both loaders read the names and shares from `campaign_peoples_named` in the same round trip as the canon rows.
It also carries `## Life of the world` (`habitatsLines`: one line per habitat, "Salt marsh (the Marsh, Saltmere's edge):
Marsh eel 40%, Giant frog 20%, anything else 40%", with "When a creature turns up somewhere, choose it at these odds for
the country it is in."), left out when no habitat has a place or a creature. Both loaders read `campaign_habitats`, the
places (with each place's name) and `campaign_habitat_life_named` in the same `Promise.all`; a creature with no readable
name is left out of its line, so its share falls under "anything else". `habitatsForBlock` joins the three reads, once for both loaders.

Canon text takes @mentions (pitch, lore and backstory passages, notes on a truth, secret or force; not a player's own
passage), but a stored mention is `{ id, entityType }` with no name, on purpose (#932). The plain-text walkers emit only
text, so every path that turns canon into words for an AI or for search reads the names itself: `loadMentionNames`
(`_shared/mentionNames.ts`, one query per table, scoped to the campaign) returns a `nameOf`, and `tiptapToPlainText`,
`plainWithoutSecrets`, `premiseEntryText`, `worldBlockFromRows` and `buildCanonEmbedText` take it. Both world block
loaders, `embed-content`, the Narrator's canon reads (`canonIo.ts`) and `suggest-canon` pass it; they run for the DM or
the server, so the names are the true ones. A mention inside a `secretBlock` is never read for the AI. A renamed person
reaches a canon vector only when that entry is next embedded.

## The page

`/canon` (`src/views/canon/CanonView.vue`, components in `src/components/canon/`, data in `src/composables/canon/`),
after Notes in the nav. `?entry=<id>` selects and scrolls to an entry; search results and the world web link there.
Premise and tone and the truths autosave; the World field moved here from Campaign settings' Details tab.

Under "Lines and veils" one quiet line reads the violence and horror dial back (`campaigns.table_violence`, labels in
`src/lib/campaign/tableViolence.ts`, shared with Campaign settings) and links to Campaign settings, where it stays: it is
how the AI table plays, not a fact about the world. Settings' dial says in turn that what must never happen is set in the
canon's lines and veils. The Narrator reads both. The Canon line shows only where the AI table is open (`useTableAccess`).
The contents column lists the parts I to IX, then, set apart below a rule, "✦ What the table added" with its count of
unreviewed lines as "n new" and the hint "Filled by the Narrator as it invents. Keep, edit or strike each line." (`canonParts.ts`, the only place a part
is added). The header's **Bring in a book** (a button under the page on a phone) opens `/canon/import`.

**Arcs, narrowing, search and order (#1255 item 11).** An arc is the one grouping, so there are no free tags: it stays a
story tool and not a filing system. At the top of the page body, above "Where to begin", `CanonArcs.vue` holds a quiet
bar: **Show** (Everything, or one arc; a native select, since the DM made a short list) with a **Clear** button while an
arc is chosen, and **Arcs…**, which opens an inline panel to add an arc (a name and one line), rename it, edit its line,
put it in order and delete it ("Delete this arc? Its entries stay, in no arc."). With no arcs the bar shows only
**Arcs…** and "Group the canon by the story it belongs to." Each truth, force, secret, lore entry, backstory and open
question has a small **Arc** picker under its title (`EntryArcPicker.vue`, the one component, shown once an arc exists; a
premise entry never has it).

- **Narrowing.** The chosen arc (`useCanonUiStore().arcFilter`, part of `hasActiveFilters`, cleared by `resetFilters`)
  narrows truths, forces, secrets, open questions and lore at once (`canonNarrow.ts`). **Backstories are not narrowed**:
  a character spans arcs, so the part always lists the whole party (#1258 item 29; the entry's own Arc picker stays). The premise, How the world works, Who and what lives
  here, the Chronicle, What the table added and Deleted are never narrowed. A narrowed part (not Backstories) says "Showing <arc> only." in
  one quiet line, and its empty state "Nothing of this part is in <arc>." **The contents column's counts follow the
  narrowing** (so they match the lists under it); "Where to begin" keeps reading the whole canon, because it asks whether
  the canon holds a thing at all. An entry that is open stays open when the DM moves it to another arc (the selection
  reads the whole list). The Force log tells only of the forces on screen. A deleted arc lets go of the filter by itself.
- **Search.** Each of those six parts has a small search of its own (`CanonPartFind.vue`, "Find a truth…"), matching the
  title (a backstory's character name). The query lives in the store (`partQuery`; it filters the list on the page). The
  field appears only past five entries, or while a query is set so it can always be cleared. Clearing the arc does not
  clear searches; `resetFilters` clears both.
- **Order.** Truths, forces, secrets, open questions and premise lines have up and down buttons (`CanonMoveButtons.vue`,
  rule in `canonOrder.ts`): the move swaps the two rows' `sort_order`, or renumbers the list from position when places
  collide, writing only the rows whose place changed (`useCanonReorder`). A force moves among the moving ones, a secret
  among those in its own state (the ledger draws the revealed last), a premise line among its own kind. Buttons are
  hidden, not disabled, while a search or an arc narrows the list, and for a list of one. Lore is shown by its date in the
  world, so it has no manual order.

What the review of the beta changed (#1255, 23 Nov 2026):

- **The contents column follows the scroll** (`useCanonScrollSpy.ts`): the part whose heading last passed the reading
  line is the one highlighted, the last part at the very end of the page. A part chosen in the contents, or landed on
  from a link, is held until the DM scrolls by hand, so the smooth scroll to it does not flash every part on the way.
  On a phone the row of chips stays on screen and keeps the current chip centred.
- **A statement wraps.** A truth, a secret, a clue, a question, a theme, a line, a force's wants and its steps are
  `AppInput wrap` (a one-row textarea that grows): still one paragraph, saved when left, Enter finishes it.
- **A row lays out by its own width**, not the viewport: a force's step and a clue put their text on a line of its own
  with the tick and buttons beneath, because the detail pane is narrow at any screen size.
- **A Line is upright text, a Veil italic**; neither is struck through (a struck line read as a deleted one).
- **`?entry=<id>` lands on every part.** A premise entry or an open question has no detail pane, so its row is scrolled
  to and ringed for two seconds (`sectionOfPart` in `canonParts.ts` names the part to highlight).
- **Below a desktop a selected entry's detail opens directly under its ledger** and is scrolled into view; the secret's
  opens above the open questions (a slot in `SecretsSection`).
- **Long entries open beside their ledger, not in the side column** (#1255 item 26). A lore entry and a force are
  edited at two thirds of the page body, next to their own ledger, as a backstory is: `CanonSplit.vue` is the one
  layout (ledger a third, entry two thirds from a body width of 56rem, the entry under its ledger below that) and
  the lore, forces and backstories all use it. Only a truth and a secret, a line and a few clues, keep the side column
  at a desktop. The page body widens while any split is open (`data-split-open`). Each entry has a quiet close button at
  its top right that clears `?entry` (and `?backstory`). The entry's wrapper is `#canon-inline-detail` at every width, so
  a tap scrolls to it. A force ledger's "The world moved" log sits beside the list from 42rem of the section's own
  width and under it below that, so beside an open entry it is under the list. Inside the entry, a passage's margin sits
  beside its text from 32rem of the passage's own row, and a force runs in two columns from 32rem of its own width.
- The World field's element id is `canon-world-name`: `canon-world` is part V's, and sharing it sent "How the world
  works" to the top of the page.

## Tonight (#1255 item 14)

`/canon/tonight` (`CanonTonightView.vue`, header button **Tonight** beside Bring in a book, and under the title on a phone; a link
back, "The whole canon") gathers what the next session needs from the canon. It is read-only and stores nothing: every line links to
where it is edited. A DM route like the rest of the canon (the lens fence derives it: only `/play` is the player area). All gathering
is the pure `src/lib/canon/canonTonight.ts`; the view reads through the Canon page's own composables, so the doorbell keeps it fresh.
Five blocks, each left out when empty, in this order:

1. **Lore to tell**: untold lore and DM backstory passages that come out at a place, person or beat, grouped by where, each with its
   entry's title linking to `/canon?entry=<id>`. A passage that comes out nowhere is not listed (no cue), nor an entry's first passage
   (told with the entry).
2. **Clues to find**: clues not found, of secrets not revealed, grouped by where they lie, "Not placed anywhere yet" last; a clue that
   is a lore passage lies where the passage comes out. Each names its secret.
3. **What moves next**: each force still moving, its first unreached step ("No next step written" when none) and its clock as "3 of 6",
   "The clock is full" when it is.
4. **Threads left open**: per character, the open threads of their backstory (`openThreads`) and the DM's passages not yet told to them,
   linking to `/canon?backstory=<party member id>`. A character with neither is left out.
5. **The table added**: the count of unreviewed table facts, only above zero, linking to `/canon?section=table` (the Canon page scrolls to the part named by `?section=<part id>`, once the page has loaded).

When all five are empty the page says nothing is waiting and links back to the Canon. There is no dashboard widget yet.

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

**Things end and turn into others (#1255 items 9 and 10).** A question can be answered: *Answer…* on its row makes the
answer a new entry (a truth with a knowledge mark, or a secret) titled with the answer, then closes the question with
`closed_as = 'answered'`, `closed_at`, `closed_note` (the answer) and `became_entry_id` (the new entry). If the second write
fails the new entry stays and a toast says so. Answered questions fold under "Answered (n)", each linking to what it became
(`/canon?entry=<id>`; the FK clears the pointer if that entry is deleted) with *Reopen*, which nulls all four columns. A
revealed secret offers *Make it a truth* (known to all, with its words and notes) and then reads "Now a truth: <title>";
the secret stays, still revealed, and *Hide again* on it asks first ("The truth it became stays known to all"). Every
"becomes" (a secret made a truth, a question answered) writes a canon `led_to` link from the old entry to the new one
beside `became_entry_id` (`useLinkBecame`); a failed link toasts and undoes nothing. A player whose truth a secret became
reads it once, under "What we know", not again under "Secrets revealed" (`groupPlayerWorld`, which needs
`get_player_canon` to return `became_entry_id`). A part never changes, so becoming is always a new entry plus `became_entry_id`
(`src/lib/canon/canonClose.ts` builds both writes). Revealed secrets sort after the ones still to find. The contents column
and the start strip count only open questions and forces still moving (`sectionCounts`).

**A secret is one thing, however many places mention it (#1255 item 21).** A quest beat can be *the* canon secret
(`quest_beats.canon_secret_id`, a secret of the same campaign, DM-only, never in a player projection; deleting the secret
unties the beat). A secret's page has one block for where it comes out, **Where it comes out** (`SecretOutlets.vue`),
grouped by quest: the beats tied to it and the clues placed at that quest's beats (read through `useSecretBeats` and
`useBeatsByIds` under the beats query root, so the `quest_beats` ring refreshes them), each linking to the beat
(`/quests/:id/beats/:beatId`). A quest linked by hand (`canon_entry_quests`) with neither reads "Planned, no beat yet";
its picker says "Plan it in a quest…" and unlinks only hand links. Revealing is one rule, `useRevealSecret` (stamp
`revealed_at`, share with every party member), used by the secret's own button and by a tied beat's prompt. An NPC's DM
note stays a note.

The hand links are the same `canon_entry_quests` rows (see What is moving), and the quest's page lists the secret under
"The canon behind this quest" with its state.

## What is moving

Part III of the page (frame 06; `ForcesSection.vue`, `ForceDetail.vue`). A force is a `canon_entries` row with
`part = 'force'`: its title says who, `wants` says what it wants in one line, and `clock_size` (2 to 12, or null for no
clock) says how many ticks fill its clock. Only a force may hold either column (23514 otherwise). Its other state lives
in three DM-only tables, all under the canon query root and all ringing the doorbell: `canon_force_steps` (what it does
next, in `sort_order`; `reached_at` and `reached_session_id` stamp the step it has reached), `canon_force_ticks` (each
move of the clock, forward or back, with a note, the open session and the world's date) and `canon_entry_quests` (the
quests where the party meets it, once each). Players never read any of it.

- **A force is who doing what** (#1258 item 16). Its title is the plan ("The summoning"), never a copy of its faction's name;
  the faction is the `about` link, read by `useForceFactions` (one read of the campaign's force-to-faction links, joined to
  the faction list) and shown as **Who** on the row and the detail under the faction's name as it is now. The add form
  (`ForceAddForm`, on the canon page and as *Add a force* on a faction's page, prefilled with that faction) asks Who (a
  faction, optional) and What they are doing (required). Forces made before this keep their titles; the row leaves Who out
  when it equals the title. The detail shows one quiet line when the clock and the steps disagree (`clockStepsDivergence`):
  a full clock with steps unreached, or every step reached with the clock short.

- **Quests and canon tie both ways** (#1255 item 12). The links are one table for five parts, and one block draws them:
  `EntryQuests` ("Where the party meets it" on a force, "The quests that uncover it" on a secret, "turn on it" on a truth,
  "tell it" on lore, "pay it off" on a backstory), each with its own empty words, a *Link a quest…* picker that leaves out
  quests already tied, and an unlink per row. The quest's own page shows the reverse, **The canon behind this quest**
  (`QuestCanon`, in the quest drawer's wide part): the entries tied to it grouped force, secret, truth, lore, backstory,
  each linking to `/canon?entry=<id>` (a backstory by its character's name) with one quiet fact (a force's clock or its
  ending, a secret's state), and a *Link canon…* picker over the five parts. A faction's page shows **What it is moving**
  (`FactionForces`): the forces `about` the faction (the canon connections whose entry is a force), with what each wants
  and its clock or ending, or a quiet *Name a force* link to `/canon`. Both are DM-only: the canon tables are DM-only reads,
  so in the player lens or a DM's preview of the player portal the gate component mounts nothing and none of the reads run.

- **A quest clock can move a force** (#1255 item 20). A quest's clock may be set to *Moves a force* (`quest_clocks.moves_force_id`,
  a force of the same campaign, nulled if the force is deleted; the clock editor's picker offers forces still moving, plus
  the one already set). Whenever that clock's fill changes, the database writes a `canon_force_ticks` row with the same
  delta and the note "Quest clock: <label>" (a force that has ended is not ticked), so the client never writes it. The force
  lists them as **Moved by quest clocks** (`ForceQuestClocks`, label, quest, "n of m"), and the run cockpit's clock says
  "Moves <force>". The force's clock stays the world's; the quest's stays the scene's.
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
- **Suggest forces** (`suggest-canon` mode `forces`, `canon_force_suggestion`) proposes each listed faction with an
  active agenda in the world block or DM's steer, up to ten, rather than a fixed count. It prefers exact listed faction
  or person names so the accepted force gets an `about` link to that record. Accept writes the entry, its steps in order,
  its quest links and matched `about` link, all carrying the run's provenance (`writeAcceptedForce`,
  `useCanonForces.ts`). Manual forces can also select a faction and clock size in `ForcesSection.vue`. Nothing is
  written before Accept (for suggestions) or Add force (for manual entry).
- A force can end (`ForceDetail.vue`, `ForceEndForm.vue`): *End this force…* takes an outcome (`succeeded`, `stopped`,
  `faded`) and an optional note, writing `closed_as`, `closed_at` and `closed_note` together; a full clock that is not ended
  asks "The clock is full. What happened?" with the same three outcomes, each opening the same form with it chosen. The form
  also offers an optional **What is true now?** (#1258 item 10): filled in, it makes a truth known to all, closes the force
  with `became_entry_id` pointing at it and ties the two with a `led_to` link (`endForce`, `canonClose.ts`: truth first, so a
  failed truth leaves the force moving; a failed link is reported and leaves the closed force pointing at its truth). *Set it
  moving again* clears `became_entry_id` too and leaves the truth standing. An ended force leaves the ledger for "No longer
  moving (n)", its detail opens with "Ended: …" and *Set it moving again*, and while ended its ticks, step Reached ticks and
  add-step row are off. Suggest forces and the Narrator's "forces that moved here" leave ended forces out.
- `canon_force_step` is an MCP kind; `canon` also takes `wants` and `clock_size`. `canon` reads `closed_as`, `closed_at`,
  `closed_note` and `became_entry_id` but does not write them (a close needs `closed_at` set with `closed_as`). Ticks are not (a tick is written by
  the clock's buttons and undone, never edited).

## How the world works

Part V (frame 11), numbered before Who and what lives here and Lore. Not entries: the campaign's own columns, moved out of Campaign settings so the
world is written in one place and nothing is kept in both. **How it keeps time** (`campaigns.calendar_id`, with the
custom calendar editor and the "Populate from <setting>" panel that hangs off the saved calendar), **where it is now**
(`current_year`, `current_month`, `current_day`, entered through the calendar adapter's months), **its weather**
(`climate`) and **what it pays with** (`campaigns.currency`, the coins editor). `WorldWorksSection.vue` holds
`WorldTime.vue`, `WorldPopulate.vue` and `WorldCoins.vue` (the old Currency tab, moved). Calendar, today and climate save
as each is changed; the custom calendar saves after a pause and not while the editor flags a problem; the coins keep
their explicit Save because removing a coin converts what players hold. Settings lost the Currency tab (a
`?tab=currency` link falls back to Details) and Details lost calendar, year, climate and Populate.

**Who lives in it**, now under Peoples in Part VI, "Who and what lives here" (below). It was a block of this part until
#1255 item 31 moved it, so both halves of "who and what lives here" are read together; nothing about it changed.
(`campaign_peoples`, `WorldPeoples.vue`, `useCampaignPeoples.ts`, #1255 item 30): the peoples of the
world as shares of its population, so a world where elves are 80% generates elf NPCs 80% of the time. A people is never
free text: it is a species or a creature the campaign already has (maintainer, 23 Nov 2026), so a goblin country is as
much a people as an elven one. Each row shows the record's name, the word "species" or "creature", a share field that
saves when left, and remove. Two pickers add a people at 0%: "Add a species..." over `useCampaignSpecies` and "Add a
creature..." over the bestiary index the encounter picker uses (`useMonsterIndex`, read when the picker is first
opened), each leaving out what is already listed; two links, "New species" (`/species/new`) and "New creature"
(`/monsters/new`), make a record to add. The total may not pass 100: the screen names it and does not save
(`peoplesProblem`, `src/lib/canon/peoples.ts`), and the table refuses it at commit (23514, shown as "These shares would
pass 100%." with the list re-read). A total below 100 leaves the rest as "anyone else", a people the DM did not list;
empty means not said. The NPC generator, with its species left blank, rolls once per generation with `rollPeople` (a
quick create too): the rolled people's name goes into the prompt as `Race: <name>` and onto the saved NPC (`npcs.race`
stays free text); a rolled creature adds a line that it is one of the world's peoples, not a monster to fight; a roll
that lands on "anyone else" asks for a people not on the list; and a species the DM picked is never rolled over. The
species select lists the peoples first, then the campaign's other species. Every other generator is told the shares
through the world block (`peoplesLine`, shared with the client from `_shared/worldBlock.ts`).

## Who and what lives here (Part VI, #1255 item 31)

After How the world works, before Lore (short label "Life"). Not entries, so it has no count in the contents column;
`LifeSection.vue` (`src/components/canon/ecology/`) holds two blocks. **Peoples** is `WorldPeoples.vue`, moved here from
How the world works with no change (see above). **Habitats** is the new half: a short list of the world's kinds of
country, each with a description, the Atlas places it covers and the creatures that live there.

The list (`HabitatsPanel.vue`) shows each habitat's name, its places as plain words and a one-line summary of what lives
there ("Marsh eel 40%, Giant frog 20%, anything else 40%", `sharesLine`), with up and down to reorder (the DM's order is
the world block's) and an add row, "A new kind of country...", which opens the new habitat. The selected habitat's editor
(`HabitatEditor.vue`) is below: the name (saved when left, never blank), the description (`RichTextEditor`, secrets
allowed, autosaved), **The places it covers** (`HabitatPlaces.vue`: the picker is the Atlas tree and leaves out every place
already in a habitat, a line saying which habitat holds those; a place covers the places inside it unless one is another
habitat's), **What lives here** (`HabitatLife.vue`), **Notes on the living world** (`HabitatNotes.vue`: the truths whose
`habitat_id` is this habitat, each linking to `/canon?entry=<id>`, and an add row making a truth known to all with the
habitat set, so a note is listed in Truths too and its mark is changed there) and **Delete this habitat** (asks first;
places and life go with it, the notes stay as truths with no habitat).

**The shares rule** is one for the peoples and for a habitat's life: `src/lib/canon/shares.ts` (`sharesTotal`,
`sharesProblem`, `sharesRest`, `rollShare`), the one list-of-shares component `ShareList.vue` (rows, the running total
"Adds up to 60%. The other 40% is anything else.", the problem sentence, a share saving when its field is left and never
while the total would pass 100), and `sharesLine` in `_shared/worldBlock.ts` for the words. `peoples.ts` and `habitats.ts`
only add their own types and name the roll (`rollPeople`, `rollLife`). A creature is never typed: it is picked from the
bestiary index the encounter picker reads (`useMonsterIndex`, loaded when the picker first opens), with a "New creature"
link to `/monsters/new`; the table keeps a creature once per habitat and the shares to 100 (23514 is shown as "These
shares would pass 100.", a place already placed, 23505, as "That place is already in another habitat."). A creature this
reader may not read keeps its row under a placeholder name and is never rolled, so the shares still add up.
`useCampaignHabitats.ts` reads the three tables and writes them, all scoped to the campaign and under `CANON_KEY`.

The world block tells every other generator the result (see "The world block").

**Rolled for an encounter.** `habitatForPlace` (`habitats.ts`) says which habitat a place lies in: its own, else the one
of the nearest place it lies inside that is covered (the rule `tablesForPlaces` uses for encounter tables), with that
covered place as `throughPlaceId`. The encounter generator has a **Where** choice (`EncounterWhere.vue`, the party's
place, `campaigns.current_location_id`, until the DM picks or clears it). When that place lies in a habitat with a
creature at a share, one quiet line gives the habitat and its shares ("Salt marsh: Marsh eel 40%, Giant frog 20%,
anything else 40%"), and each generation rolls once with `rollLife` through `lifeConstraints`: a rolled creature becomes
"Build this encounter around X: it is what lives in <habitat>. Other creatures may join it.", and a roll on "anything
else" becomes "The creatures are not <listed>: something this country rarely sees." The roll is a constraint beside the
DM's concept and never over it, a creature the reader cannot read is never named, and no place or a place in no habitat
sends nothing. The lines travel as `constraints` on `generate` (`useEncounterGeneration`): appended to the Constraints
block on the browser (BYOK) path and sent as `constraints` in the body to `generate-encounter`.

**On the place.** The DM's place page shows `PlaceHabitat.vue` beside the canon placed here: "Lies in <habitat>" (with
", through <place>" when the habitat is inherited), its shares line, and a link to `/canon?section=life`. Nothing renders
for a place in no habitat, and it is never mounted on a player surface.

## Lore, told in passages

Part VII (frames 04 and 04b, which supersedes 04's DM-only secret block). A lore entry is a `canon_entries` row with
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
(`canon_clues.passage_id`; telling it the first time marks those clues found, in the database). **Make it a clue to a
secret…** in the passage's margin (`PassageClues.vue`, #1255) files that clue: named by the passage's heading, lying
nowhere of its own, and already found when the passage had been told (`passageClue`, since the database only finds a
passage's clues at the moment it is told). The × beside a secret deletes the clue and leaves the passage. An entry's
first passage and a player's own backstory passage cannot be made a clue. Passages are added,
reordered (renumbered from position) and removed in the entry. Lore detail opens beside the lore ledger in the page body
(`CanonSplit`), so a passage's margin sits beside its text from 32rem of the row and under it below that; below 56rem of
page body it opens under the ledger.

At the table `CanonHere.vue` is one block for everything the canon placed at a place, person or beat: the clues lying
there and the lore passages that come out there and are not yet told (never an entry's first passage), each with
**Tell the party**. AI: "Draft a lore entry" in the part (from a title, kind and steer) and "Split into passages" on an
entry with text (`CanonSuggestions mode="lore"`, `useAcceptLore.ts`; the DM's own text goes to the server-path
function). Nothing is written before Accept, and a split asks before it replaces the entry's passages; it writes the
new ones before it removes the old.

## Backstories, written together (Part VIII, frame 14; story 10)

A character's backstory is a piece of the canon told in passages, and the two writers are the character's player and the
DM. **Its opening is not copied:** the character's own Backstory field (`party_members.player_description`, the "About"
on the sheet) is the backstory's first part, **Before play**, and stays where it is, because a character can live outside
any campaign and carries that text between campaigns and into the Hall of Heroes. Player and DM both edit it, through the
ordinary party member update (`BackstoryBeforePlay.vue`, autosaved). Everything that grows from there is the campaign's:
a `canon_entries` row with `part = 'backstory'` and `party_member_id` (one per character, a unique index), made on first
use by `public.open_backstory(p_party_member_id)` (a definer, for the campaign's DMs and that character's player only,
since a player cannot write `canon_entries`). The DM's page makes it the first time a character is opened
(`useBackstoryEntry`); the player's **Add to my story** makes it before the first passage (`useMyStory`).

The passages are `canon_lore_passages`, the lore passage table, with an `author_id` (the writer, defaulting to the
signed-in user). The DM edits **every** passage, the player's included (maintainer, 20 Nov 2026), and writes their own,
which start untold and are told like lore (by hand, at a place, person or beat, or by the Narrator): **Tell <character>**
tells that character, **Tell the party** everyone. A player may insert, update and delete only the passages they wrote in
their own character's backstory (`private.writes_own_backstory`); a trigger (`guard_player_passage`) tells it when
written, lets them share it only with party members, and refuses a place, a beat or a changed author (42501). Each
passage says whose it is: "Written by <player> · before play" or "... after session N" (N is the latest session that had
started before it was written, `writtenWhen`) or "Your passage". **People from this past** (`BackstoryPeople.vue`, #1258 item 4) is a short read-only list, one link to the NPC's sheet
each with the word the tie reads as: the NPCs tied to the character (their own connections, the list their page shows)
plus any NPC this entry is `about` that the character has no tie to, each once. It is not a second editor; one **Edit on
the character** link goes to their page, where the ties (each with its own reveal) are edited. Under the threads,
**Places and things from this past** is the entry's own Connections block (subject `{ kind: "canon" }`), less the `about`
ties to NPCs (listed in People) and the thread ties (listed under Threads, `isThreadTie`), so nothing is shown twice.
**New NPC from this backstory** (#1258 item 25) opens a small inline form: a name (required) and, optionally, how that
person relates to the character (the same typed People tie as on the character's page; none leaves the person tied to the
backstory only). It creates the NPC hidden from players with the Canon `about` link and, when chosen, the People tie
(`useNewBackstoryNpc`), and **stays on the backstory**: the new person appears in the list and "Open sheet" is offered. In
the NPC's Connections block, the People relationship is primary and its Canon origin is a compact marker linking back to
the source entry.

**Threads left open** (#1255 item 13) are the questions and secrets a past raises: the open questions and unrevealed
secrets tied to the backstory entry by a canon-to-canon link (`related_to` or `led_to`, from either end;
`src/lib/canon/backstoryThreads.ts`). *A thread this past leaves open…* makes an open question and then ties it to the
backstory with `related_to`, in that order; if the tie fails the question stays and a toast says it could not be tied.
Answering the question or revealing the secret takes it off the open list and moves it under a collapsed **Paid off (n)**,
each with what it became (the entry it turned into, else the closing words) and the session it closed after (read from
`closed_at` / `revealed_at`; the entry holds no session id). Threads are left out of the entry's Connections block, which
lists them there. The ledger row says "n open threads" when above zero.
The backstory also lists **The quests that pay it off** (`canon_entry_quests`).

The DM's side is `BackstoriesSection` (one row per party member: "played by", passages, "n not yet told"; the contents
column counts characters, not entries) and `BackstoryDetail` (opened with `?backstory=<party member id>`, or
`?entry=<backstory entry id>`), together in the page body: the selected pair uses up to 64rem; at 56rem of available width it
gives about one third to the ledger and two thirds to editing, then stacks below that breakpoint. A deep link scrolls to
the Backstories section.
`LorePassageRow` carries the byline, the player's-own variant (no Tell, no place) and the
tell target, and `usePassageList` is the add/move/remove the lore entry shares. Who may read the entry besides its
character is the entry's own `player_visible_to` (the **Share** control in the detail): `canon_entry_seen` lets a backstory
reach its own character always, others when it is shared, and any member who was told one of its passages (a passage
reaches only whom it was told to, `get_player_lore_passages`). **A player's "Share with the party" therefore reaches the
other characters without the DM sharing the entry:** being told a passage is enough to read the entry, and they see only
the passages told to them.

The Narrator looks a backstory up by meaning (`backstory` is in `LOOKUP_PARTS`, answered under the character's name, its
passages read as lore's are: the DM's untold ones are the Narrator's to bring out, never to state as settled); the
entry's one vector holds the character's name and every passage (`buildCanonEmbedText`, `embed-content` selects the
character). The MCP enum lists the part; the generic readers still refuse canon.

## AI help on each part

Help on a part ships with that part's story, as DM help at a real table (frame 13). `suggest-canon` (server path only,
DM-gated, `canon_premise_suggestion` / `canon_truth_suggestion` at 1 credit, prompt rows `canon_premise` /
`canon_truths`) answers two modes: **Draft from a pitch** uses the saved pitch as its starting text when the steer is
empty, then proposes the campaign starter through pitch, themes, how play feels at the table, voice, look, and private
line/veil discussion drafts; if there is no saved pitch and the model omits one, the DM's submitted pitch is offered as
the pitch proposal. **Suggest truths** is the next step and proposes up to eight truths with their marks. The pure
check is `supabase/functions/_shared/canonSuggestions.ts`: duplicate premise text is dropped, while lines and veils
remain private drafts in the proposal list. The DM must discuss them with players before accepting, because acceptance
activates them as rules for future AI generations immediately; sharing them with players is a separate action.
Replacing a saved pitch, voice or look shows the old and new text in a confirmation first. A "known to
some" truth names only people and factions the campaign has (unknown names are set aside, and a "some" truth with
nobody left is set aside rather than offered). Nothing is written until the DM accepts
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

## Deleted entries (#1255 item 17)

Deleting an entry on the page moves it to **Deleted (n)**, a quiet disclosure at the very bottom of the Canon page (`CanonDeleted`, absent when empty), for thirty days. Its clues, steps, ticks, passages, quest ties and world links are kept with it as a snapshot in `canon_trash` (DM-only; `trash_canon_entry`, `restore_canon_entry`, migration `20261123154815`; purged by `purge-canon-trash`). A deleted entry is simply not in `canon_entries`, so no reader of canon has to leave it out. Each row says what it was, when it was deleted and how many days are left, with **Restore** and **Delete for good** (asks first). A delete also toasts with Undo.

Restore puts everything back **as the restoring DM** (rows come back owned by them), re-points what pointed at the entry, queues the entry's embedding again (a delete dropped the vector) and opens it by `/canon?entry=<id>`. It does not undo anything else: a reference to something deleted meanwhile is emptied, a quest tie to a deleted quest is dropped, and a backstory comes back only while its character has none (otherwise the server answers 23505 in words: delete the new one first). Deletes made by MCP or other server paths are still permanent. The list is read under a `CANON_KEY` query, so `canon_trash` ringing the doorbell refreshes it.

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

The Narrator (`agent-turn`, see agent-runtime.md "The canon at the table") carries the world block and a short "Previously" in its standing instructions, looks the rest up by meaning through `canon_lookup` (`canon_embeddings`, `match_campaign_canon`, never the `secret` part), and is shown where the party stands as "Canon here": the clues placed there as lines only, untold lore, who present may say a truth only some know, the open questions, the forces that moved there. An answered question is no longer open (not in "Canon here", not in the invention check, not in Suggest questions, and `canon_lookup` labels it "Answered question: <answer>"), and an ended force is not one that moved. It never reads a secret's statement. When it puts an invention on record, TypeSafe's Jev checks it against the truths, the open questions and the secrets (the judge alone reads the secrets); a failed check refuses with the reason and nothing is filed. `bring_out` ticks a clue found or a passage told, once the turn is kept. At the table `search`, `get` and `list` refuse the canon types. Canon entries are embedded by `embed-content` (`entity: "canon"`, one vector per entry, a lore entry's passages folded in; `queueCanonEmbedding` after a canon write, 5 s trailing) and are part of the DM's own campaign search (all parts, secrets too).

## The Chronicle and the notes

Session notes are canon, because they are what happened. A note linked to a session (`notes.session_id`) **is** that session's chronicle entry, kept as a note row so the Chronicler, the read-aloud, the pictures that land in a note and the players' reads keep working on one row; it is read on the Canon page's Chronicle and left out of the DM's `/notes` list. `notes.category` is gone (production held 50 notes, session 21, general 13, lore 12, a few others). Lore moves to the canon as lore entries, but nothing moves by itself: the maintainer used lore and session notes for player characters' backgrounds, so every lore note and every session note not linked to a session sits on a one-time list (`note_sorting`, "Sort your notes" on the Notes page, see campaign-notes-calendar.md) that the DM works through, sending each to a lore entry, a session, a character's backstory, their own note on a character, or keeping it a note.

### The Chronicle page (Part IX, frame 12)

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
every session by its note's world date, and the campaign's Calendar events (`useCampaignCalendarEvents`; read, never
copied, each worded by its type and linking to `/calendar?year=&month=`, which opens the Calendar's month grid there). A
Calendar event of type `session` is left out, because `useNoteCalendarSync` mirrors every session note into one and the
note already makes the session an entry (it would be listed twice). Dated events are in world order (a year alone before
a month); sessions with no world date come last, oldest first. Undated lore and ticks are not in it. The other direction
is the Calendar's Chronicle timeline, which shows the DM dated lore and force moves read-only (`canonCalendarItems`, see
`campaign-notes-calendar.md`).

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

A truth made from a fact remembers it (`canon_entries.from_fact_id`, #1255 item 22; only a truth may have it, and the
unique index lets one fact make one truth). The fact's row then says "Now a truth" with a link to the truth and no longer
offers Make it a truth; a second attempt from another tab is refused by the index (23505) and toasts "That line is
already a truth." The truth's detail says "First said at the table." and links to `/table/story`, which cannot be opened
at one fact. Keep and Strike are not the Canon page's alone (item 23): on `/table/story` the DM gets the same two (and
Undo on a struck line) for a fact the table added, through `useFactReview`, the one place that holds the writes, the
toasts and what a Strike took away. The two rows differ in markup (the story page's is a plain line with links) so they
share the writes and `factReview`, not a component. Adding a fact of your own and Reveal stay on the story record; the
section's intro says so and links to it.

**A book drawn from the campaign (story 8).** The Scriptorium can draw a setting book from the canon and the Atlas, For the DM or For the players, as chapters of linked entries (`entityEmbed` with `entityType: "canon"` for canon rows), so the book follows the campaign until published. The DM's book sets each secret in a DM box; a players' book is built from, and its preview and PDF resolved from, the Open Book snapshot, never the DM's tables. See publishing-tools.md, "From this campaign".
