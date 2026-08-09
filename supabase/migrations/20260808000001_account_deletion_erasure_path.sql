-- Migration: account_deletion_erasure_path
-- Unblocks GDPR account erasure (#631): billing evidence is anonymized instead
-- of blocking the delete, and a service-role helper handles the rows no FK
-- cascade can reach.
--
-- ── 1. ai_credit_ledger: retain, anonymize (Art. 17(3)(b) GDPR + Dutch 7-year
--       bookkeeping duty) ───────────────────────────────────────────────────
-- The ledger is billing/tax evidence, not personal-preference data — Art.
-- 17(3)(b) exempts erasure where retention is needed for legal obligations,
-- and Dutch bookkeeping law (Belastingdienst, art. 52 AWR) requires 7 years.
-- So deleting the account must not delete these rows: user_id becomes
-- nullable and the FK moves from CASCADE to SET NULL. All other columns
-- (delta, reason, amounts, timestamps) are untouched — the row keeps its
-- evidentiary value, just stripped of the identifying link.
alter table public.ai_credit_ledger alter column user_id drop not null;

alter table public.ai_credit_ledger
  drop constraint ai_credit_ledger_user_id_fkey,
  add constraint ai_credit_ledger_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete set null;

-- Dropping NOT NULL to make SET NULL possible costs the guarantee that every
-- row is attributable, and null now *means* something ("erased"), so a stray
-- insert with a null user_id would mint a row that reads as anonymized
-- evidence while having never belonged to anyone. Recording the erasure as a
-- fact rather than inferring it from a null closes that: `anonymized_at` says
-- which reading applies, and the check below rejects rows that claim neither.
--
-- Deliberately a CHECK and not a BEFORE INSERT trigger — this is the hot path
-- (a row per AI generation), and a declarative constraint costs a null test
-- where a PL/pgSQL trigger costs a function call. The timestamp is also worth
-- having on its own: Art. 17 compliance is easier to demonstrate with the date
-- of erasure on the record than with an absence.
alter table public.ai_credit_ledger add column anonymized_at timestamptz;

alter table public.ai_credit_ledger
  add constraint ai_credit_ledger_attributable_or_anonymized
  check (user_id is not null or anonymized_at is not null);

-- The append-only guard (20260804000005) unconditionally blocks UPDATE
-- because, at the time it was written, no code path ever updated a ledger
-- row. Account erasure introduces exactly one legitimate UPDATE: the
-- ON DELETE SET NULL write above nulling user_id on a settled row. Widen the
-- guard to sanction that one transition and nothing else — every other
-- column must be byte-for-byte identical, which the to_jsonb diff enforces
-- and keeps correct as columns are added later. The DELETE guard is
-- untouched: settled rows still can never be removed, only anonymized.
create or replace function public.ai_credit_ledger_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sanctioned exception: the ON DELETE SET NULL write fired by account
  -- erasure (prepare_user_erasure / auth.users delete cascade). Comparing
  -- via to_jsonb minus user_id keeps this robust as columns are added.
  --
  -- `anonymized_at` is subtracted alongside it because this trigger is what
  -- stamps it — it is an output of the sanctioned transition, not part of the
  -- "nothing else changed" evidence. Stamped after the comparison so a row
  -- cannot smuggle a value in, and coalesced so a replay keeps the first
  -- erasure date rather than sliding it forward.
  if new.user_id is null and old.user_id is not null
     and (to_jsonb(new) - 'user_id' - 'anonymized_at')
       = (to_jsonb(old) - 'user_id' - 'anonymized_at') then
    new.anonymized_at := coalesce(old.anonymized_at, now());
    return new;
  end if;

  raise exception 'ai_credit_ledger is append-only — row % cannot be updated', old.id;
end;
$$;

-- 20260804000009 let account deletion through the DELETE guard by exempting
-- rows whose parent auth row is already gone (the ON DELETE CASCADE case).
-- With the FK now SET NULL, erasure no longer deletes ledger rows at all —
-- and that exemption would make every anonymized row (user_id null ⇒ "parent
-- absent") freely deletable afterwards, quietly un-doing the append-only
-- guarantee for exactly the rows we retain as evidence. Restore the strict
-- guard: only pending reservation holds may ever be deleted.
create or replace function public.ai_credit_ledger_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sanctioned exception: releasing a still-pending reservation hold
  -- (reserve_credits/release_credits, the release-stale-credit-holds cron —
  -- both delete only `pending = true` rows). A settled row must never be
  -- removed, only anonymized via the SET NULL erasure path above.
  if old.pending then
    return old;
  end if;
  raise exception 'ai_credit_ledger is append-only — settled row % cannot be deleted', old.id;
end;
$$;

revoke execute on function public.ai_credit_ledger_guard_delete() from public, anon, authenticated;

-- ── 2. purchase_consents: retain, anonymize ─────────────────────────────────
-- Same rationale as the ledger: this table's entire purpose is dispute
-- evidence for a purchase (the stripe_session_id keeps the evidentiary link
-- to Stripe), so erasure anonymizes rather than deletes.
alter table public.purchase_consents alter column user_id drop not null;

alter table public.purchase_consents
  drop constraint purchase_consents_user_id_fkey,
  add constraint purchase_consents_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete set null;

alter table public.purchase_consents add column anonymized_at timestamptz;

alter table public.purchase_consents
  add constraint purchase_consents_attributable_or_anonymized
  check (user_id is not null or anonymized_at is not null);

-- The ledger stamps `anonymized_at` from its existing append-only guard; this
-- table has no UPDATE trigger to extend, so it gets a stamp-only one. It is
-- deliberately not a second append-only guard: making consents immutable is a
-- behaviour change this migration has no mandate for, and the check above is
-- what the erasure path actually needs satisfied.
create or replace function public.purchase_consents_stamp_anonymized()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null and old.user_id is not null then
    new.anonymized_at := coalesce(old.anonymized_at, now());
  end if;
  return new;
end;
$$;

revoke execute on function public.purchase_consents_stamp_anonymized() from public, anon, authenticated;

create trigger purchase_consents_stamp_anonymized
  before update on public.purchase_consents
  for each row execute procedure public.purchase_consents_stamp_anonymized();

-- ── 3a. admin_audit_log ─────────────────────────────────────────────────────
-- Anonymizing the evidence answers "is this row still personal data"; it does
-- not answer "who erased this account". Without that second record an admin can
-- permanently destroy any account and leave no trace — a privileged destructive
-- action with no audit trail — and nothing satisfies the Art. 5(2) duty to
-- *demonstrate* that an erasure request was honoured.
--
-- This is the table #642 specifies, created here rather than invented as an
-- erasure-only register: account deletion is simply the most destructive of the
-- admin actions that ticket enumerates (ban/unban, refunds, credit grants, plan
-- changes), and a second parallel log would have to be merged away later. #642
-- keeps the remaining writers and the admin viewer tab; only the table and the
-- erasure entry land here.
--
-- Deliberate departures from the table conventions in CLAUDE.md, because this is
-- an append-only log rather than user-owned content:
--   * No `updated_at` column or trigger — a row that may never change has no
--     meaningful modification time.
--   * SELECT is admin-only, and there is no INSERT/UPDATE/DELETE policy at all,
--     so PostgREST exposes no way to write or edit the log. The only writers are
--     SECURITY DEFINER functions, which bypass RLS.
--   * `target_user_id` is NOT an FK — for an erasure it names a row that is
--     about to stop existing, which is the whole point. It is the only
--     identifier kept: no email, no name. Every row that referred to it has been
--     nulled, so it is a receipt, not a re-identification route.
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  -- Null once the actor is themselves erased; the log outlives its actors. For a
  -- self-serve deletion the actor *is* the target, so this nulls out and
  -- `details->>'actor_kind' = 'self'` is what records that.
  admin_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  target_user_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index admin_audit_log_target_idx on public.admin_audit_log (target_user_id);
create index admin_audit_log_created_at_idx on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;

create policy "admin_audit_log_select" on public.admin_audit_log
  for select using (private.is_app_admin());

-- Append-only, same shape as the ledger guards in 20260804000005: an audit log
-- an admin can edit is not an audit log.
create or replace function public.admin_audit_log_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sanctioned exception, and the one that is easy to miss: `admin_user_id` is
  -- ON DELETE SET NULL, so erasing the actor's own account issues an UPDATE
  -- here. For a self-serve deletion that lands on the entry written moments
  -- earlier in the same transaction, so refusing it would make self-serve
  -- erasure impossible — the same deadlock between an append-only guard and a
  -- referential action that this migration exists to undo for the ledger.
  --
  -- Nested rather than one `and` chain because NEW is unassigned in a DELETE
  -- trigger and SQL does not promise to short-circuit.
  if tg_op = 'UPDATE' then
    if new.admin_user_id is null and old.admin_user_id is not null
       and (to_jsonb(new) - 'admin_user_id') = (to_jsonb(old) - 'admin_user_id') then
      return new;
    end if;
  end if;

  raise exception 'admin_audit_log is append-only — % on row % is not permitted',
    tg_op, old.id;
end;
$$;

revoke execute on function public.admin_audit_log_guard_write() from public, anon, authenticated;

create trigger admin_audit_log_guard_update
  before update on public.admin_audit_log
  for each row execute procedure public.admin_audit_log_guard_write();

create trigger admin_audit_log_guard_delete
  before delete on public.admin_audit_log
  for each row execute procedure public.admin_audit_log_guard_write();

-- ── 3b. prepare_user_erasure: the rows no FK cascade/set-null can reach ─────
-- rate_limit_events has no FK to auth.users at all (by design — it's a
-- high-volume append-only log, see 20260621000008) so it needs an explicit
-- delete. storage.objects.owner/owner_id reference the uploader but are not
-- enforced FKs to auth.users either; any row still pointing at the deleted
-- user after the storage purge (e.g. this account made an admin upload under
-- the shared srd/ prefix) would otherwise dangle and could block reasoning
-- about the delete, so it's nulled defensively.
--
-- SECURITY DEFINER rule (CLAUDE.md): first act is authorization. This RPC
-- runs with elevated privilege and does destructive, unscoped-by-RLS work,
-- so only service_role (the delete-account edge function, after it has
-- already verified the caller is the account owner or an admin) may invoke
-- it — never a client-supplied identity. The actor arguments are trusted for
-- the same reason and only that reason: service_role is the edge function,
-- which derives them from the verified JWT, never from the request body.
create or replace function public.prepare_user_erasure(
  p_user_id uuid,
  p_actor_id uuid,
  p_actor_kind text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ledger_rows integer;
  v_consent_rows integer;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'prepare_user_erasure can only be called by service_role';
  end if;

  if p_actor_kind not in ('self', 'admin') then
    raise exception 'prepare_user_erasure: actor_kind must be self or admin, got %', p_actor_kind;
  end if;

  if p_actor_kind = 'self' and p_actor_id is distinct from p_user_id then
    raise exception 'prepare_user_erasure: a self erasure must be performed by its own account';
  end if;

  -- Counted before the auth delete, which is what actually nulls them.
  select count(*) into v_ledger_rows
  from public.ai_credit_ledger where user_id = p_user_id;

  select count(*) into v_consent_rows
  from public.purchase_consents where user_id = p_user_id;

  -- Written before the destructive work, not after: if anything below fails the
  -- transaction unwinds and no log row survives, whereas logging afterwards
  -- would lose the record of a partial erasure.
  insert into public.admin_audit_log (admin_user_id, action, target_user_id, details)
  values (
    p_actor_id,
    'account_erasure',
    p_user_id,
    jsonb_build_object(
      'actor_kind', p_actor_kind,
      'ledger_rows_anonymized', v_ledger_rows,
      'consent_rows_anonymized', v_consent_rows
    )
  );

  delete from public.rate_limit_events where user_id = p_user_id;

  update storage.objects
  set owner = null, owner_id = null
  where owner = p_user_id or owner_id = p_user_id::text;
end;
$$;

revoke execute on function public.prepare_user_erasure(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.prepare_user_erasure(uuid, uuid, text) to service_role;

-- ── 4. Defensive check: no FK to auth.users left that would block a delete ──
-- Fails the push (rather than failing silently at the next real account
-- deletion) if a future migration adds a FK to auth.users without CASCADE or
-- SET NULL. Scoped to public — Supabase-managed schemas (auth, storage) are
-- not ours to police here, version-drift in them must not brick a deploy, and
-- the one that matters (storage.objects.owner) is already handled by
-- prepare_user_erasure nulling it before the delete.
do $$
declare bad text;
begin
  select string_agg(conrelid::regclass::text || '.' || conname, ', ') into bad
  from pg_constraint
  where contype = 'f' and confrelid = 'auth.users'::regclass
    and confdeltype not in ('c', 'n')
    and conrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace);

  if bad is not null then
    raise exception 'FKs to auth.users would block account deletion: %', bad;
  end if;
end $$;
