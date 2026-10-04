-- Migration: terms_notices
--
-- Who has been emailed about which Terms of Service version. The admin's
-- "Send Terms notice" tool (edge function `send-terms-notice`) writes one row
-- per account it tries, so running it again, after a partial send or by a
-- second click, never emails anyone twice about the same version.
--
-- A row is in one of two states: `sent_at` set (mailed, never mailed again) or
-- only `failed_at` set (the last attempt failed; the next runs try it after
-- everyone not yet attempted, oldest failure first, so a few permanently bad
-- addresses cannot stall the send). A successful retry sets `sent_at`.
--
-- Email is for planning and for notices like this one, never for play (see
-- context/features/notifications.md). A Terms change is a notice about the
-- account's agreement with Grimoire, so it has no opt-out switch; it goes only
-- to accounts that have not yet accepted the current version in the app,
-- because anyone who has accepted it already read the same "what's new".
--
-- The FK to auth.users is what carries the rows into export_user_data and
-- through erasure (both follow the auth.users FK graph; data_export.test.sql).

create table public.terms_notices (
  user_id uuid not null references auth.users (id) on delete cascade,
  terms_version text not null,
  sent_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, terms_version),
  constraint terms_notices_outcome_check check (sent_at is not null or failed_at is not null)
);

create trigger terms_notices_updated_at
  before update on public.terms_notices
  for each row execute procedure update_updated_at();

-- Written only by the edge function's service-role client. The own-row
-- policies are the house pattern; a user can at most see that they were sent
-- the notice.
alter table public.terms_notices enable row level security;

create policy "terms_notices_select" on public.terms_notices for select using ((select auth.uid()) = user_id);
create policy "terms_notices_insert" on public.terms_notices for insert with check ((select auth.uid()) = user_id);
create policy "terms_notices_update" on public.terms_notices for update using ((select auth.uid()) = user_id);
create policy "terms_notices_delete" on public.terms_notices for delete using ((select auth.uid()) = user_id);

-- One admin_audit_log row per send run (who sent which version to how many),
-- with no target user: the per-account record is terms_notices above.
alter table public.admin_audit_log drop constraint admin_audit_log_action_check;
alter table public.admin_audit_log add constraint admin_audit_log_action_check
  check (action = any (array[
    'account_erasure', 'plan_change', 'account_freeze', 'account_unfreeze',
    'account_ban', 'account_unban', 'credit_grant', 'credit_pack_refund',
    'dsr_request_logged', 'dsr_request_answered', 'terms_notice_sent'
  ]));
