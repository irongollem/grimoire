-- Official class features, subclasses and feats, and a feat that knows it is one (#976).
--
-- Until now the Open5e class content was imported *per account*: each DM who
-- pressed "Sync from Open5e" got a private copy, readable by that DM and the
-- players at their tables. In production one account had pressed it, so of the
-- eleven accounts running a table nine had no subclasses and no feats at all,
-- and every 2024 class but the Sorcerer had an empty feature table. Feats and
-- class features shared `class_features` with nothing to tell them apart but
-- the shape of their Open5e record key.
--
-- This migration makes that content one official set every account reads, the
-- way `system_classes` already is:
--
--   1. `class_features` learns what a row is (`kind`), what a feat asks for and
--      gives (category, prerequisites, repeatable, ability increase), and what a
--      feature does (`mechanics`, shaped by src/rules/features/mechanics.types.ts).
--      `feature_type` becomes `mechanics.activation`; the column goes in a later
--      migration of this epic, once nothing reads it.
--   2. `custom_classes` and `custom_subclasses` may hold official rows
--      (`user_id is null`): everyone reads them, only the admin writes them.
--   3. The current Open5e import (provenance `open5e-v2`) is adopted in place:
--      its rows become official and keep their ids, so no class map and no
--      character moves. The maintainer chose this on 5 Oct 2026 over a fresh
--      import. Only open-licensed Open5e documents are adopted; a row from a
--      user's own book (PHB) keeps its owner, because the app may not
--      redistribute it.
--   4. The older import (`legacy:` record keys, documents named in full such as
--      "Tome of Heroes") duplicates the current one with the text missing. A
--      character on a legacy subclass moves to its twin; the legacy rows nothing
--      points at any more are deleted. The admin import restores any Open5e feat
--      among them (Open5e still serves every one).
--   5. The imported copies of the official classes (Open5e `srd-2014` and
--      `srd-2024` classes) fold into `system_classes`: the system row takes the
--      import's feature map, the characters on the copy move to the system row,
--      and the copy goes. This is what gives the 2024 classes their features.
--   6. The hand-seeded 2014 placeholder rows (`Sneak Attack (1d6)` ...
--      `(10d6)`, `ASI` with no text) that no class points at any more are
--      deleted. The 2014 Artificer is in no SRD, so its rows stay, as names
--      and levels, under `grimoire-system`.
--
-- Approval follows: an official row is approved when the table has its book
-- enabled, and benched with reason `source` when it has not, exactly like a
-- library row. Grimoire's own chassis rows (`grimoire-system`) belong to no
-- book a table can switch off, so they are always approved.

-- ─── 1. What a row is, and what it does ─────────────────────────────────────

alter table public.class_features
  add column kind text not null default 'feature',
  add column feat_category text,
  add column prerequisites jsonb,
  add column repeatable boolean not null default false,
  add column ability_increase jsonb,
  add column mechanics jsonb not null default '{}'::jsonb;

alter table public.class_features
  add constraint class_features_kind_check check (kind in ('feature', 'feat')),
  add constraint class_features_feat_category_check check (
    feat_category is null or feat_category in ('origin', 'general', 'fighting_style', 'epic_boon')),
  add constraint class_features_mechanics_object check (jsonb_typeof(mechanics) = 'object'),
  -- A feature is granted, never chosen, so the columns describing a choice
  -- belong to feats alone. The structured shapes are checked by the client's
  -- validator (src/rules/features/mechanics.ts), which every writer goes through.
  add constraint class_features_feat_only_columns check (
    kind = 'feat'
    or (feat_category is null and prerequisites is null and ability_increase is null and not repeatable));

comment on column public.class_features.kind is
  'feature: granted by a class or subclass at a level. feat: chosen (level-up, background origin). #976';
comment on column public.class_features.mechanics is
  'What the feature does, as data: activation, uses, scaling, damage riders, toggle, sub-actions, choices, replaces. Shape: src/rules/features/mechanics.types.ts. Never rules text. #976';
comment on column public.class_features.prerequisites is
  'Feats only: structured prerequisites the level-up picker enforces. `prerequisite` keeps the book''s wording for display.';

update public.class_features
   set mechanics = jsonb_build_object('activation', case feature_type
         when 'active' then 'action'
         when 'bonus_action' then 'bonus_action'
         when 'reaction' then 'reaction'
         when 'legendary' then 'special' end)
 where feature_type in ('active', 'bonus_action', 'reaction', 'legendary');

-- The current Open5e feat import keys a feat `<document>_<slug>`; a class
-- feature is `<document>_<class>_<slug>`. This is the last time that shape is
-- read: from here on `kind` says it.
update public.class_features
   set kind = 'feat'
 where source_record_key !~ '^legacy:'
   and source_record_key ~ '^[a-z0-9-]+_[^_]+$';

-- ─── 2. Official rows on the class tables ────────────────────────────────────

alter table public.custom_classes alter column user_id drop not null;
alter table public.custom_subclasses alter column user_id drop not null;

drop policy custom_classes_select on public.custom_classes;
create policy custom_classes_select on public.custom_classes for select using (
  (select auth.uid()) = user_id or user_id is null or private.is_dm_of_my_campaigns(user_id));

drop policy custom_classes_insert on public.custom_classes;
create policy custom_classes_insert on public.custom_classes for insert with check (
  ((select auth.uid()) = user_id and (campaign_id is null or private.is_campaign_dm(campaign_id)))
  or (user_id is null and campaign_id is null and private.is_app_admin()));

drop policy custom_classes_update on public.custom_classes;
create policy custom_classes_update on public.custom_classes for update
  using ((select auth.uid()) = user_id or (user_id is null and private.is_app_admin()))
  with check (
    ((select auth.uid()) = user_id and (campaign_id is null or private.is_campaign_dm(campaign_id)))
    or (user_id is null and campaign_id is null and private.is_app_admin()));

drop policy custom_classes_delete on public.custom_classes;
create policy custom_classes_delete on public.custom_classes for delete using (
  (select auth.uid()) = user_id or (user_id is null and private.is_app_admin()));

drop policy custom_subclasses_select on public.custom_subclasses;
create policy custom_subclasses_select on public.custom_subclasses for select using (
  (select auth.uid()) = user_id or user_id is null or private.is_dm_of_my_campaigns(user_id));

drop policy custom_subclasses_insert on public.custom_subclasses;
create policy custom_subclasses_insert on public.custom_subclasses for insert with check (
  ((select auth.uid()) = user_id and (campaign_id is null or private.is_campaign_dm(campaign_id)))
  or (user_id is null and campaign_id is null and private.is_app_admin()));

drop policy custom_subclasses_update on public.custom_subclasses;
create policy custom_subclasses_update on public.custom_subclasses for update
  using ((select auth.uid()) = user_id or (user_id is null and private.is_app_admin()))
  with check (
    ((select auth.uid()) = user_id and (campaign_id is null or private.is_campaign_dm(campaign_id)))
    or (user_id is null and campaign_id is null and private.is_app_admin()));

drop policy custom_subclasses_delete on public.custom_subclasses;
create policy custom_subclasses_delete on public.custom_subclasses for delete using (
  (select auth.uid()) = user_id or (user_id is null and private.is_app_admin()));

-- Official features: the admin may now also insert and delete them (the import
-- writes them). Update was made admin-only for official rows in 20261002110236.
drop policy class_features_insert on public.class_features;
create policy class_features_insert on public.class_features for insert with check (
  ((select auth.uid()) = user_id and (campaign_id is null or private.is_campaign_dm(campaign_id)))
  or (user_id is null and campaign_id is null and private.is_app_admin()));

drop policy class_features_update on public.class_features;
create policy class_features_update on public.class_features for update
  using ((select auth.uid()) = user_id or (user_id is null and private.is_app_admin()))
  with check (
    ((select auth.uid()) = user_id and (campaign_id is null or private.is_campaign_dm(campaign_id)))
    or (user_id is null and campaign_id is null and private.is_app_admin()));

drop policy class_features_delete on public.class_features;
create policy class_features_delete on public.class_features for delete using (
  (select auth.uid()) = user_id or (user_id is null and private.is_app_admin()));

-- The admin import writes an official class's feature map onto its system
-- row. Everything else on `system_classes` is migration-seeded chassis, and no
-- one else writes it.
create policy system_classes_update on public.system_classes for update
  using (private.is_app_admin())
  with check (private.is_app_admin());

-- An official subclass may be pinned by any character of its edition. The
-- trigger admitted only the character's own or its table's rows, so after
-- adoption any later write to the six characters already on an imported
-- subclass would have raised.
create or replace function public.validate_character_subclass_definition()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_name text; v_class_name text; v_ruleset text;
begin
  if new.subclass_name is null then
    new.subclass_definition_id := null;
    delete from public.ruleset_reviews
    where character_class_id = new.id and flag_type = 'subclass';
    return new;
  end if;
  if new.subclass_definition_id is null then return new; end if;
  v_ruleset := private.party_member_ruleset(new.party_member_id);
  select definition.subclass_name, definition.class_name
    into v_name, v_class_name
  from public.custom_subclasses definition
  join public.party_members member on member.id = new.party_member_id
  where definition.id = new.subclass_definition_id
    and (definition.ruleset is null or definition.ruleset = v_ruleset)
    and (definition.campaign_id = member.campaign_id
      or (definition.campaign_id is null
        and (definition.user_id is null
          or definition.user_id in (member.user_id, member.owner_user_id, auth.uid()))));
  if v_name is null then raise exception 'Subclass definition is unavailable for ruleset %', v_ruleset; end if;
  if v_name <> new.subclass_name or v_class_name <> new.class_name then
    raise exception 'Subclass definition does not match the selected class and subclass';
  end if;
  delete from public.ruleset_reviews
  where character_class_id = new.id and flag_type = 'subclass';
  return new;
end;
$function$;

-- The class trigger had the same gap: an official class that is not one of the
-- system classes (Black Flag, Tome of Heroes, A5E) lives in `custom_classes`
-- with no owner, and `user_id in (...)` is NULL for it, so a character could
-- not take it at all.
create or replace function public.validate_character_class_definition()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_name text; v_ruleset text;
begin
  if new.class_definition_id is null then return new; end if;
  v_ruleset := private.party_member_ruleset(new.party_member_id);
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
          and (definition.user_id is null
            or definition.user_id in (member.user_id, member.owner_user_id, auth.uid()))));
  end if;
  if v_name is null then raise exception 'Class definition is unavailable for ruleset %', v_ruleset; end if;
  if v_name <> new.class_name then raise exception 'Class definition does not match class name'; end if;
  delete from public.ruleset_reviews
  where character_class_id = new.id and flag_type = 'class';
  return new;
