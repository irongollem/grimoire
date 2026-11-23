-- Ask Grimoire (#1253 follow-up): questions about the app the manual could not answer, for the maintainer to write
-- pages for (maintainer, 23 Nov 2026: "Any such question it cannot log goes onto a ledger for ADMIN (anonymized) so we
-- can expand our docs every once in a while").
--
-- ANONYMISED BY CONSTRUCTION: the table has no user, campaign or session column, so nothing in it can say who asked
-- or where. `question` is the model's neutral rewording of the DM's question, with names and campaign details left
-- out (the `log_manual_gap` tool asks for that); `question_key` folds the same question asked again into one row whose
-- `asked_count` rises, so the admin reads the gaps by how often they come up.
--
-- Written only by the server (`ask-turn`, service role, through `record_manual_gap`); read and closed only by the
-- admin. No campaign reaches it, so it does not ring the campaign doorbell.

create table public.manual_gaps (
  id uuid primary key default gen_random_uuid(),
  question text not null check (length(question) between 1 and 500),
  -- Lower-cased, whitespace folded, trailing punctuation dropped: the same question asked again lands on one row.
  question_key text not null unique,
  asked_count integer not null default 1 check (asked_count >= 1),
  -- The manual pages Ask read before it gave up, by page id, so the admin sees what came close.
  pages_checked text[] not null default '{}',
  first_asked_at timestamptz not null default now(),
  last_asked_at timestamptz not null default now(),
  -- Set when the admin has written the page; asked again afterwards, the row counts on and stays covered.
  covered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index manual_gaps_open_idx on public.manual_gaps (asked_count desc) where covered_at is null;

create trigger manual_gaps_updated_at
  before update on public.manual_gaps
  for each row execute procedure update_updated_at();

alter table public.manual_gaps enable row level security;

-- Admin only. No insert policy: rows are written by the server alone.
create policy "manual_gaps_select" on public.manual_gaps for select using ((select private.is_app_admin()));
create policy "manual_gaps_update" on public.manual_gaps for update using ((select private.is_app_admin()));
create policy "manual_gaps_delete" on public.manual_gaps for delete using ((select private.is_app_admin()));

grant select, update, delete on public.manual_gaps to authenticated;
grant select, insert, update, delete on public.manual_gaps to service_role;

-- Records one gap, or counts it again. Invoker rights and the service role only: a signed-in account cannot write
-- the ledger, so it cannot be filled with noise from the browser.
create or replace function public.record_manual_gap(p_question text, p_pages text[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_question text := left(btrim(regexp_replace(coalesce(p_question, ''), '\s+', ' ', 'g')), 500);
  v_key text;
begin
  if v_question = '' then
    raise exception 'record_manual_gap: no question' using errcode = '22023';
  end if;
  v_key := regexp_replace(lower(v_question), '[[:space:][:punct:]]+$', '');
  insert into public.manual_gaps (question, question_key, pages_checked)
  values (v_question, v_key, coalesce(p_pages[1:10], '{}'))
  on conflict (question_key) do update
    set asked_count = public.manual_gaps.asked_count + 1,
        last_asked_at = now(),
        pages_checked = (
          select coalesce(array_agg(distinct page), '{}')
          from unnest(public.manual_gaps.pages_checked || excluded.pages_checked) as page
        );
end;
$$;

revoke execute on function public.record_manual_gap(text, text[]) from public, anon, authenticated;
grant execute on function public.record_manual_gap(text, text[]) to service_role;

-- The ledger reasons, so the admin's cost breakdown lists them (as 20261123073501 did for Ask's others).
insert into public.ai_generation_credit_costs (generation_type, label, credit_cost, sort_order)
values ('ask_report', 'Ask Grimoire report draft (free)', 0, 57)
on conflict (generation_type) do nothing;
