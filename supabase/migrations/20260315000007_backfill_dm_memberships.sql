-- Backfill DM memberships for campaigns that existed before the campaign_members
-- table was introduced. The trigger handles future inserts; this covers the past.

insert into public.campaign_members (campaign_id, user_id, role)
select id, user_id, 'dm'
from public.campaigns
on conflict (campaign_id, user_id) do nothing;