end;
$function$;

-- And the spell count level-up demands: for an official caster class the
-- definition was not found, so it asked for no spells and then refused the
-- ones the player was entitled to pick.
create or replace function public.required_level_up_spell_choices(p_member_id uuid, p_class_name text, p_new_class_level integer, p_definition_kind text DEFAULT NULL::text, p_definition_id uuid DEFAULT NULL::uuid)
 returns table(spell_count integer, cantrip_count integer)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ruleset text;
  v_policy public.class_spellcasting_policies%rowtype;
  v_caster_type text;
  v_spells_known jsonb;
  v_cantrips_known integer[];
  v_current integer;
  v_previous integer;
  v_wizard_spell_count integer;
begin
  if p_new_class_level < 1 or p_new_class_level > 20 then
    raise exception 'Class level must be between 1 and 20';
  end if;

  if not exists (select 1 from public.party_members pm where pm.id = p_member_id) then
    raise exception 'Party member not found' using errcode = 'P0002';
  end if;
  v_ruleset := private.party_member_ruleset(p_member_id);

  -- The Wizard spellbook's 6-at-level-1 / 2-per-level-thereafter acquisition
  -- rule is identical whether resolved via the pinned system policy below or
  -- the system/custom-class fallback; compute it once instead of twice.
  if p_class_name = 'Wizard' and coalesce(p_definition_kind, 'system') = 'system' then
    v_wizard_spell_count := case when p_new_class_level = 1 then 6 else 2 end;
  end if;

  select * into v_policy from public.class_spellcasting_policies
  where ruleset = v_ruleset and class_name = p_class_name
    and coalesce(p_definition_kind, 'system') = 'system';

  if found then
    if v_wizard_spell_count is not null then
      spell_count := v_wizard_spell_count;
    elsif v_policy.prepared_limit is not null then
      v_current := coalesce(v_policy.prepared_limit[p_new_class_level], 0);
      v_previous := case when p_new_class_level = 1 then 0
        else coalesce(v_policy.prepared_limit[p_new_class_level - 1], 0) end;
      spell_count := greatest(0, v_current - v_previous);
    else
      spell_count := 0;
    end if;
    if v_policy.cantrip_limit is not null then
      v_current := coalesce(v_policy.cantrip_limit[p_new_class_level], 0);
      v_previous := case when p_new_class_level = 1 then 0
        else coalesce(v_policy.cantrip_limit[p_new_class_level - 1], 0) end;
      cantrip_count := greatest(0, v_current - v_previous);
    else
      cantrip_count := 0;
    end if;
    return next;
    return;
  end if;

  select caster_type, spells_known, cantrips_known
    into v_caster_type, v_spells_known, v_cantrips_known
  from public.system_classes where class_name = p_class_name
    and (p_definition_id is null or id = p_definition_id)
    and coalesce(p_definition_kind, 'system') = 'system' limit 1;
  if not found then
    select cc.caster_type, cc.spells_known, cc.cantrips_known
      into v_caster_type, v_spells_known, v_cantrips_known
    from public.custom_classes cc
    join public.party_members pm on pm.id = p_member_id
    where cc.class_name = p_class_name
      and (p_definition_id is null or cc.id = p_definition_id)
      and coalesce(p_definition_kind, 'custom') = 'custom'
      and (cc.campaign_id = pm.campaign_id
        or (cc.campaign_id is null
          and (cc.user_id is null or cc.user_id in (pm.user_id, pm.owner_user_id))))
    order by (cc.campaign_id is not null) desc, (cc.user_id is not null) desc limit 1;
  end if;

  if v_wizard_spell_count is not null then
    spell_count := v_wizard_spell_count;
  elsif v_caster_type = 'known' and v_spells_known is not null then
    v_current := coalesce((v_spells_known ->> (p_new_class_level - 1))::integer, 0);
    v_previous := case when p_new_class_level = 1 then 0
      else coalesce((v_spells_known ->> (p_new_class_level - 2))::integer, 0) end;
    spell_count := greatest(0, v_current - v_previous);
  else
    spell_count := 0;
  end if;
  if v_cantrips_known is not null then
    v_current := coalesce(v_cantrips_known[p_new_class_level], 0);
    v_previous := case when p_new_class_level = 1 then 0
      else coalesce(v_cantrips_known[p_new_class_level - 1], 0) end;
    cantrip_count := greatest(0, v_current - v_previous);
  else
    cantrip_count := 0;
  end if;
  return next;
