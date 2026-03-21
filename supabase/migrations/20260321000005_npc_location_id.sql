alter table public.npcs
  add column if not exists location_id uuid references public.locations(id) on delete set null;
