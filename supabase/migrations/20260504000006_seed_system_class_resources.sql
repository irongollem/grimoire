-- Migration: seed_system_class_resources
-- Populates system_classes with spell slot tables, cantrips_known, and missing
-- class resources so the level-up wizard can correctly update party members.

-- ── SPELL SLOT TABLES ────────────────────────────────────────────────────────
-- Each row: [1st,2nd,3rd,4th,5th,6th,7th,8th,9th] slots at that class level.
-- Stored as jsonb so dbSlots() in LevelUpWizard can read them directly.

-- Full casters: Bard, Cleric, Druid, Sorcerer, Wizard
update system_classes set spell_slots = '[
  [2,0,0,0,0,0,0,0,0],[3,0,0,0,0,0,0,0,0],[4,2,0,0,0,0,0,0,0],[4,3,0,0,0,0,0,0,0],
  [4,3,2,0,0,0,0,0,0],[4,3,3,0,0,0,0,0,0],[4,3,3,1,0,0,0,0,0],[4,3,3,2,0,0,0,0,0],
  [4,3,3,3,1,0,0,0,0],[4,3,3,3,2,0,0,0,0],[4,3,3,3,2,1,0,0,0],[4,3,3,3,2,1,0,0,0],
  [4,3,3,3,2,1,1,0,0],[4,3,3,3,2,1,1,0,0],[4,3,3,3,2,1,1,1,0],[4,3,3,3,2,1,1,1,0],
  [4,3,3,3,2,1,1,1,1],[4,3,3,3,3,1,1,1,1],[4,3,3,3,3,2,1,1,1],[4,3,3,3,3,2,2,1,1]
]'::jsonb
where class_name in ('Bard', 'Cleric', 'Druid', 'Sorcerer', 'Wizard');

-- Half casters: Paladin, Ranger (round down — no slots at level 1)
-- Max 5th-level spells, rows padded to 5 elements.
update system_classes set spell_slots = '[
  [0,0,0,0,0],[2,0,0,0,0],[3,0,0,0,0],[3,0,0,0,0],
  [4,2,0,0,0],[4,2,0,0,0],[4,3,0,0,0],[4,3,0,0,0],
  [4,3,2,0,0],[4,3,2,0,0],[4,3,3,0,0],[4,3,3,0,0],
  [4,3,3,1,0],[4,3,3,1,0],[4,3,3,2,0],[4,3,3,2,0],
  [4,3,3,3,1],[4,3,3,3,1],[4,3,3,3,2],[4,3,3,3,2]
]'::jsonb
where class_name in ('Paladin', 'Ranger');

-- Artificer: half caster that rounds UP (2nd-level slots unlock at class level 3, not 5)
update system_classes set spell_slots = '[
  [2,0,0,0,0],[2,0,0,0,0],[3,0,0,0,0],[3,0,0,0,0],
  [4,2,0,0,0],[4,2,0,0,0],[4,3,0,0,0],[4,3,0,0,0],
  [4,3,2,0,0],[4,3,2,0,0],[4,3,3,0,0],[4,3,3,0,0],
  [4,3,3,1,0],[4,3,3,1,0],[4,3,3,2,0],[4,3,3,2,0],
  [4,3,3,3,1],[4,3,3,3,1],[4,3,3,3,2],[4,3,3,3,2]
]'::jsonb
where class_name = 'Artificer';

-- Warlock: pact magic — all slots are the same level (slot level increases with class level).
-- Each row has a single non-zero entry at the current pact slot level.
-- slot_recovery 'short' so RestDialog restores them on a short rest.
update system_classes set
  spell_slots = '[
    [1,0,0,0,0,0,0,0,0],[2,0,0,0,0,0,0,0,0],[0,2,0,0,0,0,0,0,0],[0,2,0,0,0,0,0,0,0],
    [0,0,2,0,0,0,0,0,0],[0,0,2,0,0,0,0,0,0],[0,0,0,2,0,0,0,0,0],[0,0,0,2,0,0,0,0,0],
    [0,0,0,0,2,0,0,0,0],[0,0,0,0,2,0,0,0,0],[0,0,0,0,3,0,0,0,0],[0,0,0,0,3,0,0,0,0],
    [0,0,0,0,3,0,0,0,0],[0,0,0,0,3,0,0,0,0],[0,0,0,0,3,0,0,0,0],[0,0,0,0,3,0,0,0,0],
    [0,0,0,0,4,0,0,0,0],[0,0,0,0,4,0,0,0,0],[0,0,0,0,4,0,0,0,0],[0,0,0,0,4,0,0,0,0]
  ]'::jsonb,
  slot_recovery = 'short'
where class_name = 'Warlock';

