-- srd_monster_art only had an owner-select policy, so players could not read the
-- DM's custom SRD art and SRD bestiary entries showed no image in the player view.
-- Allow campaign members to read art uploaded by anyone in the same campaign.
create policy "srd_monster_art_campaign_member_select" on srd_monster_art
  for select
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from campaign_members cm_player
      inner join campaign_members cm_owner
        on cm_owner.campaign_id = cm_player.campaign_id
        and cm_owner.user_id    = srd_monster_art.user_id
      where cm_player.user_id = auth.uid()
    )
  );
