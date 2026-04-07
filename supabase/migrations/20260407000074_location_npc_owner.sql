-- Add NPC owner to locations (used as the vendor/innkeeper sender name for store offers)
alter table public.locations
  add column if not exists npc_owner_id uuid references public.npcs(id) on delete set null;
