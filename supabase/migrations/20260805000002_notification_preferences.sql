-- Migration: notification_preferences
-- Per-user email notification opt-outs (#none). One row per user, created
-- lazily on first toggle; a missing row means every email type is ON — the
-- send-notification-email edge function treats absence as the defaults, so
-- players get notified without ever visiting settings.

create table notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- A DM shared a session note with this player (notes.player_visible_to).
  email_shared_notes boolean not null default true,
  -- A DM proposed a new session date (session_proposals insert).
  email_session_proposals boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger notification_preferences_updated_at
  before update on notification_preferences
  for each row execute procedure update_updated_at();

alter table notification_preferences enable row level security;

create policy "notification_preferences_select" on notification_preferences for select using (auth.uid() = user_id);
create policy "notification_preferences_insert" on notification_preferences for insert with check (auth.uid() = user_id);
create policy "notification_preferences_update" on notification_preferences for update using (auth.uid() = user_id);
create policy "notification_preferences_delete" on notification_preferences for delete using (auth.uid() = user_id);
