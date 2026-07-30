-- Migration: reorder_sort_order_rpc
--
-- Replaces the "N queries" drag-to-reorder fan-out (Promise.all of one
-- `update ... set sort_order = ... where id = ...` per row) with one
-- SECURITY DEFINER RPC per table, each doing the whole reorder as a single
-- `update ... from unnest(...)` statement.
--
-- One RPC per table (not one generic `reorder_rows(p_table text, ...)`)
-- because the 5 tables use two different ownership models:
--   - notes, player_journal_entries, soundboard_pages, sounds: user_id = auth.uid()
--   - party_inventory: private.is_campaign_member(campaign_id) (shared party
--     resource — any campaign member, including the DM via campaign_members
--     role='dm', may reorder it; matches the existing UPDATE RLS policy)
-- A single generic function would either have to interpolate the ownership
-- predicate too (worse) or apply the wrong predicate to party_inventory.
--
-- Each function's FIRST act is re-deriving identity from auth.uid() (never
-- a caller-supplied id), then verifies the caller may write EVERY id in
-- p_ids before writing anything — if any id fails the ownership check the
-- whole call raises and nothing changes.
--
-- The ownership predicate is then repeated in the UPDATE's WHERE clause. That
-- is deliberate belt-and-braces: the gate and the update are two statements, so
-- at READ COMMITTED another transaction could in principle change a row's
-- ownership in between. Repeating it means such a row is skipped rather than
-- written. These are SECURITY DEFINER and so bypass RLS entirely, which is
-- exactly why the predicate must be stated here rather than assumed.

-- ── notes ────────────────────────────────────────────────────────────────

create or replace function public.reorder_notes(p_ids uuid[], p_orders integer[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return;
  end if;
  if array_length(p_ids, 1) is distinct from array_length(p_orders, 1) then
    raise exception 'p_ids and p_orders must be the same length';
  end if;

  if exists (
    select 1
    from unnest(p_ids) as want(id)
    where not exists (
      select 1 from public.notes n where n.id = want.id and n.user_id = v_uid
    )
  ) then
    raise exception 'Not authorized to reorder one or more of the given notes';
  end if;

  update public.notes as t
  set sort_order = d.ord
  from unnest(p_ids, p_orders) as d(id, ord)
  where t.id = d.id and t.user_id = v_uid;
end;
$$;

revoke execute on function public.reorder_notes(uuid[], integer[]) from public, anon;
grant execute on function public.reorder_notes(uuid[], integer[]) to authenticated, service_role;

-- ── player_journal_entries ──────────────────────────────────────────────

create or replace function public.reorder_player_journal_entries(p_ids uuid[], p_orders integer[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return;
  end if;
  if array_length(p_ids, 1) is distinct from array_length(p_orders, 1) then
    raise exception 'p_ids and p_orders must be the same length';
  end if;

  if exists (
    select 1
    from unnest(p_ids) as want(id)
    where not exists (
      select 1 from public.player_journal_entries e where e.id = want.id and e.user_id = v_uid
    )
  ) then
    raise exception 'Not authorized to reorder one or more of the given journal entries';
  end if;

  update public.player_journal_entries as t
  set sort_order = d.ord
  from unnest(p_ids, p_orders) as d(id, ord)
  where t.id = d.id and t.user_id = v_uid;
end;
$$;

revoke execute on function public.reorder_player_journal_entries(uuid[], integer[]) from public, anon;
grant execute on function public.reorder_player_journal_entries(uuid[], integer[]) to authenticated, service_role;

-- ── soundboard_pages ─────────────────────────────────────────────────────

create or replace function public.reorder_soundboard_pages(p_ids uuid[], p_orders integer[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return;
  end if;
  if array_length(p_ids, 1) is distinct from array_length(p_orders, 1) then
    raise exception 'p_ids and p_orders must be the same length';
  end if;

  if exists (
    select 1
    from unnest(p_ids) as want(id)
    where not exists (
      select 1 from public.soundboard_pages sp where sp.id = want.id and sp.user_id = v_uid
    )
  ) then
    raise exception 'Not authorized to reorder one or more of the given soundboard pages';
  end if;

  update public.soundboard_pages as t
  set sort_order = d.ord
  from unnest(p_ids, p_orders) as d(id, ord)
  where t.id = d.id and t.user_id = v_uid;
end;
$$;

revoke execute on function public.reorder_soundboard_pages(uuid[], integer[]) from public, anon;
grant execute on function public.reorder_soundboard_pages(uuid[], integer[]) to authenticated, service_role;

-- ── sounds ───────────────────────────────────────────────────────────────

create or replace function public.reorder_sounds(p_ids uuid[], p_orders integer[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return;
  end if;
  if array_length(p_ids, 1) is distinct from array_length(p_orders, 1) then
    raise exception 'p_ids and p_orders must be the same length';
  end if;

  if exists (
    select 1
    from unnest(p_ids) as want(id)
    where not exists (
      select 1 from public.sounds s where s.id = want.id and s.user_id = v_uid
    )
  ) then
    raise exception 'Not authorized to reorder one or more of the given sounds';
  end if;

  update public.sounds as t
  set sort_order = d.ord
  from unnest(p_ids, p_orders) as d(id, ord)
  where t.id = d.id and t.user_id = v_uid;
end;
$$;

revoke execute on function public.reorder_sounds(uuid[], integer[]) from public, anon;
grant execute on function public.reorder_sounds(uuid[], integer[]) to authenticated, service_role;

-- ── party_inventory ──────────────────────────────────────────────────────
-- Shared party resource: any campaign member (DM included — the DM has its
-- own campaign_members row with role='dm') may reorder it, matching the
-- existing party_inventory_member_update RLS policy. Ownership is therefore
-- checked per-row against that row's own campaign_id, not against a
-- caller-supplied campaign id.

create or replace function public.reorder_party_inventory(p_ids uuid[], p_orders integer[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then
    return;
  end if;
  if array_length(p_ids, 1) is distinct from array_length(p_orders, 1) then
    raise exception 'p_ids and p_orders must be the same length';
  end if;

  if exists (
    select 1
    from unnest(p_ids) as want(id)
    where not exists (
      select 1 from public.party_inventory pi
      where pi.id = want.id and private.is_campaign_member(pi.campaign_id)
    )
  ) then
    raise exception 'Not authorized to reorder one or more of the given inventory items';
  end if;

  update public.party_inventory as t
  set sort_order = d.ord
  from unnest(p_ids, p_orders) as d(id, ord)
  where t.id = d.id and private.is_campaign_member(t.campaign_id);
end;
$$;

revoke execute on function public.reorder_party_inventory(uuid[], integer[]) from public, anon;
grant execute on function public.reorder_party_inventory(uuid[], integer[]) to authenticated, service_role;
