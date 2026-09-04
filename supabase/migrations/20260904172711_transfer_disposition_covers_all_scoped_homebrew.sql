-- The transfer's scoped-copy disposition missed the two kinds that go nowhere.
-- Issue #801.
--
-- `transfer_campaign_ownership` already asks the outgoing owner what should
-- happen to their campaign-scoped originals — promote, reassign or delete —
-- and that mechanism is right. What it missed is narrower than it first looks,
-- because the transfer actually sorts DM-owned content three ways:
--
--   1. CLONED, then dispositioned. `monsters` and `traps`: the recipient gets
--      fresh copies scoped to the campaign, and the outgoing owner is asked
--      what to do with theirs.
--   2. HANDED OVER wholesale, via `set user_id = p_new_owner_id`. Thirty-six
--      tables, including quests, notes, locations, encounters, puzzle_rooms,
--      roll_tables and the whole custom_classes / custom_subclasses /
--      class_features trio. Nothing is stranded: the rows change hands.
--   3. NEITHER. Exactly two: `dungeon_maps` and `dungeon_features`.
--
-- Category 3 is the bug. Those originals kept pointing at a campaign their
-- author no longer owns (#630), with two consequences: the previous owner's
-- maps and features stay filtered to a campaign they cannot open, so they
-- appear to have vanished; and because those FKs are NO ACTION, deliberately
-- (#585/#597), the new owner's later *account* deletion aborts with a 23503 and
-- no route forward — `campaigns` cascades away, the previous owner's rows
-- survive on a different user's cascade, and the constraint refuses.
--
-- Adding only these two is the point. An earlier draft of this migration added
-- all six tables outside category 1, which was wrong: the four in category 2
-- have already changed hands by the time the disposition runs, so
-- `where user_id = v_owner` matches nothing. Harmless, but it would have
-- claimed in code that those tables needed disposition when they do not.
--
-- Not cloning maps and features is deliberate and unchanged. `TransferOwnership
-- Panel` states outright that Cartographer maps stay with the outgoing DM;
-- releasing the originals is what makes that true rather than merely stated.
-- It costs the incoming owner nothing they could see either: both are
-- owner-scoped on SELECT, so a new owner never had access to those rows
-- whatever `campaign_id` said.
--
-- ── Read the live definition, by signature ─────────────────────────────────
--
-- This body came from `pg_get_functiondef` on the live database and was patched
-- in three places; it is otherwise byte-identical. Rebuilding a function from
-- the migration that *created* it silently reverts every migration that
-- replaced it since — exactly what happened in #789, and it passed the whole
-- suite because no test covered the reverted behaviour.
--
-- Two overloads exist. The 3-argument one is the 37k-character transfer itself;
-- this 5-argument one is a thin wrapper that calls it and then applies the
-- disposition. Only the wrapper is granted to `authenticated` — the bare one is
-- revoked from authenticated and anon — so it is the only reachable path and
-- the only one to patch. Note `pg_get_functiondef` on the *name* returns both
-- concatenated and is not runnable; address the overload by signature.

CREATE OR REPLACE FUNCTION public.transfer_campaign_ownership(p_campaign_id uuid, p_new_owner_id uuid, p_leave_campaign boolean, p_scoped_copy_disposition text, p_reassign_campaign_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  r       record;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_scoped_copy_disposition not in ('promote', 'reassign', 'delete') then
    raise exception 'Invalid scoped-copy disposition: %, expected ''promote'', ''reassign'' or ''delete''',
      p_scoped_copy_disposition;
  end if;

  select user_id into v_owner
  from public.campaigns
  where id = p_campaign_id;

  if v_owner is null then
    raise exception 'Campaign not found';
  end if;

  if v_owner <> v_uid then
    raise exception 'Only the campaign owner can transfer it';
  end if;

  -- Reassign needs a target campaign the caller still owns, and that target
  -- cannot be the very campaign being handed over. Every other disposition
  -- must NOT carry a reassign target -- a caller passing one alongside
  -- 'promote'/'delete' almost certainly meant something the RPC silently
  -- ignoring it would hide, so it is rejected instead.
  if p_scoped_copy_disposition = 'reassign' then
    if p_reassign_campaign_id is null then
      raise exception 'Reassigning scoped homebrew requires a target campaign';
    end if;
    if p_reassign_campaign_id = p_campaign_id then
      raise exception 'Cannot reassign scoped homebrew to the campaign being transferred';
    end if;
    if not exists (
      select 1 from public.campaigns c
      where c.id = p_reassign_campaign_id and c.user_id = v_uid
    ) then
      raise exception 'Reassign target must be a campaign you own';
    end if;
  elsif p_reassign_campaign_id is not null then
    raise exception 'A reassign target is only valid with the ''reassign'' disposition';
  end if;

  -- These inserts are part of a transfer, not user-created quota consumption.
  -- The delegated function sets the same transaction-local flag, but these
  -- copies happen first.
  perform set_config('grimoire.bypass_quota', 'on', true);

  -- The established function clones the reachable set (private.
  -- campaign_referenced_monster_ids / _trap_ids, #630). Copy only scoped rows
  -- OUTSIDE that set here, avoiding duplicate clones while ensuring newly
  -- authored, not-yet-used campaign creatures travel with the campaign.
  --
  -- NOT EXISTS rather than NOT IN against the helper's result set: the
  -- reachable-ids union includes an unnest() of campaigns.excluded_monster_ids
  -- with no NOT NULL guarantee on its elements, and `x NOT IN (subquery)`
  -- silently matches nothing at all if that subquery ever produces one null
  -- row. NOT EXISTS has no such trap.
  for r in
    select m.*
    from public.monsters m
    where m.user_id = v_owner
      and m.campaign_id = p_campaign_id
      and not exists (
        select 1 from private.campaign_referenced_monster_ids(p_campaign_id) rid
        where rid = m.id
      )
  loop
    insert into public.monsters
    select (jsonb_populate_record(
      null::public.monsters,
      to_jsonb(r) || jsonb_build_object(
        'id', gen_random_uuid(),
        'user_id', p_new_owner_id
      )
    )).*;
  end loop;

  for r in
    select t.*
    from public.traps t
    where t.user_id = v_owner
      and t.campaign_id = p_campaign_id
      and not exists (
        select 1 from private.campaign_referenced_trap_ids(p_campaign_id) rid
        where rid = t.id
      )
  loop
    insert into public.traps
    select (jsonb_populate_record(
      null::public.traps,
      to_jsonb(r) || jsonb_build_object(
        'id', gen_random_uuid(),
        'user_id', p_new_owner_id
      )
    )).*;
  end loop;

  -- Performs authorization of the recipient, clones reachable library rows
  -- (now including quest-referenced monsters, #630), repoints every
  -- reference, moves campaign-owned content and swaps roles.
  perform public.transfer_campaign_ownership(
    p_campaign_id,
    p_new_owner_id,
    p_leave_campaign
  );

  -- References from the transferred campaign now target the recipient's
  -- clones. Only the old owner's originals are resolved here; the fresh copies
  -- stay scoped to the transferred campaign.
  if p_scoped_copy_disposition = 'promote' then
    update public.monsters
       set campaign_id = null
     where user_id = v_owner and campaign_id = p_campaign_id;
    update public.traps
       set campaign_id = null
     where user_id = v_owner and campaign_id = p_campaign_id;
    update public.dungeon_maps
       set campaign_id = null
     where user_id = v_owner and campaign_id = p_campaign_id;
    update public.dungeon_features
       set campaign_id = null
     where user_id = v_owner and campaign_id = p_campaign_id;
  elsif p_scoped_copy_disposition = 'reassign' then
    update public.monsters
       set campaign_id = p_reassign_campaign_id
     where user_id = v_owner and campaign_id = p_campaign_id;
    update public.traps
       set campaign_id = p_reassign_campaign_id
     where user_id = v_owner and campaign_id = p_campaign_id;
    update public.dungeon_maps
       set campaign_id = p_reassign_campaign_id
     where user_id = v_owner and campaign_id = p_campaign_id;
    update public.dungeon_features
       set campaign_id = p_reassign_campaign_id
     where user_id = v_owner and campaign_id = p_campaign_id;
  else
    delete from public.monsters
     where user_id = v_owner and campaign_id = p_campaign_id;
    delete from public.traps
     where user_id = v_owner and campaign_id = p_campaign_id;
    delete from public.dungeon_maps
     where user_id = v_owner and campaign_id = p_campaign_id;
    delete from public.dungeon_features
     where user_id = v_owner and campaign_id = p_campaign_id;
  end if;
end;
$function$;
