alter table party_members
  alter column carry_capacity_override type text using carry_capacity_override::text;
