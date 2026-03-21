-- Allow campaign members to SELECT their own campaign row.
-- This lets players read campaign settings (theme, calendar, etc.)
-- without needing full DM access.

create policy "campaigns_member_select" on public.campaigns
  for select using (is_campaign_member(id));
