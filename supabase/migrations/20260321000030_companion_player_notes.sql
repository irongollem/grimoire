-- Player-facing notes on companions.
--
-- party_notes: shared notes visible to all campaign members (editable via RPC).
-- companion_player_notes: private per-player notes.

alter table public.companions
  add column if not exists party_notes text;

-- Players can read companions for their campaign.
create policy "Campaign members see companions"
  on public.companions for select
  using (is_campaign_member(campaign_id));

-- Secure RPC so campaign members can update only party_notes on a companion.
create or replace function public.update_companion_party_notes(p_companion_id uuid, p_notes text)
returns void language plpgsql security definer
set search_path = public as $$
declare
  v_campaign_id uuid;
begin
  select campaign_id into v_campaign_id
  from public.companions
  where id = p_companion_id;

  if not found then
    raise exception 'Companion not found';
  end if;

  if not is_campaign_member(v_campaign_id) then
    raise exception 'Access denied';
  end if;

  update public.companions set party_notes = p_notes where id = p_companion_id;
end;
$$;

-- ── Personal player notes per companion ────────────────────────────────────

create table public.companion_player_notes (
  id            uuid primary key default gen_random_uuid(),
  companion_id  uuid not null references public.companions(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  notes         text not null default '',
  updated_at    timestamptz not null default now(),
  unique(companion_id, user_id)
);

create trigger companion_player_notes_updated_at
  before update on public.companion_player_notes
  for each row execute procedure update_updated_at();

alter table public.companion_player_notes enable row level security;

create policy "companion_player_notes_select" on public.companion_player_notes
  for select using (auth.uid() = user_id);
create policy "companion_player_notes_insert" on public.companion_player_notes
  for insert with check (auth.uid() = user_id);
create policy "companion_player_notes_update" on public.companion_player_notes
  for update using (auth.uid() = user_id);
create policy "companion_player_notes_delete" on public.companion_player_notes
  for delete using (auth.uid() = user_id);
