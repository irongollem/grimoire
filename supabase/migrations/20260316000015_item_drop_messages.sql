-- Extend message type check to include item_drop
alter table public.campaign_messages
  drop constraint campaign_messages_type_check;

alter table public.campaign_messages
  add constraint campaign_messages_type_check
  check (type in ('chat', 'roll', 'system', 'item_drop'));

-- Allow any campaign member to UPDATE item_drop messages (to claim them)
create policy "campaign_messages_claim" on public.campaign_messages
  for update using (
    type = 'item_drop'
    and public.is_campaign_member(campaign_id)
  );
