-- Give dungeon_maps the dual scope the other DM-owned tables already have.
-- Story #789, epic #780.
--
-- A site renders a live Cartographer map (#784), so a map has to be able to
-- belong to the campaign whose site is rendering it. Today `dungeon_maps` is
-- `user_id`-scoped with no `campaign_id` at all, and its only tie to a place is
-- `locations.source_map_id` pointing at it — so a DM running several campaigns
-- has one undivided pile of maps and no per-map choice available even in
-- principle.
--
-- This is deliberately NOT "maps are campaign content". It is the same dual
-- state monsters, traps and puzzles got in #597: **null means available in
-- every campaign**, set means visible only when that campaign is active, and
-- the DM picks per map. Drawing a generic crypt once and using it in two
-- campaigns stays possible, which is most of why anyone draws one.
--
-- Copied from 20260809000003 rather than re-derived, because that migration is
-- more than a column and the part that is easy to miss is the part that breaks
-- campaign deletion.

alter table public.dungeon_maps add column campaign_id uuid references public.campaigns(id);

comment on column public.dungeon_maps.campaign_id is
  'NULL = available in every campaign; set = visible only when that campaign is active. Never backfilled -- see 20260809000003.';

-- ── NO BACKFILL ─────────────────────────────────────────────────────────────
-- Existing rows stay null, and null keeps meaning "available in every
-- campaign". Every map drawn before today was drawn without this choice
-- existing, so silently assigning one would be inventing an intent the DM
-- never expressed.

-- Not optional: an unindexed FK makes every campaign DELETE scan the table to
-- check the constraint.
create index if not exists dungeon_maps_campaign_id_idx on public.dungeon_maps (campaign_id);

-- ── FK: NO ACTION, deliberately ─────────────────────────────────────────────
-- Both defaults are wrong for authored work whose null is meaningful, as #585
-- and #597 already established:
--   - ON DELETE CASCADE destroys a map the DM spent an evening drawing, as a
--     side effect of deleting the campaign it happened to be scoped to.
--   - ON DELETE SET NULL silently promotes campaign-exclusive material to
--     universal — the opposite of what the DM asked for, and invisible.
-- So the app asks, and NO ACTION is the guarantee that it asked. That
-- guarantee only holds while the *counting* layer knows about the same table
-- set as the function: if `campaignHomebrewDisposition.ts` does not list maps,
-- a campaign whose only scoped content is maps reports "no homebrew", the
-- picker never appears, and the client sends its default — which is 'delete'.
-- The FK cannot save that case, because the function does delete the rows.

-- ── Campaign deletion: one more table under the same disposition ────────────
--
-- Copied from 20260809000004, NOT from 20260809000003. That distinction is the
-- whole of this section: 20260809000003 created this function, 20260809000004
-- *replaced* it, and a `create or replace` built from the creating migration
-- silently reverts the replacing one. Doing exactly that was caught here by
-- audit rather than by any test — no test in this repo exercised the case
-- 20260809000004 exists to prevent. One is added alongside this migration.
--
-- Before touching this function again: read `pg_get_functiondef` for the live
-- definition, or the newest migration that mentions it. Not the first one.
--
-- What 20260809000004 added, and why it must survive: `user_id = v_uid` on
-- every disposition statement, plus a trailing promote sweep. After a campaign
-- is transferred the previous owner's authored rows still point at it
-- (`transfer_campaign_ownership` does not re-scope them, #630). Without the
-- owner predicate, the new owner choosing "delete" destroys the previous
-- owner's work — SECURITY DEFINER, so RLS never sees the statement, and the
-- author is neither asked nor told.

create or replace function public.delete_campaign_with_homebrew(
  p_campaign_id uuid,
  p_disposition text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
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
  else
    delete from public.custom_classes    where campaign_id = p_campaign_id and user_id = v_uid;
    delete from public.custom_subclasses where campaign_id = p_campaign_id and user_id = v_uid;
    delete from public.class_features    where campaign_id = p_campaign_id and user_id = v_uid;
    delete from public.monsters          where campaign_id = p_campaign_id and user_id = v_uid;
    delete from public.traps             where campaign_id = p_campaign_id and user_id = v_uid;
    delete from public.puzzle_rooms      where campaign_id = p_campaign_id and user_id = v_uid;
    delete from public.dungeon_maps      where campaign_id = p_campaign_id and user_id = v_uid;
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

  delete from public.campaigns where id = p_campaign_id;
end;
$$;

-- Restated per the convention 20260809000004 sets: the login-only boundary
-- should be visible in every migration that recreates this function, rather
-- than inherited invisibly from the ACL that `create or replace` happens to keep.
revoke execute on function public.delete_campaign_with_homebrew(uuid, text) from public, anon;
grant  execute on function public.delete_campaign_with_homebrew(uuid, text) to authenticated, service_role;
