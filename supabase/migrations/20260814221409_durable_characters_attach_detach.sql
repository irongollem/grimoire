-- Migration: durable_characters_attach_detach
-- A character is OF a player (#730): it exists independently of any campaign
-- (campaign_id has been nullable since the initial schema) and is *linked* to
-- at most one campaign at a time. This migration makes that linkage durable
-- and gated:
--
--   * campaign_id transitions become RPC-only (guard trigger below). Before
--     this, any owner could client-side UPDATE campaign_id to an arbitrary
--     campaign uuid, and INSERT a character straight into a campaign they
--     were never invited to — both closed here.
--   * attach_party_member_to_campaign / detach_party_member_from_campaign /
--     join_campaign_via_invite(p_token, p_party_member_id) are the three
--     doors. All SECURITY DEFINER, all re-derive identity from auth.uid()
--     as their first act (see CLAUDE.md SECURITY DEFINER rules).
--   * Detach, never delete: removing a player from a campaign (or deleting
--     the campaign) returns their characters to their personal pool with
--     progression intact. A claimed character can no longer be deleted by
--     the campaign DM or the row's creator — only by its owner.
--   * clone_party_member copies a character (sheet + classes + spells) into
--     the caller's pool, for bringing "the same" character to another table.
--     One character links to one campaign; the clones diverge, on purpose.
--
-- Advisor bookkeeping: this adds three authenticated-reachable SECURITY
-- DEFINER RPCs (attach/detach/clone) and re-creates join_campaign_via_invite
-- with a second defaulted argument. That grows the *_security_definer_function_
-- executable baseline (87 as of 12 Aug 2026) in the documented direction:
-- write paths moving into gated RPCs. Each authorizes internally; none is
-- anon-reachable.

-- ---------------------------------------------------------------------------
-- 0. Backfill: characters stranded in campaigns their owner already left.
-- Before the removal-detach trigger existed, removing a player deleted the
-- membership row and left their character attached. Apply the new invariant
-- retroactively (runs before the guard trigger is created, so no flag needed).
-- ---------------------------------------------------------------------------

update public.party_members pm
   set campaign_id = null,
       current_initiative = null,
       current_location_id = null
 where pm.campaign_id is not null
   and pm.owner_user_id is not null
   and not exists (
     select 1 from public.campaign_members cm
      where cm.campaign_id = pm.campaign_id
        and cm.user_id = pm.owner_user_id
   );

-- ---------------------------------------------------------------------------
-- 1. Guard: campaign_id changes only through the RPCs below.
-- The FK campaigns(id) ON DELETE SET NULL fires this trigger while the
-- campaign row is already deleted; that referential action must pass, or
-- campaign deletion breaks. Everything else needs the transaction-local flag
-- (same mechanism as grimoire.bypass_quota in transfer_campaign_ownership:
-- set_config lives in pg_catalog and PostgREST exposes only public, so a
-- client cannot reach it).
-- ---------------------------------------------------------------------------

create or replace function public.guard_party_member_campaign_transition()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.campaign_id is not distinct from old.campaign_id then
    return new;
  end if;

  if current_setting('grimoire.pm_campaign_transition', true) = 'on' then
    return new;
  end if;

  -- campaigns row already gone: this is the FK's ON DELETE SET NULL action.
  if new.campaign_id is null and not exists (
    select 1 from public.campaigns c where c.id = old.campaign_id
  ) then
    return new;
  end if;

  raise exception 'Characters join or leave a campaign only via attach_party_member_to_campaign, detach_party_member_from_campaign, or join_campaign_via_invite';
end;
$$;

revoke execute on function public.guard_party_member_campaign_transition() from public, anon, authenticated;

create trigger party_members_guard_campaign_transition
  before update of campaign_id on public.party_members
  for each row execute procedure public.guard_party_member_campaign_transition();

-- ---------------------------------------------------------------------------
-- 2. Removing a member detaches their characters (all removal paths: the
-- MembersTab delete, and the campaign_members cascade when a campaign is
-- deleted). DM-managed characters (owner_user_id is null) stay put — they
-- belong to the campaign, not to the removed player.
--
-- During *account* deletion this trigger races party_members.owner_user_id's
-- own ON DELETE SET NULL: depending on cascade order the character either
-- detaches (owner still set when this runs) or stays attached as newly
-- unclaimed DM roster (owner already nulled). Both end states are safe and
-- reachable from the other via attach/detach, so the ordering is not pinned.
-- ---------------------------------------------------------------------------

create or replace function public.detach_characters_on_membership_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_prev text := current_setting('grimoire.pm_campaign_transition', true);
begin
  perform set_config('grimoire.pm_campaign_transition', 'on', true);
  update public.party_members pm
     set campaign_id = null,
         current_initiative = null,
         current_location_id = null
   where pm.campaign_id = old.campaign_id
     and pm.owner_user_id = old.user_id;
  perform set_config('grimoire.pm_campaign_transition', coalesce(v_prev, ''), true);
  return old;
end;
$$;

revoke execute on function public.detach_characters_on_membership_delete() from public, anon, authenticated;

create trigger campaign_members_detach_characters
  after delete on public.campaign_members
  for each row execute procedure public.detach_characters_on_membership_delete();

-- ---------------------------------------------------------------------------
-- 3. Policy rework on party_members.
--
-- The blanket creator policy ("owner full access", ALL on user_id) is split
-- into per-command policies so DELETE can carry a different predicate: once
-- another player has claimed a character (owner_user_id set), neither the
-- creator nor the campaign DM may delete it — detaching is the only way it
-- leaves a campaign, and only the owner may destroy it.
--
-- INSERT/UPDATE additionally pin campaign_id to campaigns the writer is a
-- member of (or null). Insertion into a foreign campaign was possible before;
-- update transitions are already blocked by the guard trigger, so the WITH
-- CHECK here is belt-and-suspenders.
--
-- NOTE for the account-deletion cascade: party_members.user_id references
-- auth.users ON DELETE CASCADE, so deleting a *creator's* account still
-- destroys characters claimed by other players. That FK predates this
-- migration and re-pointing it touches the erasure flow — tracked as its own
-- issue (filed alongside this migration), not silently absorbed here.
-- ---------------------------------------------------------------------------

drop policy "party_members: owner full access" on public.party_members;

create policy "party_members_creator_select" on public.party_members
  for select using ((select auth.uid()) = user_id);

create policy "party_members_creator_insert" on public.party_members
  for insert with check (
    ((select auth.uid()) = user_id)
    and (campaign_id is null or private.is_campaign_member(campaign_id))
  );

create policy "party_members_creator_update" on public.party_members
  for update
  using ((select auth.uid()) = user_id)
  with check (
    ((select auth.uid()) = user_id)
    and (campaign_id is null or private.is_campaign_member(campaign_id))
  );

create policy "party_members_creator_delete" on public.party_members
  for delete using (
    ((select auth.uid()) = user_id)
    and (owner_user_id is null or owner_user_id = (select auth.uid()))
  );

drop policy "party_members_player_insert" on public.party_members;

create policy "party_members_player_insert" on public.party_members
  for insert with check (
    (
      ((select auth.uid()) = owner_user_id)
      and (campaign_id is null or private.is_campaign_member(campaign_id))
    )
    or ((campaign_id is not null) and private.is_campaign_dm(campaign_id))
  );

drop policy "party_members_player_delete" on public.party_members;

create policy "party_members_player_delete" on public.party_members
  for delete using (
    ((select auth.uid()) = owner_user_id)
    or (
      (campaign_id is not null)
      and private.is_campaign_dm(campaign_id)
      and owner_user_id is null
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Attach: bring an unattached character into a campaign the caller
-- belongs to. p_set_active links it as the caller's active character only
-- when their membership has none — switching an already-active character
-- stays the Champions view's client-side concern (guarded by
-- campaign_members_guard_self_update).
-- ---------------------------------------------------------------------------

create or replace function public.attach_party_member_to_campaign(
  p_party_member_id uuid,
  p_campaign_id uuid,
  p_set_active boolean default true
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_pm public.party_members%rowtype;
  v_prev text := current_setting('grimoire.pm_campaign_transition', true);
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_pm from public.party_members where id = p_party_member_id;
  if not found then
    raise exception 'Character not found';
  end if;

  -- The owner attaches their character; a DM may attach an unclaimed
  -- character they created (DM-managed roster work). coalesce makes the
  -- predicate total (CLAUDE.md SECURITY DEFINER item 3): for an unclaimed row
  -- owner_user_id is NULL, `NULL = v_uid` is NULL, `NULL or false` is NULL,
  -- and `if not NULL` never raises — the exact case an attacker is in.
  if not coalesce(
    v_pm.owner_user_id = v_uid
      or (v_pm.owner_user_id is null and v_pm.user_id = v_uid),
    false
  ) then
    raise exception 'Only the character''s owner can attach it';
  end if;

  if v_pm.campaign_id is not null then
    raise exception 'Character is already in a campaign — detach it first';
  end if;

  if not private.is_campaign_member(p_campaign_id) then
    raise exception 'You are not a member of that campaign';
  end if;

  perform set_config('grimoire.pm_campaign_transition', 'on', true);
  update public.party_members
     set campaign_id = p_campaign_id
   where id = p_party_member_id;

  if p_set_active then
    update public.campaign_members
       set party_member_id = p_party_member_id
     where campaign_id = p_campaign_id
       and user_id = v_uid
       and party_member_id is null;
  end if;
  perform set_config('grimoire.pm_campaign_transition', coalesce(v_prev, ''), true);
end;
$$;

revoke execute on function public.attach_party_member_to_campaign(uuid, uuid, boolean) from public, anon;
grant execute on function public.attach_party_member_to_campaign(uuid, uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Detach: return a character to its owner's pool. Idempotent. The
-- campaign DM may also detach (that is "remove this character from my
-- table" — the durable replacement for deleting it). Campaign-bound
-- pointers are cleared; progression (level, XP, HP, gold, classes, spells)
-- travels with the character.
-- ---------------------------------------------------------------------------

create or replace function public.detach_party_member_from_campaign(
  p_party_member_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_pm public.party_members%rowtype;
  v_prev text := current_setting('grimoire.pm_campaign_transition', true);
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_pm from public.party_members where id = p_party_member_id;
  if not found then
    raise exception 'Character not found';
  end if;

  if v_pm.campaign_id is null then
    return; -- already detached
  end if;

  -- Total predicate (see attach): the owner term is NULL for unclaimed rows,
  -- and NULL propagates through the ORs unless a later term is true.
  if not coalesce(
    v_pm.owner_user_id = v_uid
      or (v_pm.owner_user_id is null and v_pm.user_id = v_uid)
      or private.is_campaign_dm(v_pm.campaign_id),
    false
  ) then
    raise exception 'Only the character''s owner or the campaign DM can detach it';
  end if;

  update public.campaign_members
     set party_member_id = null
   where party_member_id = p_party_member_id;

  perform set_config('grimoire.pm_campaign_transition', 'on', true);
  update public.party_members
     set campaign_id = null,
         current_initiative = null,
         current_location_id = null
   where id = p_party_member_id;
  perform set_config('grimoire.pm_campaign_transition', coalesce(v_prev, ''), true);
end;
$$;

revoke execute on function public.detach_party_member_from_campaign(uuid) from public, anon;
grant execute on function public.detach_party_member_from_campaign(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Clone: copy a character into the caller's pool, unattached. Copies the
-- party_members row (jsonb round-trip, so future columns are copied without
-- editing this function), character_classes, and character_spells —
-- source_class_id is remapped to the cloned class rows, or nulled when the
-- source row no longer exists. Campaign-bound satellites (inventory —
-- item_id points into the campaign's vault —, companions, tracker state,
-- pinned wild-shape forms, notes, downtime) deliberately do not travel:
-- they reference campaign-scoped content the new table does not have.
-- ---------------------------------------------------------------------------

create or replace function public.clone_party_member(
  p_party_member_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_pm public.party_members%rowtype;
  v_new_id uuid := gen_random_uuid();
  v_new jsonb;
  v_class record;
  v_new_class_id uuid;
  v_class_map jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_pm from public.party_members where id = p_party_member_id;
  if not found then
    raise exception 'Character not found';
  end if;

  -- Total predicate (see attach), and deliberately narrower than "owner or
  -- creator": once a player has claimed a character, nobody else — the
  -- creating DM included — may copy their sheet into another pool.
  if not coalesce(
    v_pm.owner_user_id = v_uid
      or (v_pm.owner_user_id is null and v_pm.user_id = v_uid),
    false
  ) then
    raise exception 'Only the character''s owner can clone it';
  end if;

  v_new := to_jsonb(v_pm) || jsonb_build_object(
    'id', v_new_id,
    'user_id', v_uid,
    'owner_user_id', v_uid,
    'is_dm_managed', false,
    'campaign_id', null,
    'name', v_pm.name || ' (copy)',
    'current_initiative', null,
    'current_location_id', null,
    'concentration', null,
    'wildshape_state', null,
    'sort_order', 0,
    'created_at', now(),
    'updated_at', now()
  );

  insert into public.party_members
    select (jsonb_populate_record(null::public.party_members, v_new)).*;

  for v_class in
    select * from public.character_classes
     where party_member_id = p_party_member_id
     order by sort_order
  loop
    insert into public.character_classes
      (party_member_id, class_name, subclass_name, levels, is_primary, hit_dice_used, sort_order)
    values
      (v_new_id, v_class.class_name, v_class.subclass_name, v_class.levels,
       v_class.is_primary, v_class.hit_dice_used, v_class.sort_order)
    returning id into v_new_class_id;
    v_class_map := v_class_map
      || jsonb_build_object(v_class.id::text, v_new_class_id::text);
  end loop;

  insert into public.character_spells
    (party_member_id, spell_id, is_known, is_prepared, source_class_id,
     source_type, uses_per_day, uses_remaining, resets_on, source_label)
  select v_new_id, cs.spell_id, cs.is_known, cs.is_prepared,
         (v_class_map ->> cs.source_class_id::text)::uuid,
         cs.source_type, cs.uses_per_day, cs.uses_remaining, cs.resets_on,
         cs.source_label
    from public.character_spells cs
   where cs.party_member_id = p_party_member_id;

  return v_new_id;
end;
$$;

revoke execute on function public.clone_party_member(uuid) from public, anon;
grant execute on function public.clone_party_member(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. join_campaign_via_invite gains an optional character to bring along.
-- Dropped and recreated (not overloaded) so pg_proc keeps exactly one row
-- for the name — supabase/tests/identity_not_from_email.test.sql looks the
-- function up by proname, and PostgREST overload dispatch is a foot-gun.
-- Body is unchanged apart from the binding block at the end; the display-name
-- fallback chain still never touches the email (#635).
-- ---------------------------------------------------------------------------

drop function public.join_campaign_via_invite(uuid);

create or replace function public.join_campaign_via_invite(
  p_token uuid,
  p_party_member_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_invite public.campaign_invites%rowtype;
  v_inserted integer;
  v_pm public.party_members%rowtype;
  v_prev text := current_setting('grimoire.pm_campaign_transition', true);
begin
  select * into v_invite
  from public.campaign_invites
  where token = p_token
    and (expires_at is null or expires_at > now())
    and (max_uses is null or use_count < max_uses);

  if not found then
    raise exception 'Invalid or expired invite token';
  end if;

  if v_invite.role = 'player' and exists (
    select 1 from public.campaigns
    where id = v_invite.campaign_id and user_id = auth.uid()
  ) then
    raise exception 'Campaign owner cannot join as player';
  end if;

  insert into public.campaign_members (campaign_id, user_id, role, display_name)
  values (
    v_invite.campaign_id,
    auth.uid(),
    v_invite.role,
    coalesce(
      (select username from public.profiles where user_id = auth.uid()),
      nullif(trim((select raw_user_meta_data->>'display_name' from auth.users where id = auth.uid())), ''),
      '(unnamed player)'
    )
  )
  on conflict (campaign_id, user_id) do nothing;

  -- Only count a use when a new membership row was actually created; a no-op
  -- re-join (existing member re-opening the link, or a page remount) must not
  -- decrement a capped invite's remaining uses.
  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    update public.campaign_invites
    set use_count = use_count + 1
    where id = v_invite.id;
  end if;

  -- Optionally bring a character from the caller's pool (#730). Idempotent
  -- across re-joins: a character already attached to *this* campaign is fine,
  -- one attached elsewhere is refused, and an existing active character is
  -- never clobbered.
  if p_party_member_id is not null then
    select * into v_pm from public.party_members where id = p_party_member_id;
    if not found then
      raise exception 'Character not found';
    end if;
    if v_pm.owner_user_id is distinct from auth.uid() then
      raise exception 'Only the character''s owner can bring it to a campaign';
    end if;
    if v_pm.campaign_id is not null and v_pm.campaign_id <> v_invite.campaign_id then
      raise exception 'Character is already in another campaign';
    end if;

    perform set_config('grimoire.pm_campaign_transition', 'on', true);
    update public.party_members
       set campaign_id = v_invite.campaign_id
     where id = p_party_member_id
       and campaign_id is null;

    update public.campaign_members
       set party_member_id = p_party_member_id
     where campaign_id = v_invite.campaign_id
       and user_id = auth.uid()
       and party_member_id is null;
    perform set_config('grimoire.pm_campaign_transition', coalesce(v_prev, ''), true);
  end if;

  return v_invite.campaign_id;
end;
$$;

-- Recreating the function resets grants to the PUBLIC default; redo the
-- hardening from 20260615000004/20260615000006.
revoke execute on function public.join_campaign_via_invite(uuid, uuid) from public, anon;
grant execute on function public.join_campaign_via_invite(uuid, uuid) to authenticated, service_role;
