-- Migration: srd_items_shared_table
-- Shared SRD item table (issue #303) — one row per SRD/bundled item, public read,
-- admin write only. Mirrors the srd_monsters/srd_spells pattern: seeded by the
-- service-role script scripts/seed-srd-items.ts (Open5e v2 weapons/armor/magicitems
-- + the grimoire-bundled gear/provisions/services/ammunition datasets), art carried
-- over from srd_art_defaults (content_type = 'item').
--
-- id is a stable app-facing slug (stableSrdId(source_record_key), e.g.
-- "srd_srd_2024_longsword"); re-run identity is (source_document_key,
-- source_record_key), never id.

create table if not exists public.srd_items (
  id                        text primary key,
  name                      text not null,
  item_type                 text default 'gear' not null,
  subtype                   text,
  rarity                    text default 'mundane' not null,
  requires_attunement       boolean default false not null,
  attunement_requirements   text,
  weight                    numeric,
  cost                      text,
  damage_rolls              jsonb,
  armor_class               text,
  properties                text[] default '{}' not null,
  mastery                   text,
  charges                   integer,
  recharge                  text,
  description               text default '' not null,
  source                    text,
  source_title              text,
  source_url                text,
  tags                      text[] default '{}' not null,
  image_url                 text,
  image_focal_point         jsonb,
  weapon_range              text,
  versatile_damage          text,
  curse_description         text,
  is_arcane_focus           boolean default false not null,
  mundane_description       text,
  mundane_image_url         text,
  mundane_image_focal_point jsonb,
  bundle_items              jsonb,
  -- versioning/provenance (same contract as items, 20260720000018); ruleset is
  -- nullable here: grimoire-bundled mundane gear is edition-neutral and shown
  -- in both 2014 and 2024 campaigns.
  ruleset                   text,
  conceptual_key            text,
  source_document_key       text not null,
  source_record_key         text not null,
  source_revision           text,
  source_license            text,
  provenance                jsonb default '{}' not null,
  created_at                timestamptz default now() not null,
  updated_at                timestamptz default now() not null,
  constraint srd_items_ruleset_check check (ruleset is null or ruleset in ('2014', '2024'))
);

create unique index srd_items_source_identity_unique
  on public.srd_items (source_document_key, source_record_key);
create index srd_items_ruleset_concept_idx
  on public.srd_items (ruleset, conceptual_key);

alter table public.srd_items enable row level security;

-- Public read — no auth required for shared SRD content
create policy "srd_items_select" on public.srd_items
  for select using (true);

-- Admin-only write
create policy "srd_items_insert" on public.srd_items
  for insert with check (private.is_app_admin());

create policy "srd_items_update" on public.srd_items
  for update using (private.is_app_admin());

create policy "srd_items_delete" on public.srd_items
  for delete using (private.is_app_admin());

create trigger srd_items_updated_at
  before update on public.srd_items
  for each row execute procedure update_updated_at();

-- Distinct sources for the campaign "Sources" panel — RPC avoids the ~1000-row
-- PostgREST cap on a plain select. Same shape as get_srd_monster_sources.
create or replace function public.get_srd_item_sources(p_ruleset text default null)
returns table(source text, source_title text, count bigint)
language sql stable security definer set search_path = public
as $$
  select source, source_title, count(*)
  from srd_items
  where source is not null and (p_ruleset is null or ruleset = p_ruleset)
  group by source, source_title
  order by coalesce(source_title, source);
$$;
grant execute on function public.get_srd_item_sources(text) to anon, authenticated;

-- Copies canonical item art (srd_art_defaults, content_type = 'item', keyed by
-- lowercase item name) into srd_items.image_url. Called from the admin panel
-- after "Publish all my SRD art" — mirrors sync_srd_spell_art_to_shared_table.
create or replace function public.sync_srd_item_art_to_shared_table()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  if not private.is_app_admin() then
    raise exception 'Unauthorized';
  end if;

  update srd_items si
  set image_url         = sad.image_url,
      image_focal_point = sad.image_focal_point,
      updated_at        = now()
  from srd_art_defaults sad
  where sad.content_type = 'item'
    and sad.srd_slug     = lower(si.name)
    and sad.image_url    is not null;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

grant execute on function public.sync_srd_item_art_to_shared_table() to authenticated;
