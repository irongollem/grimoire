-- Migration: journal_shared_with_dm
-- Add shared_with_dm flag so players can opt-in to sharing private journal entries with the campaign DM

alter table player_journal_entries
  add column if not exists shared_with_dm boolean not null default false;

-- Campaign DMs can read journal entries that players have explicitly shared with them
create policy "player_journal_entries_select_dm_shared" on player_journal_entries for select using (
  shared_with_dm = true
  and exists (
    select 1
    from campaign_members cm_author
    join campaign_members cm_dm on cm_author.campaign_id = cm_dm.campaign_id
    where cm_author.user_id = player_journal_entries.user_id
    and cm_author.campaign_id = player_journal_entries.campaign_id
    and cm_dm.user_id = auth.uid()
    and cm_dm.role = 'dm'
  )
);
