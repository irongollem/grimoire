-- A canon entry can be finished (#1255 items 9 and 10; the review of the Canon beta, 23 Nov 2026).
--
-- Nothing in the canon ever resolved: an open question could only be renamed or deleted, a force had a clock and no
-- end, and a secret the party had learned stayed a secret for good. A story needs its threads to close.
--
--  - `closed_as` says how an entry ended, `closed_at` when, `closed_note` what became of it (a question's answer in
--    the DM's words, what a force's end looked like). A question is `answered`. A force `succeeded` (it got what it
--    wanted), was `stopped`, or `faded`. No other part closes: a truth holds, lore is told, and a secret's own ending
--    is its reveal (`revealed_at`).
--  - `became_entry_id` points at the entry an entry turned into: the truth or secret that answers a question, the
--    truth a revealed secret became. A part never changes (`canon_entries_part_is_fixed`), so becoming is a new entry
--    and this is the thread between the two. Deleting the new entry leaves the old one standing.
--
-- Nothing here changes who may read: a closed question is still nobody's but the DM's, and the audience rule
-- (`private.canon_entry_seen`) reads none of these columns.

alter table public.canon_entries
  add column closed_at timestamptz,
  add column closed_as text,
  add column closed_note text,
  add column became_entry_id uuid references public.canon_entries (id) on delete set null,
  add constraint canon_entries_closed_as_known check (
    closed_as is null
    or (part = 'question' and closed_as = 'answered')
    or (part = 'force' and closed_as in ('succeeded', 'stopped', 'faded'))),
  add constraint canon_entries_closed_together check ((closed_at is null) = (closed_as is null)),
  add constraint canon_entries_note_when_closed check (closed_note is null or closed_as is not null),
  add constraint canon_entries_became_from check (became_entry_id is null or part in ('question', 'secret')),
  add constraint canon_entries_became_another check (became_entry_id is distinct from id);

create index canon_entries_became_idx on public.canon_entries (became_entry_id) where became_entry_id is not null;

-- The entry it became is in the same campaign, as every other reference of a canon entry is.
drop trigger zz_same_campaign_refs on public.canon_entries;
create trigger zz_same_campaign_refs
  before insert or update of party_member_id, became_entry_id, campaign_id
  on public.canon_entries
  for each row execute procedure private.enforce_same_campaign_refs(
    'party_member_id', 'party_members', 'owned',
    'became_entry_id', 'canon_entries', 'owned');

-- What an entry may become: a question becomes the truth or the secret that answers it, a secret becomes a truth. A
-- check constraint cannot read another row, so this is a trigger. Invoker: the DM writing the row reads both.
create function private.canon_entries_become_what()
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
  if (new.part = 'question' and v_target not in ('truth', 'secret')) or (new.part = 'secret' and v_target <> 'truth') then
    raise exception using errcode = '23514',
      message = format('A %s cannot become a %s', new.part, v_target),
      hint = 'A question becomes a truth or a secret; a secret becomes a truth.';
  end if;
  return new;
end;
$$;
revoke execute on function private.canon_entries_become_what() from public, anon, authenticated;

create trigger canon_entries_become_what
  before insert or update of became_entry_id on public.canon_entries
  for each row execute procedure private.canon_entries_become_what();

comment on column public.canon_entries.closed_as is
  'How the entry ended: a question is answered; a force succeeded, was stopped or faded. Null while it is open (#1255).';
comment on column public.canon_entries.became_entry_id is
  'The entry this one turned into: the truth or secret that answers a question, the truth a revealed secret became.';
