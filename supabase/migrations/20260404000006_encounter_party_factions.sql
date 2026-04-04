-- Allow per-player faction assignment in encounters
alter table encounters
  add column if not exists party_member_factions jsonb not null default '{}';
