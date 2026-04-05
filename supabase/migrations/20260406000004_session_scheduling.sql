-- ── Session Scheduling (issues #4, #17, #18) ─────────────────────────────────
-- DM proposes candidate dates → players mark availability → DM confirms sessions.
-- Confirmed sessions can be exported as iCal.

-- ── 1. session_proposals ──────────────────────────────────────────────────────

create table public.session_proposals (
  id             uuid        primary key default gen_random_uuid(),
  campaign_id    uuid        not null references public.campaigns(id) on delete cascade,
  user_id        uuid        not null references auth.users(id) on delete cascade,
  proposed_date  date        not null,
  proposed_time  time,
  title          text        not null default 'Session',
  notes          text,
  status         text        not null default 'proposed'
                               check (status in ('proposed', 'confirmed', 'cancelled')),
  min_attendance int         not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index session_proposals_campaign_idx on public.session_proposals(campaign_id);
create index session_proposals_date_idx     on public.session_proposals(proposed_date);

alter table public.session_proposals enable row level security;

create trigger session_proposals_updated_at
  before update on public.session_proposals
  for each row execute procedure update_updated_at();

-- All campaign members can read proposals
create policy "session_proposals_select" on public.session_proposals
  for select using (is_campaign_member(campaign_id));

-- Only the DM can create / edit / delete proposals
create policy "session_proposals_insert" on public.session_proposals
  for insert with check (is_campaign_dm(campaign_id));

create policy "session_proposals_update" on public.session_proposals
  for update using (is_campaign_dm(campaign_id));

create policy "session_proposals_delete" on public.session_proposals
  for delete using (is_campaign_dm(campaign_id));


-- ── 2. session_availability ───────────────────────────────────────────────────

create table public.session_availability (
  id                  uuid        primary key default gen_random_uuid(),
  session_proposal_id uuid        not null references public.session_proposals(id) on delete cascade,
  campaign_id         uuid        not null references public.campaigns(id) on delete cascade,
  user_id             uuid        not null references auth.users(id) on delete cascade,
  available           boolean     not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique(session_proposal_id, user_id)
);

create index session_availability_proposal_idx on public.session_availability(session_proposal_id);
create index session_availability_campaign_idx on public.session_availability(campaign_id);

alter table public.session_availability enable row level security;

create trigger session_availability_updated_at
  before update on public.session_availability
  for each row execute procedure update_updated_at();

-- All campaign members can read availability (DM sees who's free)
create policy "session_availability_select" on public.session_availability
  for select using (is_campaign_member(campaign_id));

-- Members can manage their own availability row
create policy "session_availability_insert" on public.session_availability
  for insert with check (is_campaign_member(campaign_id) and auth.uid() = user_id);

create policy "session_availability_update" on public.session_availability
  for update using (auth.uid() = user_id);

create policy "session_availability_delete" on public.session_availability
  for delete using (auth.uid() = user_id);
