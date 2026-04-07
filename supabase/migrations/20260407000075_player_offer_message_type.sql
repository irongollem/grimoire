-- Extend type check to include player_offer (player-to-player / player-to-DM gear sale)
alter table public.campaign_messages
  drop constraint campaign_messages_type_check;

alter table public.campaign_messages
  add constraint campaign_messages_type_check
  check (type in ('chat', 'roll', 'system', 'item_drop', 'currency_drop', 'vendor_offer', 'player_offer'));

-- Extend claim UPDATE policy to cover player_offer as well
drop policy if exists "campaign_messages_claim" on public.campaign_messages;

create policy "campaign_messages_claim" on public.campaign_messages
  for update using (
    type in ('item_drop', 'currency_drop', 'vendor_offer', 'player_offer')
    and public.is_campaign_member(campaign_id)
  );
