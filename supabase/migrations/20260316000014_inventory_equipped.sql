alter table public.party_inventory
  add column if not exists is_equipped boolean not null default false;
