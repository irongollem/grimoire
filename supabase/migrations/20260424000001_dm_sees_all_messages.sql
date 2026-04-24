-- Migration: dm_sees_all_messages
-- Allow campaign DMs to SELECT all messages in their campaign,
-- so dm_roll messages are always visible to the DM regardless of
-- which user_id was stored as recipient_user_id.

drop policy if exists "campaign_messages_select" on public.campaign_messages;

create policy "campaign_messages_select" on public.campaign_messages
  for select using (
    public.is_campaign_member(campaign_id)
    and (
      recipient_user_id is null                    -- group / public message
      or auth.uid() = user_id                      -- sender sees their own message
      or auth.uid() = recipient_user_id            -- addressed recipient
      or public.is_campaign_dm(campaign_id)        -- DM sees everything in their campaign
    )
  );
