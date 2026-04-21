-- Remove card_art_url and card_art_focal_point from monsters, srd_monster_art, and npcs (never used, always null)

alter table monsters
  drop column if exists card_art_url,
  drop column if exists card_art_focal_point;

alter table srd_monster_art
  drop column if exists card_art_url,
  drop column if exists card_art_focal_point;

alter table npcs drop column if exists card_art_url;
