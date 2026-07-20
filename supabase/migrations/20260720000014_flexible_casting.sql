-- Flexible Casting mutates Sorcery Points and spell slots together under one
-- party-member row lock, preventing duplicated points/slots from rapid taps.
update public.system_classes
set resources = '[
  {"key":"sorcery_points","label":"Sorcery Points","rest":"long","scaling":"table",
   "table_values":[0,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]}
]'::jsonb
where class_name = 'Sorcerer';

update public.party_members pm
set class_resources = jsonb_set(
  coalesce(pm.class_resources, '{}'::jsonb),
  '{sorcery_points}',
  jsonb_build_object(
    'max', case when cc.levels >= 2 then least(cc.levels, 20) else 0 end,
    'current', least(
      coalesce((pm.class_resources #>> '{sorcery_points,current}')::integer, 0),
      case when cc.levels >= 2 then least(cc.levels, 20) else 0 end
    ),
    'rest', 'long'
  ),
  true
)
from public.character_classes cc
where cc.party_member_id = pm.id and cc.class_name = 'Sorcerer';

update public.party_members pm
set class_resources = jsonb_set(
  coalesce(pm.class_resources, '{}'::jsonb), '{sorcery_points}',
  jsonb_build_object(
    'max', case when pm.level >= 2 then least(pm.level, 20) else 0 end,
    'current', least(coalesce((pm.class_resources #>> '{sorcery_points,current}')::integer, 0),
      case when pm.level >= 2 then least(pm.level, 20) else 0 end),
    'rest', 'long'
  ), true
)
where pm.class = 'Sorcerer'
  and not exists (select 1 from public.character_classes cc where cc.party_member_id = pm.id);

create or replace function public.convert_sorcery_points(
  p_party_member_id uuid,
  p_direction text,
  p_slot_level integer,
  p_slot_pool text default 'spellcasting'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.party_members%rowtype;
  v_slots jsonb;
  v_resources jsonb;
  v_resource jsonb;
  v_current integer;
  v_max integer;
  v_cost integer;
  v_slot jsonb;
  v_index integer;
  v_used integer;
  v_slot_max integer;
  v_found boolean := false;
begin
  if p_direction not in ('points_to_slot', 'slot_to_points') then raise exception 'Invalid Flexible Casting direction'; end if;
  if p_slot_level < 1 or p_slot_level > (case when p_direction = 'points_to_slot' then 5 else 9 end) then
    raise exception 'Invalid slot level for Flexible Casting';
  end if;
  if p_slot_pool not in ('spellcasting', 'pact', 'temporary', 'feature') then raise exception 'Invalid spell slot pool'; end if;

  select * into v_member from public.party_members where id = p_party_member_id for update;
  if not found then raise exception 'Party member not found'; end if;
  if not (
    v_member.user_id = (select auth.uid()) or v_member.owner_user_id = (select auth.uid())
    or public.is_campaign_dm(v_member.campaign_id)
    or exists (select 1 from public.campaign_members cm
      where cm.user_id = (select auth.uid()) and cm.party_member_id = v_member.id)
  ) then raise exception 'Access denied'; end if;

  v_resources := coalesce(v_member.class_resources, '{}'::jsonb);
  v_resource := v_resources -> 'sorcery_points';
  if v_resource is null then raise exception 'Character has no Sorcery Points resource'; end if;
  v_current := coalesce((v_resource ->> 'current')::integer, 0);
  v_max := coalesce((v_resource ->> 'max')::integer, 0);
  v_slots := coalesce(v_member.spell_slots, '[]'::jsonb);
  if jsonb_typeof(v_slots) <> 'array' then raise exception 'Invalid spell slot state'; end if;

  if p_direction = 'points_to_slot' then
    v_cost := (array[2,3,5,6,7])[p_slot_level];
    if v_current < v_cost then raise exception 'Not enough Sorcery Points'; end if;
    v_current := v_current - v_cost;
    if jsonb_array_length(v_slots) > 0 then
      for v_index in 0..jsonb_array_length(v_slots) - 1 loop
        v_slot := v_slots -> v_index;
        if (v_slot ->> 'level')::integer = p_slot_level
           and coalesce(v_slot ->> 'pool', 'spellcasting') = 'temporary' then
          v_slot_max := coalesce((v_slot ->> 'max')::integer, 0);
          v_slots := jsonb_set(v_slots, array[v_index::text, 'max'], to_jsonb(v_slot_max + 1), false);
          v_found := true;
          exit;
        end if;
      end loop;
    end if;
    if not v_found then
      v_slots := v_slots || jsonb_build_array(jsonb_build_object(
        'level', p_slot_level, 'max', 1, 'used', 0, 'pool', 'temporary', 'recovery', 'none'
      ));
    end if;
  else
    if v_current + p_slot_level > v_max then raise exception 'Sorcery Points cannot exceed their maximum'; end if;
    if jsonb_array_length(v_slots) = 0 then raise exception 'No spell slots exist'; end if;
    for v_index in 0..jsonb_array_length(v_slots) - 1 loop
      v_slot := v_slots -> v_index;
      if (v_slot ->> 'level')::integer = p_slot_level
         and coalesce(v_slot ->> 'pool', 'spellcasting') = p_slot_pool then
        v_used := coalesce((v_slot ->> 'used')::integer, 0);
        v_slot_max := coalesce((v_slot ->> 'max')::integer, 0);
        if v_used >= v_slot_max then raise exception 'No selected spell slot remains'; end if;
        v_slots := jsonb_set(v_slots, array[v_index::text, 'used'], to_jsonb(v_used + 1), false);
        v_found := true;
        exit;
      end if;
    end loop;
    if not v_found then raise exception 'Selected spell slot pool does not exist'; end if;
    v_current := v_current + p_slot_level;
  end if;

  v_resources := jsonb_set(v_resources, '{sorcery_points,current}', to_jsonb(v_current), false);
  update public.party_members set spell_slots = v_slots, class_resources = v_resources
  where id = p_party_member_id;
  return jsonb_build_object('spell_slots', v_slots, 'class_resources', v_resources);
end;
$$;

revoke all on function public.convert_sorcery_points(uuid, text, integer, text) from public, anon;
grant execute on function public.convert_sorcery_points(uuid, text, integer, text) to authenticated;
