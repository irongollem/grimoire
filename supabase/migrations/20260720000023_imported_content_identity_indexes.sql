-- Enforce the provider identity used by every repeatable V2 importer. These
-- partial indexes leave user-authored edition-neutral rows unrestricted.

create unique index if not exists spells_source_identity_unique
  on public.spells(user_id, source_document_key, source_record_key)
  where user_id is not null and source_document_key is not null and source_record_key is not null;

create unique index if not exists monsters_source_identity_unique
  on public.monsters(user_id, source_document_key, source_record_key)
  where user_id is not null and source_document_key is not null and source_record_key is not null;

create unique index if not exists items_source_identity_unique
  on public.items(user_id, source_document_key, source_record_key)
  where user_id is not null and source_document_key is not null and source_record_key is not null;

create unique index if not exists species_source_identity_unique
  on public.species(user_id, source_document_key, source_record_key)
  where user_id is not null and source_document_key is not null and source_record_key is not null;

create index if not exists spells_ruleset_concept_idx on public.spells(ruleset, conceptual_key);
create index if not exists monsters_ruleset_concept_idx on public.monsters(ruleset, conceptual_key);
create index if not exists items_ruleset_concept_idx on public.items(ruleset, conceptual_key);
create index if not exists species_ruleset_concept_idx on public.species(ruleset, conceptual_key);
create index if not exists class_features_ruleset_concept_idx on public.class_features(ruleset, conceptual_key);
create index if not exists rules_ruleset_concept_idx on public.rules(ruleset, conceptual_key);
