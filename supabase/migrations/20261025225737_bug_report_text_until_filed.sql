-- Migration: bug_report_text_until_filed
-- Keeps a report's text on its row until GitHub has it, and gives the filing
-- itself an admin-only record.
--
-- Until now the text of an in-app report lived in exactly one place: the
-- GitHub issue. The row written before the GitHub call (20260809000002) held
-- the reporter and the screenshot, so when the call failed (the fine-grained
-- token expired, GitHub was down) a maintainer could see that someone had
-- reported something and never what. A missing token was worse: the function
-- returned before writing the row at all, so not even the attempt survived.
--
-- ── 1. The text, on the reporter's row ─────────────────────────────────────
-- `report_text` is what the reporter typed, field by field (where, action,
-- expected, actual for a bug; summary, problem, where for a feature), not the
-- rendered issue. The issue is rendered when it is filed, so a report filed
-- again after the 90-day purge does not promise a screenshot that is gone, and
-- it still carries the time it was submitted (`created_at`).
--
-- Cleared by the update that links the issue, which the check below states.
-- Once the issue exists it is the record of the text, and a second copy here
-- would be personal data kept for no purpose. Older rows have no text, which
-- the check also allows. `has_report_text` lets Admin → Reports list rows
-- without fetching every report's text, as `has_screenshot` does for images.
--
-- The reporter may read it, under the existing policy: it is their own words.
alter table public.bug_reports
  add column report_text jsonb,
  add column has_report_text boolean generated always as (report_text is not null) stored,
  add constraint bug_reports_text_until_filed
    check (issue_number is null or report_text is null);

-- ── 2. The filing, admin-only ──────────────────────────────────────────────
-- Why a report is still waiting is operational state about our GitHub token,
-- not the reporter's data: on `bug_reports` it would be readable by them
-- through `bug_reports_select` and copied into their Art. 15/20 export, which
-- reads every column of every table holding their user id. A table with no
-- user id of its own and an admin-only read keeps it out of both. It cascades
-- with the report, so erasure and the 365-day row retention reach it too.
--
--   claimed_at  set while a filing is in flight. The edge function claims the
--               row with a conditional update before calling GitHub, so two
--               filings at once (a double click, the reporter's own request
--               racing an admin's) cannot open two issues. A claim older than
--               ten minutes is stale (no edge function runs that long) and may
--               be taken over.
--   error       why the last filing failed, in our words (the GitHub detail
--               goes to the function log).
--   uncertain   GitHub may have created the issue anyway: it answered 2xx with
--               a body that could not be read, or the issue was created and
--               linking it failed. Filing again then needs an explicit
--               "file anyway", since it may duplicate.
--
-- Deleted once the issue is linked: a filed report has no filing state.
create table public.bug_report_filings (
  report_id uuid primary key references public.bug_reports (id) on delete cascade,
  claimed_at timestamptz,
  error text,
  uncertain boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger bug_report_filings_updated_at
  before update on public.bug_report_filings
  for each row execute procedure update_updated_at();

alter table public.bug_report_filings enable row level security;

-- SELECT only, admin only, and no write policy: every write is the
-- create-bug-report edge function under the service role, as on bug_reports.
create policy "bug_report_filings_select" on public.bug_report_filings
  for select using ((select private.is_app_admin()));

-- `authenticated` because the admin reads it as an authenticated user; the
-- policy is what limits that to the admin.
grant select on public.bug_report_filings to authenticated;
grant select, insert, update, delete on public.bug_report_filings to service_role;
