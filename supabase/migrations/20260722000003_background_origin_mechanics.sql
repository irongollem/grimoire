-- Migration: background_origin_mechanics
-- 2024 background mechanics (#558): ASI trio + Origin feat on backgrounds,
-- ruleset-change review flag on party_members, safety-net trigger + ack RPC.

alter table public.backgrounds
  add column if not exists asi_ability_trio text[],
  add column if not exists origin_feat jsonb;

alter table public.backgrounds
  add constraint backgrounds_asi_ability_trio_check
  check (
    asi_ability_trio is null
    or (array_length(asi_ability_trio, 1) = 3
      and asi_ability_trio <@ array['strength','dexterity','constitution','intelligence','wisdom','charisma']::text[])
  );

alter table public.party_members
  add column if not exists background_ruleset_review_required boolean not null default false;

-- Flags members whose background ASI/feat choices need review after a campaign
-- edition switch, mirroring remap_character_options_for_campaign_ruleset
-- (migration 20260720000036).
create or replace function public.flag_background_ruleset_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ruleset is not distinct from old.ruleset then return new; end if;

  -- Downgrade (or any move away from 2024): a previously recorded ASI/feat
  -- choice no longer has rules backing it.
  update public.party_members pm
  set background_ruleset_review_required = true
  where pm.campaign_id = new.id
    and new.ruleset <> '2024'
    and (pm.class_choices ? 'background_asi' or pm.class_choices ? 'background_feat_id');

  -- Upgrade to 2024: the member's current background now offers an ASI trio
  -- they haven't chosen from yet.
  update public.party_members pm
  set background_ruleset_review_required = true
  from public.backgrounds bg
  where pm.campaign_id = new.id
    and pm.background_id = bg.id
    and new.ruleset = '2024'
    and bg.asi_ability_trio is not null
    and not (pm.class_choices ? 'background_asi');

  return new;
end;
$$;

create trigger campaigns_flag_background_ruleset_review
  after update of ruleset on public.campaigns
  for each row execute procedure flag_background_ruleset_review();

-- Trigger functions never need EXECUTE for callers; keep off the RPC surface.
revoke all on function public.flag_background_ruleset_review() from public, anon, authenticated;

-- Client-callable ack RPC: authorizes internally via auth.uid()/DM membership
-- as its first act (SECURITY DEFINER convention).
create or replace function public.acknowledge_background_ruleset_review(p_party_member_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.party_members pm
  set background_ruleset_review_required = false
  where pm.id = p_party_member_id
    and (pm.user_id = auth.uid() or pm.owner_user_id = auth.uid()
      or private.is_campaign_dm(pm.campaign_id));
  if not found then raise exception 'Party member not found or not authorized' using errcode = '42501'; end if;
end;
$$;

revoke all on function public.acknowledge_background_ruleset_review(uuid) from public, anon;
grant execute on function public.acknowledge_background_ruleset_review(uuid) to authenticated;