end;
$function$;

-- ─── 3. Adopt the current Open5e import ──────────────────────────────────────

-- The book a row comes from, as `content_sources.key`: the key a table enables.
-- Open5e's own document keys differ for some books (`tdcs` is `taldorei`,
-- `bfrd` is `blackflag`, `open5e` is `o5e`).
create function pg_temp.source_slug(p_document_key text) returns text
language sql stable as $$
  select coalesce(
    (select cs.key from public.content_sources cs where cs.open5e_key = p_document_key),
    (select cs.key from public.content_sources cs where cs.key = p_document_key));
$$;

-- Several accounts may have imported the same entry. The earliest copy of each
-- identity becomes the official row; the others are repointed to it below.
create temp table official_feature on commit drop as
select distinct on (f.source_document_key, f.source_record_key, f.ruleset) f.id
  from public.class_features f
 where f.open5e_import
   and f.source_document_key is not null
   and f.source_record_key is not null
   and f.source_record_key !~ '^legacy:'
   and pg_temp.source_slug(f.source_document_key) is not null
 order by f.source_document_key, f.source_record_key, f.ruleset, f.created_at, f.id;

create temp table official_subclass on commit drop as
select distinct on (s.source_document_key, s.source_record_key, s.ruleset) s.id
  from public.custom_subclasses s
 where s.provenance ->> 'provider' = 'open5e-v2'
   and s.source_record_key is not null
   and pg_temp.source_slug(s.source_document_key) is not null
 order by s.source_document_key, s.source_record_key, s.ruleset, s.created_at, s.id;

