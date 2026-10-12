-- A subrace carries its own size, speed and languages, and every species has a
-- walking speed: its own, or one on each of its subraces.
--
-- Tome of Heroes' darakhul and gearforged say "Your size is determined by your
-- Heritage Subrace / Race Chassis", and each heritage and chassis has its own
-- Size, Speed and Languages lines. Open5e's conversion dropped those lines, and
-- `SpeciesSubrace` had nowhere to keep them, so both species sat in the library
-- with no size and no speed, and a character built from one walked the
-- builder's fallback 30 ft whatever they had been in life. The subrace jsonb now
-- holds `size` (replaces the parent's), `speed` (replaces it mode by mode) and
-- `languages` (added to the parent's); `src/rules/speciesStats.ts` reads them.
-- The values are the book's, kept in `src/data/open5eSpeciesGaps.ts` with their
-- source, and below as the import (`buildSubrace`) produces them.
--
-- Tome of Heroes' shade arrived from Open5e v2 as an empty record. Its text is
-- in Open5e's v1 API, converted here the way the import converts any trait. Its
-- size and speed are the one deduction: the book defers both to the race the
-- shade was in life, so it takes Medium and 30 ft and keeps the deferring
-- traits for the DM.

-- ── Library data ─────────────────────────────────────────────────────────────

-- Each subrace's own size, speed and languages, merged into the stored
-- subrace of that name (anything else on it, art or a DM's edit, is kept).
with patch(document_key, record_key, subrace_name, stats) as (values
    ('toh', 'toh_mushroomfolk', 'Acid Cap', '{"size": "medium"}'::jsonb),
    ('toh', 'toh_mushroomfolk', 'Favored', '{"size": "medium"}'::jsonb),
    ('toh', 'toh_mushroomfolk', 'Morel', '{"size": "small", "speed": {"walk": 35}}'::jsonb),
    ('toh', 'toh_minotaur', 'Bhain Kwai', '{"speed": {"swim": 25}}'::jsonb),
    ('toh', 'toh_darakhul', 'Derro Heritage', '{"size": "small", "speed": {"walk": 30}, "languages": ["Dwarvish"]}'::jsonb),
    ('toh', 'toh_darakhul', 'Dragonborn Heritage', '{"size": "medium", "speed": {"walk": 25}, "languages": ["Draconic"]}'::jsonb),
    ('toh', 'toh_darakhul', 'Drow Heritage', '{"size": "medium", "speed": {"walk": 30}, "languages": ["Elvish"]}'::jsonb),
    ('toh', 'toh_darakhul', 'Dwarf Heritage', '{"size": "medium", "speed": {"walk": 25}, "languages": ["Dwarvish"]}'::jsonb),
    ('toh', 'toh_darakhul', 'Elf/Shadow Fey Heritage', '{"size": "medium", "speed": {"walk": 30}}'::jsonb),
    ('toh', 'toh_darakhul', 'Gnome Heritage', '{"size": "small", "speed": {"walk": 25}, "languages": ["Gnomish"]}'::jsonb),
    ('toh', 'toh_darakhul', 'Halfling Heritage', '{"size": "small", "speed": {"walk": 25}, "languages": ["Halfling"]}'::jsonb),
    ('toh', 'toh_darakhul', 'Human/Half-Elf Heritage', '{"size": "medium", "speed": {"walk": 30}}'::jsonb),
    ('toh', 'toh_darakhul', 'Kobold Heritage', '{"size": "small", "speed": {"walk": 30}, "languages": ["Draconic"]}'::jsonb),
    ('toh', 'toh_darakhul', 'Ravenfolk', '{"size": "medium", "speed": {"walk": 30}, "languages": ["Huginn''s Speech"]}'::jsonb),
    ('toh', 'toh_darakhul', 'Tiefling Heritage', '{"size": "medium", "speed": {"walk": 30}, "languages": ["Infernal"]}'::jsonb),
    ('toh', 'toh_darakhul', 'Trollkin Heritage', '{"size": "medium", "speed": {"walk": 30}, "languages": ["Trollkin"]}'::jsonb),
    ('toh', 'toh_gearforged', 'Dwarf Chassis', '{"size": "medium", "speed": {"walk": 25}, "languages": ["Dwarvish"]}'::jsonb),
    ('toh', 'toh_gearforged', 'Gnome Chassis', '{"size": "small", "speed": {"walk": 25}, "languages": ["Gnomish"]}'::jsonb),
    ('toh', 'toh_gearforged', 'Human Chassis', '{"size": "medium", "speed": {"walk": 30}}'::jsonb),
    ('toh', 'toh_gearforged', 'Kobold Chassis', '{"size": "small", "speed": {"walk": 30}, "languages": ["Draconic"]}'::jsonb),
    ('toh', 'toh_catfolk', 'Malkin', '{"size": "small"}'::jsonb)
)
update public.library_species s
set subraces = (
  select jsonb_agg(
    case when p.stats is null then e else e || p.stats end
    order by o)
  from jsonb_array_elements(s.subraces) with ordinality as x(e, o)
  left join patch p
    on p.document_key = s.source_document_key
   and p.record_key = s.source_record_key
   and p.subrace_name = e->>'name'
)
where jsonb_typeof(s.subraces) = 'array'
  and exists (
    select 1 from patch p
    where p.document_key = s.source_document_key and p.record_key = s.source_record_key
  );

update public.library_species
set
  size = 'medium',
  speed = '{"walk": 30}'::jsonb,
  languages = array['Common']::text[],
  ability_score_increases = jsonb_build_object('description',
    '+1 Charisma, +1 to one other ability score of your choice, and +1 to an ability score your Living Origin or one of its subraces increases.'),
  traits = $shade$[{"name": "Age", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Shades appear as the age they were when they died. They potentially have no limit to their lifespan, but, realistically, ancient shades grow weary and lose their hold on their memories, fading away near 750 years old.\"}]}]}"}, {"name": "Alignment", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Shades come from all walks of life but tend toward neutrality. Shades that lack contact with other people grow more selfish over time and slip toward evil.\"}]}]}"}, {"name": "Size", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Your size is determined by your Living Origin.\"}]}]}"}, {"name": "Speed", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Your speed is determined by your Living Origin.\"}]}]}"}, {"name": "Darkvision", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Your existence beyond death makes you at home in the dark. You can see in dim light within 60 feet of you as if it were bright light and in darkness as if it were dim light. You can't discern color in darkness, only shades of gray.\"}]}]}"}, {"name": "Ghostly Flesh", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Starting at 3rd level, you can use your action to dissolve your physical body into the ephemeral stuff of spirits. You become translucent and devoid of color, and the air around you grows cold. Your transformation lasts for 1 minute or until you end it as a bonus action. During it, you have a flying speed of 30 feet with the ability to hover, and you have resistance to bludgeoning, piercing, and slashing damage from nonmagical attacks that aren't made with silvered weapons. In addition, you have advantage on ability checks and saving throws made to escape a grapple or against being restrained, and you can move through creatures and solid objects as if they were difficult terrain. If you end your turn inside an object, you take 1d10 force damage. Once you use this trait, you can't use it again until you finish a long rest.\"}]}]}"}, {"name": "Imperfect Undeath", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"You are a humanoid, but your partial transition into undeath makes you susceptible to effects that target undead. Though you can regain hit points from spells like cure wounds, you can also be affected by game effects that specifically target undead, such as a cleric's Turn Undead feature. Game effects that raise a creature from the dead work on you as normal, but they return you to life as a shade. A true resurrection or wish spell can restore you to life as a fully living member of your original race.\"}]}]}"}, {"name": "Life Drain", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"When you damage a creature with an attack or a spell, you can choose to deal extra necrotic damage to the target equal to your level. If the creature's race matches your Living Origin, you gain temporary hit points equal to the necrotic damage dealt. Once you use this trait, you can't use it again until you finish a short or long rest.\"}]}]}"}, {"name": "Spectral Resilience", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"You have advantage on saving throws against poison and disease, and you have resistance to necrotic damage.\"}]}]}"}, {"name": "Living Origin", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"As living echoes of who they once were, shades maintain some of the traits they bore in life. Choose another race as your Living Origin. This is the race you were in life. Your size and speed are those of your Living Origin, and you know one language spoken by your Living Origin.\"}]}]}"}, {"name": "Languages", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"You can speak, read, and write Common and one other language spoken by your Living Origin.\"}]}]}"}]$shade$::jsonb
where source_document_key = 'toh'
  and source_record_key = 'toh_shade'
  and coalesce(jsonb_array_length(traits), 0) = 0;

-- ── Custom species start at 30 ft ────────────────────────────────────────────
-- The maintainer's rule: a custom species is never without a walking speed; it
-- starts at 30 ft and the DM adjusts it. On 12 Oct 2026 every one of the 23
-- custom species in production already had one; the backfill is for any stack
-- that does not.

alter table public.species alter column speed set default '{"walk": 30}'::jsonb;

update public.species
set speed = coalesce(speed, '{}'::jsonb) || '{"walk": 30}'::jsonb
where not coalesce(
  jsonb_typeof(speed -> 'walk') = 'number'
  or (jsonb_typeof(subraces) = 'array'
      and jsonb_path_exists(subraces, '$[0]')
      and not jsonb_path_exists(subraces, '$[*] ? (!exists(@.speed.walk ? (@.type() == "number")))')),
  false);

-- The same net under the library, so the constraint below cannot fail on a row
-- the patch above did not reach: a subrace stored under a name the patch does
-- not spell the same way, or a shade that already had traits (its update is
-- guarded on an empty record) and so kept a null speed. On 12 Oct 2026 every
-- production row was covered by the patch and this updated none; it is here so
-- that a red migration cannot strand everything queued behind it. 30 ft is the
-- builder's own default and the shade's deduced speed.
update public.library_species
set speed = coalesce(speed, '{}'::jsonb) || '{"walk": 30}'::jsonb
where not coalesce(
  jsonb_typeof(speed -> 'walk') = 'number'
  or (jsonb_typeof(subraces) = 'array'
      and jsonb_path_exists(subraces, '$[0]')
      and not jsonb_path_exists(subraces, '$[*] ? (!exists(@.speed.walk ? (@.type() == "number")))')),
  false);

-- ── The rule, in the database ────────────────────────────────────────────────
-- Total on purpose: a CHECK passes on NULL, so a predicate that answered NULL
-- for a species with `speed` null and no subraces would let exactly the row it
-- exists to refuse straight through. Hence the coalesce around the whole.

alter table public.species add constraint species_walk_speed_present check (coalesce(
  jsonb_typeof(speed -> 'walk') = 'number'
  or (jsonb_typeof(subraces) = 'array'
      and jsonb_path_exists(subraces, '$[0]')
      and not jsonb_path_exists(subraces, '$[*] ? (!exists(@.speed.walk ? (@.type() == "number")))')),
  false));

alter table public.library_species add constraint library_species_walk_speed_present check (coalesce(
  jsonb_typeof(speed -> 'walk') = 'number'
  or (jsonb_typeof(subraces) = 'array'
      and jsonb_path_exists(subraces, '$[0]')
      and not jsonb_path_exists(subraces, '$[*] ? (!exists(@.speed.walk ? (@.type() == "number")))')),
  false));

-- ── The species generator learns subrace stats ───────────────────────────────
-- `replace` on the shipped text: a prompt an admin has since rewritten keeps
-- their wording (the sanitizer, `src/lib/codex/speciesAi.ts`, still supplies a
-- walking speed when the model leaves one out).

update public.ai_system_prompts
set content = replace(replace(replace(content,
  '"ability_score_increases": { "wis": 1 } } ],',
  '"ability_score_increases": { "wis": 1 }, "size": null, "speed": null, "languages": [] } ],'),
  'Walk speed is usually 25 or 30.',
  'Every species has a walk speed, usually 25 or 30.'),
  '- subraces is an array of 0 to 3 subraces, each with its own name, description, traits and optionally ability_score_increases. Use subraces only when the concept has distinct lineages, otherwise return null.',
  '- subraces is an array of 0 to 3 subraces, each with its own name, description, traits and optionally ability_score_increases. Use subraces only when the concept has distinct lineages, otherwise return null. A subrace may also set size (replacing the species'' size), speed (replacing the species'' speeds key by key, for example a faster lineage) and languages (known on top of the species'' languages); leave them null or empty when the lineage keeps the species'' own.')
where generator_type = 'species';
