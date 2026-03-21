-- Allow campaign DMs to delete any message in their campaign
create policy "campaign_messages_delete_dm" on public.campaign_messages
  for delete using (is_campaign_dm(campaign_id));
