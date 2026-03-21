-- NPC player sharing: per-field visibility controls + party/personal notes.
--
-- shared_with_players: master toggle; when false, players never see this NPC.
-- player_visible_fields: text[] of field keys the DM has revealed
--   (portrait | name | status | race | occupation | relationship)
-- party_notes: free-text notes visible to all campaign members on this NPC

alter table public.npcs
  add column shared_with_players    boolean not null default false,
  add column player_visible_fields  text[]  not null default '{}',
  add column party_notes            text;

-- Players can read NPCs that the DM has explicitly shared with them.
create policy "Campaign members see shared npcs"
  on public.npcs for select
  using (shared_with_players = true and is_campaign_member(campaign_id));

-- Secure RPC so campaign members can update only party_notes on a shared NPC.
-- Using security definer avoids giving players a broad update policy on npcs.
create or replace function public.update_npc_party_notes(p_npc_id uuid, p_notes text)
returns void language plpgsql security definer
set search_path = public as $$
declare
  v_campaign_id uuid;
begin
  select campaign_id into v_campaign_id
  from public.npcs
  where id = p_npc_id and shared_with_players = true;

  if not found then
    raise exception 'NPC not found or not shared';
  end if;

  if not is_campaign_member(v_campaign_id) then
    raise exception 'Access denied';
  end if;

  update public.npcs set party_notes = p_notes where id = p_npc_id;
end;
$$;

-- ── Personal player notes per NPC ──────────────────────────────────────────

create table public.npc_player_notes (
  id          uuid primary key default gen_random_uuid(),
  npc_id      uuid not null references public.npcs(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  notes       text not null default '',
  updated_at  timestamptz not null default now(),
  unique(npc_id, user_id)
);

create trigger npc_player_notes_updated_at
  before update on public.npc_player_notes
  for each row execute procedure update_updated_at();

alter table public.npc_player_notes enable row level security;

create policy "npc_player_notes_select" on public.npc_player_notes
  for select using (auth.uid() = user_id);
create policy "npc_player_notes_insert" on public.npc_player_notes
  for insert with check (auth.uid() = user_id);
create policy "npc_player_notes_update" on public.npc_player_notes
  for update using (auth.uid() = user_id);
create policy "npc_player_notes_delete" on public.npc_player_notes
  for delete using (auth.uid() = user_id);
