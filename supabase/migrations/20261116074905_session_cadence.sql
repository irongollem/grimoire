-- A campaign's cadence (#1213): the table's rhythm, set once, so the DM only
-- asks the party when an evening deviates from it.
--
-- Upcoming regular evenings are COMPUTED from the rule (supabase/functions/
-- _shared/cadence.ts), never written ahead as rows. Only a deviation is a row:
--
--   moved     a session_proposals row on the new date, replaces_date = the
--             regular evening it stands in for, sent to the party as an
--             ordinary proposal to answer;
--   cancelled a session_proposals row with status 'cancelled' on that date;
--   added     an ordinary proposal, replaces_date null, as before.
--
-- Materialising rows a few weeks ahead was the alternative, and it was turned
-- down because every rule change would then have to find and rewrite the rows
-- it had written, and tell them apart from the ones the DM had since edited.
-- Computing has nothing to keep in step: change the rule and the evenings
-- follow. A deviation keeps the date it replaced, so it stays attached to that
-- evening (or, if the new rule no longer falls there, a moved evening simply
-- stands on its own and a cancellation does nothing).
--
-- Times are wall-clock with no zone, exactly like session_proposals'
-- proposed_date + proposed_time and the calendar feed's floating events.

create table public.session_cadences (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null unique references public.campaigns (id) on delete cascade,
  user_id          uuid not null references auth.users (id) on delete cascade,
  -- 'weekly' repeats every `every_weeks` weeks on `weekday`; 'monthly' falls
  -- on the `week_of_month`th `weekday` of each month (-1 = the last one).
  repeat           text not null check (repeat in ('weekly', 'monthly')),
  every_weeks      smallint not null default 1 check (every_weeks between 1 and 8),
  -- ISO weekday: 1 = Monday … 7 = Sunday.
  weekday          smallint not null check (weekday between 1 and 7),
  week_of_month    smallint check (week_of_month in (1, 2, 3, 4, -1)),
  start_time       time not null,
  duration_minutes integer not null default 240 check (duration_minutes > 0),
  title            text not null default 'Session',
  -- The first regular evening is the first matching day on or after this
  -- date, and an every-N-weeks rhythm counts its weeks from that evening.
  starts_on        date not null,
  ends_on          date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint session_cadences_monthly_needs_week
    check ((repeat = 'monthly') = (week_of_month is not null)),
  constraint session_cadences_ends_after_start
    check (ends_on is null or ends_on >= starts_on)
);

create index session_cadences_user_id_idx on public.session_cadences (user_id);

create trigger session_cadences_updated_at
  before update on public.session_cadences
  for each row execute procedure update_updated_at();

create trigger session_cadences_guard_content_author
  before update on public.session_cadences
  for each row
  when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute function private.guard_content_author();

alter table public.session_cadences enable row level security;

-- Every member reads the rhythm (the Hearth and the player's settings show it);
-- only the campaign's DM sets it, as with session_proposals.
create policy "session_cadences_select" on public.session_cadences
  for select using (private.is_campaign_member(campaign_id));
create policy "session_cadences_insert" on public.session_cadences
  for insert with check (private.is_campaign_dm(campaign_id) and (select auth.uid()) = user_id);
create policy "session_cadences_update" on public.session_cadences
  for update using (private.is_campaign_dm(campaign_id))
  with check (private.is_campaign_dm(campaign_id));
create policy "session_cadences_delete" on public.session_cadences
  for delete using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.session_cadences to authenticated, service_role;

create trigger session_cadences_signal_insert
  after insert on public.session_cadences
  referencing new table as changed
  for each statement execute function public.signal_campaign_change();
create trigger session_cadences_signal_update
  after update on public.session_cadences
  referencing old table as left_rows new table as changed
  for each statement execute function public.signal_campaign_change();
create trigger session_cadences_signal_delete
  after delete on public.session_cadences
  referencing old table as changed
  for each statement execute function public.signal_campaign_change();

-- ── Deviations ───────────────────────────────────────────────────────────────

alter table public.session_proposals
  add column replaces_date date;

comment on column public.session_proposals.replaces_date is
  'The regular evening (from session_cadences) this row stands in for: moved to proposed_date, or cancelled. Null for an evening added outside the cadence.';

-- One deviation per regular evening: a second would leave it ambiguous which
-- one the evening became.
create unique index session_proposals_one_deviation_per_evening
  on public.session_proposals (campaign_id, replaces_date)
  where replaces_date is not null;

-- ── "I can't make it" on a regular evening ───────────────────────────────────

-- A regular evening is not a proposal, so there is no session_availability row
-- to answer on. A player who cannot come says so here, unasked; nothing is
-- emailed, and the DM sees it beside the evening and decides whether it is
-- worth moving. The absence of a row means the player is coming, which is
-- what a cadence is: the answer is yes until said otherwise.
create table public.session_absences (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  absent_on   date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (campaign_id, user_id, absent_on)
);

create index session_absences_user_id_idx on public.session_absences (user_id);

create trigger session_absences_updated_at
  before update on public.session_absences
  for each row execute procedure update_updated_at();

alter table public.session_absences enable row level security;

-- Readable by the whole table, like session_availability: the Hearth says how
-- many are coming. Written only by the player about themselves.
create policy "session_absences_select" on public.session_absences
  for select using (private.is_campaign_member(campaign_id));
create policy "session_absences_insert" on public.session_absences
  for insert with check ((select auth.uid()) = user_id and private.is_campaign_member(campaign_id));
create policy "session_absences_update" on public.session_absences
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and private.is_campaign_member(campaign_id));
create policy "session_absences_delete" on public.session_absences
  for delete using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.session_absences to authenticated, service_role;

create trigger session_absences_signal_insert
  after insert on public.session_absences
  referencing new table as changed
  for each statement execute function public.signal_campaign_change();
create trigger session_absences_signal_update
  after update on public.session_absences
  referencing old table as left_rows new table as changed
  for each statement execute function public.signal_campaign_change();
create trigger session_absences_signal_delete
  after delete on public.session_absences
  referencing old table as changed
  for each statement execute function public.signal_campaign_change();

-- The demo copy classifies every campaign-scoped table (demo_campaign.test.sql).
insert into private.demo_campaign_tables (table_name, tier, copy, reason) values
  ('session_cadences', 1, false, 'scheduling with real players'),
  ('session_absences', 1, false, 'scheduling with real players');
