-- Map upload + interactive pins for locations
alter table locations
  add column if not exists map_url text,
  add column if not exists map_pins jsonb not null default '[]'::jsonb,
  add column if not exists is_map_shared boolean not null default false;

-- Allow campaign members (players) to read locations with a shared map.
-- Pin data (child names/positions) is embedded in map_pins JSONB so players
-- don't need a separate query for child location names.
create policy "locations_shared_map_campaign_member_select" on locations
  for select
  using (
    is_map_shared = true
    and exists (
      select 1 from campaign_members cm
      where cm.campaign_id = locations.campaign_id
        and cm.user_id = auth.uid()
    )
  );