-- ── CANTRIPS KNOWN ────────────────────────────────────────────────────────────
-- 20-element arrays (index = class level - 1).

update system_classes set cantrips_known = array[2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4]
where class_name = 'Bard';

update system_classes set cantrips_known = array[3,3,3,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,5]
where class_name = 'Cleric';

update system_classes set cantrips_known = array[2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,5]
where class_name = 'Druid';

update system_classes set cantrips_known = array[4,4,4,5,5,5,5,5,5,6,6,6,6,6,6,6,6,6,6,6]
where class_name = 'Sorcerer';

update system_classes set cantrips_known = array[2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4]
where class_name = 'Warlock';

update system_classes set cantrips_known = array[3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5]
where class_name = 'Wizard';

update system_classes set cantrips_known = array[2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2]
where class_name = 'Artificer';

-- ── CLASS RESOURCES ───────────────────────────────────────────────────────────

-- Bard: Bardic Inspiration (count = CHA modifier; defaulting to 3 as a common starting value).
-- Font of Inspiration (level 5) upgrades recovery to short rest — tracked manually until
-- the resource schema supports per-level rest changes.
update system_classes set resources = '[
  {"key":"bardic_inspiration","label":"Bardic Inspiration","rest":"long","scaling":"fixed","fixed_value":3}
]'::jsonb
where class_name = 'Bard';

-- Fighter: Second Wind (1/short rest always) + Action Surge (0 at level 1, 1 at 2–16, 2 at 17+)
update system_classes set resources = '[
  {"key":"second_wind","label":"Second Wind","rest":"short","scaling":"fixed","fixed_value":1},
  {"key":"action_surge","label":"Action Surge","rest":"short","scaling":"table",
   "table_values":[0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,2,2,2]}
]'::jsonb
where class_name = 'Fighter';

-- Paladin: Lay on Hands pool (5 × level) + Channel Divinity (0 at levels 1-2, 1 from level 3)
update system_classes set resources = '[
  {"key":"lay_on_hands","label":"Lay on Hands HP","rest":"long","scaling":"table",
   "table_values":[5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100]},
  {"key":"channel_divinity","label":"Channel Divinity","rest":"short","scaling":"table",
   "table_values":[0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]}
]'::jsonb
where class_name = 'Paladin';

-- Wizard: Arcane Recovery (1 use per long rest to recover spell slots ≤ half wizard level)
update system_classes set resources = '[
  {"key":"arcane_recovery","label":"Arcane Recovery","rest":"long","scaling":"fixed","fixed_value":1}
]'::jsonb
where class_name = 'Wizard';

-- Artificer: Infusion Slots (active infusions: 0 at level 1, 2 at 2-5, 3 at 6-9, 4 at 10-13, 5 at 14-17, 6 at 18+)
update system_classes set resources = '[
  {"key":"infusion_slots","label":"Infusion Slots","rest":"long","scaling":"table",
   "table_values":[0,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,6,6,6]}
]'::jsonb
where class_name = 'Artificer';

-- ── BACKFILL EXISTING PARTY MEMBERS ──────────────────────────────────────────
-- Apply class_resources for party members that don't yet have them.
-- Only writes keys that are absent or have max = 0; never downgrades existing values.

do $$
declare
  member_rec  record;
  sc_res      jsonb;
  new_res     jsonb;
  res_obj     jsonb;
  res_key     text;
  res_rest    text;
  res_scaling text;
  new_max     int;
  level_idx   int;
begin
  for member_rec in
    select id, class, level, class_resources
    from party_members
    where class is not null and level > 0
  loop
    select resources into sc_res
    from system_classes
    where class_name = member_rec.class;

    if sc_res is null or jsonb_array_length(sc_res) = 0 then
      continue;
    end if;

    new_res   := coalesce(member_rec.class_resources, '{}'::jsonb);
    level_idx := least(member_rec.level, 20) - 1;

    for res_obj in select * from jsonb_array_elements(sc_res) loop
      res_key     := res_obj->>'key';
      res_rest    := res_obj->>'rest';
      res_scaling := res_obj->>'scaling';

      case res_scaling
        when 'fixed'     then new_max := (res_obj->>'fixed_value')::int;
        when 'per_level' then new_max := member_rec.level;
        when 'table'     then new_max := (res_obj->'table_values'->>level_idx)::int;
        else new_max := 0;
      end case;

      if new_max > 0 and (
        new_res->res_key is null or
        (new_res->res_key->>'max')::int = 0
      ) then
        new_res := jsonb_set(
          new_res,
          array[res_key],
          jsonb_build_object('max', new_max, 'current', new_max, 'rest', res_rest)
        );
      end if;
    end loop;

    update party_members set class_resources = new_res where id = member_rec.id;
  end loop;
end $$;
