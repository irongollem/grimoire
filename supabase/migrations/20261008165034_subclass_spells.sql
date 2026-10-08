-- Subclass spells: the server is the only writer of the spells a subclass grants.
--
-- By the rules (2014 and 2024) a subclass touches a character's spells in three
-- ways, and only the first existed here:
--
--   (a) Granted, always prepared. A Cleric domain, Paladin oath, Druid circle or
--       2024 Warlock patron hands over spells at class levels. They never count
--       toward prepared or known limits. `custom_subclasses.granted_spells`
--       ({ "<class level>": [spell id] }) already described them, but the CLIENT
--       wrote the `character_spells` rows itself during creation and level-up, so
--       a de-level, a subclass change or an edit to the subclass left stale rows
--       behind, and every new client path had to remember to do it again.
--   (b) Granted through a choice the character makes: Circle of the Land's
--       terrain (2014) or land type (2024). `spell_variants`
--       ({ "<option>": { "<class level>": [ids] } }) holds the options,
--       `character_classes.subclass_variant` the pick. Both sit beside
--       `granted_spells`: the variant's grants are added to the base grants.
--   (c) An expanded list a class PICKS from (2014 Warlock patrons). The spells
--       count as known and the player chooses them, so they are not granted;
--       `expanded_spells` ({ "<spell level>": [ids] }) only widens what
--       `validate_character_spell_source` admits for that class.
--       `expanded_spell_variants` ({ "<option>": { "<spell level>": [ids] } }) is
--       the part that depends on the same choice as (b), e.g. a patron affinity.
--
-- Why a function and triggers rather than client code: "which spells does this
-- row owe?" is a pure function of (subclass, variant, class level). Computing it
-- in one place and re-running it whenever any of the three change makes every
-- caller right by construction: level-up, de-level, subclass swap, variant swap,
-- an admin editing the subclass, a character created straight into a level.
--
-- `character_spells.granted_by_subclass` marks the rows the sync owns, so it can
-- delete exactly those when they stop being owed and leave the player's own
-- picks alone. A player who had already picked a domain spell has that row
-- converted (always prepared, flagged) instead of duplicated, which frees the
-- prepared slot it was eating: the limits trigger skips always_prepared rows.
--
-- Security: `private.sync_subclass_spells` is a SECURITY DEFINER (it writes
-- `character_spells` on behalf of triggers that fire for any owner, DM or admin
-- edit). It lives in `private`, EXECUTE is revoked from every client role, and it
-- acts only on the single `character_classes` row it is given. The trigger
-- functions are in `private` too, so none of this becomes an /rpc endpoint.

-- ── Columns ──────────────────────────────────────────────────────────────────

alter table public.custom_subclasses
  add column spell_variants jsonb not null default '{}'::jsonb,
  add column spell_variant_label text,
  add column expanded_spells jsonb not null default '{}'::jsonb,
  add column expanded_spell_variants jsonb not null default '{}'::jsonb;

alter table public.custom_subclasses
  add constraint custom_subclasses_spell_variants_object check (jsonb_typeof(spell_variants) = 'object'),
  add constraint custom_subclasses_expanded_spells_object check (jsonb_typeof(expanded_spells) = 'object'),
  add constraint custom_subclasses_expanded_spell_variants_object check (jsonb_typeof(expanded_spell_variants) = 'object');
-- NOT VALID: new writes must be objects; rows from before this migration are not rescanned.
alter table public.custom_subclasses
  add constraint custom_subclasses_granted_spells_object check (jsonb_typeof(granted_spells) = 'object') not valid;

alter table public.character_classes
  add column subclass_variant text;
-- A variant belongs to a subclass. Whether it is one of THAT subclass's options
-- needs a lookup, so validate_character_subclass_definition checks it.
alter table public.character_classes
  add constraint character_classes_variant_needs_subclass
  check (subclass_variant is null or subclass_name is not null);

alter table public.character_spells
  add column granted_by_subclass boolean not null default false;

create index character_spells_granted_by_subclass_idx
  on public.character_spells (source_class_id) where granted_by_subclass;

-- ── Subclass validation: variants ────────────────────────────────────────────
-- Same body as before, plus: no subclass clears the variant (de-level
-- clear_subclass nulls the name and the definition id, never the variant); a
-- changed subclass drops a variant the caller did not set again; a variant must
-- be an option of the subclass it is pinned to: a key of spell_variants (granted
-- spells) or of expanded_spell_variants (a larger pick-from list). Both share the
-- one choice, as Animal Lords' affinity does.

