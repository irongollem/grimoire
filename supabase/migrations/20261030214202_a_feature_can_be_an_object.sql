-- A dungeon feature can be a physical object the party attacks, forces or picks.
--
-- Until now a feature only said how it is *found* (perception, investigation and
-- arcana DCs): every type was a concealment (secret door, hidden cache, moving
-- wall). A DM who generated a cart, a door or a lock got a feature with nowhere
-- to put the numbers they reach for at the table: its AC, its hit points, the
-- Strength DC to force it and the DC to pick its lock.
--
-- These come from the Dungeon Master's Guide object rules, the same in both
-- editions: AC by material, hit points by size (fragile or resilient), an
-- optional damage threshold, and immunity to poison and psychic damage (a rule,
-- not a column: every object has it). `src/rules/objects.ts` holds the table.
--
-- Material and size are stored beside AC and HP rather than derived from them,
-- so the sheet can say "Iron, Medium" and the DM can still set a sturdier door's
-- numbers by hand. Every column is nullable: a hidden passage is not an object.
--
-- `feature_type` has no check constraint, so the three new types (Door, Lock,
-- Object) need no schema change; the client's DUNGEON_FEATURE_TYPES lists them.
--
-- The library table mirrors the owned one column for column (#1060), so a
-- library feature can carry stats and Customize copies them.

alter table public.dungeon_features
  add column object_material  text,
  add column object_size      text,
  add column object_ac        smallint,
  add column object_hp        integer,
  add column damage_threshold smallint,
  add column break_dc         smallint,
  add column lock_dc          smallint,
  add constraint dungeon_features_object_material_check check (object_material is null or object_material = any (array[
    'cloth', 'crystal', 'wood', 'stone', 'iron', 'mithral', 'adamantine'])),
  add constraint dungeon_features_object_size_check check (object_size is null or object_size = any (array[
    'tiny', 'small', 'medium', 'large'])),
  add constraint dungeon_features_object_ac_check check (object_ac is null or object_ac between 1 and 30),
  add constraint dungeon_features_object_hp_check check (object_hp is null or object_hp between 1 and 9999),
  add constraint dungeon_features_damage_threshold_check check (damage_threshold is null or damage_threshold between 1 and 50),
  add constraint dungeon_features_break_dc_check check (break_dc is null or break_dc between 1 and 30),
  add constraint dungeon_features_lock_dc_check check (lock_dc is null or lock_dc between 1 and 30);

alter table public.library_dungeon_features
  add column object_material  text,
  add column object_size      text,
  add column object_ac        smallint,
  add column object_hp        integer,
  add column damage_threshold smallint,
  add column break_dc         smallint,
  add column lock_dc          smallint,
  add constraint library_dungeon_features_object_material_check check (object_material is null or object_material = any (array[
    'cloth', 'crystal', 'wood', 'stone', 'iron', 'mithral', 'adamantine'])),
  add constraint library_dungeon_features_object_size_check check (object_size is null or object_size = any (array[
    'tiny', 'small', 'medium', 'large'])),
  add constraint library_dungeon_features_object_ac_check check (object_ac is null or object_ac between 1 and 30),
  add constraint library_dungeon_features_object_hp_check check (object_hp is null or object_hp between 1 and 9999),
  add constraint library_dungeon_features_damage_threshold_check check (damage_threshold is null or damage_threshold between 1 and 50),
  add constraint library_dungeon_features_break_dc_check check (break_dc is null or break_dc between 1 and 30),
  add constraint library_dungeon_features_lock_dc_check check (lock_dc is null or lock_dc between 1 and 30);

comment on column public.dungeon_features.object_material is
  'DMG object material, which sets AC: cloth (also paper, rope) 11, crystal (glass, ice) 13, wood (bone) 15, stone 17, iron (steel) 19, mithral 21, adamantine 23. Null = not a breakable object.';
comment on column public.dungeon_features.object_size is
  'DMG object size, which sets hit points: tiny, small, medium or large. Anything bigger is several sections.';
comment on column public.dungeon_features.break_dc is
  'Strength check DC to force it open or break it. Null = cannot be forced.';
comment on column public.dungeon_features.lock_dc is
  'DC to pick its lock with thieves'' tools. Null = no lock.';

-- The generator is taught the new types and fields. replace() touches each
-- line only while it still reads as seeded (20261003235538), so an admin's own
-- edit of the prompt is kept.
update public.ai_system_prompts
   set content = replace(replace(replace(replace(content,
     $o$Design one hidden or concealed dungeon feature (a secret door, hidden passage, concealed cache, moving wall and the like) from the concept the user gives you$o$,
     $n$Design one dungeon feature from the concept the user gives you: either something hidden or concealed (a secret door, hidden passage, concealed cache, moving wall and the like), or an ordinary physical thing the party may open, pick, force or smash (a door, a lock, a cart, a statue, a portcullis)$n$),
     $o$"feature_type": "One of: Secret Door, Hidden Passage, Treasure Chest, Hidden Cache, Concealed Alcove, Moving Wall, Other",$o$,
     $n$"feature_type": "One of: Secret Door, Hidden Passage, Treasure Chest, Hidden Cache, Concealed Alcove, Moving Wall, Door, Lock, Object, Other",$n$),
     $o$  "contents_description":$o$,
     $n$  "object_material": "For a physical thing that can be attacked or broken, one of: cloth, crystal, wood, stone, iron, mithral, adamantine (cloth also covers paper and rope, crystal covers glass and ice, wood covers bone, iron covers steel). null when it is not a breakable object",
  "object_size": "One of: tiny, small, medium, large (null when object_material is null)",
  "object_ac": 15,
  "object_hp": 18,
  "damage_threshold": null,
  "break_dc": 15,
  "lock_dc": null,
  "contents_description":$n$),
     $o$- Respect any constraints given (feature type, trigger).$o$,
     $n$- Fill the object fields whenever the feature is a physical thing the party could attack, force or break: a door, a lock, a chest, a cart, a statue, a portcullis. Use the Dungeon Master's Guide object rules. object_ac follows the material: cloth 11, crystal 13, wood 15, stone 17, iron 19, mithral 21, adamantine 23. object_hp follows the size, fragile or resilient: tiny 2 or 5, small 3 or 10, medium 4 or 18, large 5 or 27. Something bigger than Large is made of several Large sections: give one section's numbers and say so in notes. Leave every object field null when the feature is not a breakable thing (a hidden passage, an alcove, a spoken keyword).
- damage_threshold is null unless the object is unusually sturdy (a vault door, a castle gate, a ship's hull), then 5 to 20.
- break_dc is the DC of the Strength check to force it open or break it, 10 to 30, or null when it cannot be forced. lock_dc is the DC to pick its lock with thieves' tools, 10 to 25, or null when it has no lock.
- Respect any constraints given (feature type, trigger).$n$)
 where generator_type = 'feature';
