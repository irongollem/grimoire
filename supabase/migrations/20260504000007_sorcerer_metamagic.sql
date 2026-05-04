-- Migration: sorcerer_metamagic
-- Adds Sorcery Points resource and metamagic level-up steps to the Sorcerer system class.

update system_classes set
  resources = '[
    {"key":"sorcery_points","label":"Sorcery Points","rest":"long","scaling":"per_level"}
  ]'::jsonb,
  steps = '[
    {
      "level": 3,
      "type": "append",
      "step_type": "text_pick",
      "key": "metamagic_options",
      "label": "Metamagic",
      "description": "Choose 2 Metamagic options. You learn 1 additional option at levels 10 and 17.",
      "options": ["Careful Spell","Distant Spell","Empowered Spell","Extended Spell","Heightened Spell","Quickened Spell","Seeking Spell","Subtle Spell","Transmuted Spell","Twinned Spell"],
      "count": 2
    },
    {
      "level": 10,
      "type": "append",
      "step_type": "text_pick",
      "key": "metamagic_options",
      "label": "Additional Metamagic",
      "description": "Choose 1 additional Metamagic option.",
      "options": ["Careful Spell","Distant Spell","Empowered Spell","Extended Spell","Heightened Spell","Quickened Spell","Seeking Spell","Subtle Spell","Transmuted Spell","Twinned Spell"],
      "count": 1
    },
    {
      "level": 17,
      "type": "append",
      "step_type": "text_pick",
      "key": "metamagic_options",
      "label": "Additional Metamagic",
      "description": "Choose 1 additional Metamagic option.",
      "options": ["Careful Spell","Distant Spell","Empowered Spell","Extended Spell","Heightened Spell","Quickened Spell","Seeking Spell","Subtle Spell","Transmuted Spell","Twinned Spell"],
      "count": 1
    }
  ]'::jsonb
where class_name = 'Sorcerer';

-- Backfill sorcery points for existing Sorcerers that don't have them yet.
do $$
declare
  member_rec record;
  sp_max     int;
begin
  for member_rec in
    select id, level, class_resources
    from party_members
    where class = 'Sorcerer' and level > 0
  loop
    if member_rec.class_resources->'sorcery_points' is null
       or (member_rec.class_resources->'sorcery_points'->>'max')::int = 0 then
      sp_max := least(member_rec.level, 20);
      update party_members
      set class_resources = jsonb_set(
        coalesce(class_resources, '{}'::jsonb),
        '{sorcery_points}',
        jsonb_build_object('max', sp_max, 'current', sp_max, 'rest', 'long')
      )
      where id = member_rec.id;
    end if;
  end loop;
end $$;
