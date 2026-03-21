-- Private per-player notes on a party member (e.g. "I don't fully trust Karl").

create table public.party_member_player_notes (
  id               uuid primary key default gen_random_uuid(),
  party_member_id  uuid not null references public.party_members(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  notes            text not null default '',
  updated_at       timestamptz not null default now(),
  unique(party_member_id, user_id)
);

create trigger party_member_player_notes_updated_at
  before update on public.party_member_player_notes
  for each row execute procedure update_updated_at();

alter table public.party_member_player_notes enable row level security;

create policy "party_member_player_notes_select" on public.party_member_player_notes
  for select using (auth.uid() = user_id);
create policy "party_member_player_notes_insert" on public.party_member_player_notes
  for insert with check (auth.uid() = user_id);
create policy "party_member_player_notes_update" on public.party_member_player_notes
  for update using (auth.uid() = user_id);
create policy "party_member_player_notes_delete" on public.party_member_player_notes
  for delete using (auth.uid() = user_id);
