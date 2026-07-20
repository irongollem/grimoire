-- Casting spends the pool persisted by trusted creation, level-up, rest, and
-- Flexible Casting workflows. A client-provided rendering template may only
-- fill in a pool that is missing from that persisted state entirely (e.g. a
-- legacy character whose spell_slots was never populated); it must never be
-- able to enlarge or override the maximum of a pool that already exists.
create or replace function public.spend_spell_slot(
  p_party_member_id uuid,
  p_slot_level integer,
  p_slot_pool text,
  p_slot_template jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.party_members%rowtype;
  v_slots jsonb;
  v_slot jsonb;
  v_index integer;
  v_used integer;
  v_max integer;
  v_template_slot jsonb;
begin
  if p_slot_level < 1 or p_slot_level > 9 then
    raise exception 'Spell slot level must be between 1 and 9';
  end if;
  if p_slot_pool not in ('spellcasting', 'pact', 'temporary') then
    raise exception 'Invalid spell slot pool';
  end if;

  select * into v_member from public.party_members
  where id = p_party_member_id for update;
  if not found then raise exception 'Party member not found'; end if;
  if not (
    v_member.user_id = (select auth.uid())
    or v_member.owner_user_id = (select auth.uid())
    or private.is_campaign_dm(v_member.campaign_id)
    or exists (
      select 1 from public.campaign_members cm
      where cm.user_id = (select auth.uid()) and cm.party_member_id = v_member.id
    )
  ) then raise exception 'Access denied'; end if;

  v_slots := coalesce(v_member.spell_slots, '[]'::jsonb);
  if jsonb_typeof(v_slots) <> 'array' then raise exception 'Invalid spell slot state'; end if;

  -- A trusted client template (derived from official class data, e.g. the UI
  -- rendering a legacy or ruleset-migrated character) may fill in a pool the
  -- persisted state is missing entirely. A pool that already exists is always
  -- authoritative for its own maximum and current use — the template can
  -- never enlarge or override an already-persisted pool's max, only add pools
  -- that are absent.
  if p_slot_template is not null then
    if jsonb_typeof(p_slot_template) <> 'array' then
      raise exception 'Invalid spell slot template';
    end if;
    for v_template_slot in select value from jsonb_array_elements(p_slot_template) loop
      if coalesce((v_template_slot ->> 'level')::integer, 0) not between 1 and 9
         or coalesce((v_template_slot ->> 'max')::integer, -1) < 0 then
        raise exception 'Invalid spell slot template entry';
      end if;
      if not exists (
        select 1 from jsonb_array_elements(v_slots) existing
        where (existing.value ->> 'level')::integer = (v_template_slot ->> 'level')::integer
          and coalesce(existing.value ->> 'pool', 'spellcasting') = coalesce(v_template_slot ->> 'pool', 'spellcasting')
      ) then
        v_slots := v_slots || jsonb_build_array(jsonb_build_object(
          'level', (v_template_slot ->> 'level')::integer,
          'max', (v_template_slot ->> 'max')::integer,
          'pool', coalesce(v_template_slot ->> 'pool', 'spellcasting'),
          'recovery', coalesce(v_template_slot ->> 'recovery',
            case when v_template_slot ->> 'pool' = 'pact' then 'short' else 'long' end),
          'used', least(coalesce((v_template_slot ->> 'used')::integer, 0), (v_template_slot ->> 'max')::integer)
        ));
      end if;
    end loop;
  end if;

  if jsonb_array_length(v_slots) = 0 then
    raise exception 'No level-% spell slot pool exists', p_slot_level;
  end if;

  for v_index in 0..jsonb_array_length(v_slots) - 1 loop
    v_slot := v_slots -> v_index;
    if (v_slot ->> 'level')::integer = p_slot_level
       and coalesce(v_slot ->> 'pool', 'spellcasting') = p_slot_pool then
      v_used := coalesce((v_slot ->> 'used')::integer, 0);
      v_max := coalesce((v_slot ->> 'max')::integer, 0);
      if v_used >= v_max then
        raise exception 'No level-% spell slots remaining', p_slot_level;
      end if;
      v_slots := jsonb_set(v_slots, array[v_index::text, 'used'], to_jsonb(v_used + 1), false);
      update public.party_members set spell_slots = v_slots where id = p_party_member_id;
      return v_slots;
    end if;
  end loop;
  raise exception 'No level-% spell slot pool exists', p_slot_level;
end;
$$;

-- This helper is an implementation detail of the V4 cast transaction.
revoke all on function public.spend_spell_slot(uuid, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.spend_spell_slot(uuid, integer, text, jsonb) to service_role;
