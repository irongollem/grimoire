alter table party_members
  add column if not exists carry_capacity_override integer null;
