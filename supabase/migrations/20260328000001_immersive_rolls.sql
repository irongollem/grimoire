alter table campaigns
  add column if not exists immersive_rolls boolean not null default false;
