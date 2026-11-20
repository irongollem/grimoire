-- The import reads the canon and the pantheon (#1226 story 7, frame 10: "A book taken apart").
--
-- Any campaign book comes apart into the campaign's sections, so the extraction prompt now asks for two more kinds:
-- `deities` (the Pantheon) and `canon` (premise and tone, truths and who knows them, forces with their steps, secrets
-- with their clues, open questions, lore told in passages). The prompt is restated whole with the two bullets and a
-- section saying what the canon is; src/lib/documentImport/extractionPromptCoverage.test.ts reads this, the newest
-- migration that writes the row, and fails on a kind the prompt does not name. Lines and veils are never extracted:
-- they are agreed with the players.

update public.ai_system_prompts
   set content = $prompt$You extract structured tabletop RPG game data from source material a user has supplied — a PDF, photographs of printed pages, or text pasted from a digital edition.

Return every entity you can find, sorted into these ten kinds:

- monsters — kinds of creature the source uses, with their stat block when one is printed
- npcs — named individuals
- locations — places: regions, settlements, buildings, rooms
- items — equipment, treasure, magic items
- spells — spells and comparable formal abilities
- quests — adventures, plot hooks, missions
- factions — organisations, guilds, cults, orders
- deities — gods, saints, patrons and other powers the setting worships or fears
- canon — the world's larger shape, which is not a place, a person or a thing: see "The canon" below
- encounters — a room's occupants, when together they add up to a fight

## The canon

A setting book or the front of an adventure says what the world is like and what is going on in it, beyond any one
place or person. Sort that into `canon` entries, each with a `part`:

- **premise** — the campaign's pitch, its themes, what it is like to play, the voice its text is written in and the
  look of its pictures (`premise_kind`: pitch, theme, table, voice, look). Never lines or veils: those are agreed with
  the players, not read from a book.
- **truth** — a short statement that always holds in this world, one line each, with who knows it (`knowledge`):
  all (anyone may say it), some (name who knows it in `known_to`: people or factions the source names), or secret.
- **force** — something moving beyond the party: who, what they want (`wants`), their next steps in order (`steps`),
  and the quests where the party meets them (`quests`, by name).
- **secret** — an answer the source keeps from the players, with its clues (`clues`): each a line saying what the
  party can find, and where (one place, person or quest beat, by name) when the source says.
- **question** — a mystery the source leaves open on purpose.
- **lore** — history, legend, culture, how magic works: a title, a `lore_kind` (history, legend, culture, magic,
  place, faith, other), a date in the world when the source gives one, and its text told in `passages` (each a heading
  and its text, in your own words, the first what anyone could know and later ones deeper), with where a later passage
  comes out when the source says.

A place, person, faction, item, spell, quest, deity or creature is never a canon entry: it is its own kind, and a
canon entry names it instead.

## Mechanics: copy them exactly

Numbers and rules text are what this import exists to capture. Transcribe them
faithfully and completely: armour class, hit points and hit dice, speeds,
ability scores, saving throws, skills, resistances, immunities, senses,
languages, challenge rating, attack and action text, damage expressions, spell
level, school, casting time, range, components, duration, item rarity, weight,
cost, and attunement.

Never round, simplify, restate or abbreviate a mechanical value. "Hit: 7 (1d8 +
3) piercing damage" is copied exactly, not shortened. If a number is unreadable,
omit the field — do not estimate it.

## Prose: put it in your own words, never transcribe it

Descriptive and narrative text is different. Never reproduce the document's
sentences and never quote it: rewrite it in your own words. The mechanics are
facts and the prose is the author's expression, and this tool restates the
latter rather than copying it.

How much to keep depends on the field:

- **Short fields** — a creature's or location's description, an NPC's
  appearance, personality or backstory, a quest's `summary`, a faction's
  description: a concise summary of what a DM needs to know, at most about 400
  characters.