create temp table official_class on commit drop as
select distinct on (c.source_document_key, c.source_record_key, c.ruleset) c.id
  from public.custom_classes c
 where c.provenance ->> 'provider' = 'open5e-v2'
   and c.source_record_key is not null
   and pg_temp.source_slug(c.source_document_key) is not null
 order by c.source_document_key, c.source_record_key, c.ruleset, c.created_at, c.id;

-- old id -> the row that replaces it, for every kind of reference rewritten below.
create temp table remap (old_id uuid primary key, new_id uuid not null) on commit drop;

insert into remap (old_id, new_id)
select dup.id, keep.id
  from public.class_features dup
  join public.class_features keep
    on keep.id in (select id from official_feature)
   and keep.source_document_key = dup.source_document_key
   and keep.source_record_key = dup.source_record_key
   and keep.ruleset is not distinct from dup.ruleset
 where dup.open5e_import and dup.id <> keep.id
   and dup.id not in (select id from official_feature);

insert into remap (old_id, new_id)
select dup.id, keep.id
  from public.custom_subclasses dup
  join public.custom_subclasses keep
    on keep.id in (select id from official_subclass)
   and keep.source_document_key = dup.source_document_key
   and keep.source_record_key = dup.source_record_key
   and keep.ruleset is not distinct from dup.ruleset
 where dup.provenance ->> 'provider' = 'open5e-v2' and dup.id <> keep.id
   and dup.id not in (select id from official_subclass);

