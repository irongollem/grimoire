-- Migration: calendar_events_player_rls
-- Allow campaign members to read player-visible events and session (chronicle) events

create policy "calendar_events_player_select" on calendar_events
  for select using (
    campaign_id is not null
    and campaign_id in (
      select campaign_id from campaign_members where user_id = auth.uid()
    )
    and (player_visible = true or event_type = 'session')
  );
