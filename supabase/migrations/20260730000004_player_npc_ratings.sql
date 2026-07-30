-- Issue #582: NPC relevance ratings were browser-local, so clearing site data or
-- changing devices silently discarded a player's carefully assigned stars.

create table public.player_npc_ratings (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  campaign_id uuid        not null references public.campaigns(id) on delete cascade,
  npc_id      uuid        not null references public.npcs(id) on delete cascade,
  rating      smallint    not null check (rating between 1 and 5),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, npc_id)
);

create index player_npc_ratings_campaign_id_idx
  on public.player_npc_ratings (campaign_id);
create index player_npc_ratings_npc_id_idx
  on public.player_npc_ratings (npc_id);

create trigger player_npc_ratings_updated_at
  before update on public.player_npc_ratings
  for each row execute procedure public.update_updated_at();

alter table public.player_npc_ratings enable row level security;

create policy "player_npc_ratings_select_own"
  on public.player_npc_ratings for select
  using ((select auth.uid()) = user_id);

create policy "player_npc_ratings_insert_own_campaign"
  on public.player_npc_ratings for insert
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.npcs n
      join public.campaign_members cm
        on cm.campaign_id = n.campaign_id
       and cm.user_id = (select auth.uid())
      where n.id = player_npc_ratings.npc_id
        and n.campaign_id = player_npc_ratings.campaign_id
    )
  );

create policy "player_npc_ratings_update_own_campaign"
  on public.player_npc_ratings for update
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.npcs n
      join public.campaign_members cm
        on cm.campaign_id = n.campaign_id
       and cm.user_id = (select auth.uid())
      where n.id = player_npc_ratings.npc_id
        and n.campaign_id = player_npc_ratings.campaign_id
    )
  );

create policy "player_npc_ratings_delete_own"
  on public.player_npc_ratings for delete
  using ((select auth.uid()) = user_id);
