-- Revised preparation changes must pass through an edition-aware RPC. Direct
-- table updates could otherwise prepare Wizard spells without taking a rest.
create or replace function public.guard_revised_preparation_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ruleset text;
begin
  if new.is_prepared is not distinct from old.is_prepared then return new; end if;
  select coalesce(c.ruleset, '2014') into v_ruleset
  from public.party_members pm join public.campaigns c on c.id = pm.campaign_id
  where pm.id = new.party_member_id;
  if v_ruleset = '2024'
     and current_setting('app.preparation_change_spell_id', true) is distinct from new.id::text then
    raise exception 'Revised preparation changes require an active class change window';
  end if;
  return new;
end;
$$;

create trigger character_spells_guard_revised_preparation
before update of is_prepared on public.character_spells
for each row execute function public.guard_revised_preparation_change();

-- public.set_character_spell_prepared is defined once, authoritatively, in
-- 20260720000033 (it needs the class-version-pinned window lookup added
-- there). This migration only owns the trigger above.
revoke all on function public.guard_revised_preparation_change() from public, anon, authenticated;
