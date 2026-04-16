-- Migration: fix_shapeshifter_rpc_auth
-- Allow party member owner (DM) as well as the linked player to set/clear disguise

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
    and (
      -- DM path: calling user owns this party member row
      user_id = auth.uid()
      or
      -- Player path: calling user is linked to this party member via campaign_members
      exists (
        select 1 from campaign_members cm
        where cm.user_id = auth.uid()
          and cm.party_member_id = member_id
      )
    );
$$;

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
    and (
      -- DM path: calling user owns this party member row
      user_id = auth.uid()
      or
      -- Player path: calling user is linked to this party member via campaign_members
      exists (
        select 1 from campaign_members cm
        where cm.user_id = auth.uid()
          and cm.party_member_id = member_id
      )
    );
$$;
