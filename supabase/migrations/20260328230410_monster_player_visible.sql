-- Add player visibility flag to monsters
alter table monsters add column if not exists is_player_visible boolean not null default false;

-- Players can read monsters marked visible if they are a member of a campaign
-- whose DM (campaigns.user_id) owns the monster.
create policy "monsters_player_select" on monsters
  for select
  using (
    is_player_visible = true
    and exists (
      select 1
      from campaign_members cm
      join campaigns c on c.id = cm.campaign_id
      where cm.user_id = auth.uid()
        and c.user_id = monsters.user_id
    )
  );
