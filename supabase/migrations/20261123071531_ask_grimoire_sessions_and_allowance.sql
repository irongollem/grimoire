-- Ask Grimoire (#1253): a DM's assistant beside search, on the agent runtime the AI table runs on (#1205).
--
-- 1. A conversation with Ask is an `agent_sessions` row of kind 'ask'. Same storage, same rules: only the server
--    writes it, only its owner reads it (`20261119121050`).
-- 2. `ask_usage`: the allowance and the meter for plain questions (maintainer, 23 Nov 2026). The first five
--    answers a day are free, per account. After that an answer is charged from the tokens it used, in whole
--    credits rounded down; the part of a credit left over is kept here (`carry`) and added to the next answer, so a
--    run of small answers is not free for ever. A request that ends at a generator never counts: its routing is
--    inside the generator's own price.
--    The day is the UTC date. Per account, not per campaign: the allowance is the person's.
-- 3. `charge_ask_answer`: the one place that decides free or charged, under the row lock, so two answers finishing
--    together cannot both take the last free slot or both claim the same whole credit (the reason
--    `append_agent_turns` decides its whole credits in SQL too).

alter table public.agent_sessions drop constraint agent_sessions_kind_check;
alter table public.agent_sessions add constraint agent_sessions_kind_check check (kind in ('solo_table', 'ask'));

create table public.ask_usage (
  user_id uuid primary key references auth.users (id) on delete cascade,
  day date not null default ((now() at time zone 'utc')::date),
  free_used integer not null default 0 check (free_used >= 0),
  carry numeric(10, 4) not null default 0 check (carry >= 0 and carry < 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ask_usage is
  'Ask Grimoire''s daily free answers and the fraction of a credit carried between charged answers. Written only by charge_ask_answer.';

create trigger ask_usage_updated_at
  before update on public.ask_usage
  for each row execute procedure update_updated_at();

alter table public.ask_usage enable row level security;

-- The owner reads their own row so the panel can say how many free answers are left today. Nobody writes it but
-- the server: an own-row write would let an account hand itself more free answers.
create policy "ask_usage_select" on public.ask_usage
  for select using ((select auth.uid()) = user_id);

grant select on public.ask_usage to authenticated;
grant select, insert, update, delete on public.ask_usage to service_role;

-- Settles one answer. `p_credits` is what the answer's tokens came to (`metering.ts`), exact.
-- Returns whether it was free, the whole credits to spend now, and the free answers left today.
create or replace function public.charge_ask_answer(
  p_user_id uuid,
  p_credits numeric,
  p_free_per_day integer
)
returns table (free boolean, credits integer, free_left integer)
language plpgsql
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_row public.ask_usage%rowtype;
  v_carry numeric;
  v_whole integer;
begin
  if p_user_id is null then
    raise exception 'charge_ask_answer: no account' using errcode = '22023';
  end if;
  if p_credits is null or p_credits < 0 then
    raise exception 'charge_ask_answer: credits must not be negative' using errcode = '22023';
  end if;
  if p_free_per_day is null or p_free_per_day < 0 then
    raise exception 'charge_ask_answer: the allowance must not be negative' using errcode = '22023';
  end if;

  insert into public.ask_usage (user_id, day) values (p_user_id, v_today) on conflict (user_id) do nothing;
  select * into v_row from public.ask_usage u where u.user_id = p_user_id for update;

  -- A new day gives the allowance back; the carried fraction stays, it is money already measured.
  if v_row.day <> v_today then
    v_row.day := v_today;
    v_row.free_used := 0;
  end if;

  if v_row.free_used < p_free_per_day then
    update public.ask_usage u set day = v_row.day, free_used = v_row.free_used + 1 where u.user_id = p_user_id;
    return query select true, 0, p_free_per_day - (v_row.free_used + 1);
    return;
  end if;

  v_carry := v_row.carry + p_credits;
  v_whole := floor(v_carry)::integer;
  update public.ask_usage u set day = v_row.day, carry = v_carry - v_whole where u.user_id = p_user_id;
  return query select false, v_whole, 0;
end;
$$;

revoke execute on function public.charge_ask_answer(uuid, numeric, integer) from public, anon, authenticated;
grant execute on function public.charge_ask_answer(uuid, numeric, integer) to service_role;
