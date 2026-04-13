-- Migration: drop_shared_with_players_all_tables
-- Remove the legacy shared_with_players boolean from notes, quests, locations,
-- factions, and crafting_recipes. player_visible_to: string[] is the sole
-- source of truth. Backfill shared_with_players=true rows with current party
-- members before dropping.

-- ── notes ─────────────────────────────────────────────────────────────────────

update notes n
set player_visible_to = (
  select coalesce(array_agg(pm.id), '{}')
  from party_members pm where pm.campaign_id = n.campaign_id
)
where n.shared_with_players = true
  and (n.player_visible_to is null or n.player_visible_to = '{}');

update notes set player_visible_to = '{}' where player_visible_to is null;

drop policy if exists "notes_select" on notes;

create policy "notes_select" on notes for select using (
  auth.uid() = user_id
  or (
    campaign_id is not null
    and campaign_id in (select campaign_id from campaign_members where user_id = auth.uid())
    and exists (
      select 1 from campaign_members cm
      where cm.user_id = auth.uid()
        and cm.campaign_id = notes.campaign_id
        and cm.party_member_id = any(notes.player_visible_to)
    )
  )
);

alter table notes drop column shared_with_players;

-- ── quests ────────────────────────────────────────────────────────────────────

update quests q
set player_visible_to = (
  select coalesce(array_agg(pm.id), '{}')
  from party_members pm where pm.campaign_id = q.campaign_id
)
where q.shared_with_players = true
  and (q.player_visible_to is null or q.player_visible_to = '{}');

update quests set player_visible_to = '{}' where player_visible_to is null;

drop policy if exists "quests_select" on quests;
drop policy if exists "quest_refs_player_select" on quest_refs;
drop policy if exists "quest_objectives_player_select" on quest_objectives;

create policy "quests_select" on quests for select using (
  auth.uid() = user_id
  or (
    campaign_id is not null
    and exists (
      select 1 from campaign_members cm
      where cm.user_id = auth.uid()
        and cm.campaign_id = quests.campaign_id
        and cm.party_member_id = any(quests.player_visible_to)
    )
  )
);

create policy "quest_refs_player_select" on quest_refs for select using (
  exists (
    select 1 from quests q
    join campaign_members cm on cm.campaign_id = q.campaign_id
    where q.id = quest_refs.quest_id
      and cm.user_id = auth.uid()
      and cm.party_member_id = any(q.player_visible_to)
  )
);

create policy "quest_objectives_player_select" on quest_objectives for select using (
  exists (
    select 1 from quests q
    join campaign_members cm on cm.campaign_id = q.campaign_id
    where q.id = quest_objectives.quest_id
      and cm.user_id = auth.uid()
      and cm.party_member_id = any(q.player_visible_to)
  )
);

alter table quests drop column shared_with_players;

-- ── locations ─────────────────────────────────────────────────────────────────

update locations l
set player_visible_to = (
  select coalesce(array_agg(pm.id), '{}')
  from party_members pm where pm.campaign_id = l.campaign_id
)
where l.shared_with_players = true
  and (l.player_visible_to is null or l.player_visible_to = '{}');

update locations set player_visible_to = '{}' where player_visible_to is null;

-- Recreate store_items and items policies that joined on l.shared_with_players
drop policy if exists "store_items_campaign_member_select" on store_items;
drop policy if exists "items_campaign_member_select" on items;

create policy "store_items_campaign_member_select" on store_items for select using (
  exists (
    select 1 from locations l
      join campaign_members cm on cm.campaign_id = l.campaign_id
     where l.id = store_items.location_id
       and cm.user_id = auth.uid()
       and cm.party_member_id = any(l.player_visible_to)
       and l.is_inventory_shared = true
       and store_items.visible = true
  )
);

create policy "items_campaign_member_select" on items for select using (
  exists (
    select 1
      from store_items si
      join locations l on l.id = si.location_id
      join campaign_members cm on cm.campaign_id = l.campaign_id
     where si.item_id = items.id
       and cm.user_id = auth.uid()
       and cm.party_member_id = any(l.player_visible_to)
       and l.is_inventory_shared = true
       and si.visible = true
  )
);

alter table locations drop column shared_with_players;

-- ── factions ──────────────────────────────────────────────────────────────────

update factions f
set player_visible_to = (
  select coalesce(array_agg(pm.id), '{}')
  from campaign_members cm
  join party_members pm on pm.campaign_id = cm.campaign_id
  where cm.user_id = f.user_id and cm.role = 'dm'
)
where f.shared_with_players = true
  and (f.player_visible_to is null or f.player_visible_to = '{}');

update factions set player_visible_to = '{}' where player_visible_to is null;

drop policy if exists "factions_player_select" on factions;

create policy "factions_player_select" on factions for select using (
  exists (
    select 1 from campaign_members cm
    join campaign_members cm_dm
      on cm.campaign_id = cm_dm.campaign_id and cm_dm.role = 'dm'
    where cm.user_id = auth.uid()
      and cm.role = 'player'
      and cm_dm.user_id = factions.user_id
      and cm.party_member_id = any(factions.player_visible_to)
  )
);

alter table factions drop column shared_with_players;

-- ── crafting_recipes ──────────────────────────────────────────────────────────

update crafting_recipes cr
set player_visible_to = (
  select coalesce(array_agg(pm.id), '{}')
  from party_members pm where pm.campaign_id = cr.campaign_id
)
where cr.shared_with_players = true
  and (cr.player_visible_to is null or cr.player_visible_to = '{}');

update crafting_recipes set player_visible_to = '{}' where player_visible_to is null;

drop policy if exists "crafting_recipes_select_player" on crafting_recipes;

create policy "crafting_recipes_select_player" on crafting_recipes for select using (
  campaign_id is not null
  and is_campaign_member(campaign_id)
  and exists (
    select 1 from campaign_members cm
    where cm.user_id = auth.uid()
      and cm.campaign_id = crafting_recipes.campaign_id
      and cm.party_member_id = any(crafting_recipes.player_visible_to)
  )
);

alter table crafting_recipes drop column shared_with_players;
