-- A graph node without a meaningful label is not runnable. Keep this invariant
-- at the data boundary so imports and future clients cannot bypass the editor.
alter table public.quest_beats
  add constraint quest_beats_title_not_blank
  check (length(btrim(title)) > 0);
