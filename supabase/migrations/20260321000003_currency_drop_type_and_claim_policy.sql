-- Extend type check to include currency_drop
alter table public.campaign_messages
  drop constraint campaign_messages_type_check;

alter table public.campaign_messages
  add constraint campaign_messages_type_check
  check (type in ('chat', 'roll', 'system', 'item_drop', 'currency_drop'));

-- Extend claim UPDATE policy to cover currency_drop as well
drop policy if exists "campaign_messages_claim" on public.campaign_messages;

create policy "campaign_messages_claim" on public.campaign_messages
  for update using (
    type in ('item_drop', 'currency_drop')
    and public.is_campaign_member(campaign_id)
  );
