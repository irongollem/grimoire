-- Migration: srd_monsters
-- Shared SRD monster table — one row per SRD monster, public read, admin write only.
-- Art (image_url + portrait_focal_point) is stored inline, seeded from srd_monster_art canonical rows.

create table if not exists public.srd_monsters (
  id                   text primary key,   -- stable slug e.g. "srd_aboleth"
  name                 text not null,
  monster_type         text not null,
  size                 text,
  alignment            text,
  habitat              text,
  source               text default 'SRD 5.1' not null,
  source_title         text,
  source_url           text,
  is_srd               boolean default true not null,
  open5e_import        boolean default false not null,
  tags                 text[] default '{}' not null,
  stat_block           jsonb,
  notes                jsonb,
  image_url            text,
  portrait_focal_point jsonb,
  created_at           timestamptz default now() not null,
  updated_at           timestamptz default now() not null
);

alter table public.srd_monsters enable row level security;

-- Public read — no auth required for shared SRD content
create policy "srd_monsters_select" on public.srd_monsters
  for select using (true);

-- Admin-only write
create policy "srd_monsters_insert" on public.srd_monsters
  for insert with check (public.is_app_admin());

create policy "srd_monsters_update" on public.srd_monsters
  for update using (public.is_app_admin());

create policy "srd_monsters_delete" on public.srd_monsters
  for delete using (public.is_app_admin());

create trigger srd_monsters_updated_at
  before update on public.srd_monsters
  for each row execute procedure update_updated_at();

-- Copies canonical srd_monster_art rows into srd_monsters.image_url.
-- Called from the admin panel after "Publish all my SRD art".
create or replace function public.sync_srd_monster_art_to_shared_table()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  if not is_app_admin() then
    raise exception 'Unauthorized';
  end if;

  update srd_monsters sm
  set image_url            = sma.image_url,
      portrait_focal_point = sma.portrait_focal_point,
      updated_at           = now()
  from srd_monster_art sma
  where sma.srd_id     = sm.id
    and sma.is_canonical = true
    and sma.image_url   is not null;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

grant execute on function public.sync_srd_monster_art_to_shared_table() to authenticated;
