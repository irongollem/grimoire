alter table items
  add column if not exists weapon_range text,
  add column if not exists versatile_damage text;
