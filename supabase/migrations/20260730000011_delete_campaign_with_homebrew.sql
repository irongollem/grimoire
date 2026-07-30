-- Migration: delete_campaign_with_homebrew
--
-- class_features.campaign_id / custom_classes.campaign_id /
-- custom_subclasses.campaign_id are FKs to campaigns left as NO ACTION,
-- deliberately (#585): for these three tables campaign_id IS NULL means
-- "available in every campaign" (see campaignContentGating.ts's
-- allowedCampaignScoped), so neither FK default is safe --
--   - ON DELETE CASCADE would destroy authored homebrew as a side effect
--     of deleting the campaign it happened to be scoped to.
--   - ON DELETE SET NULL would silently promote campaign-exclusive
--     homebrew to universal, the opposite of what the DM asked for.
-- The app resolves this explicitly by asking the DM, then applying their
-- choice ("promote" or "delete") before deleting the campaign.
--
-- That disposition-then-delete must be atomic. Done as two separate
-- client round trips, a failure between them leaves a half-applied state
-- with no way to retry: homebrew already deleted/promoted but the campaign
-- still exists, and a second attempt would see zero scoped rows and never
-- re-offer the choice. A single SECURITY DEFINER function makes the whole
-- thing one transaction -- either it all commits or none of it does. Same
-- pattern as the loot economy RPCs (20260629000002).

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
  if p_disposition = 'promote' then
    update public.custom_classes    set campaign_id = null where campaign_id = p_campaign_id;
    update public.custom_subclasses set campaign_id = null where campaign_id = p_campaign_id;
    update public.class_features    set campaign_id = null where campaign_id = p_campaign_id;
  else
    delete from public.custom_classes    where campaign_id = p_campaign_id;
    delete from public.custom_subclasses where campaign_id = p_campaign_id;
    delete from public.class_features    where campaign_id = p_campaign_id;
  end if;

  delete from public.campaigns where id = p_campaign_id;
end;
$$;

revoke execute on function public.delete_campaign_with_homebrew(uuid, text) from public, anon;
grant execute on function public.delete_campaign_with_homebrew(uuid, text) to authenticated, service_role;
