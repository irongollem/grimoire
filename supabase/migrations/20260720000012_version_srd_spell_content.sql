-- Give shared spell content a stable source identity so mechanically different
-- 2014 and 2024 records can coexist. `id` remains the app-facing key; source
-- identity is never inferred from a display name.

alter table public.srd_spells
  add column if not exists conceptual_key text,
  add column if not exists ruleset text,
  add column if not exists source_document_key text,
  add column if not exists source_record_key text,
  add column if not exists source_revision text,
  add column if not exists source_license text,
  add column if not exists provenance jsonb not null default '{}'::jsonb,
  add column if not exists casting_options jsonb,
  add column if not exists mechanics_reviewed boolean not null default false;

update public.srd_spells
set conceptual_key = coalesce(
      conceptual_key,
      trim(both '_' from regexp_replace(lower(name), '[^a-z0-9]+', '_', 'g'))
    ),
    ruleset = coalesce(
      ruleset,
      case when coalesce(source, '') ~* '2024|srd-2024' then '2024' else '2014' end
    ),
    source_document_key = coalesce(source_document_key, source, 'legacy-srd'),
    source_record_key = coalesce(source_record_key, id),
    source_revision = coalesce(source_revision, 'legacy import'),
    provenance = provenance || jsonb_build_object(
      'importer', 'legacy-srd-backfill',
      'backfilled_at', now()
    )
where conceptual_key is null
   or ruleset is null
   or source_document_key is null
   or source_record_key is null;

alter table public.srd_spells
  alter column conceptual_key set not null,
  alter column ruleset set not null,
  alter column source_document_key set not null,
  alter column source_record_key set not null,
  add constraint srd_spells_ruleset_check check (ruleset in ('2014', '2024')),
  add constraint srd_spells_source_identity_unique
    unique (source_document_key, source_record_key);

create index if not exists srd_spells_ruleset_concept_idx
  on public.srd_spells (ruleset, conceptual_key);

comment on column public.srd_spells.conceptual_key is
  'Edition-independent concept key; never used alone as a unique content identity.';
comment on column public.srd_spells.mechanics_reviewed is
  'True only when structured automation was checked against the source text.';

-- Keep source discovery edition-aware without breaking the existing return
-- shape used by clients. A source document belongs to one ruleset.
drop function if exists public.get_srd_spell_sources();

create or replace function public.get_srd_spell_sources(p_ruleset text default null)
returns table(source text, source_title text, count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    source,
    source_title,
    count(*) as count
  from srd_spells
  where source is not null
    and (p_ruleset is null or ruleset = p_ruleset)
  group by source, source_title
  order by coalesce(source_title, source) nulls last;
$$;

grant execute on function public.get_srd_spell_sources(text) to anon, authenticated;
