-- Add companion_ids to encounters so companions can participate in combat
alter table encounters
  add column companion_ids uuid[] not null default '{}';
