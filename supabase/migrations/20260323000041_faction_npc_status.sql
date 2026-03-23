-- Add status to faction_npcs to track retired/defected/expelled/deceased members
alter table faction_npcs
  add column status text not null default 'Active'
    check (status in ('Active', 'Retired', 'Defected', 'Expelled', 'Deceased'));
