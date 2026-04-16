-- Migration: party_member_disguise
-- Add shapeshifter flag to species and disguise identity fields to party_members

-- Species: mark as capable of shapeshifting
alter table species
  add column if not exists is_shapeshifter boolean not null default false;

-- Party members: current disguise state (player-controlled)
alter table party_members
  add column if not exists disguise_species_id uuid references species(id) on delete set null,
  add column if not exists disguise_race       text,
  add column if not exists disguise_subrace    text;

-- Player sets their own disguise (bypasses DM-only update RLS)
create or replace function set_shapeshifter_appearance(
  member_id       uuid,
  target_species  uuid
)
returns void
language sql
security definer
as $$
  update party_members
  set
    disguise_species_id = target_species,
    disguise_race       = (select name from species where id = target_species)
  where id = member_id
    and exists (
      select 1 from campaign_members cm
      where cm.user_id = auth.uid()
        and cm.party_member_id = member_id
    );
$$;

-- Player reverts to true form
create or replace function clear_shapeshifter_appearance(member_id uuid)
returns void
language sql
security definer
as $$
  update party_members
  set disguise_species_id = null,
      disguise_race       = null,
      disguise_subrace    = null
  where id = member_id
    and exists (
      select 1 from campaign_members cm
      where cm.user_id = auth.uid()
        and cm.party_member_id = member_id
    );
$$;
