-- Migration: bug_report_privacy
-- Takes the in-app bug reporter off the public internet (#633, #634).
--
-- The reporter posts to a GitHub issue on irongollem/grimoire, which is a
-- PUBLIC repo. Two things were crossing that boundary:
--
--   #633  The issue footer printed `submittedBy`, built client-side as
--         `membership?.display_name || userEmail`. Every report filed so far
--         happened to come from someone with a campaign display name, so no
--         address was ever actually published (all 15 `user-report` issues
--         audited on 9 Aug 2026 — #464, #459, #458, #443, #442, #441, #440,
--         #439, #407, #406, #279 carry display names, the rest "Anonymous").
--         The fallback was one profile-less reporter away from publishing an
--         email address to the open internet with no lawful basis and no
--         notice. A new account is exactly that reporter.
--
--   #634  Screenshots went to a `public: true` bucket and the permanent URL
--         was embedded in the issue body. A screenshot is whatever was on the
--         user's screen — party names, chat, another player's content, their
--         own address bar — readable by anyone with the URL, forever.
--
-- ── Why the screenshot moves into this table instead of a private bucket ────
--
-- The obvious fix for #634 is a private bucket plus signed URLs. It does not
-- work *here*: a signed URL pasted into a public issue is public for as long
-- as it is valid, so the only safe expiry is one shorter than triage takes.
-- The URL has to leave the issue body entirely — and once it does, Storage is
-- buying us nothing but machinery. A private bucket would need an
-- `is_app_admin()` storage policy, a `{userId}/` path prefix so account
-- deletion's per-user listing actually finds the object (it does NOT today —
-- see below), a new edge function to delete blobs on a schedule, a pg_cron
-- job, and a vault secret holding that function's URL whose absence fails
-- silently. Five moving parts to hold ~93KB.
--
-- On the row, every one of those problems is answered by something that
-- already exists: RLS is the access control, `on delete cascade` is the
-- erasure path, and retention is one UPDATE in a cron job. Screenshots arrive
-- pre-shrunk by the client (1200px, JPEG q0.85 — the single object in the old
-- bucket is 93KB) and are capped at 5MB by the edge function, so TOAST
-- handles this comfortably at any volume this reporter will ever see.
--
-- ── The erasure hole this also closes ──────────────────────────────────────
--
-- Objects went to `bug-reports/{timestamp}-{name}.{ext}` — no user prefix.
-- delete-account purges storage by listing the `{userId}/` folder of every
-- bucket (see _shared/storage-purge.ts), so a bug-report screenshot was
-- unreachable by erasure and survived the account that produced it. It was
-- also not linked to that account by anything, which is the only reason it
-- was not a live Art. 17 breach: nothing could find it, including us.
-- On this table the FK does the work — cascade, and it is gone with the user.

-- ── 1. The reporter ↔ issue mapping ────────────────────────────────────────
-- Attribution leaves the public issue but must not leave the system: support
-- still needs to answer "who filed #472 and can I ask them a follow-up
-- question". That link is personal data, so it lives here under RLS instead
-- of in a Markdown footer served by github.com.
create table public.bug_reports (
  id uuid primary key default gen_random_uuid(),

  -- Cascade, not set-null: unlike the billing evidence in 20260808000001 this
  -- row has no retention basis that outlives the account. Its whole purpose is
  -- contacting the reporter, and after erasure there is no one to contact. The
  -- GitHub issue survives on its own — by design it now carries no personal
  -- data, so an orphaned issue is a technical record, not a residue.
  user_id uuid not null references auth.users (id) on delete cascade,

  kind text not null check (kind in ('bug', 'feature')),

  -- Nullable because the row is written BEFORE the GitHub call: the issue body
  -- states whether a screenshot was captured, so the capture has to have
  -- already succeeded or failed by the time the body is built. Filled in by
  -- the UPDATE that follows a successful issue creation. A null here means
  -- GitHub rejected the report or the follow-up UPDATE lost its race with a
  -- cold start — the row is still the reporter's record either way.
  issue_number integer,

  -- The screenshot itself, as the base64 data URL the browser produced. Text
  -- rather than bytea so the admin view can bind it straight into an <img src>
  -- with no decode step on either side; the ~33% base64 overhead is worth
  -- fewer moving parts at this volume. Nulled by the retention job below.
  screenshot text,
  screenshot_purged_at timestamptz,

  -- So the admin list can render a "has an image" badge without selecting the
  -- images themselves. Without it the only way to know is to fetch the column,
  -- which means every list render pulls every screenshot over the wire to
  -- decide whether to draw a paperclip. Generated rather than maintained by the
  -- writer: it cannot drift from the column it describes, including when the
  -- retention job below nulls that column.
  has_screenshot boolean generated always as (screenshot is not null) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Partial: `issue_number` is null until GitHub answers, and null is not
-- distinct-from itself under a plain unique index only by accident of the
-- default. Being explicit costs nothing and states that two pending rows are
-- fine but two rows claiming the same issue are not.
create unique index bug_reports_issue_number_idx
  on public.bug_reports (issue_number)
  where issue_number is not null;

create index bug_reports_user_id_idx on public.bug_reports (user_id);
create index bug_reports_created_at_idx on public.bug_reports (created_at desc);

create trigger bug_reports_updated_at
  before update on public.bug_reports
  for each row execute procedure update_updated_at();

alter table public.bug_reports enable row level security;

-- SELECT only, and deliberately no INSERT/UPDATE/DELETE policy. Every write is
-- the create-bug-report edge function under the service role, which bypasses
-- RLS — the same shape as ai_generation_jobs (20260730000002). A client INSERT
-- policy would let anyone mint a row claiming any issue number, and a client
-- UPDATE policy would let a reporter rewrite what they submitted after a
-- maintainer read it.
--
-- Own rows are readable so the reporter can see what they sent — and so the
-- Art. 15/20 export (#632) has a table it can already read rather than a new
-- RPC to write.
create policy "bug_reports_select" on public.bug_reports
  for select using (auth.uid() = user_id or private.is_app_admin());

-- Supabase grants ALL to anon/authenticated on every public table by default
-- and RLS is the real gate; revoking the writes as well means a future stray
-- policy — or someone disabling RLS to debug something — cannot open a write
-- path here by accident. Same defence in depth as 20260804000005.
revoke insert, update, delete on public.bug_reports from anon, authenticated;

-- ── 2. Retention ───────────────────────────────────────────────────────────
-- Two periods, because the two things have different lifespans.
--
-- Screenshot — 90 days. It is the sensitive half (arbitrary screen content,
-- possibly third parties') and the half that stops being useful first: a
-- screenshot matters while the bug is being reproduced, not afterwards. Matches
-- the 90-day AI-prompt scrub in 20260804000005 rather than inventing a second
-- number for the same "kept only while it is being worked on" idea.
--
-- Row — 365 days. The reporter↔issue link is the follow-up channel, and a
-- report nobody has followed up on within a year is not going to be. The
-- public issue keeps the technical content; only the attribution expires.
--
-- Deleting the row also drops any screenshot still on it, so the two rules
-- compose rather than the second having to re-state the first. This is the
-- first enforced period outside AI prompt text — #639 still owns defining the
-- rest, including the far end of the 7-year bookkeeping retention.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-bug-report-data') then
    perform cron.unschedule('purge-bug-report-data');
  end if;
end $$;

select cron.schedule(
  'purge-bug-report-data',
  '10 4 * * *',
  $$
    update public.bug_reports
       set screenshot = null,
           screenshot_purged_at = now()
     where screenshot is not null
       and created_at < now() - interval '90 days';

    delete from public.bug_reports
     where created_at < now() - interval '365 days';
  $$
);

-- ── 3. The old bucket ──────────────────────────────────────────────────────
-- It held exactly one object — `1777148450043-01-028.png.jpg`, 93KB, filed
-- 25 Apr 2026 with #279 — and serving it needed no authentication of any kind,
-- verified by fetching it anonymously before deleting it through the Storage
-- API on 9 Aug 2026. The bucket is empty as of this migration.
--
-- Emptied but kept, private. Two reasons not to drop it:
--
--   Dropping a bucket from SQL deletes the storage.objects rows and strands
--   their blobs in S3 — reachable by nothing, deletable by nothing, the exact
--   opposite of erasure. Moot for an empty bucket today, but it is the reason
--   `delete from storage.buckets` must never become the reflex here.
--
--   CI runs `db push` before `functions deploy`, so for a minute or two this
--   migration is live while the PREVIOUS create-bug-report is still serving.
--   That version calls `createBucket("bug-reports", { public: true })` on any
--   report with a screenshot. Drop the bucket and that call recreates it
--   public; leave it in place and the call fails as a duplicate, `public`
--   stays false, and the URL it hands back 404s. Keeping the bucket is what
--   makes the deploy window harmless rather than a fresh leak.
--
-- Nothing writes here after that deploy: the upload is gone from the edge
-- function and the screenshot lives on the row above.
update storage.buckets
   set public = false
 where id = 'bug-reports';