-- A legacy subclass whose current import exists (same class, same name, an
-- open-licensed document, an edition a character on it could hold) moves there.
insert into remap (old_id, new_id)
select legacy.id, twin.id
  from public.custom_subclasses legacy
  join lateral (
    select s.id from public.custom_subclasses s
     where s.id in (select id from official_subclass)
       and s.class_name = legacy.class_name
       and lower(s.subclass_name) = lower(legacy.subclass_name)
       and (legacy.ruleset is null or s.ruleset = legacy.ruleset)
     order by (s.ruleset = '2014') desc, s.created_at
     limit 1) twin on true
 where legacy.source_record_key ~ '^legacy:'
   and legacy.source_document_key in (
     'Tome of Heroes', 'Open5e Originals', 'System Reference Document 5.1',
     'System Reference Document 5.2', 'Tal''dorei Campaign Setting',
     'Adventurer''s Guide', 'Black Flag SRD')
on conflict (old_id) do nothing;

-- A copy of a legacy SRD subclass kept for one campaign (20261003105148 made
-- these for the demo template, so `load_demo_campaign` could carry them) has no
-- provenance of its own, and every feature it grants is a textless legacy row
-- only its author can read: a player who loaded the demo saw a Thief with no
-- Thief features. Where the subclass exists officially in the same edition,
-- the campaign's characters move to the official one and the copy goes.
insert into remap (old_id, new_id)
select copy.id, twin.id
  from public.custom_subclasses copy
  join lateral (
    select s.id from public.custom_subclasses s
     where s.id in (select id from official_subclass)
       and s.class_name = copy.class_name
       and lower(s.subclass_name) = lower(copy.subclass_name)
       and s.ruleset = copy.ruleset
     order by s.created_at
     limit 1) twin on true
 where copy.source_record_key is null
   and copy.ruleset is not null
   and jsonb_typeof(copy.features) = 'object'
   and exists (
     select 1 from jsonb_each(copy.features) l, jsonb_array_elements_text(l.value) x(v))
   and not exists (
     select 1
       from jsonb_each(copy.features) l, jsonb_array_elements_text(l.value) x(v)
       left join public.class_features f on f.id::text = x.v
      where f.id is null or f.source_record_key is null or f.source_record_key !~ '^legacy:')
on conflict (old_id) do nothing;

-- Rewrites every id in a `{ "<level>": [id, ...] }` feature map through `remap`.
create function pg_temp.remap_feature_map(p_map jsonb) returns jsonb
language sql stable as $$
  select case when jsonb_typeof(p_map) <> 'object' then p_map else coalesce((
    select jsonb_object_agg(lvl.key, case when jsonb_typeof(lvl.value) <> 'array' then lvl.value else (
      select coalesce(jsonb_agg(coalesce(r.new_id::text, ref.v) order by ref.ord), '[]'::jsonb)
        from jsonb_array_elements_text(lvl.value) with ordinality as ref(v, ord)
        left join remap r on r.old_id::text = ref.v) end)
      from jsonb_each(p_map) as lvl), '{}'::jsonb) end;
$$;

update public.system_classes set features = pg_temp.remap_feature_map(features);
update public.custom_classes set features = pg_temp.remap_feature_map(features)
 where id not in (select old_id from remap);
update public.custom_subclasses set features = pg_temp.remap_feature_map(features)
 where id not in (select old_id from remap);

-- Characters on a duplicate or legacy subclass. The subclass trigger checks the
-- new row against the character's edition, which a twin was chosen to match.
create temp table moved_member on commit drop as
select distinct cc.party_member_id
  from public.character_classes cc
 where cc.subclass_definition_id in (select old_id from remap);

