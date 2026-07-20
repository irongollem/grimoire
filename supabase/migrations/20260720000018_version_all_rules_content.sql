-- One edition/source identity convention for every rules-bearing content type.
-- A null ruleset means user-authored content is edition-neutral. Built-in and
-- imported rows always carry an explicit edition and provider record identity.

alter table public.spells
  add column if not exists ruleset text,
  add column if not exists conceptual_key text,
  add column if not exists source_document_key text,
  add column if not exists source_record_key text,
  add column if not exists source_revision text,
  add column if not exists source_license text,
  add column if not exists provenance jsonb not null default '{}'::jsonb;

alter table public.monsters
  add column if not exists ruleset text,
  add column if not exists conceptual_key text,
  add column if not exists source_document_key text,
  add column if not exists source_record_key text,
  add column if not exists source_revision text,
  add column if not exists source_license text,
  add column if not exists provenance jsonb not null default '{}'::jsonb;

alter table public.items
  add column if not exists ruleset text,
  add column if not exists conceptual_key text,
  add column if not exists source_document_key text,
  add column if not exists source_record_key text,
  add column if not exists source_revision text,
  add column if not exists source_license text,
  add column if not exists provenance jsonb not null default '{}'::jsonb;

alter table public.species
  add column if not exists ruleset text,
  add column if not exists conceptual_key text,
  add column if not exists source_document_key text,
  add column if not exists source_record_key text,
  add column if not exists source_revision text,
  add column if not exists source_license text,
  add column if not exists provenance jsonb not null default '{}'::jsonb;

alter table public.class_features
  add column if not exists ruleset text,
  add column if not exists conceptual_key text,
  add column if not exists source_document_key text,
  add column if not exists source_record_key text,
  add column if not exists source_revision text,
  add column if not exists source_license text,
  add column if not exists provenance jsonb not null default '{}'::jsonb;

alter table public.rules
  add column if not exists ruleset text,
  add column if not exists conceptual_key text,
  add column if not exists source_document_key text,
  add column if not exists source_record_key text,
  add column if not exists source_revision text,
  add column if not exists source_license text,
  add column if not exists provenance jsonb not null default '{}'::jsonb;

alter table public.srd_monsters
  add column if not exists ruleset text,
  add column if not exists conceptual_key text,
  add column if not exists source_document_key text,
  add column if not exists source_record_key text,
  add column if not exists source_revision text,
  add column if not exists source_license text,
  add column if not exists provenance jsonb not null default '{}'::jsonb;

update public.srd_monsters set
  ruleset = coalesce(ruleset, case when coalesce(source, '') ~* '2024|5\.2' then '2024' else '2014' end),
  conceptual_key = coalesce(conceptual_key, trim(both '_' from regexp_replace(lower(name), '[^a-z0-9]+', '_', 'g'))),
  source_document_key = coalesce(source_document_key, source, 'legacy-srd'),
  source_record_key = coalesce(source_record_key, id),
  source_revision = coalesce(source_revision, 'legacy import');

alter table public.srd_monsters
  alter column ruleset set not null,
  alter column conceptual_key set not null,
  alter column source_document_key set not null,
  alter column source_record_key set not null;

alter table public.srd_rules
  add column if not exists ruleset text,
  add column if not exists conceptual_key text,
  add column if not exists source_document_key text,
  add column if not exists source_record_key text,
  add column if not exists source_revision text,
  add column if not exists source_license text,
  add column if not exists provenance jsonb not null default '{}'::jsonb;

update public.srd_rules set
  ruleset = coalesce(ruleset, case when doc_slug ~* '2024|5\.2' then '2024' else '2014' end),
  conceptual_key = coalesce(conceptual_key, slug),
  source_document_key = coalesce(source_document_key, doc_slug),
  source_record_key = coalesce(source_record_key, id::text),
  source_revision = coalesce(source_revision, 'legacy import');

alter table public.srd_rules
  alter column ruleset set not null,
  alter column conceptual_key set not null,
  alter column source_document_key set not null,
  alter column source_record_key set not null;

alter table public.system_classes
  add column if not exists ruleset text not null default '2014',
  add column if not exists conceptual_key text,
  add column if not exists source_document_key text,
  add column if not exists source_record_key text,
  add column if not exists source_revision text,
  add column if not exists source_license text,
  add column if not exists provenance jsonb not null default '{}'::jsonb;

update public.system_classes set
  conceptual_key = coalesce(conceptual_key, trim(both '_' from regexp_replace(lower(class_name), '[^a-z0-9]+', '_', 'g'))),
  source_document_key = coalesce(source_document_key, 'grimoire-system'),
  source_record_key = coalesce(source_record_key, ruleset || ':' || lower(class_name)),
  source_revision = coalesce(source_revision, 'seeded');

alter table public.system_classes
  alter column conceptual_key set not null,
  alter column source_document_key set not null,
  alter column source_record_key set not null,
  drop constraint if exists system_classes_class_name_key,
  add constraint system_classes_ruleset_name_unique unique (ruleset, class_name);

update public.spells set ruleset = '2014' where open5e_import and ruleset is null;
update public.monsters set ruleset = '2014' where open5e_import and ruleset is null;
update public.items set ruleset = '2014' where source is not null and ruleset is null;
update public.species set ruleset = '2014' where source is not null and ruleset is null;
update public.class_features set ruleset = '2014' where (open5e_import or user_id is null) and ruleset is null;

alter table public.spells add constraint spells_ruleset_check check (ruleset is null or ruleset in ('2014', '2024'));
alter table public.monsters add constraint monsters_ruleset_check check (ruleset is null or ruleset in ('2014', '2024'));
alter table public.items add constraint items_ruleset_check check (ruleset is null or ruleset in ('2014', '2024'));
alter table public.species add constraint species_ruleset_check check (ruleset is null or ruleset in ('2014', '2024'));
alter table public.class_features add constraint class_features_ruleset_check check (ruleset is null or ruleset in ('2014', '2024'));
alter table public.rules add constraint rules_ruleset_check check (ruleset is null or ruleset in ('2014', '2024'));
alter table public.srd_monsters add constraint srd_monsters_ruleset_check check (ruleset in ('2014', '2024'));
alter table public.srd_rules add constraint srd_rules_ruleset_check check (ruleset in ('2014', '2024'));
alter table public.system_classes add constraint system_classes_ruleset_check check (ruleset in ('2014', '2024'));

create unique index if not exists srd_monsters_source_identity_unique on public.srd_monsters(source_document_key, source_record_key);
create unique index if not exists srd_rules_source_identity_unique on public.srd_rules(source_document_key, source_record_key);
create index if not exists srd_monsters_ruleset_concept_idx on public.srd_monsters(ruleset, conceptual_key);
create index if not exists srd_rules_ruleset_concept_idx on public.srd_rules(ruleset, conceptual_key);

drop function if exists public.get_srd_monster_sources();
create or replace function public.get_srd_monster_sources(p_ruleset text default null)
returns table(source text, source_title text, count bigint)
language sql stable security definer set search_path = public
as $$
  select source, source_title, count(*)
  from srd_monsters
  where source is not null and (p_ruleset is null or ruleset = p_ruleset)
  group by source, source_title
  order by coalesce(source_title, source);
$$;
grant execute on function public.get_srd_monster_sources(text) to anon, authenticated;