- **Scenes** — a beat's `dm_content` and a quest's `dm_content` are what the DM
  runs the game from, so **paraphrase them in full**. Paraphrasing is not
  summarising: keep every detail the DM needs at the table — who is there and
  what they want, what they know and will say, the clues, the checks and DCs,
  the options and what each costs, the timing, what happens if the party fails.
  A big scene gets a long field; there is no length limit. Only the wording
  changes.

Three kinds of text are deliberately exempt and must be copied exactly:
- an item's description (its rules and properties)
- a spell's description and higher-level text
- **boxed read-aloud text** — see below

## Boxed read-aloud text: copy it exactly, and only into `read_aloud`

Adventures set apart the passage a DM reads out when the party arrives
somewhere or triggers a scene. In a printed book it is a tinted or ruled box; in
pasted text it arrives as an indented or quoted block.

Copy that text **verbatim**, and put it in the `read_aloud` field — of the beat
it belongs to, or of the keyed area it describes. A summary is useless here: the
field exists to be read out loud, and paraphrasing it defeats the purpose.

Two hard rules:

1. `read_aloud` is the **only** place transcribed narrative text may go. Never
   copy it into a description, a summary, or any other field. The prose rule
   above still governs everything else on the page.
2. Only text the source actually sets apart is read-aloud. Do not promote
   ordinary description into it because it reads nicely, and do not invent a
   read-aloud passage for a scene that has none — leave the field out.

## A creature the adventure uses is a monster, stat block or not

An adventure chapter is not a bestiary. It names the creatures the party will
meet and then refers you elsewhere for their numbers — "two giant rats attack",
"a grell floats near the ceiling", "three kobolds (see appendix C)". Return each
of those as a **monster** anyway, with whatever the page does say (name, and any
description of how it behaves in this adventure), marked `confidence: "partial"`.
That is exactly what partial means: real information, knowingly incomplete.

Returning nothing because the stat block is elsewhere is the worst outcome — it
silently drops the antagonist of the adventure, which is the single entity the
DM most needs. Do not invent numbers to fill the gap; omit the fields the page
does not state.

**A creature kind and a named individual are different entities.** A named
character is an `npc` even when they are a monster by species; the species is
still its own `monster` entry. A kobold leader with a name is an NPC, *and*
"kobold" is a monster the party fights. Return both.

## Quests are graphs, not summaries

A quest is a story with scenes and branches, and adventures are already written
that way. Return each quest as:

- `title` and `summary`. The summary is **one sentence**, and it is shown to the
  players verbatim — so it must contain **no DM-only information**. Write the job
  as the party understands it when they accept it, not as the DM understands it
  after reading the whole chapter.

  Adventures almost always open by telling the DM what is *really* going on: who
  is behind it, who is not what they seem, what the twist is. None of that
  belongs in the summary. "Clear the mine of the creatures that drove the miners
  out" is right; adding that a ghost is behind it is a spoiler printed on the
  players' own quest log. Put the twist in the `dm_content` of the beat where it
  is discovered.

  Anything longer than a sentence belongs in the quest's `dm_content` or in a
  beat.
- `dm_content` — the quest's own notes for the DM: what belongs to no single
  scene. The premise and what is really going on, the background the party
  brings with them, the DM's goals for the session, its themes, how to run a
  recurring character, a preparation checklist. Paraphrase it in full, like a
  beat's. Leave it out when the source has nothing above the scenes.
- `beats` — the scenes, in the order the source presents them. Each beat has a
  `key` you invent (`b1`, `b2`, …) used only to join the arrays below, a
  `title`, a `kind` (`neutral`, `combat`, `social`, `explore`, `discovery`),
  `dm_content` for the guidance around the scene, and `read_aloud` for its
  boxed text if it has any. Every beat also carries `rumor_text` and
  `reveal_text`, the two lines its players are shown — see "What the players
  are shown of a beat" below. A beat also records **what is in it** — see
  "Wiring a beat to the rest of the page" below.
