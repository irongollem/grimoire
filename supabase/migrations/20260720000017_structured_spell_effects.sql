-- Version structured spell mechanics independently from descriptive text.
-- Imported effects remain manual until mechanics_reviewed is explicitly set.
alter table public.srd_spells
  add column if not exists effect_schema_version integer not null default 1,
  add column if not exists effects jsonb;

alter table public.srd_spells
  add constraint srd_spells_effect_schema_version_check
  check (effect_schema_version > 0),
  add constraint srd_spells_effects_array_check
  check (effects is null or jsonb_typeof(effects) = 'array');

comment on column public.srd_spells.effects is
  'Outcome- and phase-gated mechanics. Never execute when mechanics_reviewed is false.';
