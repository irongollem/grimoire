-- Add per-ref player visibility (default hidden)
alter table public.quest_refs
  add column if not exists is_player_visible boolean not null default false;

-- Allow DM to UPDATE refs (needed for the eye toggle)
create policy "quest_refs_update" on public.quest_refs
  for update using (
    exists (select 1 from public.quests where id = quest_refs.quest_id and auth.uid() = user_id)
  );

-- Players can read only visible refs on visible quests in their campaign
create policy "quest_refs_player_select" on public.quest_refs
  for select using (
    is_player_visible = true
    and exists (
      select 1 from public.quests
      where quests.id = quest_refs.quest_id
        and quests.is_player_visible = true
        and quests.campaign_id is not null
        and is_campaign_member(quests.campaign_id)
    )
  );
