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
  if new.user_id is null and old.user_id is not null
     and (to_jsonb(new) - 'user_id') = (to_jsonb(old) - 'user_id') then
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

-- ── 3. prepare_user_erasure: the rows no FK cascade/set-null can reach ──────
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
-- it — never a client-supplied identity.
create or replace function public.prepare_user_erasure(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'prepare_user_erasure can only be called by service_role';
  end if;

  delete from public.rate_limit_events where user_id = p_user_id;

  update storage.objects
  set owner = null, owner_id = null
  where owner = p_user_id or owner_id = p_user_id::text;
end;
$$;

revoke execute on function public.prepare_user_erasure(uuid) from public, anon, authenticated;
grant  execute on function public.prepare_user_erasure(uuid) to service_role;

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
