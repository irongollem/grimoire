-- Migration: realtime_campaign_members
-- Add campaign_members to the supabase_realtime publication and set REPLICA
-- IDENTITY FULL so postgres_changes on it (a) fire at all, and (b) carry the
-- old row's user_id + campaign_id on UPDATE/DELETE. useCampaignLiveSync already
-- listens on campaign_members (display-name / add-remove propagation) and #535's
-- eject-on-removal needs the deleted row's user_id to know whose membership was
-- revoked — the default replica identity only carries the primary key. (#535)

alter table public.campaign_members replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.campaign_members;
exception when duplicate_object then
  null;
end $$;