create or replace function public.validate_character_subclass_definition()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_name text; v_class_name text; v_ruleset text; v_variants jsonb; v_expanded_variants jsonb;
begin
  if new.subclass_name is null then
    new.subclass_definition_id := null;
    new.subclass_variant := null;
    delete from public.ruleset_reviews
    where character_class_id = new.id and flag_type = 'subclass';
    return new;
  end if;
  if new.subclass_definition_id is null then
    if new.subclass_variant is not null then
      raise exception 'A subclass variant needs a subclass definition';
    end if;
    return new;
  end if;
  v_ruleset := private.party_member_ruleset(new.party_member_id);
  select definition.subclass_name, definition.class_name, definition.spell_variants, definition.expanded_spell_variants
    into v_name, v_class_name, v_variants, v_expanded_variants
  from public.custom_subclasses definition
  where definition.id = new.subclass_definition_id
    and (definition.ruleset is null or definition.ruleset = v_ruleset)
    and private.character_may_take_definition(new.party_member_id, definition.campaign_id, definition.user_id);
  if v_name is null then raise exception 'Subclass definition is unavailable for ruleset %', v_ruleset; end if;
  if v_name <> new.subclass_name or v_class_name <> new.class_name then
    raise exception 'Subclass definition does not match the selected class and subclass';
  end if;
  -- Swapping subclass without naming a variant must not carry the old one over.
  if tg_op = 'UPDATE'
     and new.subclass_definition_id is distinct from old.subclass_definition_id
     and new.subclass_variant is not distinct from old.subclass_variant then
    new.subclass_variant := null;
  end if;
  if new.subclass_variant is not null
     and not (jsonb_typeof(v_variants) = 'object' and v_variants ? new.subclass_variant)
     and not (jsonb_typeof(v_expanded_variants) = 'object' and v_expanded_variants ? new.subclass_variant) then
    raise exception '% is not an option of the % subclass', new.subclass_variant, v_name;
  end if;
  delete from public.ruleset_reviews
  where character_class_id = new.id and flag_type = 'subclass';
  return new;
end;
$function$;

drop trigger character_classes_validate_subclass_definition on public.character_classes;
create trigger character_classes_validate_subclass_definition
  before insert or update of party_member_id, class_name, subclass_name, subclass_definition_id, subclass_variant
  on public.character_classes
  for each row execute function public.validate_character_subclass_definition();

-- ── Spell source: the expanded list ──────────────────────────────────────────
-- The class-list gate also admits a spell listed in any tier of the character's
-- subclass `expanded_spells`. Every other check, the max-spell-level one
-- included, is unchanged.

CREATE OR REPLACE FUNCTION public.validate_character_spell_source()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_class public.character_classes%rowtype;
  v_member public.party_members%rowtype;
  v_policy public.class_spellcasting_policies%rowtype;
  v_spell_level integer;
  v_spell_classes text[];
  v_spell_slots jsonb;
  v_cantrips_known integer[];
  v_row jsonb;
  v_max_spell_level integer := 0;
  v_index integer;
