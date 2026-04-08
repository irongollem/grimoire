-- Replace all-or-nothing is_player_visible on notes with the shared per-person
-- pattern used by NPCs, locations, factions etc.
-- shared_with_players = true  → visible to all campaign members
-- player_visible_to = [uuid…] → visible only to those specific party_member_ids

alter table public.notes
  add column if not exists shared_with_players boolean not null default false,
  add column if not exists player_visible_to   uuid[]  default null;

-- Migrate existing all-player shares
update public.notes set shared_with_players = true where is_player_visible = true;

-- Drop old catch-all notes RLS and replace with per-player aware policy
drop policy if exists "notes_select" on public.notes;

create policy "notes_select" on public.notes for select using (
  -- DM always sees their own notes
  auth.uid() = user_id
  or (
    -- Campaign member + note is shared
    campaign_id is not null
    and campaign_id in (
      select campaign_id from campaign_members where user_id = auth.uid()
    )
    and (
      -- Shared with whole party
      (shared_with_players = true and player_visible_to is null)
      -- Shared with specific players: current user's linked party_member_id must be in the array
      or (
        player_visible_to is not null
        and exists (
          select 1 from campaign_members cm
          where cm.user_id     = auth.uid()
            and cm.campaign_id = notes.campaign_id
            and cm.party_member_id = any(notes.player_visible_to)
        )
      )
    )
  )
);
