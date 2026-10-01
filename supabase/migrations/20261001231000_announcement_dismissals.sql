-- One-off product announcements ("what's new" notices) shown at the top of
-- the DM shell. The announcements themselves live in code
-- (src/lib/announcements.ts); this table only records which ones an account
-- has dismissed, so a dismissed notice stays gone on every device.
create table announcement_dismissals (
  user_id         uuid not null references auth.users(id) on delete cascade,
  announcement_id text not null,
  dismissed_at    timestamptz not null default now(),
  primary key (user_id, announcement_id)
);

alter table announcement_dismissals enable row level security;

create policy "announcement_dismissals_select" on announcement_dismissals
  for select using (auth.uid() = user_id);
create policy "announcement_dismissals_insert" on announcement_dismissals
  for insert with check (auth.uid() = user_id);
create policy "announcement_dismissals_delete" on announcement_dismissals
  for delete using (auth.uid() = user_id);
