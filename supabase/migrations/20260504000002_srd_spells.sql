-- Migration: srd_spells
-- Shared SRD spell table — one row per SRD spell, public read, admin write only.
-- Art (image_url + image_focal_point) is stored inline, seeded from srd_art_defaults canonical rows.

create table if not exists public.srd_spells (
  id                   text primary key,   -- stable slug e.g. "srd_fireball"
  name                 text not null,
  level                integer not null,   -- 0 = cantrip, 1–9
  school               text not null,
  casting_time         text not null,
  casting_time_custom  text,
  range                text not null,
  range_custom         text,
  components           text[] default '{}' not null,
  material             text,
  duration             text not null,
  duration_custom      text,
  concentration        boolean default false not null,
  ritual               boolean default false not null,
  attack_type          text,
  save_attribute       text,
  save_effect          text,
  damage_rolls         jsonb,
  healing_dice         text,
  target_description   text,
  aoe_shape            text,
  aoe_size             text,
  condition_inflicted  text,
  description          text not null default '',
  higher_levels        text,
  higher_level_damage  jsonb,
  higher_level_healing text,
  classes              text[] default '{}' not null,
  tags                 text[] default '{}' not null,
  source               text,
  source_title         text,
  source_url           text,
  open5e_import        boolean default false not null,
  image_url            text,
  image_focal_point    jsonb,
  created_at           timestamptz default now() not null,
  updated_at           timestamptz default now() not null
);

alter table public.srd_spells enable row level security;

-- Public read — no auth required for shared SRD content
create policy "srd_spells_select" on public.srd_spells
  for select using (true);

-- Admin-only write
create policy "srd_spells_insert" on public.srd_spells
  for insert with check (public.is_app_admin());

create policy "srd_spells_update" on public.srd_spells
  for update using (public.is_app_admin());

create policy "srd_spells_delete" on public.srd_spells
  for delete using (public.is_app_admin());

create trigger srd_spells_updated_at
  before update on public.srd_spells
  for each row execute procedure update_updated_at();

-- Copies canonical srd_art_defaults spell rows into srd_spells.image_url.
-- Called from the admin panel after "Publish all my SRD art".
create or replace function public.sync_srd_spell_art_to_shared_table()
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

  update srd_spells ss
  set image_url         = sad.image_url,
      image_focal_point = sad.image_focal_point,
      updated_at        = now()
  from srd_art_defaults sad
  where sad.content_type = 'spell'
    and sad.srd_slug     = lower(ss.name)
    and sad.image_url    is not null;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

grant execute on function public.sync_srd_spell_art_to_shared_table() to authenticated;
