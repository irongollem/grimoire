-- Migration: exchange_wild_shape
-- Wild Shape's spell-slot trades, by the book for both editions (epic #959).
--
--   slot_for_healing  2014 Circle of the Moon, Combat Wild Shape: while in a
--                     beast form, spend a slot to heal the beast 1d8 per slot
--                     level. The client rolls; the amount is bounded here.
--   slot_for_use      2024 Wild Resurgence: with no Wild Shape uses left,
--                     spend a slot to regain one.
--   use_for_slot      2024 Wild Resurgence: once per long rest, spend a use to
--                     regain an expended level 1 slot.
--
-- One locked read-modify-write per trade, like convert_sorcery_points: a slot
-- and a use (or the beast's HP) change together or not at all. A definer, not
-- an invoker, for the same reason as its siblings: spend_spell_slot is the one
-- place a slot is spent (template fallback included) and clients may not call
-- it, so a function that reuses it has to run as its owner. It authorizes
-- first, with the same total predicate as spend_spell_slot (#936: coalesced,
-- so a character with no owner cannot turn the guard into NULL).
--
-- Edition rules the server does not know, and does not need to: how many uses
-- a druid has (edition and level) and whether a trade is legal right now ("no
-- uses left") are the client's (src/rules/wildshape.ts). A player may already
-- write wildshapes_used and spell_slots on their own row through RLS, so those
-- checks were never a security boundary; this function's job is atomicity and
-- access.

create or replace function public.exchange_wild_shape(
  p_party_member_id uuid,
  p_action text,
  p_slot_level integer,
  p_slot_pool text default 'spellcasting',
  p_slot_template jsonb default null,
  p_healing integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.party_members%rowtype;
  v_slots jsonb;
  v_slot jsonb;
  v_used integer;
  v_uses integer;
  v_choices jsonb;
  v_form jsonb;
  v_found boolean := false;
begin
  -- Total checks: `x not in (...)` is NULL for a NULL x and would not raise,
  -- so every argument is tested for absence explicitly.
  if p_action is null or p_action not in ('slot_for_healing', 'slot_for_use', 'use_for_slot') then
    raise exception 'Invalid Wild Shape exchange';
  end if;
  if p_action in ('slot_for_healing', 'slot_for_use')
     and (p_slot_level is null or p_slot_level not between 1 and 9 or p_slot_pool is null) then
    raise exception 'Choose a spell slot to spend';
  end if;

  select * into v_member from public.party_members where id = p_party_member_id for update;
  if not found then raise exception 'Party member not found'; end if;
  if not coalesce((
    v_member.user_id = (select auth.uid())
    or v_member.owner_user_id = (select auth.uid())
    or private.is_campaign_dm(v_member.campaign_id)
    or exists (
      select 1 from public.campaign_members cm
      where cm.user_id = (select auth.uid()) and cm.party_member_id = v_member.id
    )
  ), false) then raise exception 'Access denied'; end if;

  if not exists (
    select 1 from public.character_classes cc
    where cc.party_member_id = v_member.id and cc.class_name ilike '%druid%'
  ) then raise exception 'Wild Shape requires a Druid'; end if;

  v_uses := coalesce(v_member.wildshapes_used, 0);
  v_choices := coalesce(v_member.class_choices, '{}'::jsonb);
  v_form := v_member.wildshape_state;
  v_slots := coalesce(v_member.spell_slots, '[]'::jsonb);

  if p_action = 'slot_for_healing' then
    -- Only a form with its own hit point pool (2014) can be healed this way.
    if v_form is null
       or jsonb_typeof(v_form -> 'beast_hp') <> 'number'
       or jsonb_typeof(v_form -> 'beast_max_hp') <> 'number' then
      raise exception 'Not in a beast form with its own hit points';
    end if;
    if p_healing is null or p_healing < p_slot_level or p_healing > 8 * p_slot_level then
      raise exception 'Healing must be what 1d8 per slot level can roll';
    end if;
    v_slots := public.spend_spell_slot(p_party_member_id, p_slot_level, p_slot_pool, p_slot_template);
    v_form := jsonb_set(v_form, '{beast_hp}', to_jsonb(least(
      (v_form ->> 'beast_max_hp')::integer,
      (v_form ->> 'beast_hp')::integer + p_healing
    )), false);
    update public.party_members set wildshape_state = v_form where id = p_party_member_id;

  elsif p_action = 'slot_for_use' then
    if v_uses <= 0 then raise exception 'No Wild Shape use has been spent'; end if;
    v_slots := public.spend_spell_slot(p_party_member_id, p_slot_level, p_slot_pool, p_slot_template);
    v_uses := v_uses - 1;
    update public.party_members set wildshapes_used = v_uses where id = p_party_member_id;

  elsif p_action = 'use_for_slot' then
    if coalesce((v_choices ->> 'wild_resurgence_slot_taken')::boolean, false) then
      raise exception 'Already regained a slot from Wild Shape this long rest';
    end if;
    if jsonb_typeof(v_slots) <> 'array' then raise exception 'Invalid spell slot state'; end if;
    if jsonb_array_length(v_slots) > 0 then
      for v_index in 0..jsonb_array_length(v_slots) - 1 loop
        v_slot := v_slots -> v_index;
        v_used := coalesce((v_slot ->> 'used')::integer, 0);
        if (v_slot ->> 'level')::integer = 1
           and coalesce(v_slot ->> 'pool', 'spellcasting') = 'spellcasting'
           and v_used > 0 then
          v_slots := jsonb_set(v_slots, array[v_index::text, 'used'], to_jsonb(v_used - 1), false);
          v_found := true;
          exit;
        end if;
      end loop;
    end if;
    if not v_found then raise exception 'No expended level 1 spell slot to regain'; end if;
    v_uses := v_uses + 1;
    v_choices := jsonb_set(v_choices, '{wild_resurgence_slot_taken}', 'true'::jsonb, true);
    update public.party_members
      set spell_slots = v_slots, wildshapes_used = v_uses, class_choices = v_choices
      where id = p_party_member_id;
  else
    raise exception 'Invalid Wild Shape exchange';
  end if;

  return jsonb_build_object(
    'spell_slots', v_slots,
    'wildshapes_used', v_uses,
    'wildshape_state', v_form,
    'class_choices', v_choices
  );
end;
$$;

revoke all on function public.exchange_wild_shape(uuid, text, integer, text, jsonb, integer) from public, anon;
grant execute on function public.exchange_wild_shape(uuid, text, integer, text, jsonb, integer) to authenticated, service_role;

-- Once-per-long-rest flags in class_choices, reset by take_spellcasting_rest:
--   wild_resurgence_slot_taken  set by use_for_slot above.
--   wild_shape_form_replaced    2024 Known Forms: a druid may replace one known
--                               form per long rest (set by the client, which
--                               owns class_choices.wild_shape_known_forms).
insert into public.class_choice_rest_resets (choice_key, rest, reset_action) values
  ('wild_resurgence_slot_taken', 'long', 'set_false'),
  ('wild_shape_form_replaced', 'long', 'set_false')
on conflict (choice_key) do nothing;
