-- The inspector and full-page editor share these authored fields. Rich content
-- is stored once on the beat; the two surfaces are only different projections.

alter table public.quest_beats
  add column read_aloud text,
  add column how_it_plays text,
  add column outcomes text,
  add column consequences text;

comment on column public.quest_beats.read_aloud is
  'Tiptap JSON for boxed text the DM may read or paraphrase at the table.';
comment on column public.quest_beats.how_it_plays is
  'Tiptap JSON for pacing, checks, roleplay guidance, and non-combat resolution.';
comment on column public.quest_beats.outcomes is
  'Tiptap JSON for authored branches and possible immediate results.';
comment on column public.quest_beats.consequences is
  'Tiptap JSON for delayed world, faction, and quest consequences.';
