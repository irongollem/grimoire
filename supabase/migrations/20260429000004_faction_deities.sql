-- Migration: faction_deities
-- Join table linking factions to deities (many-to-many)

create table faction_deities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  faction_id  uuid not null references factions(id) on delete cascade,
  deity_id    uuid not null references deities(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (faction_id, deity_id)
);

alter table faction_deities enable row level security;

create policy "faction_deities_select" on faction_deities for select using (public.is_campaign_dm(campaign_id));
create policy "faction_deities_insert" on faction_deities for insert with check (public.is_campaign_dm(campaign_id));
create policy "faction_deities_update" on faction_deities for update using (public.is_campaign_dm(campaign_id));
create policy "faction_deities_delete" on faction_deities for delete using (public.is_campaign_dm(campaign_id));

-- Players can see faction-deity links where either the faction or deity is visible to them
create policy "faction_deities_player_select" on faction_deities for select using (
  public.is_campaign_member(campaign_id)
  and (
    exists (
      select 1 from public.factions f
      where f.id = faction_deities.faction_id
        and f.player_visible_to is not null
        and exists (
          select 1 from public.campaign_members cm
          where cm.user_id = auth.uid()
            and cm.role = 'player'
            and cm.party_member_id = any(f.player_visible_to)
        )
    )
    or exists (
      select 1 from public.deities d
      where d.id = faction_deities.deity_id
        and d.player_visible_to is not null
        and exists (
          select 1 from public.campaign_members cm
          where cm.user_id = auth.uid()
            and cm.role = 'player'
            and cm.party_member_id = any(d.player_visible_to)
        )
    )
  )
);
