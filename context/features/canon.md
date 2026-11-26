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
| Forces | `force` | story 4 | never |
| How the world works | none: columns of `campaigns` (calendar, today's date, climate, coins) | story 5 | n/a |
| Who and what lives here | none: `campaign_peoples`, `campaign_habitats` and what hangs off them (a truth may carry a `habitat_id`) | #1255 item 31 | n/a |
| Secrets and open questions | `secret`, `question` | story 3 | a secret once the DM reveals it; never a question |
| Lore, told in passages | `lore` | story 5 | the passages told |
| Backstories | `backstory`, one per character (`party_member_id`) | story 10 | their own character's, always; another's when the DM shares it or any passage was told to them; only the passages told to them |
| The Chronicle | none: the session's note (`notes.session_id`); no longer a Canon chapter, it lives on the Sessions page (`components/sessions/Chronicle*`) | story 6 | what the DM shared |
| What the table added | none: `story_facts` the AI table filed | story 9 | what the party knows and the DM has not struck |

The player's journal draws every row `get_player_canon` returns (`groupPlayerWorld`): the shared premise under "The
campaign" (pitch, themes, at the table, lines and veils, each line or veil saying which it is in words), the truths,
"Secrets revealed", the lore and the Chronicle. Until #1255 it drew only truths and lore, so a revealed secret and a
shared pitch reached nobody.

**Who knows a truth, what the party found, and what the players wonder (#1258 items 14, 23, 24).** `get_player_canon`
returns `known_with` on a truth known to some: the names of the other party characters who know it. A truth with none
stays under "Only you know", with **Tell the party** (asks first, then `tell_party_canon_truth`, which only a player whose
character knows it may call; `useTellParty`; hidden while a DM previews as a player). With names it sits under "What we
know" as "You and Mira know" / "You, Bram and Mira know" (`knownWithLabel`). "What we have found" lists the party's found
clues from `get_player_found_clues`, newest first, each with where it lay only as a place, person or item the player can
read through their own projections, else just its title (`usePlayerFoundClues`). "Things we wonder" is the player's own
questions (`canon_wonders`, 1 to 300 characters, `useCanonWonders`): each reads "Taken up by the DM" once adopted and "Let
be" once dismissed. It is drawn even when nothing has been told yet.

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
- `canon_arcs` (`20261123235700_canon_story_tools.sql`, #1255 item 11): the story's arcs, each a `name` (1 to 80
  characters) and one line of `summary`, in the DM's `sort_order`; DM-only, rings the doorbell (`canon_arcs` →
  `CANON_KEY`). `canon_entries.arc_id` names the arc an entry belongs to (`on delete set null`, so deleting an arc leaves
  its entries in no arc; never set on a premise entry, 23514). Read by `useCanonArcs` under `[CANON_KEY, "arcs",
  campaignId]`.
- `canon_entry_quests` (`20261123235659_canon_entry_quests.sql`, #1255 items 12 and 13): which quests a canon entry matters
  in, once each per (entry, quest) (23505). It began as `canon_force_quests` ("where the party meets it") and was renamed and
  widened, never copied: a force, a secret, a truth, lore or a backstory may be tied to a quest, a premise entry or an
  open question may not (23514). DMs read and write, players read none of it; it rings the doorbell (`canon_entry_quests`
  → `CANON_KEY`) and is read once for the campaign with the forces' data (`useCanonForceData().quests`, written by
  `useCanonEntryQuests`).
- `campaign_peoples` (`20261123235657_campaign_peoples.sql`, #1255 item 30): who lives in the world, one row per people
  with its `percent` share. A people is a record the campaign already has, never typed: exactly one of `species_id`
  (a DM-written species), `library_species_id` (a shared book's), `monster_id` (a DM-written creature) or
  `library_monster_id` (a shared book's). One row per people per campaign; a library id that names nothing is refused
  (23503); the shares of a campaign may not pass 100, checked at commit by a deferred constraint trigger (23514). The
  view `campaign_peoples_named` (invoker) gives `kind`, `record_id`, `from_library` and the record's `name`, and leaves out
  a row whose record is gone. DMs read and write; it rings the doorbell (`campaign_peoples` → `CANON_KEY`).
- `campaign_habitats`, `campaign_habitat_places`, `campaign_habitat_life` (`20261123235700_canon_story_tools.sql` section 5,
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
load it with `loadWorldBlock` (`worldBlockLoad.ts`). The
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

**Rebuilt as the campaign's background book (#1267, 24 Nov 2026).** The design is the page "Rebuild, 24 Nov" of the canvas
*Campaign Canon* (frames R01 to R09). The Canon holds everything about the campaign that is not a person, a place, a quest or
a faction, as chapters, and prints into the Scriptorium as one book (**Open as a book**, `CanonOpenAsBook`, draws the DM's
copy with `startBookFromCampaign`). It had grown part by part with each part its own small page; the rebuild puts every
chapter on one kit, so learning one chapter teaches them all.

`/canon/:part?` (`src/views/canon/CanonView.vue`). The chapters, in reading order and grouped (`CANON_SECTIONS` and
`CANON_GROUPS` in `canonParts.ts`, the only place a chapter is added; `chapterOf(id)` gives its label and its one line of
why): **Front matter** (Premise and tone, How the world works), **The world** (Truths, Lore, Peoples, Habitats), **The story,
yours only** (Forces, Secrets and questions), **The characters** (Backstories). The Chronicle lives on the Sessions
page, in each session's own row (`SessionChronicleLine`); the AI table's lines arrive as an inbox on Truths ("n lines from the
table to keep or strike", **Review** opens `TableAddedSection` in a dialog); `?section=table` lands on Truths. A bare `/canon`
opens the chapter the DM was last on (`useCanonUiStore().lastPart`); `?entry=<id>`, `?section=<chapter>` (and the helpers'
words `forces`, `questions`) and `?backstory=<member>` resolve to the chapter that holds them and are rewritten to its address.

- **The header**: the search (`CanonSearchField`), **Bring in a book**, **Open as a book**, and, while the page is narrow, **Tonight**. On a phone they sit under the title.
- **The contents** (`CanonContents`): once the page itself is 60rem wide (a container query, `@container/canon` on the
  page header, so a collapsed sidebar or a wide window counts and the screen's size does not; #1279 item 17) a sticky column of the groups and their chapters with counts, the arc
  control under it (`CanonArcs`: an "Arc" picker and Clear) and the next
  session's card (`CanonNextSession`: what the canon has waiting, from `useTonight`, the same gathering as the Tonight
  page, and its button to it, with the plan line and the number of pinned things when there are any). Narrower, the
  contents are a chapter picker above the chapter whose options keep their groups (`optgroup`), so the book's shape shows
  at every width. While an arc is chosen the contents header shows **Narrowed to the arc …** with Clear on every chapter,
  including those without the arc control, so a narrowed count never goes unexplained (item 18).
  At the foot of the contents, under every chapter, sits the quiet **Deleted (n)** link (`CanonDeleted`, see Deleted entries); it is
  not drawn under a chapter or a sheet (#1279 item 34c).
- **One name per thing** (#1279 item 26): the chapter is **Forces** (route id `moving`, kept), the prep page and every link to it say
  **Tonight**, and the habitats chapter is **Habitats** (route id `life`, kept). Labels live in `CANON_SECTIONS`; only labels changed.
- **The kit** (`src/components/canon/kit/`): `CanonChapter` (the list, and the open entry beside it from 56rem of the
  chapter's own width; below that the entry replaces the list, with "Back to <chapter>"; the list takes a reading width
  while nothing is open), `CanonRow` (the one row: the words, and one mark at the right, always a sign and a word),
  `CanonEntryPane` (an entry always reads: the kind word and its title, one "who" line, the text, the chapter's own
  blocks, the connections, delete), `CanonBlock` (a chapter's own block, with its Suggest in its head), `CanonEmpty` and
  `CanonSuggest`. Each list chapter is one component on it: `TruthsChapter`, `ForcesChapter`, `SecretsChapter` (Secrets and
  Questions behind one switch, `secretsView`), `LoreChapter`, `BackstoriesChapter`; Peoples and Life are
  `ecology/PeoplesChapter` and `ecology/LifeChapter` (a habitat opens beside its list). Premise and How the world works
  are sheets (`PremiseChapter`, `WorldChapter`); the premise shows, in a margin from 80rem of its own width, what of it
  prints in the players' book (`PremiseBookPreview`: only what is shared; the voice and the look never).
- **The Canon has no AI of its own.** A Suggest (`CanonSuggest`) opens the Familiar (Ask Grimoire) with a written request
  for that block ("Suggest clues for the secret \"<title>\"."). The Familiar's `canon_suggestions` adapter reads the
  request's chapter (`canonModeFor`: truths, premise, forces, secrets, questions, clues for a named secret, a passage for
  named lore, and the whole-canon read for contradictions), quotes it naming the chapter, runs it and sends the DM to the
  chapter, where `CanonReview` shows what to accept. An unknown title fails before anything is charged. No Suggest is
  offered where the server has no helper: a force's steps and a backstory's passages. The read's findings show above any
  chapter (`CanonReview mode="read"`).
- **A new canon is led in** (`CanonWayIn`, `canonWayIn.ts`): until it has a pitch, three truths, a force and a secret with a
  clue, the page shows four steps in place of the chapter, each writing into its real chapter, with "Bring in a book you
  have" and "Let the Familiar walk you through it". **Skip to the chapters** is kept per campaign (`wayInDismissed`).
- **Rumours are not a chapter.** A rumour is a stage-1 quest: the quest tree already holds it, and a quest there can be
  hidden, rumoured or revealed (maintainer, 24 Nov 2026). A truth is true by definition; what the party hears and may
  not be so belongs on the quest tree.
- **One scroller.** Only the page body scrolls; the app shell and PageHeader are `overflow: clip` (#1266), so no jump moves
  the header or the sound deck, and every jump goes through `scrollWithin`.

Under "Lines and veils" one quiet line reads the violence and horror dial back (`campaigns.table_violence`, labels in
`src/lib/campaign/tableViolence.ts`, shared with Campaign settings) and links to Campaign settings, where it stays: it is
how the AI table plays, not a fact about the world. The Canon line shows only where the AI table is open (`useTableAccess`).

**Arcs, narrowing, search and order (#1255 item 11).** An arc is the one grouping, so there are no free tags: it stays a
story tool and not a filing system. Arcs are a chapter (`arcs`, first of "The story", `ArcsChapter.vue` on the kit; the
contents' count is the number of arcs, `sectionCounts(entries, arcCount)`): rows are the arcs in the DM's order (name,
the question it asks, where it stands, Up and Down), the add row makes one by its name and opens it, and the open arc
(`?arc=<id>`, which the chapter owns) reads as a `CanonEntryPane kind="Arc"`: its status (`SegmentedControl`: Planned,
Running, Ended) on the who line, then **The arc** (its line, "The question it asks", "What is at stake", a theme from the
premise's theme lines `theme_id`, and "How it ended" once Ended) and **What is in it** (`ArcContents.vue`: its forces with
their clocks, its secrets with their clue tallies, its open questions, its quests (`quests.arc_id`, chosen in the quest's
Details as **Arc**) with their status, and the backstories in it with their open threads, each line opening where it
lives). Every field saves when it is left and emptying an optional one writes null. Leaving Ended asks first and clears the
ending in the same write (`statusPatch`; the table refuses an ending on an arc that has not ended, 23514). Delete asks
"Delete this arc? Its entries stay, in no arc.". `/canon/arcs/:id` redirects to `/canon/arcs?arc=<id>`. `CanonArcs.vue`
under the contents is only the filter: **Arc** (Everything, or one arc; a native select) with **Clear**, hidden while there
are no arcs. A theme line in the premise says what carries it ("Carried by": entries with a
`carries` link to it, and arcs whose `theme_id` is it, `ThemeCarriedBy.vue`), or "Nothing carries this yet." Each truth, force, secret, lore entry, backstory and open
question has a small **Arc** picker under its title (`EntryArcPicker.vue`, the one component, shown once an arc exists; a
premise entry never has it).

- **Narrowing.** The chosen arc (`useCanonUiStore().arcFilter`, part of `hasActiveFilters`, cleared by `resetFilters`)
  narrows truths, forces, secrets, open questions and lore at once (`canonNarrow.ts`). **Backstories are not narrowed**:
  a character spans arcs, so the part always lists the whole party (#1258 item 29; the entry's own Arc picker stays). The premise, How the world works, Peoples, Life,
  the table's lines and Deleted are never narrowed. A narrowed part (not Backstories) says "Showing <arc> only." in
  one quiet line, and its empty state "Nothing of this part is in <arc>." **The contents column's counts follow the
  narrowing** (so they match the lists under it); the way in keeps reading the whole canon, because it asks whether
  the canon holds a thing at all. An entry that is open stays open when the DM moves it to another arc (the selection
  reads the whole list). A deleted arc lets go of the filter by itself.
- **Search (#1258 item 21).** One field at the top of the page searches the whole canon: titles and bodies (plain text of
  the rich text) of every entry, plus clue titles, force step titles and lore passage titles and bodies (`searchCanon` in
  `canonSearch.ts`, a pure function; passages, clues and steps are the campaign-wide reads the parts already make). It reads the
  arc-narrowed canon, so a clue, step or passage whose entry the arc leaves out is not found. While a query is set the
  results (`CanonSearchResults.vue`) stand in place of the part, grouped by part in the contents' order, each hit a link to
  `/canon/<part>?entry=<id>` (a clue opens its secret, a step its force, a passage its entry) with a line of the body around
  the match; following one, or choosing a part, clears the query. The query is `useCanonUiStore().query`, part of
  `hasActiveFilters` and cleared by `resetFilters`, with a **Clear** beside the field. Clearing the arc does not clear the search.
- **Truths: filter and group (#1258 item 22).** The truths ledger can be filtered by mark (All, Known to all, Some, Secret) or
  to the truths of **No arc**, and grouped under "what it is about": the record the truth's `about` link points at (read
  from the same world ties as the knowers), the rest last under "Not about anyone in particular"
  (`canonTruthView.ts`). Both live in the store (`truthFilter`, `truthsGrouped`, with their own **Clear**).
- **Order.** Truths, forces, secrets, open questions and premise lines have up and down buttons (`CanonMoveButtons.vue`,
  rule in `canonOrder.ts`): the move swaps the two rows' `sort_order`, or renumbers the list from position when places
  collide, writing only the rows whose place changed (`useCanonReorder`). A force moves among the moving ones, a secret
  among those in its own state (the ledger draws the revealed last), a premise line among its own kind. Buttons are
  hidden, not disabled, while an arc narrows the list (and, for truths, while a mark filter or grouping does), and for a list of one. Lore is shown by its date in the
  world, so it has no manual order.

What the review of the beta changed (#1255, 23 Nov 2026) and the rebuild kept:

- **A statement wraps.** A truth, a secret, a clue, a question, a theme, a line, a force's wants and its steps are
  `AppInput wrap` (a one-row textarea that grows): still one paragraph, saved when left, Enter finishes it.
- **A Line is upright text, a Veil italic**; neither is struck through (a struck line read as a deleted one).
- **`?entry=<id>` lands on every chapter.** A premise entry or an open question has no entry pane, so its row is scrolled
  to and ringed for two seconds.
- The World field's element id is `canon-world-name`: `canon-world` is the chapter's, and sharing it sent "How the world
  works" to the top of the page.

## Tonight (#1255 item 14)

`/canon/tonight` (`CanonTonightView.vue`, header button **Tonight** beside Bring in a book, and under the title on a phone; a link
back, "The whole canon") gathers what the next session needs from the canon. It is something you run from (#1258 item 1): it stores nothing of its own, but a clue has **Found**, a passage **Tell** and a
force with a clock **Tick**, each through the composable the entry pages use (`useSetClueFound`, `useTellPassage`, `useTickForce`),
so each stamps the open session as they do (a backstory passage is told to its character only). Every name still links to where it
is edited. A DM route like the rest of the canon (the lens fence derives it: only `/play` is the player area). All gathering
is the pure `src/lib/canon/canonTonight.ts`; the view reads through the Canon page's own composables, so the doorbell keeps it fresh.
Five blocks, each left out when empty, in this order:

1. **Lore to tell**: untold lore and DM backstory passages that come out at a place, person or beat, grouped by where, each with its
   entry's title linking to `/canon?entry=<id>`. A passage that comes out nowhere is not listed (no cue), nor an entry's first passage
   (told with the entry).
2. **Clues to find**: clues not found, of secrets not revealed, grouped by where they lie, "Not placed anywhere yet" last; a clue that
   is a lore passage lies where the passage comes out. Each names its secret. A clue lying in an item or a handout is grouped under
   that item or handout (named as `useClueWhere` names it); they have no place, so "Where the party is" never holds them and "Everything" does.
3. **What moves next**: each force still moving, its first unreached step ("No next step written" when none) and its clock as "3 of 6",
   "The clock is full" when it is.
4. **Threads left open**: per character, the open threads of their backstory (`openThreads`) and the DM's passages not yet told to them,
   linking to `/canon?backstory=<party member id>`. A character with neither is left out.
5. **The table added**: the count of unreviewed table facts, only above zero, linking to `/canon?section=table` (the Canon page opens the part named by `?section=<part id>`, rewriting the address to `/canon/table`, once the page has loaded).

A **scope control** tops the page: *Where the party is* (the default), *Active quests*, *Everything*, kept in `useCanonUiStore().tonightScope`
(a filter: it counts in `hasActiveFilters` and clears with `resetFilters`). It narrows the two blocks that lie somewhere, lore and clues,
through `scopeTonight` in `canonTonight.ts`: *Where the party is* keeps places that are `campaigns.current_location_id` or inside it (the
`parent_id` walk, so a room in the party's town counts); *Active quests* keeps what lies at a beat of a quest whose status is `active`
(`useCampaignBeatQuests`). What lies nowhere, or at a person, is left out of both. What moves and the open threads belong to the whole
campaign and are never narrowed. When the scope hides everything the canon holds, a line under the control says so.

A sixth block, **Loose ends**, is folded by default and left out when empty (`looseEnds` in `canonTonight.ts`, from data already loaded).
Each row links to its entry (a backstory to `/canon?backstory=<member>`, an arc to `/canon/arcs?arc=<id>`, which has no entry of its own):
a secret not yet revealed with fewer than three clues or no clue placed anywhere (a place, person, beat, item, document or passage); a
force still moving with no unreached step or no quest tied (`canon_entry_quests`); an open question with more than five sessions
begun since it was written (`campaign_sessions.created_at` against the entry's `created_at`); a backstory with no open thread; and an
arc with status `running` that has no moving force (`canon_entries.arc_id`) and no active quest (`quests.arc_id`).

Tell, Found and Tick each toast with **Undo** (take the passage back, set the clue unfound, tick the clock back by one). The row stays
in view for the visit: it leaves its block and lands under a folded **Done this session** block (`TonightDone`), where each line has its
own Undo; the page keeps that block even when nothing else is waiting. An arc loose end opens `/canon/arcs?arc=<id>`. The Next session
card says "one tick from full" for a clock one tick short of full.

When the whole canon has nothing for any block, the page says nothing is waiting and links back to the Canon. There is no dashboard widget yet.

**Canon here on the run surfaces** (#1258 item 2): `CanonHere` takes a `compact` prop and is mounted so in the quest cockpit's wide
part for the beat being run (`QuestBeatWide`) and in the Play screen's room card for the room the party stands in
(`ExploreRoomCard`). DM surfaces only; `CanonHere.test.ts` fails if a player view or component imports it.

## Secrets, clues and open questions

Part IV of the page. A secret is a `canon_entries` row with `part = 'secret'` (its title is the statement); its clues
are `canon_clues` rows, each placed at a place, a person, a quest beat, an item or a handout (at most one, in `location_id`, `npc_id`, `quest_beat_id`, `item_id` or `document_id`) or nowhere yet. The state is
derived, never stored: **hidden** (no clue found), **partly known** (any clue has `found_at`), **revealed**
(`revealed_at` set). Each state is a word and a shape (empty, half, full circle), never colour alone. Finding every
clue does not reveal a secret: **Reveal to the party** is the DM's button (it asks first, stamps `revealed_at` and
shares the secret with every party member through `player_visible_to`); **Hide again** clears `revealed_at`. Players
read a secret only once revealed, through `get_player_canon`, and never see a clue.

The Found tick sets `found_at` and `found_session_id` (the open session, null when none runs); unticking clears both.
Clues show where they lie, for the DM only, as a "Canon here" block (`CanonHere.vue`, which also offers lore to tell there: see **Lore, told in passages**) on a place's DM page, an NPC's
sheet, a quest beat's editor, an item's DM sheet (`ItemSheet`, not for a library item or a player) and a handout's editor, each clue with the same Found tick and a link to `/canon?entry=<secret id>`. A secret wants
three clues, so the party can miss two and still find it. Open questions (`part = 'question'`) are a plain list, each
marked "nobody settles this by invention". `canon_clue` is an MCP kind; `canon_clues` rings the doorbell under the
canon query root.

**Clues in items and handouts (#1258 item 30).** `ClueKind` is `location`, `npc`, `quest_beat`, `item` or `document`, and `get_canon_here`
answers all five. The clue form's *An item* uses the world picker (the campaign's own items, never a book's) and *A handout*
lists the Scriptorium documents of kind `handout`; a clue row names either through `useClueWhere` (items are read by id, only the
ones a clue lies in). `cluePlacement` turns a chosen place into the one column to set, so a new kind cannot fall into another's.
A lore passage never lies in an item or a handout (`wherePatch` refuses), so `WherePicker` offers them only with `for-clue`.

**Things end and turn into others (#1255 items 9 and 10).** A question can be answered: *Answer…* on its row makes the
answer a new entry (a truth with a knowledge mark, or a secret) titled with the answer, then closes the question with
`closed_as = 'answered'`, `closed_at`, `closed_note` (the answer) and `became_entry_id` (the new entry). If the second write
fails the new entry stays and a toast says so. Answered questions fold under "Answered (n)", each linking to what it became
(`/canon?entry=<id>`; the FK clears the pointer if that entry is deleted) with *Reopen*, which nulls all four columns. A
revealed secret offers *Make it a truth* (with its words and notes; known to all when the whole party reads the secret, otherwise
`knowledge: some` with a `known_to` link to each character who does, #1279 item 3) and then reads "Now a truth: <title>";
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
`revealed_at` and `revealed_session_id`, share with every party member), used by the secret's own button and by a tied
beat's prompt. **Reveal to…** (#1258 item 23) uses the same pick-some picker as a passage's Tell (`PassageTellSome`) and
shares with only the characters ticked; both stamp the open session (null when none runs, as a Found clue does), and
*Hide again* clears both columns, since the table refuses a session with no reveal time. A revealed secret says who has it
("Revealed to Mira and Bram", "Revealed to the whole party") and, until the whole party has it, offers **Reveal to more…**: the
same picker with those who have it ticked, which only adds members (`widenReveal`) and keeps `revealed_at` and the session
(#1279 item 4). A link to an open question (`?entry=<question id>`) opens the chapter on Questions, so its row renders and rings
(#1279 item 6). An NPC's DM note stays a note.

**The players wonder (#1258 item 24).** Above the open questions, "The players wonder" (`WonderInbox`, drawn only while
some are open) lists each `canon_wonders` row nobody has answered. *Take it up* makes an open question of the player's
words (the question first, then the wonder's `adopted_entry_id`; a failed pointer toasts and keeps the question) and
*Let it be* stamps `dismissed_at`. A DM never edits a wonder's words. Each open question's row has **Answered in…**, a
folded `EntryQuests` tying it to the quests that settle it (`canon_entry_quests`).

The hand links are the same `canon_entry_quests` rows (see Forces), and the quest's page lists the secret under
"The canon behind this quest" with its state.

## Forces (the chapter once called What is moving)

Part III of the page (frame 06; `ForcesSection.vue`, `ForceDetail.vue`). A force is a `canon_entries` row with
`part = 'force'`: its title says who, `wants` says what it wants in one line, and `clock_size` (2 to 12, or null for no
clock) says how many ticks fill its clock. Only a force may hold either column (23514 otherwise). Its other state lives
in three DM-only tables, all under the canon query root and all ringing the doorbell: `canon_force_steps` (what it does
next, in `sort_order`; `reached_at` and `reached_session_id` stamp the step it has reached), `canon_force_ticks` (each
move of the clock, forward or back, with a note, the open session and the world's date) and `canon_entry_quests` (the
quests where the party meets it, once each). Players never read any of it.

- **A force is who doing what** (#1258 item 16). Its title is the plan ("The summoning"), never a copy of its faction's name.
  The who is any number of people, factions or gods (#1279 item 11): canon→npc/faction/deity `about` links, set from the
  **Who** picker in the pane header (`ForceWhoPicker`, each who a chip to its own page) and read by `useForceWho` (one read
  for the whole list, `lib/canon/forceWho.ts`), named on the row ("The Ferrymen and Vexa") and hidden from the pane's
  Connections block (`isWhoTie`) so they are not shown twice. A force whose who is an NPC is listed on that NPC's sheet
  under "About them". The add row
  (`CanonAddRow`, on the canon page and as *Add a force* on a faction's page, which ties the new force `about` that faction)
  takes What they are doing (required); who and the rest are set in the opened entry. Forces made before this keep their titles; the row leaves Who out
  when it equals the title. The detail shows one quiet line when the clock and the steps disagree (`clockStepsDivergence`):
  a full clock with steps unreached, or every step reached with the clock short.

- **A force has a schedule and stakes** (#1258 item 9). Each step may carry a **Due** date in the world (`canon_force_steps.due_year/_month/_day`:
  a year, a year and month, or a whole date; a day without its month is refused, 23514), entered through `WorldDateField`
  like lore's date and written by `duePatch`, which normalises first so a day without a month is never sent. Once the
  campaign's date (`campaignToday`, only when it keeps a calendar) is past an unreached step's due date, read at the
  precision it was given (`stepOverdue`), the step, the force's row and its detail say "Due 3 Harvest, not reached."
  (`overdueLine`); an ended force says nothing. Unreached steps with a due date also appear on the Calendar's canon
  timeline ("A step due") and in the almanac ("Due"), beside the ticks already past (`dueSteps`). The detail also holds
  **If it succeeds** (`canon_entries.if_succeeds`, force only): saved when the field is left, and clearing it writes null,
  unlike the other fields, which put the saved words back. `EntryStoryLinks` (Because of, Led to, Carries, and the cause and effect pickers) sits below the quest clocks. It owns `led_to` and `carries`: every detail hides both from its Connections block, each `led_to` row can be removed (a row that is only the entry's own `became_entry_id` pointer is its record, not a tie, and has no remove), and **Add a cause** / **Add an effect** write a `led_to` with this entry at the `to` / `from` end (#1279 item 9).

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

**Who lives in it**, now the chapter Peoples (below). It was a block of this part until
#1255 item 31 moved it, so both halves of "who and what lives here" are read together; nothing about it changed.
(`campaign_peoples`, `ecology/PeoplesChapter.vue`, `useCampaignPeoples.ts`, #1255 item 30): the peoples of the
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

After How the world works, before Lore (short label "Habitats"). Not entries, so it has no count in the contents column;
Since #1267 these are two chapters, **Peoples** (`ecology/PeoplesChapter.vue`) and **Habitats**
(`ecology/LifeChapter.vue`), so the world's peoples are no longer read as part of its ecology. **Habitats** is the habitats chapter: a short list of the world's kinds of
country, each with a description, the Atlas places it covers and the creatures that live there.

The list (`LifeChapter.vue`, a habitat opening beside it on the kit) shows each habitat's name, its places as plain words and a one-line summary of what lives
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
covered place as `throughPlaceId`. The encounter generator has a **Where** choice (`useEncounterWhere`, the party's
place, `campaigns.current_location_id`, until the DM picks or clears it). When that place lies in a habitat with a
creature at a share, one quiet line gives the habitat and its shares ("Salt marsh: Marsh eel 40%, Giant frog 20%,
anything else 40%"), and each generation rolls once with `rollLife` through `lifeConstraints`: a rolled creature becomes
"Build this encounter around X: it is what lives in <habitat>. Other creatures may join it.", and a roll on "anything
else" becomes "The creatures are not <listed>: something this country rarely sees." The roll is a constraint beside the
DM's concept and never over it, a creature the reader cannot read is never named, and no place or a place in no habitat
sends nothing. **A place's own table wins (#1258 item 15):** `encounterSourceForPlace` (`habitats.ts`) is the one rule: the roll table placed on the
place, or on the nearest place it lies inside (`tablesForPlaces`), comes first, and the habitat is the fallback only when neither has one. With a table
the Where line says "Uses <table> here" and nothing is rolled from the habitat. The lines travel as `constraints` on `generate` (`useEncounterGeneration`): sent as `constraints` in the body to `generate-encounter`.

**On the place.** The DM's place page shows `PlaceHabitat.vue` beside the canon placed here: "Lies in <habitat>" (with
", through <place>" when the habitat is inherited), its shares line, and a link to `/canon?section=life`. Nothing renders
for a place in no habitat and no table, and it is never mounted on a player surface. When a table applies it adds "Its own table, <name>, comes first" under the habitat line.

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
"Told with the entry" and is never offered **Tell the party**. One rule, kept in SQL (`get_player_lore_passages`' `firsts`; `get_canon_here`
never offers it): the lore detail labels it "The opening, read when the entry is shared" with a line saying it never waits at a place.
A lore entry also carries `EntryStoryLinks` (Because of, Led to, Carries). An NPC's sheet (desktop and phone) has one **In the
canon** block (`NpcInCanon.vue`, #1279 item 13): **Knows** (entries tied to them `known_to`, a truth offering **Tell the party**
through `useTellTruth`), **About them** (truths, secrets and forces tied `about` them, and the lore about them with "n of m
told"), and **Clues and passages on them** (`CanonHere`, bare). All of it is the one `get_canon_here` read (its `knows` and
`about` from `20261125220434`), and the Relations tab hides canon ties since the block shows them. **Write lore about this person** makes an entry, ties it `about` the NPC and lands on
it at `/canon?entry=<id>`; the NPC's own `backstory` field stays the DM's summary. A later passage is told on its own: **Tell the party**
sets `told_at`, `told_session_id` (the open session) and `player_visible_to` (every party member); **Take back** asks
first and clears all three. It may come out at one place, person or beat (`WherePicker.vue`, shared with the clue form;
the other two columns are cleared on a move), and shows "Also a clue to" any secret whose clue points at it
(`canon_clues.passage_id`; telling it the first time marks those clues found, in the database). **Make it a clue to a
secret…** in the passage's margin (`PassageClues.vue`, #1255) files that clue: named by the passage's heading, lying
nowhere of its own, and already found when the passage had been told (`passageClue`, since the database only finds a
passage's clues at the moment it is told). The × beside a secret deletes the clue and leaves the passage. An entry's
first passage and a player's own backstory passage cannot be made a clue. Passages are added,
reordered (renumbered from position) and removed in the entry. A lore entry opens beside the lore list (`CanonChapter`); a passage's margin sits beside its text from 32rem of the
row and under it below that.

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
started before it was written, `writtenWhen`) or "Your passage".

**A backstory's ties are the character's** (#1279 item 12). The pane mounts the character's own Connections block (subject
`{ kind: "party_member" }`), editable, so a hometown or a mentor tied there is the character's tie and shows on the
character's page too; a backstory entry holds canon-to-canon ties (threads) only. `20261125202721` moved the ties older
backstory entries held onto their characters. **New NPC from this backstory** (`BackstoryPeople.vue`, #1258 item 25) is a
small inline form, a name and how that person relates to the character, which creates the NPC hidden from players with
that tie to the character (a contact when no relationship is chosen) and **stays on the backstory**: the new person
appears in the Connections block. The character's page links to its backstory (**Backstory**, `/canon?backstory=<id>`).

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
(`src/components/canon/CanonReview.vue`; since #1267 every run is started from the Familiar, see The page); an accepted entry and the `known_to` ties it brings carry
`ai_provenance`. An AI-written entry is marked edited by the database the first time its words change
(`private.canon_entries_mark_edited`), whoever changes them.

Two more modes (#1255 item 7). Every mode is priced on its own `ai_generation_credit_costs` row and has its
own `ai_system_prompts` row; the client reads each price through `canonSuggestionsQuote.ts`.

- **Suggest secrets** (`secrets`, `canon_secret_suggestion`, prompt `canon_secrets`, reviewed in `SecretsChapter`) proposes
  up to five secrets, each with up to three clues. A clue lies at a place, person or beat **by id**, from a campaign-scoped
  candidate list the server sends the model; an id that is not in the list (or of the wrong kind) is dropped and the clue
  stays, unplaced, and a second clue at one place is left unplaced too. A secret with no readable clue is set aside.
  Accepting writes the secret, then its clues in order through `useCreateCanonEntry` and `useCreateCanonClue`, and opens
  the secret; a clue that fails stops the rest, tells the DM and leaves the proposal.
- **Read it through** (`read`, `canon_read_through`, prompt `canon_read_through`, asked of the Familiar and shown by `CanonReview mode="read"`) is a mode of
  `suggest-canon`, not a function of its own, because it needs the same DM gate, prompt row, price, credit hold and id
  grounding. It writes nothing and returns findings `{ kind, text, entry_ids }`. **Loose ends are computed in code**
  (`_shared/canonReadThrough.ts`, `looseEnds`): an unrevealed secret with no clue, an open force with no unreached step,
  an open question no quest is tied to (`canon_entry_quests`); closed entries and revealed secrets are never reported.
  **Contradictions come from the model**, which is given every entry as `id|part|title|start of text` (at most 150) and
  may name only those ids: a contradiction naming any other id (another campaign's, an invented one) is set aside whole,
  and one needs two distinct entries. An empty read is an answer and is charged; a canon of fewer than two entries skips
  the model and returns the loose ends free. Each finding links its entries to `/canon?entry=<id>`.
- **Shape the world**, the walk of five steps, went in #1267: the way in leads a new canon, and "Walk me through building
  my campaign's canon" is asked of the Familiar. Each step of the way in is done in place (#1279 item 1): the pitch is
  written in `PremisePitch` inside step 1, because the guide stands in for the Premise chapter and a link to it was the
  page already showing; no step may link to the chapter on screen.
- **Lore text is a passage** (#1279 item 2). Sorting a note into lore writes its text as the entry's first passage
  (`canon_lore_passages`, sort order 0), never to `canon_entries.body`, which the lore editor has no field for while the
  player's World tab renders it. A lore entry that still has a `body` shows it in "Text from before passages", with
  "Make this the first passage" (passage 0, the others shifted, then the body cleared).
- **No Familiar on Arcs, Peoples or Life** (#1279 item 10): the canon helper has no mode for them (`canonSuggestionsAskAdapter`),
  so the request came back as truths. Give one a mode before giving it a button again.

None of the three could be run against a model in the test environment (no AI keys): the tests cover everything around
the model call, and the two new prompt rows need a run against a real key before they are trusted.

## The look, shown (#1252)

A look is often easier to show than to put into words. The Look field in Part I takes up to four pictures
(`canon_entries.reference_images`, migration `20261123064323`: at most four, and only on the look premise entry, both
held by checks). The browser stores each at 512 px on its longest side as WebP in `asset-images` (style carries at that
size, and every picture is billed as image input on every render), after the likeness notice, since a picture may show
a real person. **Describe from the pictures** calls `describe-look` (server path only, DM-gated, likeness backstop,
`canon_look_description` at 1 credit, prompt row `canon_look`), which reads them through `callDocument` and returns one
paragraph about how they are painted, never who or what they show; nothing is written server side. The text lands in
the field and autosaves; replacing existing text asks first, as the other canon suggestions do.

The pictures travel with the world block (`WorldBlock.lookReferences`), so every generator that paints from the look
also hands them to the image model as style references: `generate-entity-image`, `generate-npc`, `generate-location`'s
scene, `generate-trap`, and `generate-chronicle-image`. A map never gets them (top-down
cartography), and neither do the tools that edit a given picture. `generateImage`'s `styleReferences` puts them after
any source images and adds the one sentence that names them as style only (`_shared/styleReferences.ts`). On OpenAI
they send the render to the edits endpoint, which cannot take `moderation: "low"`; so when the pictures were the only
reason for the edit and OpenAI refuses, the render is retried once as a plain generation without them, inside the same
screening row. The server fetches them only through the SSRF guard.

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

Deleting an entry on the page moves it to **Deleted (n)**, a quiet disclosure at the foot of the contents column (`CanonDeleted` inside `CanonContents`, absent when empty, drawn under no chapter or sheet), for thirty days. Its clues, steps, ticks, passages, quest ties and world links are kept with it as a snapshot in `canon_trash` (DM-only; `trash_canon_entry`, `restore_canon_entry`, migration `20261123235700`; purged by `purge-canon-trash`). A deleted entry is simply not in `canon_entries`, so no reader of canon has to leave it out. Each row says what it was, when it was deleted and how many days are left, with **Restore** and **Delete for good** (asks first). A delete also toasts with Undo.

Restore puts everything back **as the restoring DM** (rows come back owned by them), re-points what pointed at the entry, queues the entry's embedding again (a delete dropped the vector) and opens it by `/canon?entry=<id>`. It does not undo anything else: a reference to something deleted meanwhile is emptied, a quest tie to a deleted quest is dropped, and a backstory comes back only while its character has none (otherwise the server answers 23505 in words: delete the new one first). Deletes made by MCP or other server paths are still permanent. The list is read under a `CANON_KEY` query, so `canon_trash` ringing the doorbell refreshes it.

## The third review's story tools (#1279 wave 2)

Data in `20261125202721_canon_story_round_three`; pgTAP in `canon_story_round_three.test.sql`.

**Entry panes are as tall as what they hold** (item 16). A pane shows the blocks that hold something and folds every empty
optional one (arc, notes, quests, cause/effect/theme, connections, a secret's cover story) into one **Add…** menu
(`kit/CanonAddFold`, `useEntryFold`). "Filled" is read from data, never local state; a block the DM just chose stays shown
until the entry closes. A truth's knowledge help is a tooltip on its mark, not a paragraph.

**Two kinds of secret, told apart** (item 14). The truth mark `secret` is labelled **Known to no one**, so it no longer
reads as the Secrets chapter. Such a truth offers **Give it clues** (`useGiveClues`): a secret with its title and arc whose
`became_entry_id` is the truth, the `led_to` link written as "Make it a truth" writes it, and the DM lands on it. Once one
exists the truth says "Its clues are in …" instead.

**Cover stories** (item 15). `canon_entries.cover_story` (secret only, 1 to 500 characters) is "What people believe
instead". The world block sends open secrets' cover stories, and only those words, as **Commonly believed**; a revealed
secret's stays, because the party learning the truth does not change what the world says, and a closed one's goes.
Players read them in the World tab's **What people say** through `get_player_common_beliefs`, which returns the belief
alone (never the secret's id, title or words) for every open secret not yet revealed to the caller's character.

**Telling a truth** (item 27). **Tell the party** (knowledge `all`) and **Tell…** (`some`, a `known_to` link per chosen
character) stamp `revealed_at` and `revealed_session_id` on the truth as a reveal does on a secret (`useTellTruth`; the
constraint now allows both parts). Telling more keeps the first stamp. `get_player_canon` returns `revealed_at`, which
gives a told truth the World tab's New dot (read marker `canon_told`), and "This session" counts it.

**Peoples are cultures** (item 22). A people may take its own name over its record (`campaign_peoples.name`: "the Vell",
humans); several peoples may share a record when their names differ, and an unnamed second one is refused (23505). The
view reads `name` (own name, else the record's), `own_name` and `record_name`. Where they live is
`campaign_people_places` (a place may hold several peoples, unlike a habitat; `PeoplePlaces`). The NPC generator still
rolls per people at its share: the race is the record's name and a "Culture:" line names the culture with the first
sentence of what they are like. The world block sends "the Vell (Human), 30%: …" once any people has a name or words.

**One rule for loose ends, and Leave it** (item 21). `supabase/functions/_shared/canonLooseEnds.ts` decides what is a loose
end, for Tonight and the paid read-through alike (its doc comment says why each case is one). An entry with
`canon_entries.loose_end_left_at` set, or an arc with `canon_arcs.loose_end_left_at` set
(`20261125210154`), is skipped by both; Tonight's **Leave it** sets it on either, with Undo.

**Tonight's plan** (item 20). Pins (`canon_tonight_pins`: one clue, passage, force step or entry each) sit in a
**Planned** block at the top in the DM's order; a pin whose clue is found, passage told or step reached drops out, and the
scope never cuts one. One line of intent per campaign (`canon_tonight_plans`, autosaved) heads the page and the Next
session card. "Where the party is" also keeps what lies on a person whose `npcs.location_id` is the party's place or
inside it. Force steps are flagged Due or Overdue against the world date, with **Reached**. The scope control shows only
when there is lore or a clue to narrow, carries a count per option and says it narrows those two blocks (the maintainer
found the tabs seemed to do nothing on a campaign whose Tonight was all forces and threads, 25 Nov 2026).

**Lists that scale** (items 25 and 33). An arc's "What is in it" lists truths and lore as well, each row with **Take out of
this arc**, and an **Add to this arc…** picker files any entry or quest in place. The Quests list filters by arc
(`questsArcFilter`). Lore filters by kind (`loreKindFilter`). Truths has a **Select** mode (`TruthBulkBar`): File in arc…
and Mark as… (which never touches known_to ties), applied only to rows still shown. Lists may offer Move to top/bottom
(`endsOf(list, id, true)`, `moveToEnd`).

**The Timeline is a chapter** (item 33), in the world group after Lore (`TimelineChapter`), with **Add an event** (a dated
history lore entry in the active arc, `TimelineAddEvent`) above the almanac; How the world works no longer holds it.

**Search and the book** (items 23, 24). The Canon search also reads arcs, peoples, habitats and the table's lines; its
last row puts the same words to the whole campaign, in place. **Open as a book** draws How the world works, Peoples,
Habitats, Arcs and Backstories as well. A book drawn from the canon says so itself, `scriptorium_documents.drawn_from =
'canon'` (`20261125210154`, which marked the books drawn before it by the title drawing gave them), so the DM's book is
found again however it is renamed, and a book the DM wrote by hand under the same title is never taken for it.

**Starting from an entry, and the Calendar** (item 32). **Start a quest from this** on a secret (`SecretOutlets`) or a
force (its quests block) creates an undiscovered quest with the entry's title in the entry's arc, ties it to the entry
(`canon_entry_quests`), for a secret makes a beat for each unplaced clue the DM ticks and places the clue there, and lands
on the quest (`useStartQuestFrom`; a Sanctioned Exception in CLAUDE.md). It is several writes, not one transaction: a failed
beat or tie is told and leaves the quest. **Put this step on the Calendar** on a dated force step makes a hidden world event
on its date and points the step at it (`canon_force_steps.calendar_event_id`, emptied when the event is deleted; the event
is taken back if the pointer cannot be written), so "On the Calendar" opens the event's month wherever the DM moves it and
the Calendar draws the event instead of the step's own "A step due".

**Panes and lists, continued.** The force pane folds its empty blocks into **Add…** like the others (clock and steps always
show). Forces, Secrets, open Questions and Arcs offer Move to top and bottom; Lore reads by date and has no manual order.
The search links `?people=`, `?habitat=` and `?fact=` open that people's or habitat's editor, or the table review with that
line ringed, through `useLinkedRow`. The player's Journal badge counts told truths and revealed secrets (`canon_told`), as
the World tab's New dot does.

**Lines and veils, asked privately** (item 29). A player sends one from the World tab (Line or Veil, a sentence, "Put my
name on it" off by default) through `ask_for_line_or_veil`. The row belongs to the campaign's owner from the moment it is
written and names the asker's character only when signed, so no read of it can say who asked; a player never reads the
table. The DM's Premise chapter shows `LineRequestInbox`: **Add as a line/veil** (a premise entry, `adopted_entry_id`) or
**Let it be** (`dismissed_at`); a trigger keeps the player's words and signature as written.

**A player's words survive a DM's edit** (item 30). When a DM edits a passage a player wrote, a trigger keeps what the
player had (`body_before_dm_edit`, from the first DM edit since the player last wrote) and stamps `dm_edited_at`; the
player's own next edit clears both. The player's backstory shows "Edited by your DM" and "What you wrote".

**A backstory's ties are the character's** (item 12). The migration moved every non-canon tie a backstory entry held onto
its character (`party_member`), skipping one the character already held.

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

### The Chronicle (Part IX, frame 12; now on the Sessions page)

Since the 24 Nov rebuild the Chronicle is no longer a Canon chapter, and since the review that followed it is no longer a second list either: each session's row in the Sessions log carries its chronicle (`SessionChronicleLine`: the excerpt, the date in the world, who it is shared with, what the party learned, the canon this session), and **Draft with the Chronicler** sits with Write notes. The almanac is the Canon's again, in How the world works (`WorldAlmanac`). The paragraphs below describe the content; the component names in them are the old ones.

`ChronicleSection` lists the campaign's **sessions**, newest first or from the start (`SegmentedControl`, state in
`useCanonUiStore`), each with the note linked to it (`chronicleItems` in `canonChronicle.ts`; its newest when several are
linked; a note with no session is never shown). An entry (`ChronicleEntry`) carries the session number and title, the day
it was played, its date **in the world** (the note's `session_start_year/month/day` through
`useCalendarStore().adapter.formatDate`), who the note is shared with (`audienceLabel` of `player_visible_to`, "Not shared
yet" when nobody), the note's title as a link, the first picture in it and an excerpt, and "What the party learned" as
one list (below). A session with no note offers
**Write the chronicle** and **Draft with the Chronicler**, both `sessionNoteRoute()` into the note editor. Entries show ten
at a time, because each reads its own session's learned moments.

**This session** (#1258 item 8, made one list by #1279 item 31). Under each entry, `SessionChronicleList` shows one list with a
kind word per row (Learned, Found, Told, Revealed, Step reached, Clock moved, Answered, Table line): what the party learned
(`useSessionLearned`), the table's lines from that session not yet reviewed (`story_facts` with its `session_id`, linking to
the Truths chapter where they are reviewed, and still in its inbox), and what the canon
did that session (`canonThisSession` in `canonSession.ts`, read by `useSessionCanon` from the Canon page's own queries): clues
found (`found_session_id`), passages told (`told_session_id`), secrets revealed and truths told (`revealed_session_id`), force steps reached
(`reached_session_id`) and clock moves (`canon_force_ticks.session_id`, leaving out the tick a reached step wrote, which is
the step), and questions answered. A question stores `closed_at` and no session, so it is matched to the session played
that calendar day. Each item links to its entry. The same list, as text (`sessionCanonText`), is read for the note's session
by `fetchSessionCanonText` (table lines left out: they are not yet canon) and sent with the Chronicler draft as `canon_this_session`; `generate-chronicle-text` adds it (capped at 4000 characters) after the notes in the model's input.

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
