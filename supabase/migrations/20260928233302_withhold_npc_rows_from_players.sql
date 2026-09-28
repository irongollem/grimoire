-- Migration: withhold_npc_rows_from_players
-- A player reads NPCs only through `get_player_visible_npcs`, never the table.
--
-- ── What was wrong ───────────────────────────────────────────────────────────
--
-- `npcs_player_select` let a player select the whole row of any NPC shared with
-- their character: the true `name` of a disguised NPC, the name the DM had not
-- shared, the backstory, the DM's own notes and the stat block. The app never
-- asked for any of it, because every player read goes through
-- `get_player_visible_npcs`, which blanks the name unless it is in
-- `player_visible_fields` and returns the cover name while `is_revealed` is
-- false. But a policy is what the database hands out, not what the app happens
-- to request: the same rows were one REST call away, and `npcs` is in the
-- realtime publication, so a player's live subscription received the full row
-- on every edit the DM made. Measured in production when this was written: 107
-- NPCs shared with at least one player, 3 of them disguised and 5 with their
-- name withheld.
--
-- A column-limited policy cannot fix it, because RLS filters rows and not
-- columns, and the projection already exists and is the only reader the player
-- portal uses. So the policy goes.
--
-- ── What depended on it ──────────────────────────────────────────────────────
--
-- 1. The two `player_npc_ratings` write checks joined `npcs` as the caller, so
--    they quietly relied on the player being able to see the row. They now ask
--    `private.npc_is_visible_to_caller`, a definer helper answering the same
--    question the policy used to (the caller owns the NPC, or it is shared with
--    their character) without handing out the row.
-- 2. Live updates. With the policy gone a player's `npcs` subscription carries
--    nothing, which is the point, so the table now rings the `campaign_sync`
--    doorbell on insert and update as well as on delete, the same move
--    20260928225909 made for `campaign_session_state`. The insert and update
--    triggers pass `npcs_player` as the signal name, so the client refreshes
--    only the players' projection caches. The DM already has the row event and
--    must not refetch every NPC query on each keystroke-save. Delete keeps ringing
--    as `npcs`, because a filtered delete reaches nobody, the DM included.
--    `signal_campaign_change()` learns to take that name as a trigger argument,
--    defaulting to the table name so every existing trigger is unchanged.
--
-- Nothing else reads `npcs` as a player: the other embeds of it
-- (`faction_npcs` → `npc:npcs`, `npc_inventory` → `npc:npcs`) run on DM
-- surfaces, and the item sheet's holder list no longer queries for players at
-- all (useItemHolders). Every other player path is a SECURITY DEFINER
-- projection, which RLS does not bind.

-- ── 1. The doorbell takes an optional signal name ───────────────────────────

create or replace function public.signal_campaign_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into campaign_sync (campaign_id, changed_table, updated_at)
  -- The signal is the table name unless the trigger names one: `npcs` rings
  -- `npcs_player` on insert and update so only player projections refresh.
  select distinct c.campaign_id, coalesce(tg_argv[0], tg_table_name), now()
    from changed c
   where c.campaign_id is not null
     -- Skip the cascade from `delete from campaigns`: the parent row is already
     -- gone by the time its children cascade, so the insert would fail the FK —
     -- and nobody is listening to a campaign that no longer exists.
     and exists (select 1 from campaigns p where p.id = c.campaign_id)
   -- Lock the doorbell rows in a fixed order. A statement deleting across two
   -- campaigns takes a row lock per campaign, and two such statements running
   -- in opposite orders would deadlock; ordering by the key makes that
   -- impossible rather than unlikely.
   order by 1
  on conflict (campaign_id) do update
     set changed_table = excluded.changed_table,
         updated_at    = excluded.updated_at;
  return null;
end;
$function$;

drop trigger if exists npcs_signal_insert on public.npcs;
create trigger npcs_signal_insert after insert on public.npcs
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change('npcs_player');

drop trigger if exists npcs_signal_update on public.npcs;
create trigger npcs_signal_update after update on public.npcs
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change('npcs_player');

-- ── 2. The rating checks stop reading the row ───────────────────────────────

create or replace function private.npc_is_visible_to_caller(p_npc_id uuid, p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  -- Total by construction (CLAUDE.md item 3): `exists` is never null, and the
  -- coalesce keeps it that way if this is ever rewritten as a comparison.
  select coalesce((
    select exists (
      select 1
        from npcs n
        join campaign_members cm
          on cm.campaign_id = n.campaign_id
         and cm.user_id = (select auth.uid())
       where n.id = p_npc_id
         and n.campaign_id = p_campaign_id
         and (n.user_id = (select auth.uid())
              or cm.party_member_id = any (n.player_visible_to))
    )
  ), false);
$$;

-- An RLS helper: `authenticated` must keep EXECUTE or the policies below fail
-- with "permission denied for function". `private` is not exposed by PostgREST,
-- so this is not an RPC endpoint.
revoke execute on function private.npc_is_visible_to_caller(uuid, uuid) from public, anon;
grant execute on function private.npc_is_visible_to_caller(uuid, uuid) to authenticated, service_role;

drop policy if exists "player_npc_ratings_insert_own_campaign" on public.player_npc_ratings;
create policy "player_npc_ratings_insert_own_campaign" on public.player_npc_ratings
  for insert
  with check (
    (select auth.uid()) = user_id
    and private.npc_is_visible_to_caller(npc_id, campaign_id)
  );

drop policy if exists "player_npc_ratings_update_own_campaign" on public.player_npc_ratings;
create policy "player_npc_ratings_update_own_campaign" on public.player_npc_ratings
  for update
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and private.npc_is_visible_to_caller(npc_id, campaign_id)
  );

-- ── 3. The leak itself ──────────────────────────────────────────────────────

drop policy if exists "npcs_player_select" on public.npcs;
