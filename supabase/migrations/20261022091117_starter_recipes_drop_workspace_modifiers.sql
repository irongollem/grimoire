-- #1081: the starter recipes carried the discipline's workspace bonus as a
-- recipe modifier ("Full forge available" +3 on smithing, and so on). The craft
-- attempt dialog already offers that bonus as its own checkbox, so a player
-- could tick both and take it twice. `src/data/starterRecipes.ts` no longer has
-- them, and `starterRecipes.test.ts` fails if one comes back.
--
-- This removes the copies already imported into campaigns. A row goes only when
-- its (discipline, text, bonus) is exactly one of the 18 starter duplicates, so
-- a DM who reworded a modifier or changed its bonus keeps it. Production dry run
-- on 22 Oct 2026: 353 rows on 353 recipes, 3 campaigns, 2 owners, out of 377
-- modifier rows in total. Nine more rows mention a workspace noun and stay: they
-- are DM-written and mostly genuine ("Acids available", a notebook on the bench).

delete from public.crafting_recipe_modifiers m
using public.crafting_recipes r
where r.id = m.recipe_id
  and (r.discipline, m.description, m.bonus) in (values
    ('alchemy',       'Proper alchemical laboratory available',          2),
    ('alchemy',       'Proper alchemist''s lab available',               2),
    ('brewing',       'Brewing facility or equipped tavern available',   2),
    ('forgery',       'Private workroom with good light available',      2),
    ('herbalism',     'Herb garden or drying room available',            2),
    ('jewelcrafting', 'Jeweler''s workshop available',                   2),
    ('jewelcrafting', 'Proper jeweler''s bench with fine tools',         2),
    ('leathercraft',  'Equipped leatherworking workshop available',      2),
    ('masonry',       'Quarry or stoneyard available',                   3),
    ('painting',      'Proper studio or scriptorium available',          2),
    ('poisoncraft',   'Equipped poisoner''s laboratory available',       2),
    ('scribing',      'Scriptorium or proper writing desk available',    2),
    ('smithing',      'Full forge available',                            3),
    ('smithing',      'Full forge with bellows available',               3),
    ('tinkering',     'Full forge available',                            2),
    ('tinkering',     'Fully equipped workshop available',               2),
    ('weaving',       'Equipped loom or tailoring room available',       2),
    ('woodcraft',     'Woodworking workshop available',                  2)
  );