update public.character_classes cc
   set subclass_definition_id = r.new_id
  from remap r
 where cc.subclass_definition_id = r.old_id;

-- A character's own choices name features by id too: feats in
-- `class_choices.feats` / `origin_feat_id`, picks a homebrew step stored, and
-- the record of each level. Rewritten through the same map, so deleting a
-- duplicate below leaves no character pointing at nothing.
do $$
declare r record;
begin
  for r in select old_id, new_id from remap loop
    update public.party_members
       set class_choices = replace(class_choices::text, r.old_id::text, r.new_id::text)::jsonb,
           level_choices = replace(level_choices::text, r.old_id::text, r.new_id::text)::jsonb
     where class_choices::text like '%' || r.old_id::text || '%'
        or level_choices::text like '%' || r.old_id::text || '%';
  end loop;
end $$;

-- Now nothing points at a duplicate, adopt the keepers.
update public.class_features f
   set user_id = null,
       campaign_id = null,
       source = pg_temp.source_slug(f.source_document_key)
 where f.id in (select id from official_feature);

update public.custom_subclasses s
   set user_id = null,
       campaign_id = null,
       source = pg_temp.source_slug(s.source_document_key)
 where s.id in (select id from official_subclass);

update public.custom_classes c
   set user_id = null,
       campaign_id = null,
       source = pg_temp.source_slug(c.source_document_key)
 where c.id in (select id from official_class);

-- ─── 4. The official classes are `system_classes` ────────────────────────────

-- The import of an official class (SRD 5.1 for 2014, SRD 5.2 for 2024) is the
-- same class as the system row of that edition and name. The system row keeps
-- its chassis (hit die, slots, ASI levels) and takes the import's feature map,
-- which has the SRD text the hand-seeded placeholders never had.
create temp table class_fold on commit drop as
select c.id as custom_id, sc.id as system_id
  from public.custom_classes c
  join public.system_classes sc on sc.ruleset = c.ruleset and lower(sc.class_name) = lower(c.class_name)
 where c.id in (select id from official_class)
   and c.source_document_key in ('srd-2014', 'srd-2024');

update public.system_classes sc
   set features = c.features
  from class_fold f
  join public.custom_classes c on c.id = f.custom_id
 where sc.id = f.system_id
   and jsonb_typeof(c.features) = 'object'
   and c.features <> '{}'::jsonb;

insert into moved_member (party_member_id)
select distinct cc.party_member_id
  from public.character_classes cc
 where cc.class_definition_kind = 'custom'
   and cc.class_definition_id in (select custom_id from class_fold);

update public.character_classes cc
   set class_definition_kind = 'system',
       class_definition_id = f.system_id
  from class_fold f
 where cc.class_definition_kind = 'custom'
   and cc.class_definition_id = f.custom_id;

-- A pending review names what the character pointed at, and that changed.
-- Recomputed for every moved character at the end of this migration.
delete from public.character_content_reviews ccr
 where ccr.ref in (select old_id::text from remap)
    or ccr.ref in (select custom_id::text from class_fold);

delete from public.custom_classes where id in (select custom_id from class_fold);
delete from public.custom_subclasses where id in (select old_id from remap);
delete from public.class_features where id in (select old_id from remap);

-- ─── 5. What nothing points at any more ──────────────────────────────────────

-- Whether a feature id is still used by a definition or a character. Characters
-- are matched on the text of their choices: a homebrew `feature_pick` step
-- stores ids under keys of its own naming, so no path list would be complete.
create function pg_temp.feature_in_use(p_id uuid) returns boolean
language sql stable as $$
  select exists (
      select 1 from public.system_classes d, jsonb_each(case when jsonb_typeof(d.features) = 'object' then d.features else '{}' end) l,
             jsonb_array_elements_text(case when jsonb_typeof(l.value) = 'array' then l.value else '[]' end) x(v)
       where x.v = p_id::text)
    or exists (
      select 1 from public.custom_classes d, jsonb_each(case when jsonb_typeof(d.features) = 'object' then d.features else '{}' end) l,
             jsonb_array_elements_text(case when jsonb_typeof(l.value) = 'array' then l.value else '[]' end) x(v)
       where x.v = p_id::text)
    or exists (
      select 1 from public.custom_subclasses d, jsonb_each(case when jsonb_typeof(d.features) = 'object' then d.features else '{}' end) l,
             jsonb_array_elements_text(case when jsonb_typeof(l.value) = 'array' then l.value else '[]' end) x(v)
       where x.v = p_id::text)
    or exists (
      select 1 from public.party_members pm
       where pm.class_choices::text like '%' || p_id::text || '%'
          or pm.level_choices::text like '%' || p_id::text || '%');
