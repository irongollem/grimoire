-- Migration: secure_campaign_members_role
-- Prevent players from self-escalating to DM via campaign_members UPDATE.
--
-- The existing `campaign_members_update_own` policy had a USING clause but no
-- WITH CHECK, so a player could run
--   update campaign_members set role='dm' where user_id = auth.uid()
-- against PostgREST and gain full DM access (every is_campaign_dm() RLS check
-- reads this column). We add a BEFORE UPDATE trigger that forbids a non-DM from
-- changing the privileged columns (role / campaign_id / party_member_id) on
-- their own row. DMs continue to manage members via `campaign_members_dm_all`.

create or replace function public.guard_campaign_member_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- DMs of this campaign may change anything (handled by campaign_members_dm_all,
  -- but the trigger fires for them too, so allow it explicitly).
  if is_campaign_dm(old.campaign_id) then
    return new;
  end if;

  -- Non-DM self-update: pin the privileged columns to their prior values.
  if new.role is distinct from old.role
     or new.campaign_id is distinct from old.campaign_id
     or new.party_member_id is distinct from old.party_member_id then
    raise exception 'Not allowed to change role/campaign/party assignment';
  end if;

  return new;
end;
$$;

drop trigger if exists campaign_members_guard_self_update on public.campaign_members;
create trigger campaign_members_guard_self_update
  before update on public.campaign_members
  for each row execute procedure public.guard_campaign_member_self_update();