begin
  if new.source_type <> 'class' then
    if new.source_class_id is not null then raise exception 'Non-class spell grants cannot reference a source class'; end if;
    return new;
  end if;
  if new.source_class_id is null then raise exception 'Class spells require a source class'; end if;
  select * into v_class from public.character_classes
    where id = new.source_class_id and party_member_id = new.party_member_id;
  if not found then raise exception 'Spell source class does not belong to this character'; end if;
  select * into strict v_member from public.party_members where id = new.party_member_id;

  select level, classes into v_spell_level, v_spell_classes from public.library_spells where id = new.spell_id;
  if not found then select level, classes into v_spell_level, v_spell_classes from public.spells where id::text = new.spell_id; end if;
  if not found then raise exception 'Spell does not exist'; end if;
  if not new.always_prepared
     and not (v_class.class_name = any(coalesce(v_spell_classes, '{}'::text[])))
     and not (
       v_class.subclass_definition_id is not null
       and exists (
         select 1
         from public.custom_subclasses subclass,
              lateral (
                select case when jsonb_typeof(subclass.expanded_spells) = 'object'
                            then subclass.expanded_spells else '{}'::jsonb end as tiers
                union all
                select case when v_class.subclass_variant is not null
                                 and jsonb_typeof(subclass.expanded_spell_variants) = 'object'
                                 and jsonb_typeof(subclass.expanded_spell_variants -> v_class.subclass_variant) = 'object'
                            then subclass.expanded_spell_variants -> v_class.subclass_variant else '{}'::jsonb end
              ) lists,
              jsonb_each(lists.tiers) tier(spell_level, ids),
              jsonb_array_elements_text(case when jsonb_typeof(tier.ids) = 'array'
                                             then tier.ids else '[]'::jsonb end) listed(spell_id)
         where subclass.id = v_class.subclass_definition_id and listed.spell_id = new.spell_id
       )
     ) then
    raise exception '% is not on the % spell list', new.spell_id, v_class.class_name;
  end if;

  if v_class.class_definition_kind = 'system' then
    select policy.* into v_policy from public.class_spellcasting_policies policy
    where policy.ruleset = private.party_member_ruleset(v_member.id) and policy.class_name = v_class.class_name;
  end if;
  if v_policy.ruleset is not null then
    if v_spell_level = 0 and v_policy.cantrip_limit is null and not new.always_prepared then
      raise exception '% does not have a cantrip progression', v_class.class_name;
    end if;
    v_max_spell_level := v_policy.max_spell_level[least(v_class.levels, 20)];
  else
    if v_class.class_definition_kind = 'system' then
      select spell_slots, cantrips_known into v_spell_slots, v_cantrips_known
      from public.system_classes where class_name = v_class.class_name
        and id = v_class.class_definition_id limit 1;
    else
      select spell_slots, cantrips_known into v_spell_slots, v_cantrips_known
      from public.custom_classes where id = v_class.class_definition_id;
    end if;
    if not found or v_spell_slots is null then raise exception '% is not configured as a spellcasting class', v_class.class_name; end if;
    if v_spell_level = 0 then
      if v_cantrips_known is null and not new.always_prepared then raise exception '% does not have a cantrip progression', v_class.class_name; end if;
      return new;
    end if;
    v_row := v_spell_slots -> (least(v_class.levels, 20) - 1);
    if v_row is null or jsonb_typeof(v_row) <> 'array' then
      raise exception 'Missing spell-slot progression for % level %', v_class.class_name, v_class.levels;
    end if;
    if jsonb_array_length(v_row) > 0 then
      for v_index in 0..least(jsonb_array_length(v_row), 9) - 1 loop
        if coalesce((v_row ->> v_index)::integer, 0) > 0 then v_max_spell_level := v_index + 1; end if;
      end loop;
    end if;
  end if;
  if v_spell_level > 0 and v_spell_level > v_max_spell_level then
    raise exception 'A level-% % cannot acquire a level-% spell', v_class.levels, v_class.class_name, v_spell_level;
  end if;
  return new;
end;
$function$;

-- ── The sync ─────────────────────────────────────────────────────────────────
-- Reconciles ONE character_classes row. Expected set = granted_spells plus
-- spell_variants[subclass_variant], every tier whose class level is <= levels.
-- Idempotent: running it twice changes nothing the second time.

