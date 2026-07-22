-- Migration: generalize_ruleset_reviews
-- Replace the three parallel ruleset-review mechanisms (boolean flag columns +
-- per-domain campaign triggers + per-domain ack RPCs on character_classes,
-- character_spells and party_members) with one generic ruleset_reviews table,
-- one consolidated campaigns trigger and one generic ack RPC (#562). The next
-- edition-sensitive character field only needs a new flag_type value plus its
-- flagging logic — no new column, trigger plumbing, ack RPC or frontend ack
-- wiring.

-- 1. The generic review table -------------------------------------------------

create table public.ruleset_reviews (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  party_member_id uuid not null references public.party_members(id) on delete cascade,
  flag_type text not null check (flag_type in ('class', 'subclass', 'spell', 'background')),
  character_class_id uuid references public.character_classes(id) on delete cascade,
  character_spell_id uuid references public.character_spells(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ruleset_reviews_target_check check (
    (flag_type in ('class', 'subclass') and character_class_id is not null and character_spell_id is null)
    or (flag_type = 'spell' and character_spell_id is not null and character_class_id is null)
    or (flag_type = 'background' and character_class_id is null and character_spell_id is null)
  ),
  constraint ruleset_reviews_unique
    unique nulls not distinct (party_member_id, flag_type, character_class_id, character_spell_id)
);

create index ruleset_reviews_campaign_idx on public.ruleset_reviews (campaign_id);
create index ruleset_reviews_character_class_idx on public.ruleset_reviews (character_class_id);
create index ruleset_reviews_character_spell_idx on public.ruleset_reviews (character_spell_id);

create trigger ruleset_reviews_updated_at
  before update on ruleset_reviews
  for each row execute procedure update_updated_at();

alter table public.ruleset_reviews enable row level security;

-- Rows are written exclusively by SECURITY DEFINER trigger functions and the
-- ack RPC below, so only a select policy exists — deliberately no client
-- write policies.
create policy "ruleset_reviews_select" on public.ruleset_reviews for select using (
  exists (
    select 1 from public.party_members pm
    where pm.id = party_member_id
      and (pm.user_id = auth.uid() or pm.owner_user_id = auth.uid()
        or private.is_campaign_dm(pm.campaign_id))
  )
);

grant select on public.ruleset_reviews to authenticated, service_role;

-- Live sync: campaign-scoped postgres_changes need the publication entry and
-- REPLICA IDENTITY FULL so DELETEs carry campaign_id (see 20260711000018).
alter table public.ruleset_reviews replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.ruleset_reviews;
exception when duplicate_object then
  null;
end $$;

-- 2. Carry over currently-pending flags before the columns are dropped --------

insert into public.ruleset_reviews (campaign_id, party_member_id, flag_type, character_class_id)
select member.campaign_id, cc.party_member_id, 'class', cc.id
from public.character_classes cc
join public.party_members member on member.id = cc.party_member_id
where cc.class_ruleset_review_required and member.campaign_id is not null
on conflict do nothing;

insert into public.ruleset_reviews (campaign_id, party_member_id, flag_type, character_class_id)
select member.campaign_id, cc.party_member_id, 'subclass', cc.id
from public.character_classes cc
join public.party_members member on member.id = cc.party_member_id
where cc.subclass_ruleset_review_required and member.campaign_id is not null
on conflict do nothing;

insert into public.ruleset_reviews (campaign_id, party_member_id, flag_type, character_spell_id)
select member.campaign_id, grant_row.party_member_id, 'spell', grant_row.id
from public.character_spells grant_row
join public.party_members member on member.id = grant_row.party_member_id
where grant_row.ruleset_review_required and member.campaign_id is not null
on conflict do nothing;

insert into public.ruleset_reviews (campaign_id, party_member_id, flag_type)
select pm.campaign_id, pm.id, 'background'
from public.party_members pm
where pm.background_ruleset_review_required and pm.campaign_id is not null
on conflict do nothing;

-- 3. One consolidated campaigns trigger ---------------------------------------
-- Merges remap_character_options_for_campaign_ruleset (20260720000036),
-- remap_character_spells_for_campaign_ruleset (20260720000041) and
-- flag_background_ruleset_review (20260722000003). Remap behavior is ported
-- verbatim; flag bookkeeping now recomputes ruleset_reviews rows for the
-- campaign from scratch on every edition change (this also clears stale
-- background flags when a later flip removes the reason for review — the old
-- background trigger only ever set its flag).

drop trigger if exists campaigns_remap_character_options_ruleset on public.campaigns;
drop trigger if exists campaigns_remap_character_spells_ruleset on public.campaigns;
drop trigger if exists campaigns_flag_background_ruleset_review on public.campaigns;
drop function if exists public.remap_character_options_for_campaign_ruleset();
drop function if exists public.remap_character_spells_for_campaign_ruleset();
drop function if exists public.flag_background_ruleset_review();

create or replace function public.review_characters_for_campaign_ruleset()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ruleset is not distinct from old.ruleset then return new; end if;

  -- Classes: official rows follow the same-named edition record; incompatible
  -- or unmatched definitions are retained and flagged for review below.
  update public.character_classes cc set
    class_definition_id = target.id,
    class_definition_kind = 'system'
  from public.party_members member, public.system_classes current_definition,
    public.system_classes target
  where member.id = cc.party_member_id and member.campaign_id = new.id
    and coalesce(cc.class_definition_kind, 'system') = 'system'
    and current_definition.id = cc.class_definition_id
    and target.ruleset = new.ruleset
    and target.conceptual_key = current_definition.conceptual_key;

  -- Spells: keep the chosen concept when a unique, still-eligible counterpart
  -- exists in the new edition; never silently substitute otherwise.
  update public.character_spells grant_row set
    spell_id = target.id
  from public.party_members member
  join public.srd_spells current_spell on true
  join public.srd_spells target
    on target.conceptual_key = current_spell.conceptual_key
    and target.ruleset = new.ruleset
    and target.level = current_spell.level
  where member.id = grant_row.party_member_id
    and member.campaign_id = new.id
    and current_spell.id = grant_row.spell_id
    and current_spell.ruleset is distinct from new.ruleset
    and 1 = (
      select count(*) from public.srd_spells candidate
      where candidate.conceptual_key = current_spell.conceptual_key
        and candidate.ruleset = new.ruleset
        and candidate.level = current_spell.level
    )
    and (
      grant_row.source_type <> 'class'
      or grant_row.always_prepared
      or exists (
        select 1 from public.character_classes source_class
        where source_class.id = grant_row.source_class_id
          and source_class.class_name = any(coalesce(target.classes, '{}'::text[]))
      )
    )
    and not exists (
      select 1 from public.character_spells duplicate
      where duplicate.party_member_id = grant_row.party_member_id
        and duplicate.spell_id = target.id
        and duplicate.source_type = grant_row.source_type
        and coalesce(duplicate.source_class_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce(grant_row.source_class_id, '00000000-0000-0000-0000-000000000000'::uuid)
        and duplicate.id <> grant_row.id
    );

  -- Recompute this campaign's review rows from scratch.
  delete from public.ruleset_reviews where campaign_id = new.id;

  -- Class definitions with no valid backing in the new edition.
  insert into public.ruleset_reviews (campaign_id, party_member_id, flag_type, character_class_id)
  select new.id, cc.party_member_id, 'class', cc.id
  from public.character_classes cc
  join public.party_members member on member.id = cc.party_member_id
  where member.campaign_id = new.id
    and case
      when coalesce(cc.class_definition_kind, 'system') = 'system' then
        cc.class_definition_id is null or not exists (
          select 1 from public.system_classes definition
          where definition.id = cc.class_definition_id
            and definition.ruleset = new.ruleset
        )
      else
        not exists (
          select 1 from public.custom_classes definition
          where definition.id = cc.class_definition_id
            and (definition.ruleset is null or definition.ruleset = new.ruleset)
        )
    end
  on conflict do nothing;

  -- Pinned subclasses whose definition is unavailable in the new edition.
  insert into public.ruleset_reviews (campaign_id, party_member_id, flag_type, character_class_id)
  select new.id, cc.party_member_id, 'subclass', cc.id
  from public.character_classes cc
  join public.party_members member on member.id = cc.party_member_id
  where member.campaign_id = new.id
    and cc.subclass_definition_id is not null
    and not exists (
      select 1 from public.custom_subclasses subclass
      where subclass.id = cc.subclass_definition_id
        and (subclass.ruleset is null or subclass.ruleset = new.ruleset)
    )
  on conflict do nothing;

  -- Spells left without rules backing in the new edition.
  insert into public.ruleset_reviews (campaign_id, party_member_id, flag_type, character_spell_id)
  select new.id, grant_row.party_member_id, 'spell', grant_row.id
  from public.character_spells grant_row
  join public.party_members member on member.id = grant_row.party_member_id
  where member.campaign_id = new.id
    and not exists (
      select 1 from public.srd_spells spell
      where spell.id = grant_row.spell_id and spell.ruleset = new.ruleset
    )
    and not exists (
      select 1 from public.spells spell
      where spell.id::text = grant_row.spell_id
        and (spell.ruleset is null or spell.ruleset = new.ruleset)
    )
  on conflict do nothing;

  -- Background: moving off 2024 orphans a recorded ASI/feat choice; moving to
  -- 2024 surfaces an ASI trio the member hasn't chosen from yet.
  insert into public.ruleset_reviews (campaign_id, party_member_id, flag_type)
  select new.id, pm.id, 'background'
  from public.party_members pm
  where pm.campaign_id = new.id
    and new.ruleset <> '2024'
    and (pm.class_choices ? 'background_asi' or pm.class_choices ? 'background_feat_id')
  on conflict do nothing;

  insert into public.ruleset_reviews (campaign_id, party_member_id, flag_type)
  select new.id, pm.id, 'background'
  from public.party_members pm
  join public.backgrounds bg on bg.id = pm.background_id
  where pm.campaign_id = new.id
    and new.ruleset = '2024'
    and bg.asi_ability_trio is not null
    and not (pm.class_choices ? 'background_asi')
  on conflict do nothing;

  return new;
end;
$$;

create trigger campaigns_review_characters_ruleset
after update of ruleset on public.campaigns
for each row execute function public.review_characters_for_campaign_ruleset();

revoke all on function public.review_characters_for_campaign_ruleset() from public, anon, authenticated;

-- 4. Validation triggers resolve reviews by deleting rows instead of clearing
--    the (now removed) flag columns. Bodies otherwise identical to
--    20260720000036.

create or replace function public.validate_character_class_definition()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_ruleset text;
begin
  if new.class_definition_id is null then return new; end if;
  select coalesce(c.ruleset, '2014') into strict v_ruleset
  from public.party_members pm join public.campaigns c on c.id = pm.campaign_id
  where pm.id = new.party_member_id;
  if new.class_definition_kind = 'system' then
    select class_name into v_name from public.system_classes
    where id = new.class_definition_id and ruleset = v_ruleset;
  else
    select definition.class_name into v_name from public.custom_classes definition
    join public.party_members member on member.id = new.party_member_id
    where definition.id = new.class_definition_id
      and (definition.ruleset is null or definition.ruleset = v_ruleset)
      and (definition.campaign_id = member.campaign_id
        or (definition.campaign_id is null
          and definition.user_id in (member.user_id, member.owner_user_id, auth.uid())));
  end if;
  if v_name is null then raise exception 'Class definition is unavailable for campaign ruleset %', v_ruleset; end if;
  if v_name <> new.class_name then raise exception 'Class definition does not match class name'; end if;
  delete from public.ruleset_reviews
  where character_class_id = new.id and flag_type = 'class';
  return new;
end;
$$;

revoke all on function public.validate_character_class_definition() from public, anon, authenticated;

create or replace function public.validate_character_subclass_definition()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_class_name text; v_ruleset text;
begin
  if new.subclass_name is null then
    new.subclass_definition_id := null;
    delete from public.ruleset_reviews
    where character_class_id = new.id and flag_type = 'subclass';
    return new;
  end if;
  if new.subclass_definition_id is null then return new; end if;
  select definition.subclass_name, definition.class_name, coalesce(campaign.ruleset, '2014')
    into v_name, v_class_name, v_ruleset
  from public.custom_subclasses definition
  join public.party_members member on member.id = new.party_member_id
  join public.campaigns campaign on campaign.id = member.campaign_id
  where definition.id = new.subclass_definition_id
    and (definition.ruleset is null or definition.ruleset = coalesce(campaign.ruleset, '2014'))
    and (definition.campaign_id = member.campaign_id
      or (definition.campaign_id is null
        and definition.user_id in (member.user_id, member.owner_user_id, auth.uid())));
  if v_name is null then raise exception 'Subclass definition is unavailable for the campaign ruleset'; end if;
  if v_name <> new.subclass_name or v_class_name <> new.class_name then
    raise exception 'Subclass definition does not match the selected class and subclass';
  end if;
  delete from public.ruleset_reviews
  where character_class_id = new.id and flag_type = 'subclass';
  return new;
end;
$$;

revoke all on function public.validate_character_subclass_definition() from public, anon, authenticated;

-- 5. One generic ack RPC --------------------------------------------------------

drop function if exists public.acknowledge_character_ruleset_review(uuid);
drop function if exists public.acknowledge_character_spell_ruleset_review(uuid);
drop function if exists public.acknowledge_background_ruleset_review(uuid);

-- Client-callable: authorizes internally via auth.uid()/DM membership as its
-- first act (SECURITY DEFINER convention). Acking zero rows is a no-op
-- success so the RPC is idempotent under concurrent acks.
create or replace function public.acknowledge_ruleset_reviews(
  p_party_member_id uuid,
  p_flag_types text[] default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.party_members pm
    where pm.id = p_party_member_id
      and (pm.user_id = auth.uid() or pm.owner_user_id = auth.uid()
        or private.is_campaign_dm(pm.campaign_id))
  ) then
    raise exception 'Party member not found or not authorized' using errcode = '42501';
  end if;

  delete from public.ruleset_reviews rr
  where rr.party_member_id = p_party_member_id
    and (p_flag_types is null or rr.flag_type = any(p_flag_types));
end;
$$;

revoke all on function public.acknowledge_ruleset_reviews(uuid, text[]) from public, anon;
grant execute on function public.acknowledge_ruleset_reviews(uuid, text[]) to authenticated;

-- 6. Drop the legacy flag columns -----------------------------------------------

alter table public.character_classes
  drop column if exists class_ruleset_review_required,
  drop column if exists subclass_ruleset_review_required;
alter table public.character_spells
  drop column if exists ruleset_review_required;
alter table public.party_members
  drop column if exists background_ruleset_review_required;
