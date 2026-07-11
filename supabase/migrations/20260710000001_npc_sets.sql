-- Migration: npc_sets
-- Named, ordered sets of NPCs ("playlists") a DM assembles for a session and
-- can export to the Card Forge. Campaign- and user-scoped; membership is an
-- ordered uuid[] of npc ids (stale ids are tolerated and filtered at render).

create table npc_sets (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  campaign_id uuid        not null references campaigns(id) on delete cascade,
  name        text        not null,
  description text,
  npc_ids     uuid[]      not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index npc_sets_campaign_id_idx on npc_sets(campaign_id);

create trigger npc_sets_updated_at
  before update on npc_sets
  for each row execute procedure update_updated_at();

alter table npc_sets enable row level security;

create policy "npc_sets_select" on npc_sets for select using (auth.uid() = user_id);
create policy "npc_sets_insert" on npc_sets for insert with check (auth.uid() = user_id);
create policy "npc_sets_update" on npc_sets for update using (auth.uid() = user_id);
create policy "npc_sets_delete" on npc_sets for delete using (auth.uid() = user_id);
