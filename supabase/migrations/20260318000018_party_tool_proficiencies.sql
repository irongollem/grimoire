-- Add tool proficiencies and languages to party members
alter table party_members
  add column if not exists tool_proficiencies text[] not null default '{}',
  add column if not exists languages text[] not null default '{}';
