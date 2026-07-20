-- Flexible Casting is a Sorcerer feature, not a capability inferred from a
-- client-editable resource key. Require an exact eligible class before the
-- existing row-locked conversion transaction runs.

alter function public.convert_sorcery_points(uuid, text, integer, text)
  rename to convert_sorcery_points_before_class_guard;

create function public.convert_sorcery_points(
  p_party_member_id uuid,
  p_direction text,
  p_slot_level integer,
  p_slot_pool text default 'spellcasting'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_member public.party_members%rowtype;
begin
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
  if public.sorcerer_level(v_member) < 2 then
    raise exception 'Flexible Casting requires an eligible Sorcerer';
  end if;
  return public.convert_sorcery_points_before_class_guard(
    p_party_member_id, p_direction, p_slot_level, p_slot_pool
  );
end;
$$;

revoke all on function public.convert_sorcery_points_before_class_guard(uuid, text, integer, text)
  from public, anon, authenticated;
revoke all on function public.convert_sorcery_points(uuid, text, integer, text)
  from public, anon;
grant execute on function public.convert_sorcery_points(uuid, text, integer, text)
  to authenticated;