$$;

-- The older import's subclasses nothing stands on. A user's own book (PHB)
-- is not among these documents and keeps its rows.
delete from public.custom_subclasses s
 where s.source_record_key ~ '^legacy:'
   and s.source_document_key in (
     'Tome of Heroes', 'Open5e Originals', 'System Reference Document 5.1',
     'System Reference Document 5.2', 'Tal''dorei Campaign Setting',
     'Adventurer''s Guide', 'Black Flag SRD')
   and not exists (select 1 from public.character_classes cc where cc.subclass_definition_id = s.id);

-- The older import's features. Those a surviving definition (a user's PHB
-- subclass, a homebrew class) still uses stay, with their owner.
delete from public.class_features f
 where f.source_record_key ~ '^legacy:'
   and not pg_temp.feature_in_use(f.id);

-- The hand-seeded placeholders (official, no provenance) the system classes
-- stopped pointing at in step 4.
delete from public.class_features f
 where f.user_id is null
   and f.source_record_key is null
   and not pg_temp.feature_in_use(f.id);

-- The survivors name their book by the key a table enables.
update public.class_features
   set source = 'srd-2014'
 where user_id is null and source = 'srd-5.1';

-- ─── 6. Identity of official rows ────────────────────────────────────────────

-- Names repeat across editions now that official rows exist for both, so an
-- official row is unique by its provenance, as every account's import already was.
drop index if exists public.class_features_system_name_unique;
create unique index class_features_official_identity_unique
  on public.class_features (source_document_key, source_record_key, ruleset)
  where user_id is null and source_document_key is not null and source_record_key is not null;
create unique index custom_subclasses_official_identity_unique
  on public.custom_subclasses (source_document_key, source_record_key, ruleset)
  where user_id is null and source_record_key is not null;
create unique index custom_classes_official_identity_unique
  on public.custom_classes (source_document_key, source_record_key, ruleset)
  where user_id is null and source_record_key is not null;

-- ─── 7. Approval ─────────────────────────────────────────────────────────────

-- An official class, subclass or feat is a book entry like a library row: it
-- needs the table to have its book enabled. Before this, an official feat was
-- approved unconditionally and an official subclass could not exist.
create or replace function private.assess_content(p_kind text, p_ref text, p_campaign_id uuid, p_character_owner uuid, OUT approved boolean, OUT reason text, OUT label text, OUT source_slug text, OUT source_title text, OUT repoint_to uuid)
 returns record
 language plpgsql
 stable
 set search_path to ''
as $function$
declare
  v_uuid uuid;
  v_owner uuid;
  v_row_campaign uuid;
  v_document_key text;
  v_record_key text;
  v_ruleset text;
  v_source text;
  v_found boolean := false;
  v_blocked boolean := false;
