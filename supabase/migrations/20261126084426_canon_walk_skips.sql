-- "Design it with me" (#1282): the walk through the whole canon, section by section. Which sections are filled is read
-- from the canon itself; the one thing the canon cannot say is that the DM chose to leave a section empty. That is this
-- table: one row per (campaign, section) the DM skipped, so the walk never asks about it again until they bring it back.
--
-- Its own table rather than a column on `campaigns`, which every member reads and on which nothing of the canon may live
-- (#1228). The DMs of the campaign read and write it; players read none of it. The section ids are the walk's own
-- (`WALK_SKIPPABLE` in `src/lib/canon/canonWalk.ts`); the pitch is not among them, because every draft after it reads it.

create table public.canon_walk_skips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  section text not null constraint canon_walk_skips_section check (section in (
    'themes', 'table', 'voice', 'look', 'lines',
    'truths', 'forces', 'secrets', 'questions', 'lore',
    'arcs', 'peoples', 'habitats', 'backstories'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint canon_walk_skips_once unique (campaign_id, section)
);
create index canon_walk_skips_user_idx on public.canon_walk_skips (user_id);

create trigger canon_walk_skips_updated_at
  before update on public.canon_walk_skips
  for each row execute procedure update_updated_at();

create trigger canon_walk_skips_guard_content_author
  before update on public.canon_walk_skips
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();

alter table public.canon_walk_skips enable row level security;
create policy "canon_walk_skips_select" on public.canon_walk_skips for select using (private.is_campaign_dm(campaign_id));
create policy "canon_walk_skips_insert" on public.canon_walk_skips for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "canon_walk_skips_update" on public.canon_walk_skips for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "canon_walk_skips_delete" on public.canon_walk_skips for delete using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.canon_walk_skips to authenticated, service_role;

-- A co-DM's skip reaches the other DM's walk.
create trigger canon_walk_skips_signal_insert after insert on public.canon_walk_skips
  referencing new table as changed for each statement execute procedure signal_campaign_change();
create trigger canon_walk_skips_signal_update after update on public.canon_walk_skips
  referencing old table as left_rows new table as changed for each statement execute procedure signal_campaign_change();
create trigger canon_walk_skips_signal_delete after delete on public.canon_walk_skips
  referencing old table as changed for each statement execute procedure signal_campaign_change();

insert into private.demo_campaign_tables (table_name, tier, copy, reason) values
  ('canon_walk_skips', 1, false, 'the author''s own progress through the walk, not part of the template');

comment on table public.canon_walk_skips is 'The canon sections a DM chose to leave empty in "Design it with me" (#1282).';