create or replace function private.sync_subclass_spells(p_class_row uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_class public.character_classes%rowtype;
  v_def public.custom_subclasses%rowtype;
  v_expected text[] := '{}';
  v_row_id uuid;
  v_spell_id text;
  v_prev_guard text := current_setting('app.preparation_change_spell_id', true);
begin
  select * into v_class from public.character_classes where id = p_class_row;
  if not found then return; end if;

  if v_class.subclass_definition_id is not null then
    select * into v_def from public.custom_subclasses where id = v_class.subclass_definition_id;
  end if;

  if v_def.id is not null then
    -- Tier keys are class levels as text; anything that is not 1-3 digits is
    -- ignored rather than cast. A spell id that exists in neither catalogue is
    -- skipped: it can never become a valid row, and failing here would block a
    -- level-up over data the player cannot fix. The same reasoning covers a spell
    -- the class cannot hold YET (above its max spell level, or a class with no
    -- spellcasting configuration): each convert and insert below runs in its own
    -- sub-block, so validate_character_spell_source refusing one grant leaves
    -- that spell off the sheet instead of aborting the level-up, or the author's
    -- whole subclass edit. The sync re-runs on every level change, so the grant
    -- arrives at the level that makes it legal.
    select coalesce(array_agg(distinct tiers.spell_id), '{}'::text[]) into v_expected
    from (
      select listed.spell_id
      from jsonb_each(case when jsonb_typeof(v_def.granted_spells) = 'object'
                           then v_def.granted_spells else '{}'::jsonb end) tier(lvl, ids),
           jsonb_array_elements_text(case when jsonb_typeof(tier.ids) = 'array'
                                          then tier.ids else '[]'::jsonb end) listed(spell_id)
      where case when tier.lvl ~ '^[0-9]{1,3}$' then tier.lvl::integer end <= v_class.levels
      union
      select listed.spell_id
      from jsonb_each(case when v_class.subclass_variant is not null
                                and jsonb_typeof(v_def.spell_variants) = 'object'
                                and jsonb_typeof(v_def.spell_variants -> v_class.subclass_variant) = 'object'
                           then v_def.spell_variants -> v_class.subclass_variant else '{}'::jsonb end) tier(lvl, ids),
           jsonb_array_elements_text(case when jsonb_typeof(tier.ids) = 'array'
                                          then tier.ids else '[]'::jsonb end) listed(spell_id)
      where case when tier.lvl ~ '^[0-9]{1,3}$' then tier.lvl::integer end <= v_class.levels
    ) tiers
    where exists (select 1 from public.library_spells s where s.id = tiers.spell_id)
       or exists (select 1 from public.spells s where s.id::text = tiers.spell_id);
  end if;

  -- No longer owed: a de-level, a subclass change or a variant change.
  delete from public.character_spells
  where source_class_id = p_class_row
    and granted_by_subclass
    and not (spell_id = any (v_expected));

  -- Already on the sheet as this class's pick (or half-granted): convert it.
  -- A 2024 character may not flip is_prepared outside a change window, so the
  -- guard is opened for exactly that row, as the window code does, then restored.
  for v_row_id in
    select id from public.character_spells
    where party_member_id = v_class.party_member_id
      and source_type = 'class'
      and source_class_id = p_class_row
      and spell_id = any (v_expected)
      and not (always_prepared and is_prepared and granted_by_subclass)
  loop
    begin
      perform set_config('app.preparation_change_spell_id', v_row_id::text, true);
      update public.character_spells
         set always_prepared = true, is_prepared = true, granted_by_subclass = true
       where id = v_row_id;
    exception when others then
      raise warning 'sync_subclass_spells: left row % as it was (%)', v_row_id, sqlerrm;
    end;
  end loop;
  perform set_config('app.preparation_change_spell_id', coalesce(v_prev_guard, ''), true);

  for v_spell_id in
    select wanted.spell_id from unnest(v_expected) as wanted(spell_id)
    where not exists (
      select 1 from public.character_spells existing
      where existing.party_member_id = v_class.party_member_id
        and existing.spell_id = wanted.spell_id
        and existing.source_type = 'class'
        and existing.source_class_id = p_class_row
    )
  loop
    begin
      insert into public.character_spells
        (party_member_id, spell_id, source_type, source_class_id,
         is_known, is_prepared, always_prepared, granted_by_subclass)
      values (v_class.party_member_id, v_spell_id, 'class', p_class_row, true, true, true, true);
    exception when others then
      raise warning 'sync_subclass_spells: % not granted yet (%)', v_spell_id, sqlerrm;
    end;
  end loop;
end;
$function$;

revoke execute on function private.sync_subclass_spells(uuid) from public, anon, authenticated;

-- ── Triggers ─────────────────────────────────────────────────────────────────

create or replace function private.character_classes_sync_subclass_spells()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  perform private.sync_subclass_spells(new.id);
  return null;
end;
$function$;

create or replace function private.character_classes_drop_subclass_spells()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  -- character_spells.source_class_id is ON DELETE SET NULL, which would leave
  -- the granted rows behind as orphans no sync could ever find.
  delete from public.character_spells
  where source_class_id = old.id and granted_by_subclass;
  return old;
end;
$function$;

create or replace function private.custom_subclasses_resync_characters()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_class_id uuid;
begin
  -- One character failing must not abort the author's edit of the subclass.
  for v_class_id in select cc.id from public.character_classes cc where cc.subclass_definition_id = new.id loop
    begin
      perform private.sync_subclass_spells(v_class_id);
    exception when others then
      raise warning 'custom_subclasses_resync_characters: class row % not synced (%)', v_class_id, sqlerrm;
    end;
  end loop;
  return null;
end;
$function$;

-- character_classes.subclass_definition_id has no FK, so deleting a subclass
-- leaves its grants on the sheets until the class row is next touched. The
-- definition is gone by now, so the sync finds nothing owed and removes them.
create or replace function private.custom_subclasses_drop_grants()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_class_id uuid;
begin
  for v_class_id in select cc.id from public.character_classes cc where cc.subclass_definition_id = old.id loop
    begin
      perform private.sync_subclass_spells(v_class_id);
    exception when others then
      raise warning 'custom_subclasses_drop_grants: class row % not synced (%)', v_class_id, sqlerrm;
    end;
  end loop;
  return null;
end;
$function$;

revoke execute on function private.character_classes_sync_subclass_spells() from public, anon, authenticated;
revoke execute on function private.character_classes_drop_subclass_spells() from public, anon, authenticated;
revoke execute on function private.custom_subclasses_resync_characters() from public, anon, authenticated;
revoke execute on function private.custom_subclasses_drop_grants() from public, anon, authenticated;

-- subclass_name is listed too: validate_character_subclass_definition nulls the
-- definition id when the name is cleared, but UPDATE OF only sees the columns
-- the statement named, so a name-only clear would otherwise never resync.
create trigger character_classes_sync_subclass_spells
  after insert or update of levels, subclass_name, subclass_definition_id, subclass_variant on public.character_classes
  for each row execute function private.character_classes_sync_subclass_spells();

create trigger character_classes_drop_subclass_spells
  before delete on public.character_classes
  for each row execute function private.character_classes_drop_subclass_spells();

create trigger custom_subclasses_resync_characters
  after update of granted_spells, spell_variants on public.custom_subclasses
  for each row
  when (old.granted_spells is distinct from new.granted_spells
     or old.spell_variants is distinct from new.spell_variants)
  execute function private.custom_subclasses_resync_characters();

create trigger custom_subclasses_drop_grants
  after delete on public.custom_subclasses
  for each row execute function private.custom_subclasses_drop_grants();

-- ── apply_level_up carries the variant ───────────────────────────────────────
-- A level that picks a Circle of the Land terrain must write subclass and
-- variant in one statement: the class-row write fires the sync once, with the
-- right variant, in the same transaction as the level. An 'add' inserts it with
-- the row; an 'update' sets it when p_class_op names the key and leaves it
-- alone when absent. validate_character_subclass_definition refuses an option
-- the subclass does not offer, which aborts the whole RPC. Body, grants and
-- authorization are otherwise the live definition.

CREATE OR REPLACE FUNCTION public.apply_level_up(p_member_id uuid, p_member_update jsonb, p_class_op jsonb DEFAULT NULL::jsonb, p_spell_rows jsonb DEFAULT '[]'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_source_class_id uuid;
  v_class_name text;
  v_old_class_level integer;
  v_new_class_level integer;
  v_old_member_level integer;
  v_required_spells integer;
  v_required_cantrips integer;
  v_submitted_spells integer;
  v_submitted_cantrips integer;
  v_definition_id uuid;
  v_definition_kind text;
  v_member public.party_members%rowtype;
  v_bad_feat text;
begin
  select * into v_member from public.party_members
  where id = p_member_id
    and (owner_user_id = v_uid or (owner_user_id is null and user_id = v_uid) or private.is_campaign_dm(campaign_id));
  if not found then
    raise exception 'apply_level_up: not authorized for member %', p_member_id using errcode = '42501';
  end if;
  v_old_member_level := v_member.level;
  if p_member_update is null or not (p_member_update ? 'level')
     or (p_member_update->>'level')::integer is distinct from v_old_member_level + 1 then
    raise exception 'apply_level_up: member level must increase by exactly one';
  end if;
  if p_class_op is null then
    raise exception 'apply_level_up: a source class operation is required';
  end if;

  -- Every feat the level adds must be a feat of the character's edition that
  -- its owner or its table may use. Which ones were added is the new list
  -- minus the old, counted, so a repeatable feat taken again is checked too.
  -- This keeps the level-up honest; it is not the access boundary (whoever may
  -- call this may also write class_choices directly). The approval review is:
  -- it benches a character holding a feat its table has not approved.
  if p_member_update ? 'class_choices' then
    select added.id into v_bad_feat
      from (
        select n.id from jsonb_array_elements_text(
          case when jsonb_typeof(p_member_update -> 'class_choices' -> 'feats') = 'array'
               then p_member_update -> 'class_choices' -> 'feats' else '[]'::jsonb end) with ordinality n(id, ord)
        except all
        select o.id from jsonb_array_elements_text(
          case when jsonb_typeof(v_member.class_choices -> 'feats') = 'array'
               then v_member.class_choices -> 'feats' else '[]'::jsonb end) with ordinality o(id, ord)
      ) added
     where not exists (
       select 1 from public.class_features f
        where f.id = private.try_uuid(added.id)
          and f.kind = 'feat'
          and (f.ruleset is null or f.ruleset = v_member.ruleset)
          and (f.user_id is null
               or f.user_id = coalesce(v_member.owner_user_id, v_member.user_id)
               or (v_member.campaign_id is not null and private.is_table_dm(v_member.campaign_id, f.user_id)
                   and (f.campaign_id is null or f.campaign_id = v_member.campaign_id))))
     limit 1;
    if v_bad_feat is not null then
      raise exception 'apply_level_up: % is not a feat this character can take', v_bad_feat using errcode = '22023';
    end if;
  end if;

  if p_class_op->>'op' = 'add' then
    v_class_name := nullif(p_class_op->>'class_name', '');
    v_definition_id := nullif(p_class_op->>'class_definition_id', '')::uuid;
    v_definition_kind := nullif(p_class_op->>'class_definition_kind', '');
    v_new_class_level := (p_class_op->>'levels')::integer;
    -- A character's first class row carries its whole new level (a character
    -- with no class takes its first one here). A further class starts at one.
    if exists (select 1 from public.character_classes where party_member_id = p_member_id)
       and v_new_class_level <> 1 then
      raise exception 'apply_level_up: a new multiclass must start at level one';
    end if;
  elsif p_class_op->>'op' = 'update' then
    v_source_class_id := (p_class_op->>'id')::uuid;
    select class_name, levels, class_definition_id, class_definition_kind
      into v_class_name, v_old_class_level, v_definition_id, v_definition_kind
    from public.character_classes where id = v_source_class_id and party_member_id = p_member_id;
    if not found then raise exception 'apply_level_up: source class not found'; end if;
    v_new_class_level := (p_class_op->>'levels')::integer;
    if v_new_class_level <> v_old_class_level + 1 then
      raise exception 'apply_level_up: class level must increase by exactly one';
    end if;
  else
    raise exception 'apply_level_up: invalid class operation';
  end if;
  if v_class_name is null then raise exception 'apply_level_up: class name is required'; end if;

  select spell_count, cantrip_count into v_required_spells, v_required_cantrips
  from public.required_level_up_spell_choices(
    p_member_id, v_class_name, v_new_class_level, v_definition_kind, v_definition_id
  );
  select
    count(distinct r->>'spell_id') filter (where public.character_spell_level(r->>'spell_id') > 0),
    count(distinct r->>'spell_id') filter (where public.character_spell_level(r->>'spell_id') = 0)
  into v_submitted_spells, v_submitted_cantrips
  from jsonb_array_elements(coalesce(p_spell_rows, '[]'::jsonb)) r
  where coalesce(r->>'source_type', 'class') = 'class'
    and not coalesce((r->>'always_prepared')::boolean, false);
  if v_submitted_spells <> v_required_spells or v_submitted_cantrips <> v_required_cantrips then
    raise exception 'apply_level_up: % level % requires % spell and % cantrip choices (received % and %)',
      v_class_name, v_new_class_level, v_required_spells, v_required_cantrips,
      v_submitted_spells, v_submitted_cantrips;
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_spell_rows, '[]'::jsonb)) r
    where coalesce(r->>'source_type', 'class') = 'class'
      and nullif(r->>'source_class_id', '') is not null
      and (v_source_class_id is null or (r->>'source_class_id')::uuid <> v_source_class_id)
  ) then
    raise exception 'apply_level_up: spell choices must use the class being leveled';
  end if;
  if v_source_class_id is not null and exists (
    select 1 from jsonb_array_elements(coalesce(p_spell_rows, '[]'::jsonb)) r
    join public.character_spells existing
      on existing.party_member_id = p_member_id
      and existing.source_class_id = v_source_class_id
      and existing.source_type = 'class'
      and existing.spell_id = r->>'spell_id'
    where coalesce(r->>'source_type', 'class') = 'class'
      and not coalesce((r->>'always_prepared')::boolean, false)
  ) then
    raise exception 'apply_level_up: a required choice must be new for the source class';
  end if;

  update public.party_members set
    level = (p_member_update->>'level')::int,
    proficiency_bonus = case when p_member_update ? 'proficiency_bonus' then (p_member_update->>'proficiency_bonus')::int else proficiency_bonus end,
    max_hp = case when p_member_update ? 'max_hp' then (p_member_update->>'max_hp')::int else max_hp end,
    current_hp = case when p_member_update ? 'current_hp' then (p_member_update->>'current_hp')::int else current_hp end,
    hit_dice_remaining = case when p_member_update ? 'hit_dice_remaining' then (p_member_update->>'hit_dice_remaining')::int else hit_dice_remaining end,
    str = case when p_member_update ? 'str' then (p_member_update->>'str')::int else str end,
    dex = case when p_member_update ? 'dex' then (p_member_update->>'dex')::int else dex end,
    con = case when p_member_update ? 'con' then (p_member_update->>'con')::int else con end,
    "int" = case when p_member_update ? 'int' then (p_member_update->>'int')::int else "int" end,
    wis = case when p_member_update ? 'wis' then (p_member_update->>'wis')::int else wis end,
    cha = case when p_member_update ? 'cha' then (p_member_update->>'cha')::int else cha end,
    spell_slots = case when p_member_update ? 'spell_slots' then p_member_update->'spell_slots' else spell_slots end,
    class_resources = case when p_member_update ? 'class_resources' then p_member_update->'class_resources' else class_resources end,
    class_choices = case when p_member_update ? 'class_choices' then p_member_update->'class_choices' else class_choices end,
    level_choices = case when p_member_update ? 'level_choices' then p_member_update->'level_choices' else level_choices end,
    skill_proficiencies = case when p_member_update ? 'skill_proficiencies' then p_member_update->'skill_proficiencies' else skill_proficiencies end,
    weapon_masteries = case when p_member_update ? 'weapon_masteries'
      then array(select jsonb_array_elements_text(p_member_update->'weapon_masteries')) else weapon_masteries end,
    tool_proficiencies = case when p_member_update ? 'tool_proficiencies'
      then array(select jsonb_array_elements_text(p_member_update->'tool_proficiencies')) else tool_proficiencies end,
    languages = case when p_member_update ? 'languages'
      then array(select jsonb_array_elements_text(p_member_update->'languages')) else languages end
  where id = p_member_id;

  if p_class_op->>'op' = 'add' then
    insert into public.character_classes
      (party_member_id, class_name, class_definition_id, class_definition_kind,
       subclass_name, subclass_definition_id, subclass_variant, levels, is_primary, hit_dice_used, sort_order)
    values (p_member_id, v_class_name, v_definition_id, v_definition_kind,
      p_class_op->>'subclass_name', nullif(p_class_op->>'subclass_definition_id', '')::uuid,
      nullif(p_class_op->>'subclass_variant', ''), v_new_class_level,
      coalesce((p_class_op->>'is_primary')::boolean, false),
      coalesce((p_class_op->>'hit_dice_used')::int, 0), coalesce((p_class_op->>'sort_order')::int, 0))
    returning id into v_source_class_id;
  else
    update public.character_classes set levels = v_new_class_level,
      subclass_name = case when p_class_op ? 'subclass_name' then p_class_op->>'subclass_name' else subclass_name end,
      subclass_definition_id = case when p_class_op ? 'subclass_name'
        then nullif(p_class_op->>'subclass_definition_id', '')::uuid else subclass_definition_id end,
      subclass_variant = case when p_class_op ? 'subclass_variant'
        then nullif(p_class_op->>'subclass_variant', '') else subclass_variant end
    where id = v_source_class_id;
  end if;

  insert into public.character_spells
    (party_member_id, spell_id, is_known, is_prepared, always_prepared,
     source_class_id, source_type, source_label, uses_per_day, uses_remaining, resets_on)
  select p_member_id, r->>'spell_id', coalesce((r->>'is_known')::boolean, true),
    coalesce((r->>'is_prepared')::boolean, false), coalesce((r->>'always_prepared')::boolean, false),
    case when coalesce(r->>'source_type', 'class') = 'class'
      then coalesce(nullif(r->>'source_class_id', '')::uuid, v_source_class_id) else null end,
    coalesce(r->>'source_type', 'class'), r->>'source_label',
    nullif(r->>'uses_per_day', '')::int, nullif(r->>'uses_remaining', '')::int, nullif(r->>'resets_on', '')
  from jsonb_array_elements(coalesce(p_spell_rows, '[]'::jsonb)) r
  on conflict do nothing;
