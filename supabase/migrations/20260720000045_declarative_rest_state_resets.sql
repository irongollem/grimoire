-- Migration: declarative_rest_state_resets
-- take_spellcasting_rest embedded a hardcoded blacklist of class_choices keys
-- to clear on a long rest, so every future class feature with rest- or
-- turn-scoped state needed another full-function migration. Two declarative
-- conventions replace the blacklist (mirroring class_resources' `rest` field):
--
--   1. Any class_choices key ending in `_turn` is turn-scoped and never
--      survives a long rest (covers arcane_apotheosis_turn,
--      spell_slot_cast_turn, noncantrip_spell_turn, bonus_action_spell_turn,
--      and every future turn key automatically).
--   2. Other resettable keys register a row in class_choice_rest_resets
--      declaring when they reset and how ('remove' the key or 'set_false').
--      A long rest also applies 'short' registrations, like resources.

create table public.class_choice_rest_resets (
  choice_key text primary key,
  rest text not null check (rest in ('short', 'long')),
  reset_action text not null check (reset_action in ('remove', 'set_false')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger class_choice_rest_resets_updated_at
  before update on class_choice_rest_resets
  for each row execute procedure update_updated_at();

-- Global rules data: readable by everyone, writable by app admins only.
alter table public.class_choice_rest_resets enable row level security;
create policy "class_choice_rest_resets_select" on public.class_choice_rest_resets
  for select using (true);
create policy "class_choice_rest_resets_admin_write" on public.class_choice_rest_resets
  for all using (private.is_app_admin()) with check (private.is_app_admin());

insert into public.class_choice_rest_resets (choice_key, rest, reset_action) values
  ('innate_sorcery_active', 'long', 'set_false'),
  ('innate_sorcery_expires_at', 'long', 'remove');

create or replace function public.take_spellcasting_rest(
  p_party_member_id uuid,
  p_rest text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_member public.party_members%rowtype;
  v_slots jsonb := '[]'::jsonb;
  v_resources jsonb := '{}'::jsonb;
  v_choices jsonb;
  v_ruleset text;
  v_sorcerer_level integer;
begin
  if p_rest not in ('short', 'long') then raise exception 'Invalid rest type'; end if;
  select * into v_member from public.party_members where id = p_party_member_id for update;
  if not found then raise exception 'Party member not found'; end if;
  if not (v_member.user_id = (select auth.uid()) or v_member.owner_user_id = (select auth.uid())
    or private.is_campaign_dm(v_member.campaign_id)
    or exists (select 1 from public.campaign_members cm
      where cm.user_id = (select auth.uid()) and cm.party_member_id = v_member.id))
  then raise exception 'Access denied'; end if;

  select coalesce(jsonb_agg(
    case
      when p_rest = 'long' and coalesce(slot ->> 'pool', 'spellcasting') = 'temporary' then null
      when p_rest = 'long' and coalesce(slot ->> 'recovery', case when slot ->> 'pool' = 'pact' then 'short' else 'long' end) <> 'none'
        then jsonb_set(slot, '{used}', '0'::jsonb, true)
      when p_rest = 'short' and coalesce(slot ->> 'recovery', case when slot ->> 'pool' = 'pact' then 'short' else 'long' end) = 'short'
        then jsonb_set(slot, '{used}', '0'::jsonb, true)
      else slot
    end order by ordinal
  ) filter (where not (p_rest = 'long' and coalesce(slot ->> 'pool', 'spellcasting') = 'temporary')), '[]'::jsonb)
  into v_slots
  from jsonb_array_elements(coalesce(v_member.spell_slots, '[]'::jsonb)) with ordinality rows(slot, ordinal);

  select coalesce(jsonb_object_agg(key,
    case
      when (p_rest = 'long' and coalesce(value ->> 'rest', 'long') <> 'none')
        or (p_rest = 'short' and value ->> 'rest' = 'short')
        then jsonb_set(value, '{current}', coalesce(value -> 'max', value -> 'current', '0'::jsonb), true)
      else value
    end
  ), '{}'::jsonb) into v_resources
  from jsonb_each(coalesce(v_member.class_resources, '{}'::jsonb));

  v_choices := coalesce(v_member.class_choices, '{}'::jsonb);
  select coalesce(c.ruleset, '2014') into v_ruleset from public.campaigns c where c.id = v_member.campaign_id;
  v_sorcerer_level := public.sorcerer_level(v_member);
  if v_ruleset = '2024' and v_sorcerer_level >= 5 then
    if p_rest = 'short' and coalesce((v_choices ->> 'sorcerous_restoration_used')::boolean, false) is not true then
      v_choices := jsonb_set(v_choices, '{sorcerous_restoration_available}', 'true'::jsonb, true);
    elsif p_rest = 'long' then
      v_choices := jsonb_set(jsonb_set(v_choices, '{sorcerous_restoration_available}', 'false'::jsonb, true),
        '{sorcerous_restoration_used}', 'false'::jsonb, true);
    end if;
  end if;

  -- Declarative state reset: `_turn`-suffixed keys are turn-scoped and never
  -- survive a long rest; everything else resets per class_choice_rest_resets.
  select coalesce(jsonb_object_agg(kv.key,
    case when r.reset_action = 'set_false' then 'false'::jsonb else kv.value end), '{}'::jsonb)
  into v_choices
  from jsonb_each(v_choices) kv
  left join public.class_choice_rest_resets r
    on r.choice_key = kv.key
   and (r.rest = p_rest or (p_rest = 'long' and r.rest = 'short'))
  where coalesce(r.reset_action, '') <> 'remove'
    and not (p_rest = 'long' and kv.key like '%\_turn' escape '\');

  update public.party_members set
    spell_slots = v_slots,
    class_resources = v_resources,
    class_choices = v_choices
  where id = p_party_member_id;

  update public.character_spells set uses_remaining = uses_per_day
  where party_member_id = p_party_member_id and source_type <> 'class' and uses_per_day is not null
    and (resets_on = 'short_rest' or (p_rest = 'long' and resets_on = 'long_rest'));

  if p_rest = 'long' then
    -- Every rest surface opens the edition-defined preparation window as part
    -- of this transaction; it cannot be skipped by a second client request.
    perform public.open_spell_change_windows(p_party_member_id, 'long_rest');
  end if;

  return jsonb_build_object('spell_slots', v_slots, 'class_resources', v_resources, 'class_choices', v_choices);
end;
$$;

revoke all on function public.take_spellcasting_rest(uuid, text) from public, anon;
grant execute on function public.take_spellcasting_rest(uuid, text) to authenticated;

-- record_sorcerer_rest was superseded by take_spellcasting_rest (its execute
-- grant was already revoked in 20260720000025); remove the dead surface.
drop function public.record_sorcerer_rest(uuid, text);