begin
  approved := true;

  if p_kind = 'class' and p_ref like 'system:%' then
    label := substr(p_ref, 8);
    -- By name, and a name is not a different class for being typed in another case.
    if exists (
      select 1 from public.campaigns c, unnest(coalesce(c.disabled_class_names, '{}')) as blocked(name)
       where c.id = p_campaign_id and lower(blocked.name) = lower(label)
    ) then
      approved := false;
      reason := 'blocked';
    end if;
    return;
  end if;

  if p_kind = 'species' then
    v_blocked := exists (
      select 1 from public.campaigns c
       where c.id = p_campaign_id and p_ref = any(coalesce(c.disabled_species_ids, '{}')));
  end if;

  -- Library rows: public, shared, admin-written, tagged with their book. A slug
  -- the library does not know is nothing a client could have created, so it is
  -- left alone.
  v_uuid := private.try_uuid(p_ref);
  if v_uuid is null then
    if p_kind = 'species' then
      select ls.name, ls.source, ls.source_title into label, source_slug, source_title
        from public.library_species ls where ls.id = p_ref;
      v_found := found;
    elsif p_kind = 'background' then
      select lb.name, lb.source, lb.source_title into label, source_slug, source_title
        from public.library_backgrounds lb where lb.id = p_ref;
      v_found := found;
    elsif p_kind = 'spell' then
      select ls.name, ls.source, ls.source_title into label, source_slug, source_title
        from public.library_spells ls where ls.id = p_ref;
      v_found := found;
    end if;
    if not v_found then
      return;
    end if;
    if v_blocked then
      approved := false;
      reason := 'blocked';
    elsif not private.source_enabled(p_campaign_id, source_slug) then
      approved := false;
      reason := 'source';
    end if;
    return;
  end if;

  -- Rows somebody owns, or official rows (no owner).
  case p_kind
    when 'species' then
      select s.name, s.user_id, s.campaign_id, s.source_document_key, s.source_record_key, s.ruleset, null::text
        into label, v_owner, v_row_campaign, v_document_key, v_record_key, v_ruleset, v_source
        from public.species s where s.id = v_uuid;
      v_found := found;
    when 'background' then
      select b.name, b.user_id, null::uuid, b.source_document_key, b.source_record_key, b.ruleset, null::text
        into label, v_owner, v_row_campaign, v_document_key, v_record_key, v_ruleset, v_source
        from public.backgrounds b where b.id = v_uuid;
      v_found := found;
    when 'class' then
      select c.class_name, c.user_id, c.campaign_id, c.source_document_key, c.source_record_key, c.ruleset, c.source
        into label, v_owner, v_row_campaign, v_document_key, v_record_key, v_ruleset, v_source
        from public.custom_classes c where c.id = v_uuid;
      v_found := found;
    when 'subclass' then
      select c.subclass_name, c.user_id, c.campaign_id, c.source_document_key, c.source_record_key, c.ruleset, c.source
        into label, v_owner, v_row_campaign, v_document_key, v_record_key, v_ruleset, v_source
        from public.custom_subclasses c where c.id = v_uuid;
      v_found := found;
    when 'spell' then
      select s.name, s.user_id, s.campaign_id, s.source_document_key, s.source_record_key, s.ruleset, null::text
        into label, v_owner, v_row_campaign, v_document_key, v_record_key, v_ruleset, v_source
        from public.spells s where s.id = v_uuid;
      v_found := found;
    when 'feat' then
      select f.name, f.user_id, f.campaign_id, f.source_document_key, f.source_record_key, f.ruleset, f.source
        into label, v_owner, v_row_campaign, v_document_key, v_record_key, v_ruleset, v_source
        from public.class_features f where f.id = v_uuid;
      v_found := found;
    else
      raise exception 'Unknown content kind %', p_kind;
  end case;

  if not v_found then
    approved := false;
    reason := 'missing';
    label := 'Something that no longer exists';
    return;
  end if;

  -- Official: approved when the table has the book. Grimoire's own chassis
  -- rows belong to no book a table can switch off.
  if v_owner is null and p_kind in ('class', 'subclass', 'feat') then
    if v_source in ('grimoire-system', 'grimoire-2024-compatibility') then
      return;
    end if;
    source_slug := v_source;
    select cs.title into source_title from public.content_sources cs where cs.key = v_source;
    if not private.source_enabled(p_campaign_id, v_source) then
      approved := false;
      reason := 'source';
    end if;
    return;
  end if;

  -- The table's own: a DM of this table owns it, and it is not kept for another
  -- campaign of theirs.
  if private.is_table_dm(p_campaign_id, v_owner)
     and (v_row_campaign is null or v_row_campaign = p_campaign_id) then
    if v_blocked then
      approved := false;
      reason := 'blocked';
    end if;
    return;
  end if;

  approved := false;
  repoint_to := private.table_book_entry(p_kind, p_campaign_id, v_document_key, v_record_key, v_ruleset);

  -- "The character's owner" is whoever owns the character, and nobody when
  -- nobody does. It is never the row's creator standing in: a DM may create a
  -- roster character, and a creator that could be read as an owner would let
  -- that DM make any account the "owner" and read or copy that account's
  -- content through a flag.
  if p_character_owner is not null and v_owner = p_character_owner then
    reason := 'homebrew';
  else
    reason := 'foreign';
    label := 'Content from another table';
  end if;
end;
$function$;

-- Re-review every character whose class or subclass moved, so its table's
-- queue names what it now stands on.
do $$
declare v_member uuid;
begin
  for v_member in select distinct party_member_id from moved_member loop
    perform private.review_party_member_content(v_member);
  end loop;
end $$;
