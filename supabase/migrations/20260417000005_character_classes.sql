-- Migration: character_classes
-- Introduces a `character_classes` join table so a party member can hold levels
-- in more than one class (5e multiclassing). Each row represents N levels taken
-- in a given class for that character. `is_primary` flags the first class
-- (the one picked at creation); multiclass RAW limits a character to one
-- primary class.

create table if not exists character_classes (
  id              uuid primary key default gen_random_uuid(),
  party_member_id uuid not null references party_members(id) on delete cascade,
  class_name      text not null,
  subclass_name   text,
  levels          int  not null check (levels between 1 and 20),
  is_primary      boolean not null default false,
  hit_dice_used   int  not null default 0,
  sort_order      int  not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Exactly one primary class per member. Nullable + partial unique index means
-- rows without is_primary coexist freely.
create unique index if not exists character_classes_one_primary_per_member
  on character_classes (party_member_id)
  where is_primary;

create index if not exists character_classes_member_idx
  on character_classes (party_member_id);

create trigger character_classes_updated_at
  before update on character_classes
  for each row execute procedure update_updated_at();

alter table character_classes enable row level security;

-- Owner-through-party-member RLS: you can read/write class rows for party
-- members you own. Matches the party_members RLS shape.
create policy "character_classes_select" on character_classes
  for select using (
    exists (
      select 1 from party_members pm
      where pm.id = character_classes.party_member_id
        and pm.user_id = auth.uid()
    )
  );

create policy "character_classes_insert" on character_classes
  for insert with check (
    exists (
      select 1 from party_members pm
      where pm.id = character_classes.party_member_id
        and pm.user_id = auth.uid()
    )
  );

create policy "character_classes_update" on character_classes
  for update using (
    exists (
      select 1 from party_members pm
      where pm.id = character_classes.party_member_id
        and pm.user_id = auth.uid()
    )
  );

create policy "character_classes_delete" on character_classes
  for delete using (
    exists (
      select 1 from party_members pm
      where pm.id = character_classes.party_member_id
        and pm.user_id = auth.uid()
    )
  );

-- View used by clients to read aggregate class info without joining manually.
-- total_level falls back to 1 so characters without any character_classes rows
-- still return something sensible (legacy / pre-backfill defensive fallback).
create or replace view party_member_levels as
select
  pm.id as party_member_id,
  coalesce(sum(cc.levels), pm.level) as total_level,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',         cc.id,
        'class',      cc.class_name,
        'subclass',   cc.subclass_name,
        'levels',     cc.levels,
        'is_primary', cc.is_primary,
        'sort_order', cc.sort_order
      ) order by cc.sort_order
    ) filter (where cc.id is not null),
    '[]'::jsonb
  ) as classes
from party_members pm
left join character_classes cc on cc.party_member_id = pm.id
group by pm.id, pm.level;
