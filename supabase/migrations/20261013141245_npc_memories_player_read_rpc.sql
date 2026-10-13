-- A player reads an NPC memory without learning where its secret lives (#1056).
--
-- 20261012233859 gave npc_memories the [secret] block a line discloses
-- (secret_entity_type, secret_entity_id, secret_id). The select policy let a
-- player read every row shared with their character, and table-level SELECT
-- returns every column, so a player calling PostgREST directly could read
-- those three and learn that a hidden block exists in, say, a location the
-- party has not discovered. The app asked for six columns; the table answered
-- with all of them to anyone who asked for more.
--
-- A column revoke cannot fix it: DMs and players read as the same
-- `authenticated` role, the DM's reads and returning clauses need the columns,
-- and a column revoke is a no-op while the table-level grant stands. A
-- security_invoker view cannot either, since it reads through the table's RLS
-- and so needs the player branch to stay. So the table becomes DM-only and a
-- player reads through the function below, which returns only what a player
-- may see of a line.

create or replace function public.get_player_npc_memories(p_npc_id uuid, p_party_member_id uuid)
returns table (id uuid, npc_id uuid, kind text, body text, session_id uuid, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_campaign uuid;
begin
  -- The NPC's campaign decides who may ask. One message for a missing NPC and
  -- a foreign one, so a caller learns nothing about campaigns they are not in.
  -- A DM of the campaign may read any member's lines (the DM preview of the
  -- player portal); a player only their own character's.
  select n.campaign_id into v_campaign from public.npcs n where n.id = p_npc_id;
  if auth.uid() is null
     or v_campaign is null
     or not (
       coalesce(private.is_campaign_dm(v_campaign), false)
       or exists (
         select 1 from public.campaign_members cm
          where cm.user_id = auth.uid()
            and cm.campaign_id = v_campaign
            and cm.role = 'player'
            and cm.party_member_id = p_party_member_id
       )
     ) then
    raise exception 'Not authorized';
  end if;

  return query
    select m.id, m.npc_id, m.kind, m.body, m.session_id, m.created_at
      from public.npc_memories m
     where m.npc_id = p_npc_id
       and m.campaign_id = v_campaign
       and p_party_member_id = any (m.player_visible_to)
     order by m.created_at;
end;
$$;

revoke execute on function public.get_player_npc_memories(uuid, uuid) from public, anon;
grant execute on function public.get_player_npc_memories(uuid, uuid) to authenticated, service_role;

-- The table itself is the DM's. A player still hears the npc_memories ring
-- (the doorbell names the table and carries no row) and refetches through the
-- function above.
alter policy "npc_memories_select" on public.npc_memories
  using (private.is_campaign_dm(campaign_id));