end;
$function$;

-- ── browse_spells: ids that pass the class filter ────────────────────────────
-- A subclass's expanded list is spells outside the class's own list, so the
-- picker passes their ids and they survive the class filter. Everything else is
-- the 20261005001303 definition. A new parameter is a new signature: drop the
-- old one in this transaction so PostgREST never sees two overloads.

drop function public.browse_spells(text[], text, uuid, text, integer, text, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.browse_spells(p_slugs text[], p_ruleset text, p_campaign_id uuid, p_search text DEFAULT NULL::text, p_level integer DEFAULT NULL::integer, p_school text DEFAULT NULL::text, p_class text DEFAULT NULL::text, p_source text DEFAULT 'all'::text, p_limit integer DEFAULT 48, p_offset integer DEFAULT 0, p_extra_ids text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with
  pat as (select private.contains_pattern(p_search) as p),
  lib as (
    select s.id, s.name, s.level, s.school, s.ritual, s.casting_time, s.range, s.components,
           s.concentration, s.classes, s.tags, s.source, s.source_title, s.source_url,
           true as is_shared, false as is_own, 0 as origin
      from public.library_spells s
     where s.source = any (p_slugs) and s.ruleset = p_ruleset
  ),
  -- No user filter, on purpose: spells_select lets a player read the custom
  -- spells of a DM they share a campaign with, and the player's spell list
  -- relies on it. Scoped by campaign like useAllSpells. So a listed custom
  -- spell is not necessarily the caller's: `is_own` says which are, and only
  -- those can be edited or selected.
  own as (
    select s.id::text as id, s.name, s.level::int, s.school, s.ritual, s.casting_time, s.range, s.components,
           s.concentration, s.classes, s.tags, s.source, s.source_title, s.source_url,
           s.source_record_key is not null as is_shared,
           s.user_id = (select auth.uid()) as is_own, 1 as origin
      from public.spells s
     where not s.open5e_import
       and (s.ruleset is null or s.ruleset = p_ruleset)
       and (s.campaign_id is null or s.campaign_id = p_campaign_id)
  ),
  scoped as (select * from lib union all select * from own),
  filtered as (
    select f.* from scoped f, pat
     where (coalesce(p_source, 'all') = 'all'
            or (p_source = 'custom' and not f.is_shared)
            or f.source = p_source)
       and (p_level is null or f.level = p_level)
       and (p_school is null or f.school = p_school)
       and (p_class is null or p_class = any (f.classes) or f.id = any (p_extra_ids))
       and (pat.p is null or f.name ilike pat.p)
  ),
  page as (
    select * from filtered
     order by level, lower(name), name, origin, id
     limit greatest(p_limit, 0) offset greatest(p_offset, 0)
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id, 'name', name, 'level', level, 'school', school, 'ritual', ritual,
               'casting_time', casting_time, 'range', range, 'components', components,
               'concentration', concentration, 'classes', classes, 'tags', tags,
               'source', source, 'source_title', source_title, 'source_url', source_url, 'is_shared', is_shared,
               'is_own', is_own)
             order by level, lower(name), name, origin, id)
        from page), '[]'::jsonb)
  ) || case when greatest(p_offset, 0) = 0 then jsonb_build_object(
    'total', (select count(*) from filtered),
    'selectable_ids', coalesce((select jsonb_agg(id order by id) from filtered where is_own and not is_shared), '[]'::jsonb)
  ) else '{}'::jsonb end
$function$;

revoke execute on function public.browse_spells(text[], text, uuid, text, integer, text, text, text, integer, integer, text[]) from public, anon;
grant execute on function public.browse_spells(text[], text, uuid, text, integer, text, text, text, integer, integer, text[]) to authenticated, service_role;

-- ── Existing characters ──────────────────────────────────────────────────────
-- Reconcile every character that already has a subclass. Library subclasses hold
-- no grants yet, so this is close to a no-op until their data lands.

select private.sync_subclass_spells(id) from public.character_classes where subclass_definition_id is not null;
