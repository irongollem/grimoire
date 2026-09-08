-- Give dungeon_features the dual campaign scope every other homebrew kind has.
-- Story #800, epic #780 follow-up.
--
-- dungeon_features was the last DM-owned homebrew table with no campaign_id at
-- all -- user_id only. A DM running several campaigns saw one undivided list of
-- features with no per-row choice available even in principle, exactly where
-- monsters and traps were before #597.
--
-- It already forced a design decision: in #788, placing prep material in a
-- location had to become a join table rather than a column, and one of the two
-- reasons was that dungeon_features has no campaign scope, so a column would
-- have made a reusable fixture single-use. That reasoning is sound and the join
-- stands regardless -- but the underlying gap was still there.
--
-- Same dual state as #597: null means available in every campaign, set means
-- visible only when that campaign is active, and the DM picks per feature.

alter table public.dungeon_features add column campaign_id uuid references public.campaigns(id);

comment on column public.dungeon_features.campaign_id is
  'NULL = available in every campaign; set = visible only when that campaign is active. Never backfilled -- see 20260809000003.';

-- NO BACKFILL. Existing rows stay null and keep meaning "available in every
-- campaign". Every feature authored before today was authored without this
-- choice existing, so assigning one would invent an intent nobody expressed.

-- Not optional: an unindexed FK makes every campaign DELETE scan the table to
-- check the constraint.
create index if not exists dungeon_features_campaign_id_idx on public.dungeon_features (campaign_id);

-- FK is NO ACTION, deliberately, for the reasons #585 and #597 established:
-- CASCADE destroys a feature the DM authored as a side effect of deleting a
-- campaign; SET NULL silently promotes campaign-exclusive material to universal.
-- So the app asks, and NO ACTION is the guarantee that it asked.
--
-- Which is why the function below is updated in the SAME migration as the
-- column. A column without a disposition branch does not fail at migration
-- time, and does not fail in any test that never deletes a campaign. It fails
-- months later, in front of a DM, as a constraint violation they cannot act on.

-- ── Campaign deletion: one more table under the same disposition ────────────
--
-- The body below was read from `pg_get_functiondef` on the live database rather
-- than retyped from an earlier migration, and that is the point. 20260809000003
-- created this function; 20260809000004 replaced it, adding `user_id = v_uid`
-- to every disposition statement plus a trailing promote sweep. Rebuilding it
-- from the creating migration silently reverts the replacing one -- which is
-- exactly what happened in #789 and passed the entire test suite, because no
-- test exercised the case 20260809000004 exists to prevent.
--
-- Read the live definition. Not the first migration that mentions it.

CREATE OR REPLACE FUNCTION public.delete_campaign_with_homebrew(p_campaign_id uuid, p_disposition text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- `is null or` is load-bearing, and is a fix rather than a copy. `null not in
  -- ('promote','delete')` evaluates to NULL, so this guard never fired for a
  -- null disposition; execution then fell past `if p_disposition = 'promote'`
  -- (also NULL, therefore false) into the else branch, and deleted. The one
  -- non-total predicate in this function, failing destructive-side. Inherited
  -- from 20260730000011, closed here because this change puts one more table
  -- behind it.
  if p_disposition is null or p_disposition not in ('promote', 'delete') then
    raise exception 'Invalid disposition: %, expected ''promote'' or ''delete''', p_disposition;
  end if;

  -- Mirrors "Users manage own campaigns", the only RLS policy that governs
  -- DELETE on public.campaigns: only the campaign's owner may delete it. This
  -- function is SECURITY DEFINER and bypasses RLS entirely, so that check is
  -- restated here explicitly, re-derived from auth.uid() -- never trusting a
  -- caller-supplied id.
  select user_id into v_owner
  from public.campaigns
  where id = p_campaign_id;

  if v_owner is null then
    raise exception 'Campaign not found';
  end if;

  if v_owner <> v_uid then
    raise exception 'Not authorized to delete this campaign';
  end if;

  -- `campaign_id = p_campaign_id` is false (not true) for NULL rows, so
  -- universal homebrew and every other campaign's rows are never touched.
  -- `user_id = v_uid` is the other half, and the point of 20260809000004: the
  -- disposition the DM chose is a decision about the DM's own authored work.
  -- It is not consent to delete a previous owner's.
  if p_disposition = 'promote' then
    update public.custom_classes    set campaign_id = null where campaign_id = p_campaign_id and user_id = v_uid;
    update public.custom_subclasses set campaign_id = null where campaign_id = p_campaign_id and user_id = v_uid;
    update public.class_features    set campaign_id = null where campaign_id = p_campaign_id and user_id = v_uid;
    update public.monsters          set campaign_id = null where campaign_id = p_campaign_id and user_id = v_uid;
    update public.traps             set campaign_id = null where campaign_id = p_campaign_id and user_id = v_uid;
    update public.puzzle_rooms      set campaign_id = null where campaign_id = p_campaign_id and user_id = v_uid;
    update public.dungeon_maps      set campaign_id = null where campaign_id = p_campaign_id and user_id = v_uid;
    update public.dungeon_features  set campaign_id = null where campaign_id = p_campaign_id and user_id = v_uid;
  else
    delete from public.custom_classes    where campaign_id = p_campaign_id and user_id = v_uid;
    delete from public.custom_subclasses where campaign_id = p_campaign_id and user_id = v_uid;
    delete from public.class_features    where campaign_id = p_campaign_id and user_id = v_uid;
    delete from public.monsters          where campaign_id = p_campaign_id and user_id = v_uid;
    delete from public.traps             where campaign_id = p_campaign_id and user_id = v_uid;
    delete from public.puzzle_rooms      where campaign_id = p_campaign_id and user_id = v_uid;
    delete from public.dungeon_maps      where campaign_id = p_campaign_id and user_id = v_uid;
    delete from public.dungeon_features  where campaign_id = p_campaign_id and user_id = v_uid;
  end if;

  -- Whatever still points at this campaign belongs to another user -- in
  -- practice a previous owner, after a transfer. Promote it, never delete it.
  -- In the 'promote' branch this is a no-op superset of the statements above.
  --
  -- Without dungeon_maps here, a map owned by another user and scoped to this
  -- campaign survives the disposition and then aborts the whole delete on the
  -- NO ACTION constraint, with a raw 23503 and no route forward from the UI.
  update public.custom_classes    set campaign_id = null where campaign_id = p_campaign_id;
  update public.custom_subclasses set campaign_id = null where campaign_id = p_campaign_id;
  update public.class_features    set campaign_id = null where campaign_id = p_campaign_id;
  update public.monsters          set campaign_id = null where campaign_id = p_campaign_id;
  update public.traps             set campaign_id = null where campaign_id = p_campaign_id;
  update public.puzzle_rooms      set campaign_id = null where campaign_id = p_campaign_id;
  update public.dungeon_maps      set campaign_id = null where campaign_id = p_campaign_id;
  update public.dungeon_features  set campaign_id = null where campaign_id = p_campaign_id;

  delete from public.campaigns where id = p_campaign_id;
end;
$function$;

-- Restated per the convention 20260809000004 sets: the login-only boundary
-- should be visible in every migration that recreates this function.
revoke execute on function public.delete_campaign_with_homebrew(uuid, text) from public, anon;
grant  execute on function public.delete_campaign_with_homebrew(uuid, text) to authenticated, service_role;
