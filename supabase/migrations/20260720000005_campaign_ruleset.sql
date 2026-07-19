-- One campaign-wide ruleset controls all edition-sensitive behavior and content.
-- Preserve existing campaigns on the rules they already use.
alter table public.campaigns
  add column if not exists ruleset text not null default '2014';

alter table public.campaigns
  drop constraint if exists campaigns_ruleset_check;

alter table public.campaigns
  add constraint campaigns_ruleset_check check (ruleset in ('2014', '2024'));

comment on column public.campaigns.ruleset is
  'Campaign-wide D&D rules edition. Applies to classes, spells, creatures, items, rests, and encounter rules.';
