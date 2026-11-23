-- An ended force can leave a truth behind (#1258 item 10). Ending a force asks "What is true now?"; a line there
-- becomes a truth known to all, the force points at it through `became_entry_id`, and a `led_to` link records the cause.
-- Until now only a question and a secret could become another entry. A force becomes a truth and nothing else: what a
-- finished plan leaves is a fact of the world, not a fresh mystery.

alter table public.canon_entries
  drop constraint canon_entries_became_from,
  add constraint canon_entries_became_from check (became_entry_id is null or part in ('question', 'secret', 'force'));

create or replace function private.canon_entries_become_what()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_target text;
begin
  if new.became_entry_id is null then return new; end if;
  select e.part into v_target from public.canon_entries e where e.id = new.became_entry_id;
  -- A missing row is the foreign key's to report.
  if v_target is null then return new; end if;
  if (new.part = 'question' and v_target not in ('truth', 'secret'))
    or (new.part in ('secret', 'force') and v_target <> 'truth') then
    raise exception using errcode = '23514',
      message = format('A %s cannot become a %s', new.part, v_target),
      hint = 'A question becomes a truth or a secret; a secret or an ended force becomes a truth.';
  end if;
  return new;
end;
$$;

revoke execute on function private.canon_entries_become_what() from public, anon, authenticated;

comment on column public.canon_entries.became_entry_id is
  'The entry this one turned into: the truth or secret that answers a question, the truth a revealed secret became, '
  'or what an ended force left true.';
