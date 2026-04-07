-- Add a stable iCal subscription token to each campaign.
-- The token acts as a shared secret: possession of the URL grants read-only
-- access to the campaign's confirmed session dates in the iCal feed.
-- Existing campaigns get a unique token assigned automatically.

alter table public.campaigns
  add column ical_token uuid not null default gen_random_uuid();

create unique index campaigns_ical_token_idx on public.campaigns(ical_token);