- `routes` — directed edges between beats, referencing your own keys:
  `{ "from": "b1", "to": "b2", "kind": "choice", "label": "…", "note": "…" }`.
  - `label` is what the party does to take the route, in a few words: "Take
    Naerth's deal", "Sneak in through the sewers". The DM reads it at the table
    as the party's option.
  - `note` is one short line on what it leads to or what it costs: "His son
    goes free; the family loses its boats." Leave it out if the source says
    nothing about it.
  - `kind` is `choice` when taking this route means not taking the routes
    beside it, and `parallel` when the party can do it **as well as** the
    others. The test: if they can do both, it is `parallel`. Rescuing the
    prisoners and looting the palace are both possible, so they are parallel
    routes, not a choice; a hub, a heist or a town with several jobs usually
    has several. A private offer to one character while the party deals with
    something else is parallel too.
  - Include a branch wherever the text offers the party a real choice, even
    when it never draws one: "the characters can either parley or drive them
    out" is two `choice` routes out of that beat. A table or list of approaches
    is one route per approach, each to a beat for its outcome. The choice is
    the routes: never make a beat whose content is the list of options.
- `objectives` — what the party is actually trying to do. Each has a
  `description` and `raised_by`, the `key` of the beat where the party learns of
  it. `raised_by` matters: an objective a later beat raises stays dormant until
  the party gets there, instead of showing up as live from the start.

## What the players are shown of a beat

A beat starts hidden. When the DM rumours it, and later reveals it, the players
are shown one line of text for it and nothing else on the beat. You write both
lines, for **every** beat:

- `rumor_text` — what the party can hear about the scene *before* it happens:
  talk at the bar, a warning from a traveller, a notice on a board. It points
  at the scene without giving away what is in it. "The fishermen say the
  lighthouse has been dark for three nights, and the keeper has not come down
  for his supplies."
- `reveal_text` — what the party knows *once the scene has happened to them*,
  written the way their own journal would record it. "The keeper was dead at
  the top of the stairs, and the lamp had been smashed from the inside."

One or two sentences each. Unlike the fields around them, these two are never
left out: a beat with no reveal line shows the players nothing at all, so the
DM would have to write every one by hand before the quest could be shared.

Both are shown to the players verbatim, so the rule for a quest's `summary`
applies with full force: **no DM-only information**. Nothing the party has not
seen or been told by that point in the story — not who is really behind it, not
what waits in the next scene, not a DC or a stat. A rumour may be vague, and it
may be wrong where the source says the locals have it wrong. The truth belongs
in `dm_content`.

Both obey the prose rule too. They are your own summary of what the source says
happens, never its sentences and never its boxed text: `read_aloud` stays the
only home for transcribed narrative, and it is the one field on a beat the
players never see. Summarising is not inventing — do not add an event, a name
or a detail the source does not have.

## Wiring a beat to the rest of the page

An adventure is one web: the NPC the party questions in the second scene, the
fight in the flooded shaft, the gem they recover at the end. The importer turns
that web into links, so a DM opening a beat finds its people, fights and loot
already attached — but only if you name them. For every beat, record:

- `location_name` — the place the scene happens, matching a `locations` entry.
  When the scene is exploring a keyed place (a mine, a keep, a tomb), name
  **the place itself**, never one of its rooms: the rooms are how the DM runs
  it, and one beat covers them all. Do not make a beat per room.
- `npc_names` — named individuals who appear or matter in the scene.
- `monster_names` — creature kinds the party meets there.
- `encounter_names` — fights that happen in the scene, matching `encounters`,
  but only fights that are not already in one of the keyed rooms (an ambush on
  the road, a brawl in the tavern). A fight in a keyed room belongs to that
  room through the encounter's `location_name`, not to the beat.
- `item_names` — items given or needed in the scene (a reward, a key the
  party must bring). An item found in a keyed room belongs to that room: list
  it in the room's own `item_names` instead.
