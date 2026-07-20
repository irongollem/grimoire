-- Complete the shared version/source identity contract for character options.
-- Imported rows use provider-native document + record keys. User-authored rows
-- remain edition-neutral unless their author explicitly selects an edition.

alter table public.custom_classes
  add column if not exists ruleset text,
  add column if not exists conceptual_key text,
  add column if not exists source_document_key text,
  add column if not exists source_record_key text,
  add column if not exists source_revision text,
  add column if not exists source_license text,
  add column if not exists provenance jsonb not null default '{}'::jsonb;

alter table public.custom_subclasses
  add column if not exists ruleset text,
  add column if not exists conceptual_key text,
  add column if not exists source_document_key text,
  add column if not exists source_record_key text,
  add column if not exists source_revision text,
  add column if not exists source_license text,
  add column if not exists provenance jsonb not null default '{}'::jsonb;

alter table public.backgrounds
  add column if not exists ruleset text,
  add column if not exists conceptual_key text,
  add column if not exists source_document_key text,
  add column if not exists source_record_key text,
  add column if not exists source_revision text,
  add column if not exists source_license text,
  add column if not exists provenance jsonb not null default '{}'::jsonb;

-- Legacy imports did not retain Open5e's native record key. Give those rows a
-- collision-free legacy identity; the next V2 sync can coexist without losing
-- a previously selected row.
update public.custom_classes set
  ruleset = coalesce(ruleset, case
    when coalesce(source, '') ~* '2024|5[.]2|srd-2024' then '2024'
    when coalesce(source, '') ~* '2014|5[.]1|srd-2014' then '2014'
    else null
  end),
  conceptual_key = coalesce(conceptual_key, trim(both '_' from regexp_replace(lower(class_name), '[^a-z0-9]+', '_', 'g'))),
  source_document_key = coalesce(source_document_key, source),
  source_record_key = coalesce(source_record_key, case when source is not null then 'legacy:' || id::text end),
  source_revision = coalesce(source_revision, case when source is not null then 'legacy-v1' end);

update public.custom_subclasses set
  ruleset = coalesce(ruleset, case
    when coalesce(source, '') ~* '2024|5[.]2|srd-2024' then '2024'
    when coalesce(source, '') ~* '2014|5[.]1|srd-2014' then '2014'
    else null
  end),
  conceptual_key = coalesce(conceptual_key, trim(both '_' from regexp_replace(lower(class_name || '-' || subclass_name), '[^a-z0-9]+', '_', 'g'))),
  source_document_key = coalesce(source_document_key, source),
  source_record_key = coalesce(source_record_key, case when source is not null then 'legacy:' || id::text end),
  source_revision = coalesce(source_revision, case when source is not null then 'legacy-v1' end);

update public.backgrounds set
  ruleset = coalesce(ruleset, case
    when coalesce(source, '') ~* '2024|5[.]2|srd-2024' then '2024'
    when coalesce(source, '') ~* '2014|5[.]1|srd-2014' then '2014'
    else null
  end),
  conceptual_key = coalesce(conceptual_key, trim(both '_' from regexp_replace(lower(name), '[^a-z0-9]+', '_', 'g'))),
  source_document_key = coalesce(source_document_key, source),
  source_record_key = coalesce(source_record_key, case when open5e_import then 'legacy:' || id::text end),
  source_revision = coalesce(source_revision, case when open5e_import then 'legacy-v1' end);

-- The first pass added these columns to features but did not populate imported
-- identities. Backfill without conflating equal names from different books.
update public.class_features set
  ruleset = coalesce(ruleset, case
    when coalesce(source, '') ~* '2024|5[.]2|srd-2024' then '2024'
    when coalesce(source, '') ~* '2014|5[.]1|srd-2014' then '2014'
    else null
  end),
  conceptual_key = coalesce(conceptual_key, trim(both '_' from regexp_replace(lower(name), '[^a-z0-9]+', '_', 'g'))),
  source_document_key = coalesce(source_document_key, case when open5e_import then source end),
  source_record_key = coalesce(source_record_key, case when open5e_import then 'legacy:' || id::text end),
  source_revision = coalesce(source_revision, case when open5e_import then 'legacy-v1' end);

alter table public.custom_classes
  add constraint custom_classes_ruleset_check check (ruleset is null or ruleset in ('2014', '2024'));
alter table public.custom_subclasses
  add constraint custom_subclasses_ruleset_check check (ruleset is null or ruleset in ('2014', '2024'));
alter table public.backgrounds
  add constraint backgrounds_ruleset_check check (ruleset is null or ruleset in ('2014', '2024'));

create unique index if not exists custom_classes_source_identity_unique
  on public.custom_classes(user_id, source_document_key, source_record_key)
  where source_document_key is not null and source_record_key is not null;
create unique index if not exists custom_subclasses_source_identity_unique
  on public.custom_subclasses(user_id, source_document_key, source_record_key)
  where source_document_key is not null and source_record_key is not null;
create unique index if not exists backgrounds_source_identity_unique
  on public.backgrounds(user_id, source_document_key, source_record_key)
  where source_document_key is not null and source_record_key is not null;
create unique index if not exists class_features_source_identity_unique
  on public.class_features(user_id, source_document_key, source_record_key)
  where user_id is not null and source_document_key is not null and source_record_key is not null;

create index if not exists custom_classes_ruleset_concept_idx on public.custom_classes(ruleset, conceptual_key);
create index if not exists custom_subclasses_ruleset_concept_idx on public.custom_subclasses(ruleset, conceptual_key);
create index if not exists backgrounds_ruleset_concept_idx on public.backgrounds(ruleset, conceptual_key);
