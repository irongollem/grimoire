-- Preserve character choices across campaign-edition switches. Official class
-- rows follow the same-named edition record; incompatible pinned homebrew is
-- retained and explicitly marked for review.
alter table public.character_classes
  add column if not exists class_ruleset_review_required boolean not null default false,
  add column if not exists subclass_ruleset_review_required boolean not null default false;

create or replace function public.remap_character_options_for_campaign_ruleset()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ruleset is not distinct from old.ruleset then return new; end if;

  update public.character_classes cc set
    class_definition_id = target.id,
    class_definition_kind = 'system',
    class_ruleset_review_required = false,
    subclass_ruleset_review_required = case when cc.subclass_definition_id is null then false else not exists (
      select 1 from public.custom_subclasses subclass
      where subclass.id = cc.subclass_definition_id
        and (subclass.ruleset is null or subclass.ruleset = new.ruleset)
    ) end
  from public.party_members member, public.system_classes current_definition,
    public.system_classes target
  where member.id = cc.party_member_id and member.campaign_id = new.id
    and coalesce(cc.class_definition_kind, 'system') = 'system'
    and current_definition.id = cc.class_definition_id
    and target.ruleset = new.ruleset
    and target.conceptual_key = current_definition.conceptual_key;

  update public.character_classes cc set
    class_ruleset_review_required = true,
    subclass_ruleset_review_required = case when cc.subclass_definition_id is null then false else not exists (
      select 1 from public.custom_subclasses subclass
      where subclass.id = cc.subclass_definition_id
        and (subclass.ruleset is null or subclass.ruleset = new.ruleset)
    ) end
  from public.party_members member
  where member.id = cc.party_member_id and member.campaign_id = new.id
    and coalesce(cc.class_definition_kind, 'system') = 'system'
    and not exists (
      select 1 from public.system_classes current_definition
      join public.system_classes target
        on target.conceptual_key = current_definition.conceptual_key
        and target.ruleset = new.ruleset
      where current_definition.id = cc.class_definition_id
    );

  update public.character_classes cc set
    class_ruleset_review_required = not exists (
      select 1 from public.custom_classes definition
      where definition.id = cc.class_definition_id
        and (definition.ruleset is null or definition.ruleset = new.ruleset)
    ),
    subclass_ruleset_review_required = case when cc.subclass_definition_id is null then false else not exists (
      select 1 from public.custom_subclasses subclass
      where subclass.id = cc.subclass_definition_id
        and (subclass.ruleset is null or subclass.ruleset = new.ruleset)
    ) end
  from public.party_members member
  where member.id = cc.party_member_id and member.campaign_id = new.id
    and cc.class_definition_kind = 'custom';

  return new;
end;
$$;

create trigger campaigns_remap_character_options_ruleset
after update of ruleset on public.campaigns
for each row execute function public.remap_character_options_for_campaign_ruleset();

revoke all on function public.remap_character_options_for_campaign_ruleset() from public, anon, authenticated;

create or replace function public.acknowledge_character_ruleset_review(p_character_class_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.character_classes cc set
    class_ruleset_review_required = false,
    subclass_ruleset_review_required = false
  from public.party_members member
  where cc.id = p_character_class_id and member.id = cc.party_member_id
    and (member.user_id = auth.uid() or member.owner_user_id = auth.uid()
      or private.is_campaign_dm(member.campaign_id));
  if not found then raise exception 'Character class not found or not authorized' using errcode = '42501'; end if;
end;
$$;

revoke all on function public.acknowledge_character_ruleset_review(uuid) from public, anon;
grant execute on function public.acknowledge_character_ruleset_review(uuid) to authenticated;

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
  new.class_ruleset_review_required := false;
  return new;
end;
$$;

-- Moved from 20260720000028, which now only owns the columns/backfill/index
-- for this table: the trigger needs the authoritative function above, which
-- itself needs the class_ruleset_review_required column defined earlier in
-- this migration.
create trigger character_classes_validate_definition
before insert or update of party_member_id, class_name, class_definition_id, class_definition_kind
on public.character_classes for each row execute function public.validate_character_class_definition();
revoke all on function public.validate_character_class_definition() from public, anon, authenticated;

create or replace function public.validate_character_subclass_definition()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_class_name text; v_ruleset text;
begin
  if new.subclass_name is null then
    new.subclass_definition_id := null;
    new.subclass_ruleset_review_required := false;
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
  new.subclass_ruleset_review_required := false;
  return new;
end;
$$;

-- Moved from 20260720000030, which now only owns the column/backfill/index
-- for this table: the trigger needs the authoritative function above, which
-- itself needs the subclass_ruleset_review_required column defined earlier
-- in this migration.
create trigger character_classes_validate_subclass_definition
before insert or update of party_member_id, class_name, subclass_name, subclass_definition_id
on public.character_classes for each row execute function public.validate_character_subclass_definition();
revoke all on function public.validate_character_subclass_definition() from public, anon, authenticated;