- `faction_names` — organisations acting in the scene.

Use the **exact same names** you gave the matching entries elsewhere in this
response — these are joined by name, and a name that drifts fails to link. Name
only what the scene actually involves; an empty list is a correct answer, and a
beat stuffed with every NPC in the chapter is as useless as one with none.

If the source genuinely has no scenes — a one-line rumour on a table of hooks —
return the quest with no beats. An empty `beats` is a correct answer. Do not
manufacture a placeholder scene to fill it.

## Keyed areas are rooms of one place

Adventures key the locations of a dungeon, building or district with numbered
or lettered headings — "1. Guardroom", "M4. Processing Room", "Area 12" — often
under a single grouping heading.

Every such run of headings is **the rooms of one place**, not a list of
unrelated locations. Extract them as `locations` and set each one's
`parent_name` to the place that contains them.

That place is a **site**: the thing the adventure maps and the party explores
room by room. Give it the `location_type` that says what it is: `dungeon` for
a mine, cave, tomb, ruin or lair; `building` for a house, keep, temple or
tower; `tavern`, `inn` or `store` when it is one; `wilds` for an outdoor place
explored in parts (a wood, a marsh, a graveyard). Give each keyed area
`location_type` `room`, or `grounds` when it is open to the sky (a courtyard, a
glade). A room can only exist inside one of those six site types. A mine typed
as anything else leaves its rooms with nowhere to go.

The container often has **no heading of its own** — it is named in the prose
above the list, or in the quest that sends the party there. Name it from that
context and return it as its own location, so the rooms have a parent to point
at. A grouping heading that only introduces the list is not itself a place, and
is not a beat either.

## A room's occupants are an encounter

When a location's description names creatures that would fight the party there
— "two giant rats lair here", "three kobolds guard the passage" — return that
room as an **encounter** too, in addition to the `monsters`/`npcs` entries for
the creatures themselves.

An encounter has:

- `name` — reuse the room's own heading ("M3. River Cavern") unless the prose
  gives the fight a better name of its own.
- `description` — optional, one line, whatever makes this fight distinct from
  "the room's occupants attack" (an ambush, a hostage, a trap rigged into the
  room). Leave it out when there is nothing beyond the obvious.
- `location_name` — the exact name of the room this fight happens in, matching
  the `locations` entry you gave it.
- `combatants` — `{ "name": ..., "count": ... }` pairs, one per creature kind or
  named individual in the fight, not one per creature. "Three archers and two
  warriors" is two entries, `count: 3` and `count: 2`, never five. Use the
  **exact same name** you gave the matching `monsters` or `npcs` entry — the
  importer links a combatant to the creature it belongs to by that name, and a
  name that drifts even slightly — a plural the monster entry doesn't have, a
  dropped epithet — fails to link, one per creature kind or named individual in
  the fight, not one per creature.

Only propose an encounter where the room's occupants would actually fight the
party. A shopkeeper, a locked chest with no guard, an empty room the text calls
"quiet" — none of these is a fight, and none becomes an encounter. Do not
invent one just to give every room a matching entry.

## Location types come from a fixed list

`location_type` must be exactly one of: continent, region, country, city, town,
village, district, building, room, dungeon, wilderness, other, world, plane,
store, tavern, inn, grounds, wilds. Pick the closest one. A mountain or a
glacier is `wilderness`, and "underground region" is `region`. Do not invent a
type ("mine", "mine room"): the list is what the rest of the app understands.

## Reading structured text

Pasted text arrives as markdown and its structure is meaningful:

- **Heading depth is nesting.** A deeper heading belongs to the one above it.
- **A heading that only groups other headings is not a scene and not a place** —
  it is a section divider. The things under it are the content.
- **A quoted block (`>`) is set-apart text** — usually the boxed read-aloud
  passage for whatever it sits under.
