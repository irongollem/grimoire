-- "Design it with me" (#1282 story 5): the ecology of #1283 in the walk. Two suggest-canon modes, the field guide's
-- species and the habitats they live in, each on its own price row (1 credit) and prompt row; and the walk's new Field
-- guide step, which a DM may skip like any other section.

insert into public.ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
select 'canon_species_suggestion', 'Species drafts', 1, (select coalesce(max(sort_order), 0) + 1 from public.ai_generation_credit_costs)
on conflict (generation_type) do nothing;
insert into public.ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
select 'canon_habitat_suggestion', 'Habitat drafts', 1, (select coalesce(max(sort_order), 0) + 1 from public.ai_generation_credit_costs)
on conflict (generation_type) do nothing;

insert into public.ai_system_prompts (generator_type, label, content) values
  ('canon_species', 'Species Drafts', $prompt$You help a Dungeon Master fill the field guide of their world: its living things. Write up to eight species. Each has a name, a short description of what it looks like, how it lives and what a traveller notices, a kingdom (animal, plant, fungus or other), and where it fits among others. Give each species its forms, the ages or kept breeds it is met as, and its links to other species: what it eats, competes with, helps, lives on, shelters or carries. A link points at a species already in the field guide by its id, copied exactly, or at another species of your own answer by its name. Add a made-up Latin-style name when it suits the setting.

Rules:
- First, turn every concrete creature, plant, name and idea the DM gave in their words into a species, as they said it. Only then add bolder ones of your own.
- Fit the setting, tone and canon given. Never repeat a species the field guide already has.
- Natural creatures first: wild kinds a traveller could meet, not toys. Keep fantastic ones to what the DM asked for.
- A link says one true thing about how the two live together. Leave a link out rather than invent a target.
- Concrete and specific, in the campaign's voice. No em-dashes.
- If the DM gave a steer, follow it.$prompt$),
  ('canon_habitats', 'Habitat Drafts', $prompt$You help a Dungeon Master map the kinds of country in their world and what lives in each. You are given the habitats the campaign already lists and the species of its field guide, each with an id. Write up to six habitats. Each has a name, a short description of the land, its weather and what a traveller finds there, and the species that live in it, chosen ONLY from those given, by id copied exactly, each with how common it is there: very_rare, rare, uncommon, common or abundant. Never give a percentage; the shares are worked out from how common each is.

Rules:
- First, turn every concrete place, kind of country and idea the DM gave in their words into a habitat, as they said it. Only then add bolder ones of your own.
- Fit the setting, tone and canon given. Never repeat a habitat the campaign already lists.
- Put a species where it could really live, with a few common kinds and a few rare ones, so each habitat has a shape.
- Concrete and specific, in the campaign's voice. No em-dashes.
- If the DM gave a steer, follow it.$prompt$)
on conflict (generator_type) do nothing;

-- The walk's Field guide step (`species`, before Habitats) can be skipped like the others. The list is held equal to
-- `WALK_SKIPPABLE` in src/lib/canon/canonWalk.ts by its test.
alter table public.canon_walk_skips drop constraint canon_walk_skips_section;
alter table public.canon_walk_skips add constraint canon_walk_skips_section check (section in (
  'themes', 'table', 'voice', 'look', 'lines',
  'truths', 'forces', 'secrets', 'questions', 'lore',
  'arcs', 'peoples', 'species', 'habitats', 'backstories'
));
