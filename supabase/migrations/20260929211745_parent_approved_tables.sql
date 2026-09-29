-- #927 stories 1-2: a parent says who their young player plays with.
--
-- Since #919 a child account can run a campaign and join others from an invite
-- link, and nobody's parent had a say in who was at the table. From here, a
-- join that involves a child is a *request*, not a membership, until each
-- parent it concerns says yes:
--
--   * the joiner's parent, when the joiner is a child;
--   * the DM's parent, when the campaign's owner is a child.
--
-- Automatic cases, because asking would be asking someone to approve
-- themselves: a parent who owns the campaign their child joins, and a joiner
-- who is the DM's own parent. Two siblings share a parent, so one yes covers
-- both sides.
--
-- A pending joiner gets no campaign_members row, so every RLS policy keyed on
-- membership keeps them out with no new condition anywhere. The request table
-- holds only pending requests: approving admits the joiner and deletes the
-- row, declining deletes it. Nothing is kept as history, because a declined
-- request is not a record anyone needs; the joiner may simply ask again, and
-- the emails that go with a request are rate-limited (notify-join-request).
--
-- Production held no child accounts when this shipped, so no existing
-- membership needed approving after the fact.

-- ── The requests ────────────────────────────────────────────────────────────

create table public.campaign_join_requests (
  id                         uuid primary key default gen_random_uuid(),
  campaign_id                uuid not null references public.campaigns (id) on delete cascade,
  -- The joiner. Named user_id so it reads like every other owned row.
  user_id                    uuid not null references auth.users (id) on delete cascade,
  role                       text not null,
  display_name               text not null,
  -- The invite the request came through, so a decline gives its seat back.
  invite_id                  uuid references public.campaign_invites (id) on delete set null,
  -- The character the joiner chose to bring (#730), attached on admission.
  party_member_id            uuid references public.party_members (id) on delete set null,
  -- Who must approve, fixed when the request is made. Null means no approval
  -- is needed from that side.
  joiner_parent_id           uuid references auth.users (id) on delete cascade,
  joiner_parent_approved_at  timestamptz,
  dm_parent_id               uuid references auth.users (id) on delete cascade,
  dm_parent_approved_at      timestamptz,
  -- Set by notify-join-request once each parent has been emailed, so a
  -- remounted join page never mails them twice. Per parent, because one may be
  -- skipped by the email rate limit while the other is reached.
  joiner_parent_notified_at  timestamptz,
  dm_parent_notified_at      timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (campaign_id, user_id),
  constraint campaign_join_requests_needs_an_approval
    check (joiner_parent_id is not null or dm_parent_id is not null)
);

create index campaign_join_requests_joiner_parent_idx on public.campaign_join_requests (joiner_parent_id);
create index campaign_join_requests_dm_parent_idx on public.campaign_join_requests (dm_parent_id);
create index campaign_join_requests_user_idx on public.campaign_join_requests (user_id);

create trigger campaign_join_requests_updated_at
  before update on public.campaign_join_requests
  for each row execute procedure update_updated_at();

alter table public.campaign_join_requests enable row level security;

-- ── Who must approve ────────────────────────────────────────────────────────

-- The parent whose child account p_user_id is, while it is still a child.
create or replace function private.parent_of_child(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.parent_user_id
    from public.child_accounts c
   where c.child_user_id = p_user_id
     and c.adult_on > current_date;
$$;

-- The request policy below calls it, so authenticated keeps EXECUTE; it lives
-- in private, which PostgREST does not expose (CLAUDE.md: relocation, not
-- revocation, keeps an RLS helper off the RPC surface).
revoke execute on function private.parent_of_child(uuid) from public, anon;
grant execute on function private.parent_of_child(uuid) to authenticated;

-- The parent of a campaign's owner, while the owner is a child. A definer, so
-- the request policy below can ask it for a campaign the caller cannot read:
-- a DM's parent is usually not at their child's table, and a lookup of
-- campaigns under their own RLS would come back empty.
create or replace function private.parent_of_campaign_owner(p_campaign_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select private.parent_of_child(k.user_id) from public.campaigns k where k.id = p_campaign_id;
$$;

revoke execute on function private.parent_of_campaign_owner(uuid) from public, anon;
grant execute on function private.parent_of_campaign_owner(uuid) to authenticated;

-- Readable by the joiner and by the parents who must approve, while they are
-- still that child's parent (a child who has come of age, or a link that is
-- gone, takes the row out of the old parent's sight). There are no write
-- policies: requests are made, approved and declined only through the definer
-- functions below, which is where the rules live.
create policy "campaign_join_requests_select" on public.campaign_join_requests
  for select using (
    (select auth.uid()) = user_id
    or ((select auth.uid()) = joiner_parent_id
        and private.parent_of_child(user_id) = (select auth.uid()))
    or ((select auth.uid()) = dm_parent_id
        and private.parent_of_campaign_owner(campaign_id) = (select auth.uid()))
  );

-- ── Membership is granted, never written ───────────────────────────────────

-- Until now campaign_members_dm_all let a campaign's DM insert, update and
-- delete any member row from the browser. No client inserts a member (every
-- insert is a definer function: create_dm_membership, consume_campaign_invite,
-- admit_campaign_member, the demo copy), but the policy allowed it, and a DM
-- inserting a row by hand, or re-pointing an existing row's user_id at another
-- account, skipped the whole approval above: a child DM could seat an adult, an
-- adult DM someone else's child. So the DM keeps update and delete, loses
-- insert, and no update of anyone's may move a row to another user or campaign.
drop policy if exists "campaign_members_dm_all" on public.campaign_members;

create policy "campaign_members_dm_update" on public.campaign_members
  for update using (private.is_campaign_dm(campaign_id))
  with check (private.is_campaign_dm(campaign_id));

create policy "campaign_members_dm_delete" on public.campaign_members
  for delete using (private.is_campaign_dm(campaign_id));

create or replace function public.guard_campaign_member_self_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- A membership row belongs to one person at one table, for everyone, the DM
  -- included: moving it is how a seat would be granted without an invite or a
  -- parent's yes (#927).
  if new.user_id is distinct from old.user_id
     or new.campaign_id is distinct from old.campaign_id then
    raise exception 'A membership cannot be moved to another person or campaign';
  end if;

  -- DMs of this campaign may change the rest (role, name, character).
  if private.is_campaign_dm(old.campaign_id) then
    return new;
  end if;

  -- Admission (private.admit_campaign_member) links the character the joiner
  -- chose, and has checked it is theirs. It runs as whoever gave the last yes,
  -- usually a parent, who owns no character here, so the per-caller check
  -- below would refuse every approval that brings one.
  if current_setting('grimoire.pm_campaign_transition', true) = 'on' then
    return new;
  end if;

  -- Non-DM self-update: role stays pinned to its prior value.
  if new.role is distinct from old.role then
    raise exception 'Not allowed to change role or campaign assignment';
  end if;

  -- party_member_id may change (claim / self-create / assume), but only to a
  -- character the player is allowed to take: same campaign, not owned by someone
  -- else, and not already claimed by another member. Clearing it is always allowed.
  if new.party_member_id is distinct from old.party_member_id
     and new.party_member_id is not null then

    if not exists (
      select 1 from public.party_members pm
      where pm.id = new.party_member_id
        and pm.campaign_id = new.campaign_id
        and (pm.owner_user_id is null or pm.owner_user_id = (select auth.uid()))
    ) then
      raise exception 'Cannot link a character from another campaign or owned by another player';
    end if;

    if exists (
      select 1 from public.campaign_members cm
      where cm.party_member_id = new.party_member_id
        and cm.id is distinct from new.id
    ) then
      raise exception 'That character is already claimed by another player';
    end if;
  end if;

  return new;
end;
$function$;

-- Admit a member: the membership row, and the character they chose to bring.
-- Shared by a direct join and by the last approval of a request. The character
-- is checked again here because time may have passed since the request: one
-- that has since gone to another campaign is left behind rather than blocking
-- the admission, and the player can attach another from the campaign.
create or replace function private.admit_campaign_member(
  p_campaign_id uuid, p_user_id uuid, p_role text, p_display_name text, p_party_member_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
  v_prev text := current_setting('grimoire.pm_campaign_transition', true);
begin
  insert into public.campaign_members (campaign_id, user_id, role, display_name)
  values (p_campaign_id, p_user_id, p_role, p_display_name)
  on conflict (campaign_id, user_id) do nothing;
  get diagnostics v_inserted = row_count;

  if p_party_member_id is not null then
    perform set_config('grimoire.pm_campaign_transition', 'on', true);
    update public.party_members
       set campaign_id = p_campaign_id
     where id = p_party_member_id
       and owner_user_id = p_user_id
       and campaign_id is null;
    update public.campaign_members m
       set party_member_id = p_party_member_id
     where m.campaign_id = p_campaign_id
       and m.user_id = p_user_id
       and m.party_member_id is null
       and exists (
         select 1 from public.party_members pm
          where pm.id = p_party_member_id
            and pm.campaign_id = p_campaign_id
            and pm.owner_user_id = p_user_id
       );
    perform set_config('grimoire.pm_campaign_transition', coalesce(v_prev, ''), true);
  end if;

  -- Whatever route admitted them, nothing is pending for them here any more
  -- (a request left from before a child came of age, say).
  delete from public.campaign_join_requests
   where campaign_id = p_campaign_id and user_id = p_user_id;

  return v_inserted > 0;
end;
$$;

revoke execute on function private.admit_campaign_member(uuid, uuid, text, text, uuid) from public, anon, authenticated;

-- Admit the joiner if nobody's yes is still owed, judged by the parent links
-- as they stand now rather than as the row recorded them: a side whose child
-- has come of age no longer needs a parent's say, and a request must never sit
-- waiting forever on a parent who can no longer answer it. True when admitted.
create or replace function private.settle_join_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.campaign_join_requests%rowtype;
begin
  select * into v_req from public.campaign_join_requests where id = p_request_id;
  if not found then
    return false;
  end if;

  if (v_req.joiner_parent_id is not null
      and v_req.joiner_parent_approved_at is null
      and private.parent_of_child(v_req.user_id) is not distinct from v_req.joiner_parent_id)
     or (v_req.dm_parent_id is not null
      and v_req.dm_parent_approved_at is null
      and private.parent_of_campaign_owner(v_req.campaign_id) is not distinct from v_req.dm_parent_id) then
    return false;
  end if;

  perform private.admit_campaign_member(
    v_req.campaign_id, v_req.user_id, v_req.role, v_req.display_name, v_req.party_member_id
  );
  return true;
end;
$$;

revoke execute on function private.settle_join_request(uuid) from public, anon, authenticated;

-- ── Joining ─────────────────────────────────────────────────────────────────

-- Replaces the #919 helper of the same name, which admitted unconditionally.
-- p_approving_parent is a parent acting for their child (join_campaign_for_child
-- has verified it), whose own approval therefore needs no second click.
--
-- Returns {status: 'joined' | 'pending', campaign_id, request_id?}.
drop function if exists private.consume_campaign_invite(uuid, uuid);

create or replace function private.consume_campaign_invite(
  p_token uuid, p_user_id uuid, p_party_member_id uuid, p_approving_parent uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.campaign_invites%rowtype;
  v_owner uuid;
  v_name text;
  v_joiner_parent uuid;
  v_dm_parent uuid;
  v_request_id uuid;
begin
  if p_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_invite from public.campaign_invites where token = p_token;
  if not found then
    raise exception 'Invalid or expired invite token';
  end if;

  select user_id into v_owner from public.campaigns where id = v_invite.campaign_id;

  if v_invite.role = 'player' and v_owner = p_user_id then
    raise exception 'Campaign owner cannot join as player';
  end if;

  v_name := coalesce(
    (select username from public.profiles where user_id = p_user_id),
    nullif(trim((select raw_user_meta_data->>'display_name' from auth.users where id = p_user_id)), ''),
    '(unnamed player)'
  );

  -- Already at the table: re-opening a link is never a new request, but a
  -- character chosen this time is still brought (the membership insert is a
  -- no-op; the attach is not). Checked before the invite's limits, so a member
  -- is never told their own table's link is dead.
  if exists (
    select 1 from public.campaign_members
     where campaign_id = v_invite.campaign_id and user_id = p_user_id
  ) then
    perform private.admit_campaign_member(v_invite.campaign_id, p_user_id, v_invite.role, v_name, p_party_member_id);
    return jsonb_build_object('status', 'joined', 'campaign_id', v_invite.campaign_id);
  end if;

  -- Already asked: the same request stands, whatever the invite's limits say
  -- now (on a single-use link the request itself took the one seat), and it is
  -- settled against today's parent links in case a side no longer applies.
  select id into v_request_id from public.campaign_join_requests
   where campaign_id = v_invite.campaign_id and user_id = p_user_id;
  if found then
    if p_party_member_id is not null then
      update public.campaign_join_requests set party_member_id = p_party_member_id where id = v_request_id;
    end if;
    if private.settle_join_request(v_request_id) then
      return jsonb_build_object('status', 'joined', 'campaign_id', v_invite.campaign_id);
    end if;
    return jsonb_build_object(
      'status', 'pending', 'campaign_id', v_invite.campaign_id, 'request_id', v_request_id
    );
  end if;

  if (v_invite.expires_at is not null and v_invite.expires_at <= now())
     or (v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses) then
    raise exception 'Invalid or expired invite token';
  end if;

  v_joiner_parent := private.parent_of_child(p_user_id);
  v_dm_parent := private.parent_of_child(v_owner);
  -- A parent who runs the campaign has already chosen to have their child there.
  if v_joiner_parent = v_owner then
    v_joiner_parent := null;
  end if;
  -- The DM's own parent joining their child's table needs nobody's say-so.
  if v_dm_parent = p_user_id then
    v_dm_parent := null;
  end if;

  if v_joiner_parent is null and v_dm_parent is null then
    if private.admit_campaign_member(v_invite.campaign_id, p_user_id, v_invite.role, v_name, p_party_member_id) then
      update public.campaign_invites set use_count = use_count + 1 where id = v_invite.id;
    end if;
    return jsonb_build_object('status', 'joined', 'campaign_id', v_invite.campaign_id);
  end if;

  -- A parent acting for their child approves their own side here, and if that
  -- was the only side, the child is simply admitted.
  if p_approving_parent is not null and p_approving_parent = v_joiner_parent
     and (v_dm_parent is null or v_dm_parent = p_approving_parent) then
    if private.admit_campaign_member(v_invite.campaign_id, p_user_id, v_invite.role, v_name, p_party_member_id) then
      update public.campaign_invites set use_count = use_count + 1 where id = v_invite.id;
    end if;
    return jsonb_build_object('status', 'joined', 'campaign_id', v_invite.campaign_id);
  end if;

  insert into public.campaign_join_requests (
    campaign_id, user_id, role, display_name, invite_id, party_member_id,
    joiner_parent_id, joiner_parent_approved_at, dm_parent_id
  )
  values (
    v_invite.campaign_id, p_user_id, v_invite.role, v_name, v_invite.id, p_party_member_id,
    v_joiner_parent,
    case when p_approving_parent is not null and p_approving_parent = v_joiner_parent then now() end,
    v_dm_parent
  )
  returning id into v_request_id;

  -- A capped invite counts the request as its use: the seat is spoken for
  -- while the parents decide.
  update public.campaign_invites set use_count = use_count + 1 where id = v_invite.id;

  return jsonb_build_object(
    'status', 'pending', 'campaign_id', v_invite.campaign_id, 'request_id', v_request_id
  );
end;
$$;

revoke execute on function private.consume_campaign_invite(uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- The return type changes from the campaign id to the status object, so the
-- old signature is dropped rather than replaced (rule 1: one path, every
-- caller updated in the same change).
drop function if exists public.join_campaign_via_invite(uuid, uuid);

create or replace function public.join_campaign_via_invite(p_token uuid, p_party_member_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_pm public.party_members%rowtype;
  v_campaign_id uuid;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select campaign_id into v_campaign_id from public.campaign_invites where token = p_token;
  if not found then
    raise exception 'Invalid or expired invite token';
  end if;

  -- The character is checked up front so a bad choice is refused now, not
  -- discovered when a parent approves days later (#730's rules: the caller's
  -- own character, and not already at another table).
  if p_party_member_id is not null then
    select * into v_pm from public.party_members where id = p_party_member_id;
    if not found then
      raise exception 'Character not found';
    end if;
    if v_pm.owner_user_id is distinct from v_caller then
      raise exception 'Only the character''s owner can bring it to a campaign';
    end if;
    if v_pm.campaign_id is not null and v_pm.campaign_id is distinct from v_campaign_id then
      raise exception 'Character is already in another campaign';
    end if;
  end if;

  return private.consume_campaign_invite(p_token, v_caller, p_party_member_id, null);
end;
$$;

revoke execute on function public.join_campaign_via_invite(uuid, uuid) from public, anon;
grant execute on function public.join_campaign_via_invite(uuid, uuid) to authenticated, service_role;

drop function if exists public.join_campaign_for_child(uuid, uuid);

-- Service-role only: the child-account edge function has verified that
-- p_parent_user_id is the caller and this child's parent. Not on the advisor's
-- definer count, which counts functions PostgREST lets a client reach.
create or replace function public.join_campaign_for_child(p_token uuid, p_child_user_id uuid, p_parent_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'join_campaign_for_child can only be called by service_role';
  end if;
  if private.parent_of_child(p_child_user_id) is distinct from p_parent_user_id then
    raise exception 'Not this child''s parent';
  end if;
  return private.consume_campaign_invite(p_token, p_child_user_id, null, p_parent_user_id);
end;
$$;

revoke execute on function public.join_campaign_for_child(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.join_campaign_for_child(uuid, uuid, uuid) to service_role;

-- ── Deciding ────────────────────────────────────────────────────────────────

-- Approve or decline, as one of the parents the request names. Returns
-- 'joined' when this was the last approval needed, 'pending' when the other
-- parent has still to say yes, and 'declined'.
create or replace function public.decide_campaign_join_request(p_request_id uuid, p_approve boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_req public.campaign_join_requests%rowtype;
  v_as_joiner_parent boolean;
  v_as_dm_parent boolean;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;
  if p_approve is null then
    raise exception 'Say yes or no';
  end if;

  select * into v_req from public.campaign_join_requests where id = p_request_id for update;
  if not found then
    raise exception 'Request not found';
  end if;

  -- Re-derived rather than trusted from the row: the link must still hold now
  -- (a child who has come of age, or a parent link removed, no longer counts).
  v_as_joiner_parent := v_req.joiner_parent_id = v_caller
    and private.parent_of_child(v_req.user_id) is not distinct from v_caller;
  v_as_dm_parent := v_req.dm_parent_id = v_caller
    and private.parent_of_campaign_owner(v_req.campaign_id) is not distinct from v_caller;

  if not coalesce(v_as_joiner_parent, false) and not coalesce(v_as_dm_parent, false) then
    raise exception 'Not authorized';
  end if;

  if not p_approve then
    delete from public.campaign_join_requests where id = v_req.id;
    -- The request took a seat on a capped invite; a no gives it back, so a
    -- child asking again after each no cannot use a link up.
    update public.campaign_invites
       set use_count = greatest(use_count - 1, 0)
     where id = v_req.invite_id;
    return 'declined';
  end if;

  update public.campaign_join_requests
     set joiner_parent_approved_at = case when coalesce(v_as_joiner_parent, false)
                                          then coalesce(joiner_parent_approved_at, now())
                                          else joiner_parent_approved_at end,
         dm_parent_approved_at     = case when coalesce(v_as_dm_parent, false)
                                          then coalesce(dm_parent_approved_at, now())
                                          else dm_parent_approved_at end
   where id = v_req.id
  returning * into v_req;

  if private.settle_join_request(v_req.id) then
    return 'joined';
  end if;

  return 'pending';
end;
$$;

revoke execute on function public.decide_campaign_join_request(uuid, boolean) from public, anon;
grant execute on function public.decide_campaign_join_request(uuid, boolean) to authenticated, service_role;

-- ── Removing ────────────────────────────────────────────────────────────────

-- A parent can take their child out of any campaign, and take anyone out of a
-- campaign their child runs (they approved them, so they can un-approve them).
-- The campaign's owner is never removed this way; deleting the campaign is the
-- DM's own act. Deleting the membership row is all a removal is: the existing
-- triggers detach the member's characters and ring the campaign's live sync.
create or replace function public.remove_from_family_campaign(p_campaign_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_owner uuid;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select user_id into v_owner from public.campaigns where id = p_campaign_id;
  if v_owner is null then
    raise exception 'Campaign not found';
  end if;
  if p_user_id = v_owner then
    raise exception 'The campaign''s owner cannot be removed';
  end if;

  if private.parent_of_child(p_user_id) is distinct from v_caller
     and private.parent_of_child(v_owner) is distinct from v_caller then
    raise exception 'Not authorized';
  end if;

  delete from public.campaign_members where campaign_id = p_campaign_id and user_id = p_user_id;
end;
$$;

revoke execute on function public.remove_from_family_campaign(uuid, uuid) from public, anon;
grant execute on function public.remove_from_family_campaign(uuid, uuid) to authenticated, service_role;

-- ── The Family page's read ──────────────────────────────────────────────────

-- For the calling parent: each of their children's campaigns and who is at
-- each table, and the requests waiting on the caller. A parent is not a member
-- of those campaigns, so RLS would show them nothing; this is the one read
-- that shows a parent exactly their own children's tables and nothing else.
-- Names are the display names members chose for that campaign.
create or replace function public.get_family_campaigns()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  return jsonb_build_object(
    'children', coalesce((
      select jsonb_agg(jsonb_build_object(
        'child_user_id', c.child_user_id,
        'campaigns', coalesce((
          select jsonb_agg(jsonb_build_object(
            'campaign_id', k.id,
            'name', k.name,
            'child_role', m.role,
            'child_runs_it', k.user_id = c.child_user_id,
            'members', (
              select jsonb_agg(jsonb_build_object(
                'user_id', o.user_id,
                -- The same fallback a join records, so a member row with no
                -- name still reads as someone.
                'display_name', coalesce(
                  o.display_name,
                  (select pr.username from public.profiles pr where pr.user_id = o.user_id),
                  '(unnamed player)'
                ),
                'role', o.role,
                'is_owner', o.user_id = k.user_id,
                'is_young_player', private.parent_of_child(o.user_id) is not null,
                'is_you', o.user_id = v_caller
              ) order by (o.user_id = k.user_id) desc, o.display_name)
              from public.campaign_members o
              where o.campaign_id = k.id
            )
          ) order by k.name)
          from public.campaign_members m
          join public.campaigns k on k.id = m.campaign_id
          where m.user_id = c.child_user_id
        ), '[]'::jsonb)
      ) order by c.consented_at)
      from public.child_accounts c
      where c.parent_user_id = v_caller
        and c.adult_on > current_date
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'request_id', r.id,
        'campaign_id', r.campaign_id,
        'campaign_name', k.name,
        'joiner_user_id', r.user_id,
        'joiner_name', r.display_name,
        'joiner_is_young_player', r.joiner_parent_id is not null,
        -- Which of the caller's children this concerns, and how.
        'child_user_id', case when r.joiner_parent_id = v_caller then r.user_id else k.user_id end,
        'kind', case when r.joiner_parent_id = v_caller then 'child_joining' else 'joining_child_campaign' end,
        -- Null only when the owner has neither a named member row nor a
        -- profile name; the page then names just the campaign.
        'dm_name', coalesce(
          (select o.display_name from public.campaign_members o
            where o.campaign_id = k.id and o.user_id = k.user_id),
          (select pr.username from public.profiles pr where pr.user_id = k.user_id)
        ),
        'waiting_on_other_parent',
          (r.joiner_parent_id = v_caller and r.joiner_parent_approved_at is not null)
          or (r.dm_parent_id = v_caller and r.dm_parent_approved_at is not null),
        'created_at', r.created_at
      ) order by r.created_at)
      from public.campaign_join_requests r
      join public.campaigns k on k.id = r.campaign_id
      where (r.joiner_parent_id = v_caller and private.parent_of_child(r.user_id) = v_caller)
         or (r.dm_parent_id = v_caller and private.parent_of_child(k.user_id) = v_caller)
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_family_campaigns() from public, anon;
grant execute on function public.get_family_campaigns() to authenticated, service_role;

-- ── The demo copy ───────────────────────────────────────────────────────────

-- A request names real people (a joiner and their parents); a demo copy is one
-- person's sandbox and never carries anyone else.
insert into private.demo_campaign_tables (table_name, tier, parent_column, parent_table, copy, defer_columns, reason)
values ('campaign_join_requests', 1, null, null, false, '{}', 'pending joins name other accounts and their parents');
