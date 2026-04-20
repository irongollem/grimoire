-- Migration: dm_roll_type
-- Add 'dm_roll' message type for hidden player rolls visible only to the DM

alter table public.campaign_messages
  drop constraint campaign_messages_type_check;

alter table public.campaign_messages
  add constraint campaign_messages_type_check
  check (type in ('chat', 'roll', 'system', 'item_drop', 'currency_drop', 'vendor_offer', 'player_offer', 'loot_chest', 'dm_roll'));
