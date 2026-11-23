-- Ask Grimoire (#1253): a turn that ends at a generator is free only when the DM runs that generator
-- (maintainer, 23 Nov 2026: "we're offering a tool to work with your campaign, not to ideate").
--
-- Before this, a routed turn was never charged and never counted, so asking Ask to "answer by proposing something"
-- gave unlimited free answers once the five free ones were spent. Now a routed turn is written here as pending, with
-- the exact credits its tokens came to. When the DM's next Ask turn begins, `settle_ask_routes` looks at each one:
--
--   - run: the account was charged for a generation after the proposal (a spend in `ai_credit_ledger`, or an
--     own-key row, never a free line and never one of Ask's own). The route is confirmed and costs nothing more:
--     its routing is inside that generator's price. One generation confirms one route.
--   - not run: it is settled like any other answer, by its tokens (`charge_ask_answer`: a free answer if one is
--     left today, else the exact credits on the meter, whole credits charged and the fraction carried). So six
--     unconfirmed proposals that came to 1.6 credits cost one credit, not six.
--
-- A route not yet confirmed is left open for ten minutes rather than metered. A generation is written to the ledger
-- only when it finishes, and the DM may keep talking to Ask while it runs (a portrait takes a minute), so a turn sent
-- meanwhile must not meter the route of a generator that is still painting. This defers nothing a DM can exploit:
-- routes were only ever settled at the DM's next turn, and a route older than the window is settled at the next one.
--
-- The check is the server's, against the ledger, at settlement: nothing a browser sends can mark a route confirmed,
-- and a generator the DM ran from its own screen (the Quest Designer, a map style) confirms it as well.
--
-- What a metered route owes is charged here, in the same transaction that removes it. The first version returned the
-- credits for the turn to spend later, under its credit hold, but the routes were already gone by then: an account
-- whose hold was refused (it could not cover what it owed plus the answer) had its debt deleted and paid nothing, so
-- repeating that made every unrun proposal free. The charge may take the balance below zero, as every generation's
-- settlement may (`spend_credits` with `p_allow_negative`): the tokens were spent, so the debt is real.
--
-- A confirmed route is kept only while it can still matter. It exists so one generation confirms one route, and a
-- route can only be confirmed by a charge made at or after it, so once no open route is older than the charge that
-- confirmed it, nothing can match that charge again and the row is deleted.

create table public.ask_pending_routes (
  proposal_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references public.agent_sessions (id) on delete cascade,
  credits numeric(14, 6) not null check (credits >= 0),
  confirmed_at timestamptz,
  -- The ledger row that confirmed it; unique, so one generation confirms one route.
  confirmed_by uuid unique references public.ai_credit_ledger (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Full indexes, not one limited to open routes: a key lookup (an account or a session deleted) cannot use a partial
-- one, and settlement's read of a caller's routes by age is served as well by the full (user_id, created_at).
create index ask_pending_routes_user_created_idx on public.ask_pending_routes (user_id, created_at);
create index ask_pending_routes_session_idx on public.ask_pending_routes (session_id);

create trigger ask_pending_routes_updated_at
  before update on public.ask_pending_routes
  for each row execute procedure update_updated_at();

alter table public.ask_pending_routes enable row level security;

-- The owner may read their own; only the server writes.
create policy "ask_pending_routes_select" on public.ask_pending_routes
  for select using ((select auth.uid()) = user_id);

grant select on public.ask_pending_routes to authenticated;
grant select, insert, update, delete on public.ask_pending_routes to service_role;

-- Settles the account's open routes, oldest first, and charges what they owe (reason `ask_answer`). Returns the whole
-- credits it charged and the free answers left today afterwards.
create or replace function public.settle_ask_routes(p_user_id uuid, p_free_per_day integer)
returns table (credits integer, free_left integer)
language plpgsql
set search_path = ''
as $$
declare
  v_route public.ask_pending_routes%rowtype;
  v_ledger uuid;
  v_charge record;
  v_owed integer := 0;
  v_today date := (now() at time zone 'utc')::date;
  v_usage public.ask_usage%rowtype;
begin
  if p_user_id is null then
    raise exception 'settle_ask_routes: no account' using errcode = '22023';
  end if;

  for v_route in
    select * from public.ask_pending_routes r
    where r.user_id = p_user_id and r.confirmed_at is null
    order by r.created_at
    for update skip locked
  loop
    select l.id into v_ledger
    from public.ai_credit_ledger l
    where l.user_id = p_user_id
      and l.created_at >= v_route.created_at
      and l.reason not like 'ask\_%'
      and (l.delta < 0 or l.is_byok is true)
      and coalesce(l.pending, false) = false
      and not exists (select 1 from public.ask_pending_routes c where c.confirmed_by = l.id)
    order by l.created_at
    limit 1;

    if v_ledger is not null then
      update public.ask_pending_routes r set confirmed_at = now(), confirmed_by = v_ledger where r.proposal_id = v_route.proposal_id;
    elsif v_route.created_at > now() - interval '10 minutes' then
      -- Its generator may still be running: settle it at a later turn.
      continue;
    else
      select * into v_charge from public.charge_ask_answer(p_user_id, v_route.credits, p_free_per_day);
      v_owed := v_owed + v_charge.credits;
      delete from public.ask_pending_routes r where r.proposal_id = v_route.proposal_id;
    end if;
  end loop;

  if v_owed > 0 then
    perform public.spend_credits(p_user_id, 'ask_answer', v_owed, '{}'::jsonb, true);
  end if;

  delete from public.ask_pending_routes r
  using public.ai_credit_ledger l
  where r.user_id = p_user_id
    and r.confirmed_by = l.id
    and l.created_at < coalesce(
      (select min(o.created_at) from public.ask_pending_routes o where o.user_id = p_user_id and o.confirmed_at is null),
      'infinity'::timestamptz);

  select * into v_usage from public.ask_usage u where u.user_id = p_user_id;
  return query select v_owed,
    case when v_usage.user_id is null or v_usage.day <> v_today then p_free_per_day
         else greatest(0, p_free_per_day - v_usage.free_used) end;
end;
$$;

revoke execute on function public.settle_ask_routes(uuid, integer) from public, anon, authenticated;
grant execute on function public.settle_ask_routes(uuid, integer) to service_role;
