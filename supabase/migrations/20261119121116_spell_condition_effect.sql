-- What a spell does to a creature besides damage, in data (#1021, row 5b, step C).
--
-- A fight resolves Fireball because its dice are columns. It could not resolve Hold Person: nothing said in data
-- which condition a spell imposes, on what, for how long, or what ends it (0 of 1,783 library spells had
-- `condition_inflicted` filled). `condition_effect` holds that, in the shape of `CuratedSpellCondition`
-- (src/lib/spells/curatedSpellConditions.ts) without its `evidence`: the verdict (`condition`, `no_condition`,
-- `not_simple`), the conditions, how they land, whom they reach, how long they last and what ends them early.
--
-- Null means nobody has read the spell for this. A library row is written only from two independent readings that
-- agree (`npm run spells:conditions`); a campaign's own spell is its DM's to fill. Nothing reads the old
-- `condition_inflicted` text column for a fight.

alter table public.library_spells add column condition_effect jsonb;
alter table public.spells add column condition_effect jsonb;

comment on column public.library_spells.condition_effect is
  'What the spell does besides damage (CuratedSpellCondition without evidence). Null: not read yet. Written from two agreeing readings only.';
comment on column public.spells.condition_effect is
  'What the spell does besides damage (CuratedSpellCondition without evidence). Null: not said.';

-- A shape check, so a hand edit cannot leave something the fight would trust and misread.
alter table public.library_spells add constraint library_spells_condition_effect_shape check (
  condition_effect is null
  or (jsonb_typeof(condition_effect) = 'object' and condition_effect ->> 'verdict' in ('condition', 'no_condition', 'not_simple'))
);
alter table public.spells add constraint spells_condition_effect_shape check (
  condition_effect is null
  or (jsonb_typeof(condition_effect) = 'object' and condition_effect ->> 'verdict' in ('condition', 'no_condition', 'not_simple'))
);
