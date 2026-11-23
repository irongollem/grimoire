-- A truth remembers the table fact it was made from (#1255 item 22; the review of the Canon beta, 23 Nov 2026).
--
-- "Make it a truth" on a line the Narrator put on record copied the sentence into a new truth and kept the fact, with
-- nothing between the two. The same words then lived in two places: the fact still offered "Make it a truth", so it
-- could be filed twice, and nobody reading the truth could tell it began at the table.
--
-- `from_fact_id` is that thread. Only a truth may have it. Deleting the fact (a campaign being cleared) leaves the
-- truth standing. A fact is made a truth once: the same fact cannot be the source of two truths.

alter table public.canon_entries
  add column from_fact_id uuid references public.story_facts (id) on delete set null,
  add constraint canon_entries_only_a_truth_is_from_a_fact check (from_fact_id is null or part = 'truth');

create unique index canon_entries_from_fact_once on public.canon_entries (from_fact_id) where from_fact_id is not null;

-- The fact is in the same campaign, as every other reference of a canon entry is.
drop trigger zz_same_campaign_refs on public.canon_entries;
create trigger zz_same_campaign_refs
  before insert or update of party_member_id, became_entry_id, from_fact_id, campaign_id
  on public.canon_entries
  for each row execute procedure private.enforce_same_campaign_refs(
    'party_member_id', 'party_members', 'owned',
    'became_entry_id', 'canon_entries', 'owned',
    'from_fact_id', 'story_facts', 'owned');

comment on column public.canon_entries.from_fact_id is
  'The table fact (story_facts) this truth was made from, so the two are not filed twice (#1255).';
