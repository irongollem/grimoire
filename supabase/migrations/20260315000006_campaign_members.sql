-- ── Phase 1: Campaign membership + invite system ─────────────────────────────
-- Enables players to join a DM's campaign via invite link.
-- Adds two tables (campaign_members, campaign_invites), RLS helper functions,
-- a trigger that auto-creates the DM's membership on campaign creation, and
-- a security-definer function that atomically validates + consumes an invite.

-- ── 1. campaign_members ───────────────────────────────────────────────────────
-- Table must exist before the helper functions reference it.

create table if not exists public.campaign_members (
  id               uuid primary key default gen_random_uuid(),
  campaign_id      uuid not null references public.campaigns(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  role             text not null check (role in ('dm', 'player')),
  party_member_id  uuid references public.party_members(id) on delete set null,
  display_name     text,
  joined_at        timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique(campaign_id, user_id)
);

create index if not exists campaign_members_campaign_idx on public.campaign_members(campaign_id);
create index if not exists campaign_members_user_idx     on public.campaign_members(user_id);

alter table public.campaign_members enable row level security;

create trigger campaign_members_updated_at
  before update on public.campaign_members
  for each row execute procedure update_updated_at();


-- ── 2. RLS helper functions ───────────────────────────────────────────────────
-- Defined after campaign_members so the SQL parser can resolve the relation.

-- Is the current user a member (any role) of the given campaign?
create or replace function public.is_campaign_member(cid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = cid and user_id = auth.uid()
  );
$$;

-- Is the current user the DM of the given campaign?
create or replace function public.is_campaign_dm(cid uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.campaign_members
    where campaign_id = cid and user_id = auth.uid() and role = 'dm'
  );
$$;


-- ── 3. RLS policies for campaign_members ─────────────────────────────────────
-- Defined after the helper functions exist.

-- DM: full control over their campaign's member list
create policy "campaign_members_dm_all" on public.campaign_members
  for all using (is_campaign_dm(campaign_id))
  with check (is_campaign_dm(campaign_id));

-- Members: can read the member list for campaigns they belong to
create policy "campaign_members_select" on public.campaign_members
  for select using (is_campaign_member(campaign_id));

-- Members: can update their own record (display_name, party_member_id)
create policy "campaign_members_update_own" on public.campaign_members
  for update using (user_id = auth.uid());


-- ── 4. Auto-create DM membership when a campaign is created ──────────────────

create or replace function public.create_dm_membership()
returns trigger language plpgsql security definer as $$
begin
  insert into public.campaign_members (campaign_id, user_id, role)
  values (new.id, new.user_id, 'dm')
  on conflict (campaign_id, user_id) do nothing;
  return new;
end;
$$;

create trigger campaigns_create_dm_membership
  after insert on public.campaigns
  for each row execute procedure create_dm_membership();


-- ── 5. campaign_invites ───────────────────────────────────────────────────────

create table if not exists public.campaign_invites (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  token       uuid not null unique default gen_random_uuid(),
  role        text not null default 'player' check (role in ('dm', 'player')),
  created_by  uuid not null references auth.users(id),
  label       text,        -- DM note e.g. "For Alice"
  expires_at  timestamptz, -- null = never expires
  max_uses    int,         -- null = unlimited
  use_count   int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists campaign_invites_campaign_idx on public.campaign_invites(campaign_id);
create index if not exists campaign_invites_token_idx    on public.campaign_invites(token);

alter table public.campaign_invites enable row level security;

-- DM manages their campaign's invites
create policy "campaign_invites_dm_all" on public.campaign_invites
  for all using (is_campaign_dm(campaign_id))
  with check (is_campaign_dm(campaign_id));

-- Any authenticated user can read invites (needed to look up a token before joining)
create policy "campaign_invites_read_by_token" on public.campaign_invites
  for select using (auth.uid() is not null);


-- ── 6. Atomic join function ───────────────────────────────────────────────────
-- Called from the client after the user is authenticated.
-- Validates the invite token, inserts the membership, increments use_count.
-- Returns the campaign_id so the client can redirect to the right campaign.

create or replace function public.join_campaign_via_invite(p_token uuid)
returns uuid language plpgsql security definer as $$
declare
  v_invite  public.campaign_invites;
begin
  -- Validate token
  select * into v_invite
  from public.campaign_invites
  where token = p_token
    and (expires_at is null or expires_at > now())
    and (max_uses is null or use_count < max_uses);

  if not found then
    raise exception 'Invalid or expired invite link';
  end if;

  -- Idempotent: if already a member just return the campaign_id
  if exists (
    select 1 from public.campaign_members
    where campaign_id = v_invite.campaign_id and user_id = auth.uid()
  ) then
    return v_invite.campaign_id;
  end if;

  -- Create membership
  insert into public.campaign_members (campaign_id, user_id, role)
  values (v_invite.campaign_id, auth.uid(), v_invite.role);

  -- Consume one use
  update public.campaign_invites
  set use_count = use_count + 1
  where id = v_invite.id;

  return v_invite.campaign_id;
end;
$$;
