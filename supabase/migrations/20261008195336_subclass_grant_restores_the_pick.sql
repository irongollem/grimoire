-- A spell a subclass took over from the player's own picks goes back to being
-- that pick when the grant ends (CodeRabbit on #1028).
--
-- When a granted spell was already on the sheet as a pick of the same class,
-- private.sync_subclass_spells (20261008165034) converted that row in place, so
-- it stopped eating a prepared slot. But the row then carried only
-- granted_by_subclass, the same flag as a row the sync inserted itself, and the
-- cleanup that runs when a grant is no longer owed (a de-level, a subclass or
-- variant change, clearing the subclass) deleted it.
-- The player lost a spell they had chosen.
--
-- A converted row now remembers how it stood as a pick (pick_was_prepared,
-- pick_was_always_prepared; both null on a row the sync created), and the
-- cleanup hands it back in that state instead of deleting it. Only the rows the
-- sync created are deleted.
--
-- The restore suspends the spell limits for that row, as a ruleset conversion
-- and a clone do: the player may have filled the freed slot meanwhile, and
-- getting the spell back over the allowance (visible on the sheet, like the
-- picks a de-level leaves) is better than losing it a second time. The 2024
-- preparation guard is opened for exactly that row, as the conversion does.

alter table public.character_spells
  add column pick_was_prepared boolean,
  add column pick_was_always_prepared boolean,
  add constraint character_spells_pick_before_grant_check check (
    (pick_was_prepared is null) = (pick_was_always_prepared is null)
    and (pick_was_prepared is null or granted_by_subclass)
  );

comment on column public.character_spells.pick_was_prepared is
  'Set only on a subclass-granted row that was the player''s own pick before the grant: its is_prepared then. Null on a row the subclass sync created.';
comment on column public.character_spells.pick_was_always_prepared is
  'Pairs with pick_was_prepared: the pick''s always_prepared before the grant took it over.';

-- The rows the release of 20261008165034 already converted. The sync did not
-- exist before that release, so a granted row created earlier can only have
-- been a pick. Its prepared state then was not recorded; a class that has
-- subclass grants either prepares every pick it holds or ignores the flag, so
-- it is restored as prepared, and as an ordinary pick rather than a free one.
update public.character_spells
   set pick_was_prepared = true, pick_was_always_prepared = false
 where granted_by_subclass
   and created_at < timestamptz '2026-10-08 17:57:00+00';

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

  -- No longer owed (a de-level, a subclass or variant change): a grant that
  -- took over the player's own pick goes back to being that pick.
  perform private.restore_subclass_picks(p_class_row, v_expected);

  -- ...and a grant the sync created goes.
  delete from public.character_spells
  where source_class_id = p_class_row
    and granted_by_subclass
    and pick_was_prepared is null
    and not (spell_id = any (v_expected));

  -- Already on the sheet as this class's pick (or half-granted): convert it,
  -- remembering how it stood as a pick so it can go back.
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
         set pick_was_prepared = case when granted_by_subclass then pick_was_prepared else is_prepared end,
             pick_was_always_prepared = case when granted_by_subclass then pick_was_always_prepared else always_prepared end,
             always_prepared = true, is_prepared = true, granted_by_subclass = true
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

-- Hands every converted pick of one class row that is not in p_keep back to the
-- player, as it stood before the grant. Called only by the sync; a function of
-- its own so the guard and limit settings it opens are scoped to it. One row failing (a spell the class can
-- no longer hold at all) leaves that row granted and warns, rather than
-- aborting the level-up or subclass edit that triggered it.
create or replace function private.restore_subclass_picks(p_class_row uuid, p_keep text[])
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_row_id uuid;
  v_prev_guard text := current_setting('app.preparation_change_spell_id', true);
  v_prev_limits text := current_setting('grimoire.spell_limits', true);
begin
  for v_row_id in
    select id from public.character_spells
    where source_class_id = p_class_row
      and granted_by_subclass
      and pick_was_prepared is not null
      and not (spell_id = any (p_keep))
  loop
    begin
      perform set_config('app.preparation_change_spell_id', v_row_id::text, true);
      perform set_config('grimoire.spell_limits', 'suspended', true);
      update public.character_spells
         set is_prepared = pick_was_prepared,
             always_prepared = pick_was_always_prepared,
             granted_by_subclass = false,
             pick_was_prepared = null,
             pick_was_always_prepared = null
       where id = v_row_id;
    exception when others then
      raise warning 'restore_subclass_picks: left row % granted (%)', v_row_id, sqlerrm;
    end;
  end loop;
  perform set_config('app.preparation_change_spell_id', coalesce(v_prev_guard, ''), true);
  perform set_config('grimoire.spell_limits', coalesce(v_prev_limits, ''), true);
end;
$function$;

revoke execute on function private.restore_subclass_picks(uuid, text[]) from public, anon, authenticated;

-- Deleting the class row takes every spell of that class with it.
--
-- character_spells.source_class_id was ON DELETE SET NULL, but
-- validate_character_spell_source refuses a class spell without a source class
-- (and validate_character_spell_limits reads that class strictly), so the SET
-- NULL could never succeed: removing a class from a character failed outright
-- as soon as the class held a single pick. 20261008165034 papered over the
-- subclass half of it with a before-delete trigger that removed the grants
-- first, which left the picks to fail. A class's spells belong to the class,
-- so the key cascades and the trigger goes.
drop trigger character_classes_drop_subclass_spells on public.character_classes;
drop function private.character_classes_drop_subclass_spells();

alter table public.character_spells
  drop constraint character_spells_source_class_id_fkey,
  add constraint character_spells_source_class_id_fkey
    foreign key (source_class_id) references public.character_classes(id) on delete cascade;
