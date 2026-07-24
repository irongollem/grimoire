-- Migration: srd_species_shared_table
-- Shared SRD species table (issue #303) — one row per SRD species, public read,
-- admin write only. Mirrors srd_monsters/srd_spells; seeded by the service-role
-- script scripts/seed-srd-species.ts from Open5e v2 /species/ (srd-2014 + srd-2024
-- core species, non-subspecies rows).
--
-- id is a stable app-facing slug (stableSrdId(source_record_key), e.g.
-- "srd_srd_2024_elf"); re-run identity is (source_document_key, source_record_key).
--
-- Fields Open5e has no data for (subraces, granted_spells, is_shapeshifter, art)
-- stay at their defaults — a DM who wants to enrich a species clones it into
-- their own `species` table, where the clone shadows the shared row by source
-- identity in the merged client list.

create table if not exists public.srd_species (
  id                      text primary key,
  name                    text not null,
  description             text,
  size                    text,
  speed                   jsonb,
  ability_score_increases jsonb,
  traits                  jsonb,
  languages               text[],
  tags                    text[],
  source                  text,
  source_title            text,
  subraces                jsonb,
  image_url               text,
  focal_point             jsonb,
  is_shapeshifter         boolean default false not null,
  granted_spells          jsonb default '[]' not null,
  natural_armor_ac        integer,
  avg_height              text,
  avg_weight              text,
  -- versioning/provenance (same contract as species, 20260720000018). All rows
  -- come from a 5e-2014/5e-2024 Open5e document, so ruleset is NOT NULL here.
  ruleset                 text not null,
  conceptual_key          text,
  source_document_key     text not null,
  source_record_key       text not null,
  source_revision         text,
  source_license          text,
  provenance              jsonb default '{}' not null,
  created_at              timestamptz default now() not null,
  updated_at              timestamptz default now() not null,
  constraint srd_species_ruleset_check check (ruleset in ('2014', '2024'))
);

create unique index srd_species_source_identity_unique
  on public.srd_species (source_document_key, source_record_key);
create index srd_species_ruleset_concept_idx
  on public.srd_species (ruleset, conceptual_key);

alter table public.srd_species enable row level security;

-- Public read — no auth required for shared SRD content
create policy "srd_species_select" on public.srd_species
  for select using (true);

-- Admin-only write
create policy "srd_species_insert" on public.srd_species
  for insert with check (private.is_app_admin());

create policy "srd_species_update" on public.srd_species
  for update using (private.is_app_admin());

create policy "srd_species_delete" on public.srd_species
  for delete using (private.is_app_admin());

create trigger srd_species_updated_at
  before update on public.srd_species
  for each row execute procedure update_updated_at();

-- Distinct sources for the campaign "Sources" panel — same shape as
-- get_srd_monster_sources / get_srd_item_sources.
create or replace function public.get_srd_species_sources(p_ruleset text default null)
returns table(source text, source_title text, count bigint)
language sql stable security definer set search_path = public
as $$
  select source, source_title, count(*)
  from srd_species
  where source is not null and (p_ruleset is null or ruleset = p_ruleset)
  group by source, source_title
  order by coalesce(source_title, source);
$$;
grant execute on function public.get_srd_species_sources(text) to anon, authenticated;
