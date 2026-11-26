-- Credits the admin gives an account, told to its owner (#1281 follow-up).
--
-- An admin grant used to land silently in the ledger: the maintainer thanked a
-- user for a bug report with credits the user had no way of noticing. Every
-- positive admin grant now leaves a gift here, with an optional message, and the
-- app shows unseen gifts in a small dialog until the owner presses Thanks.
--
-- Kept out of ai_credit_ledger on purpose: the ledger is the billing record and
-- no client may update it, while a gift needs one owner-writable column
-- (seen_at). The ledger's own `note` column belongs to refunds.
--
-- A negative grant (taking credits back) leaves no gift: it is a correction, not
-- something to celebrate, and the ledger and the audit log already record it.

create table public.credit_gifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ledger_id uuid not null unique references public.ai_credit_ledger (id) on delete cascade,
  credits numeric(10, 2) not null check (credits > 0),
  message text check (message is null or length(message) between 1 and 500),
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index credit_gifts_unseen_idx on public.credit_gifts (user_id) where seen_at is null;

create trigger credit_gifts_updated_at
  before update on public.credit_gifts
  for each row execute procedure update_updated_at();

alter table public.credit_gifts enable row level security;

-- Only the server writes a gift (admin_grant_credits, a definer) and only the
-- erasure cascade removes one, so there is no insert or delete policy and no
-- grant for either: an owner can read their gifts and mark them seen, nothing more.
create policy "credit_gifts_select" on public.credit_gifts
  for select using ((select auth.uid()) = user_id);
create policy "credit_gifts_update" on public.credit_gifts
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select on public.credit_gifts to authenticated, service_role;
grant update (seen_at) on public.credit_gifts to authenticated;
grant insert, update, delete on public.credit_gifts to service_role;

-- The grant takes an optional message for its owner. The old three-argument
-- form is dropped so only one signature exists.
drop function public.admin_grant_credits(uuid, numeric, text);

create function public.admin_grant_credits(
  p_user_id uuid,
  p_delta numeric,
  p_reason text default 'admin_grant',
  p_message text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_reason text := coalesce(nullif(trim(p_reason), ''), 'admin_grant');
  v_message text := nullif(trim(p_message), '');
  v_ledger_id uuid;
begin
  if not private.is_app_admin() then
    raise exception 'Not authorized';
  end if;

  -- A zero-credit grant writes a ledger row that changes no balance and an audit
  -- entry for an action with no effect. Negative deltas stay allowed: taking
  -- credits back by hand is a real admin action, and this is exactly the kind of
  -- one that most needs the record.
  if p_delta = 0 then
    raise exception 'admin_grant_credits: delta must be non-zero';
  end if;

  if v_message is not null and p_delta < 0 then
    raise exception 'admin_grant_credits: a message goes with a gift, not with taking credits back';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'No such user %', p_user_id;
  end if;

  insert into public.ai_credit_ledger (user_id, delta, reason, is_byok)
  values (p_user_id, p_delta, v_reason, false)
  returning id into v_ledger_id;

  if p_delta > 0 then
    insert into public.credit_gifts (user_id, ledger_id, credits, message)
    values (p_user_id, v_ledger_id, p_delta, v_message);
  end if;

  insert into public.admin_audit_log (admin_user_id, action, target_user_id, details)
  values (
    auth.uid(),
    'credit_grant',
    p_user_id,
    jsonb_build_object('delta', p_delta, 'reason', v_reason, 'message', v_message)
  );
end;
$function$;

revoke execute on function public.admin_grant_credits(uuid, numeric, text, text) from public, anon;
grant execute on function public.admin_grant_credits(uuid, numeric, text, text) to authenticated, service_role;