- **Tables are mechanics.** A dice table is rules content: keep its rows.

When the text has no structure at all, judge from the prose itself. Structure is
a help when present, never a requirement.

## Do not invent

Return only what is actually on the page. If a field is not stated, omit it —
an omitted field is a correct answer and the reviewing user can fill it in. A
plausible-looking invented value is the worst possible output, because it is the
one thing they cannot spot in review.

A beat's `rumor_text` and `reveal_text` are the one exception to omitting: they
restate the scene the page does describe, so there is always something to write.

If you find only a name, return the entity with just its name.

## Marking your own confidence

Set `confidence` to "complete" when you captured the whole entry, and "partial"
when you did not — a stat block cut off by a page break, a creature mentioned in
prose without stats, a photograph too blurred to read in places. "partial" is a
useful, expected answer; it tells the user which entries to check. Do not mark
something "complete" because it looks tidy.

Set `page` to the 1-based page or photo the entity came from, or null if you
cannot tell. Pasted text has no pages: use null.

Give every entity a `ref` that is unique within this response — "m1", "m2",
"npc1", and so on. It is used to track the user's selections.

## Cross-references

Where an entity names another entity in the same document, record the **name**
in the matching field — never an identifier, and never a name for something the
page does not contain:

- an NPC's `faction_name`, and `location_name` — where they are usually found
- an NPC's `kin` — family the page names, each as `{ name, relation }` where
  `relation` is what the NAMED person is to this NPC (parent, child, spouse,
  former_spouse, sibling or relative). For "the Baron's son, Izek", Izek's
  entry is `{ "name": "<the Baron>", "relation": "parent" }`. Only ties the
  page states; use the name exactly as that NPC's own entry spells it
- a location's `parent_name`, and `owner_npc_name` — who runs or owns it (an
  innkeeper's inn, a baron's keep), and `item_names` — items found there (the
  treasure in a keyed room)
- a faction's `location_names` — the places it holds or operates from
- a quest's `giver_npc_name` and `location_name`
- an encounter's `location_name` and the creatures in its `combatants`
- a beat's names, as described under the quests section

Every such name must be spelled exactly as the entry it points at.

Return only the JSON. No commentary, no markdown fences.

## Layouts where one entity spans several pages

An entity is not always confined to one page. Card decks, spreads and reference
sheets routinely split a single creature across a front and a back: the front
carries the art, the name, the type line and the core numbers, and the back
carries saving throws, resistances, senses, challenge, traits and actions.

**Merge them.** That is one creature, and it should come back as one entity with
everything from both pages, marked "complete". Do not return the front and the
back as two entities, and do not mark it "partial" — nothing is missing, it is
just laid out across two sides. Use the name, the art and the running order to
decide which back belongs to which front; in a deck the back almost always
immediately follows its own front.

Reserve "partial" for what it means: information that is genuinely absent or
unreadable.

## Reading a card front

Card fronts print things differently from a prose statblock:

- **Ability scores are usually graphics**, not text — a number in a box, its
  modifier in a small circle beneath, and STR / DEX / CON / INT / WIS / CHA
  labelled underneath. Read the large number as the score. If the score and the
  modifier disagree, trust the score.
- **Not every box is labelled.** A row like "AC. 14 | 38 (6d8 + 12) | 30 ft."
  labels only the armour class; the dice expression is hit points and the
  distance is speed. Assign them by shape, not by hoping for a label.
- **The type line combines three fields.** "Medium fey, neutral" is size
  "Medium", creature type "fey", alignment "neutral". "Large construct,
  unaligned" is size "Large", type "construct", alignment "unaligned". Return
  each in its own field.$prompt$,
       updated_at = now()
 where generator_type = 'document_import';

