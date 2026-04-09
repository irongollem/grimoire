-- ── Hall of Heroes ────────────────────────────────────────────────────────────
-- Global admin-curated NPC roster, importable into any campaign.
-- Same shape as npcs minus campaign/location FKs; adds a `setting` tag.

create table public.hall_of_heroes (
  id                              uuid primary key default gen_random_uuid(),
  user_id                         uuid not null references auth.users(id) on delete cascade,
  name                            text not null,
  setting                         text not null default 'faerun',
  race                            text,
  alignment                       text,
  age                             text,
  occupation                      text,
  appearance                      text,
  personality                     text,
  backstory                       text,
  notes                           text,
  status                          text not null default 'alive',
  relationship                    text not null default 'neutral',
  portrait_url                    text,
  card_art_url                    text,
  portrait_focal_point            jsonb,
  disguise_name                   text,
  disguise_portrait_url           text,
  disguise_portrait_focal_point   jsonb,
  is_revealed                     boolean not null default false,
  tags                            text[] not null default '{}',
  stat_block                      jsonb,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

create index hall_of_heroes_setting_idx  on public.hall_of_heroes(setting);
create index hall_of_heroes_name_idx     on public.hall_of_heroes(name);

create trigger hall_of_heroes_updated_at
  before update on hall_of_heroes
  for each row execute procedure update_updated_at();

-- RLS: all authenticated users can browse; only admin can write
alter table hall_of_heroes enable row level security;

create policy "hall_of_heroes_select" on hall_of_heroes
  for select using (auth.role() = 'authenticated');

create policy "hall_of_heroes_insert" on hall_of_heroes
  for insert with check ((auth.jwt() ->> 'email') = 'jeffrey@crocode.nl');

create policy "hall_of_heroes_update" on hall_of_heroes
  for update using ((auth.jwt() ->> 'email') = 'jeffrey@crocode.nl');

create policy "hall_of_heroes_delete" on hall_of_heroes
  for delete using ((auth.jwt() ->> 'email') = 'jeffrey@crocode.nl');
