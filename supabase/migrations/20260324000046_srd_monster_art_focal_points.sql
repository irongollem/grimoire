alter table srd_monster_art
  add column if not exists portrait_focal_point jsonb,
  add column if not exists card_art_focal_point jsonb;
