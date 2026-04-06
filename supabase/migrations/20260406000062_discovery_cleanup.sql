-- Remove snapshot columns from discovered_monsters and pinned_forms.
-- Uses IF EXISTS so this is safe to run even if already applied.
alter table discovered_monsters drop column if exists image_url;
alter table discovered_monsters drop column if exists monster_name;

alter table pinned_forms drop column if exists image_url;
alter table pinned_forms drop column if exists monster_name;

-- The original discovered_monsters migration dropped the old is_player_visible-based
-- "monsters_player_select" policy but never added a replacement.
-- Players could not read the monsters table, so discovered custom monsters resolved
-- to null in the player bestiary ("Unknown creature").
--
-- Allow campaign members to read custom monsters that appear in their campaign's
-- discovered_monsters table. The discovered_monsters RLS controls per-player
-- visibility; this policy just makes the underlying monster record readable.
drop policy if exists "monsters_player_select" on monsters;

create policy "monsters_player_select" on monsters
  for select
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from discovered_monsters dm
      inner join campaign_members cm
        on cm.campaign_id = dm.campaign_id
        and cm.user_id = auth.uid()
      where dm.monster_id = monsters.id
    )
  );
