-- Migration: patreon_connections
-- Stores OAuth tokens for users who link their Patreon account

create table patreon_connections (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  patreon_user_id  text not null unique,
  access_token     text not null,
  refresh_token    text not null,
  token_expires_at timestamptz not null,
  patreon_email    text,
  full_name        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger patreon_connections_updated_at
  before update on patreon_connections
  for each row execute procedure update_updated_at();

alter table patreon_connections enable row level security;

-- Users can only read their own connection
create policy "patreon_connections_select" on patreon_connections
  for select using (auth.uid() = user_id);

-- Inserts/updates/deletes are done by the edge functions via service role only