-- The name matcher learns the two kinds, so the review offers an existing god or canon entry as a match.
CREATE OR REPLACE FUNCTION public.match_import_entity_names(p_user_id uuid, p_campaign_id uuid, p_kind text, p_names text[])
 RETURNS TABLE(query_name text, target_id text, source text, matched_name text, match_kind text, detail text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
  with asked as (
    select distinct n as query_name, private.normalize_entity_name(n) as norm
    from unnest(coalesce(p_names, array[]::text[])) as n
    where private.normalize_entity_name(n) is not null
  ),
  -- `detail` is what tells five goblins apart in the review — CR and type,
  -- occupation, rarity, where an encounter happens — plus "all campaigns" for
  -- a DM's global row and the publisher for a library row, since the library
  -- holds the same creature from several books.
  -- The library side obeys the same gate every other library read does: only
  -- books this campaign has enabled, only its edition. Offering a disabled
  -- source's creature as "already yours" is the licensing mistake #567/#583
  -- fixed, and linking to it would put that content into the campaign. Items
  -- key on `source_document_key` with the always-visible bundled gear and an
  -- edition-neutral null ruleset, exactly as `match_library_items` and
  -- `fetchLibraryItems()` do; monsters and spells key on `source`.
  camp as (
    -- A system with no 5e edition (Generic) has no library to match against.
    select private.game_system_is_5e(c.game_system) as has_library,
           case when private.game_system_is_5e(c.game_system) then private.game_system_edition(c.game_system) end as ruleset,
           coalesce(array_agg(s.source_slug) filter (where s.source_slug is not null), array[]::text[]) as slugs
    from public.campaigns c
    left join public.campaign_enabled_sources s on s.campaign_id = c.id
    where c.id = p_campaign_id
    group by c.game_system
  ),
  pool as (
    select 'npcs'::text as kind, x.id::text as id, x.name, 'campaign'::text as source,
           nullif(concat_ws(' · ', x.race, x.occupation, case when x.campaign_id is null then 'all campaigns' end), '') as detail
      from public.npcs x
      where x.campaign_id = p_campaign_id or (x.campaign_id is null and x.user_id = p_user_id)
    union all
    select 'factions', x.id::text, x.name, 'campaign', nullif(concat_ws(' · ', x.faction_type, case when x.campaign_id is null then 'all campaigns' end), '')
      from public.factions x
      where x.campaign_id = p_campaign_id or (x.campaign_id is null and x.user_id = p_user_id)
    union all
    select 'locations', x.id::text, x.name, 'campaign', nullif(concat_ws(' · ', x.location_type::text, case when x.campaign_id is null then 'all campaigns' end), '')
      from public.locations x
      where x.campaign_id = p_campaign_id or (x.campaign_id is null and x.user_id = p_user_id)
    union all
    select 'encounters', x.id::text, x.name, 'campaign', nullif(concat_ws(' · ', 'at ' || l.name, case when x.campaign_id is null then 'all campaigns' end), '')
      from public.encounters x
      -- Scoped like every other row here: nothing in the schema stops an
      -- encounter's location_id pointing at another account's location, and
      -- this function bypasses RLS, so an unscoped join would hand that
      -- location's name back as `detail`. A mismatched id just drops the "at".
      left join public.locations l
        on l.id = x.location_id
       and (l.campaign_id = p_campaign_id or (l.campaign_id is null and l.user_id = p_user_id))
      where x.campaign_id = p_campaign_id or (x.campaign_id is null and x.user_id = p_user_id)
    union all
    select 'quests', x.id::text, x.title, 'campaign', null
      from public.quests x
      where x.campaign_id = p_campaign_id
    union all
    -- The pantheon and the canon (#1226 story 7): a book that names a god or a truth the campaign already has links to
    -- it rather than creating it twice. Both are campaign rows only; a deity carries its portfolio as the detail, a canon
    -- entry its part.
    select 'deities', x.id::text, x.name, 'campaign', nullif(x.portfolio, '')
      from public.deities x
      where x.campaign_id = p_campaign_id
    union all
    select 'canon', x.id::text, x.title, 'campaign', x.part
      from public.canon_entries x
      where x.campaign_id = p_campaign_id and x.title <> ''
    union all
    select 'monsters', x.id::text, x.name, 'campaign',
           nullif(concat_ws(' · ', 'CR ' || (x.stat_block ->> 'challenge_rating'), x.monster_type, case when x.campaign_id is null then 'all campaigns' end), '')
      from public.monsters x
      where x.campaign_id = p_campaign_id or (x.campaign_id is null and x.user_id = p_user_id)
    union all
    select 'monsters', x.id, x.name, 'library',
           nullif(concat_ws(' · ', 'CR ' || (x.stat_block ->> 'challenge_rating'), x.monster_type, coalesce(x.source_title, x.ruleset)), '')
      from public.library_monsters x, camp
      where camp.has_library and x.source = any(camp.slugs) and x.ruleset = camp.ruleset
    union all
    select 'items', x.id::text, x.name, 'campaign', nullif(concat_ws(' · ', x.rarity, x.item_type, case when x.campaign_id is null then 'all campaigns' end), '')
      from public.items x
      where x.campaign_id = p_campaign_id or (x.campaign_id is null and x.user_id = p_user_id)
    union all
    select 'items', x.id, x.name, 'library', nullif(concat_ws(' · ', x.rarity, x.item_type, coalesce(x.source_title, x.ruleset)), '')
      from public.library_items x, camp
      where x.source_document_key = any(array['grimoire-bundled'] || camp.slugs)
        and camp.has_library and (x.ruleset is null or x.ruleset = camp.ruleset)
    union all
    select 'spells', x.id::text, x.name, 'campaign', nullif(concat_ws(' · ', 'level ' || x.level, x.school, case when x.campaign_id is null then 'all campaigns' end), '')
      from public.spells x
      where x.campaign_id = p_campaign_id or (x.campaign_id is null and x.user_id = p_user_id)
    union all
    select 'spells', x.id, x.name, 'library', nullif(concat_ws(' · ', 'level ' || x.level, x.school, coalesce(x.source_title, x.ruleset)), '')
      from public.library_spells x, camp
      where camp.has_library and x.source = any(camp.slugs) and x.ruleset = camp.ruleset
  ),
  existing as (
    select p.id, p.name, p.source, p.detail, private.normalize_entity_name(p.name) as norm
    from pool p
    where p.kind = p_kind
  ),
  matched as (
    select a.query_name, e.id, e.source, e.name, e.detail, m.match_kind
    from asked a
    join existing e on e.norm is not null
    cross join lateral (
      select private.import_name_verdict(p_kind, a.norm, e.norm, e.source) as match_kind
    ) m
    where m.match_kind is not null
  ),
  candidates as (
    select k.query_name, k.id, k.source, k.name, k.detail, k.match_kind,
           -- Exact, near, contains; own rows before the library within each.
           case k.match_kind when 'exact' then 0 when 'near' then 2 else 4 end
             + case when k.source = 'campaign' then 0 else 1 end as rank
    from (
      select m.*, bool_or(m.match_kind = 'exact') over (partition by m.query_name) as has_exact
      from matched m
    ) k
    where k.match_kind <> 'near' or not k.has_exact
  ),
  -- The DM's own rows are never cut: five goblins of their own must all be on
  -- the list, or the one they meant can be the one hidden. 25 is only a guard
  -- against a pathological vault. The library, which can hold the same name
  -- from many books, is capped at five.
  ranked as (
    select c.*, row_number() over (partition by c.query_name, c.source order by c.rank, c.name, c.id) as n
    from candidates c
  )
  select r.query_name, r.id, r.source, r.name, r.match_kind, r.detail
  from ranked r
  where (r.source = 'campaign' and r.n <= 25) or (r.source = 'library' and r.n <= 5)
  order by r.query_name, r.rank, r.name, r.id;
$function$;
