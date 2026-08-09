-- Migration: confine_campaign_delete_disposition_to_owner
-- Stop deleting a campaign from destroying homebrew that belongs to someone else.

-- WHY. delete_campaign_with_homebrew disposes of six homebrew tables with an
-- owner-less predicate -- `where campaign_id = p_campaign_id`, and nothing more.
-- That was safe only while a campaign's scoped rows could only ever belong to
-- the campaign's owner, and transfer_campaign_ownership (20260731000001) breaks
-- exactly that assumption: it hands a campaign to a new DM while the OUTGOING
-- DM's rows keep pointing at it. Before 20260809000003 that could not bite
-- monsters or traps, because they had no campaign_id to point with -- which is
-- also why 20260731000001's header still says they have none. It is out of date
-- as of the previous migration; see the function comment restated at the bottom
-- of this file.
--
-- So today: DM A transfers a campaign to DM B, DM B later deletes it and picks
-- the 'delete' disposition, and DM A's authored monsters, traps and puzzles go
-- with it. Silently, in the one function whose entire purpose is to make that
-- choice explicit and consented -- and DM A was never asked.
--
-- THE FIX. A caller may only dispose of their OWN rows, so both branches gain
-- `user_id = v_uid`. Rows still pointing at the campaign after that belong to
-- somebody else, and they are PROMOTED to null rather than deleted:
--
--   * it is the one disposition that destroys nothing;
--   * null means "available in every campaign", so the row stays visible in its
--     owner's library instead of being stranded behind a campaign id that no
--     longer resolves to anything;
--   * and the NO ACTION foreign keys from 20260809000003 would otherwise abort
--     the delete on the constraint, leaving the campaign undeletable with a raw
--     FK error and no way forward from the UI.
--
-- Promotion is the safe direction here for the same reason the migration that
-- added those FKs refused it as a *default*: silently widening a scope is wrong
-- when the owner is present to be asked, and right when they are not and the
-- alternative is destroying their work.
--
-- NOT SETTLED HERE. Whether a transfer should re-scope the rows it clones, or
-- release the ones it leaves behind, is a policy question with its own issue
-- (#630) and a 370-line function to rewrite. This migration only removes the
-- destructive outcome that question currently leads to.

-- Unchanged from 20260809000003 except for the two predicates and the promote
-- sweep. Same authorization (re-derived from auth.uid(), never a caller-supplied
-- id) and the same one-transaction guarantee: disposition and delete either both
-- commit or neither does.
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

  if p_disposition not in ('promote', 'delete') then
    raise exception 'Invalid disposition: %, expected ''promote'' or ''delete''', p_disposition;
  end if;

  -- Mirrors "Users manage own campaigns", the only RLS policy that governs
  -- DELETE on public.campaigns (campaigns_member_select is SELECT-only and
  -- does not apply): only the campaign's owner may delete it. This function
  -- is SECURITY DEFINER and bypasses RLS entirely, so that check must be
  -- restated here explicitly, re-derived from auth.uid() -- never trusting
  -- a caller-supplied id.
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
  -- `user_id = v_uid` is the other half, and the point of this migration: the
  -- disposition the DM chose is a decision about the DM's own authored work.
  -- It is not consent to delete a previous owner's.
  if p_disposition = 'promote' then
    update public.custom_classes    set campaign_id = null where campaign_id = p_campaign_id and user_id = v_uid;
    update public.custom_subclasses set campaign_id = null where campaign_id = p_campaign_id and user_id = v_uid;
    update public.class_features    set campaign_id = null where campaign_id = p_campaign_id and user_id = v_uid;
    update public.monsters          set campaign_id = null where campaign_id = p_campaign_id and user_id = v_uid;
    update public.traps             set campaign_id = null where campaign_id = p_campaign_id and user_id = v_uid;
    update public.puzzle_rooms      set campaign_id = null where campaign_id = p_campaign_id and user_id = v_uid;
  else
    delete from public.custom_classes    where campaign_id = p_campaign_id and user_id = v_uid;
    delete from public.custom_subclasses where campaign_id = p_campaign_id and user_id = v_uid;
    delete from public.class_features    where campaign_id = p_campaign_id and user_id = v_uid;
    delete from public.monsters          where campaign_id = p_campaign_id and user_id = v_uid;
    delete from public.traps             where campaign_id = p_campaign_id and user_id = v_uid;
    delete from public.puzzle_rooms      where campaign_id = p_campaign_id and user_id = v_uid;
  end if;

  -- Whatever still points at this campaign belongs to another user -- in
  -- practice a previous owner, after a transfer. Promote it, never delete it.
  -- In the 'promote' branch this is a no-op superset of the six statements
  -- above, so the promote path behaves exactly as it did before.
  update public.custom_classes    set campaign_id = null where campaign_id = p_campaign_id;
  update public.custom_subclasses set campaign_id = null where campaign_id = p_campaign_id;
  update public.class_features    set campaign_id = null where campaign_id = p_campaign_id;
  update public.monsters          set campaign_id = null where campaign_id = p_campaign_id;
  update public.traps             set campaign_id = null where campaign_id = p_campaign_id;
  update public.puzzle_rooms      set campaign_id = null where campaign_id = p_campaign_id;

  delete from public.campaigns where id = p_campaign_id;
end;
$$;

-- CREATE OR REPLACE preserves grants; restated because the login-only boundary
-- on a SECURITY DEFINER function should be visible in every migration that
-- recreates it. (anon's access arrives via the PUBLIC grant, so revoking from
-- `anon` alone would be a no-op -- both are named deliberately.)
revoke execute on function public.delete_campaign_with_homebrew(uuid, text) from public, anon;
grant  execute on function public.delete_campaign_with_homebrew(uuid, text) to authenticated, service_role;

-- 20260731000001's header reasons from "monsters / traps ... have no
-- campaign_id", which stopped being true one migration ago. The file is applied
-- history and is not edited to say so; this comment is attached to the live
-- object instead, where \df+ and the next reader will find it.
comment on function public.transfer_campaign_ownership(uuid, uuid, boolean) is
  'Hands a campaign to another member. NOTE: monsters and traps gained a campaign_id in 20260809000003, so the personal-library rows this function clones now carry the source row''s scope verbatim, and the outgoing DM''s originals keep pointing at a campaign they no longer own. Whether either should be re-scoped at handover is #630. delete_campaign_with_homebrew no longer deletes those left-behind rows -- see 20260809000004.';
