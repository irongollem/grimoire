-- Migration: pro_waitlist
-- Go-to-market gate: Pro checkout isn't open yet, so the marketing site shows a
-- waitlist form in place of the Pro CTAs. Two pieces:
--   1. pro_waitlist — anonymous email capture from the marketing site (insert-only).
--   2. checkout_config.pro_signup_open — admin-toggled flag; flipping it fires the
--      existing marketing deploy hook so the static site rebuilds with real CTAs.

-- ── pro_waitlist (anonymous email capture) ───────────────────────────────────
-- Companion to feature_interest (which is user_id-based and app-side): this one
-- takes bare emails from logged-out visitors via the anon key.

create table pro_waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  source     text,
  created_at timestamptz not null default now()
);

-- Case-insensitive dedupe; the marketing form treats the 409 as "already on the list".
create unique index pro_waitlist_email_key on pro_waitlist (lower(email));

-- No updated_at column/trigger: joining a waitlist is a fact, never edited.

alter table pro_waitlist enable row level security;

-- Anyone may add themselves (marketing site posts with the publishable anon key)…
create policy "pro_waitlist_insert" on pro_waitlist
  for insert with check (true);

-- …but only admins ever read the list back.
create policy "pro_waitlist_select" on pro_waitlist
  for select using (private.is_app_admin());

-- No update/delete policies: rows are immutable facts.

-- ── checkout_config.pro_signup_open (the launch switch) ──────────────────────

alter table checkout_config
  add column pro_signup_open boolean not null default false;

-- checkout_config shipped with only a public-read policy, so the admin UI's
-- promo_codes_enabled update has been silently no-op'd by RLS (or patched by
-- hand in the dashboard). Establish the write policy properly here.
drop policy if exists "checkout_config_admin_update" on checkout_config;
create policy "checkout_config_admin_update" on checkout_config
  for update using (private.is_app_admin());

-- Flipping the switch rebuilds the marketing site (same Vault-stored Vercel
-- deploy hook the plans trigger uses), so the CTAs swap within a minute or two.
create trigger checkout_config_marketing_rebuild
  after update on public.checkout_config
  for each row
  when (old.pro_signup_open is distinct from new.pro_signup_open)
  execute procedure public.notify_marketing_rebuild();
