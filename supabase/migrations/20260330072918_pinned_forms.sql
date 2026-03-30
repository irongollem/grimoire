-- DM can pin specific monster forms to a player (wildshape, animal companion, etc.)
-- Pinned forms appear in the player's Wild Forms tab regardless of CR/type filters.

create table pinned_forms (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade not null,
  party_member_id uuid references party_members(id) on delete cascade not null,
  monster_id  uuid references monsters(id) on delete cascade,
  srd_slug    text,
  monster_name text not null,
  image_url   text,
  created_at  timestamptz default now(),
  -- one pin per monster per party member
  constraint pinned_forms_custom_unique unique (campaign_id, party_member_id, monster_id),
  constraint pinned_forms_srd_unique    unique (campaign_id, party_member_id, srd_slug)
);

alter table pinned_forms enable row level security;

-- DM: full access
create policy "pinned_forms_dm" on pinned_forms
  for all using (is_campaign_dm(campaign_id));

-- Players: can read their own pinned forms
create policy "pinned_forms_player_select" on pinned_forms
  for select using (
    is_campaign_member(campaign_id) and
    exists (
      select 1 from campaign_members cm
      where cm.campaign_id = pinned_forms.campaign_id
        and cm.user_id     = auth.uid()
        and cm.party_member_id = pinned_forms.party_member_id
    )
  );

create trigger pinned_forms_updated_at
  before update on pinned_forms
  for each row execute procedure update_updated_at();
