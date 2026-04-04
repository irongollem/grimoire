alter table quests
  add column if not exists reward_art_objects jsonb not null default '[]';
