-- What happened on the board of a fight at the AI table, kept with its conversation (#1021).
--
-- A fight at the table is fought by the rules, and what the board writes into the story (a creature's attack and
-- its roll, "Round 2 · your turn", how the fight ended) is never sent to the model, so `agent_turns` does not hold
-- it. For a day those lines were kept in the browser, which lost them on another device and could never serve a
-- table with more than one player (the maintainer, 18 Nov 2026). They are kept here instead, beside the turns.
--
-- Each line says how many turns of the conversation had been kept when it was written (`after_turns`): that is its
-- place in the story when the sitting is read back (`storyFromTurns`).
--
-- Written by the conversation's owner, from the page that runs the fight: the lines are composed there from what
-- the fight's commands answered. So the owner may insert, into their own conversation only, a line of a known
-- shape and a bounded size, and may never change or remove one (a deleted conversation takes its lines). When
-- more than one player sits at a table the reader widens; the writer does not.
--
-- No `updated_at`: like `agent_turns`, a row is written once and never updated.

create table public.agent_board_lines (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.agent_sessions (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The order the lines were written in.
  seq bigint generated always as identity,
  -- How many turns of the conversation had been kept when the line was written.
  after_turns integer not null check (after_turns >= 0),
  -- A margin line ({kind, text, tone?}) or a roll ({kind, die, label, detail, critical}), as the page draws it.
  line jsonb not null check (
    jsonb_typeof(line) = 'object'
    and line ->> 'kind' in ('margin', 'roll')
    and octet_length(line::text) <= 1200
  ),
  -- Whether the board (the rules) wrote it, not the player's own hand.
  by_server boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.agent_board_lines is
  'What the board of a fight wrote into the story of a conversation at the AI table: never sent to the model, read back with the turns.';

create index agent_board_lines_session_seq_idx on public.agent_board_lines (session_id, seq);
create index agent_board_lines_user_id_idx on public.agent_board_lines (user_id);

alter table public.agent_board_lines enable row level security;

create policy "agent_board_lines_select" on public.agent_board_lines
  for select using ((select auth.uid()) = user_id);

-- Into the caller's own conversation only: the row names its owner, and the conversation must be theirs too.
create policy "agent_board_lines_insert" on public.agent_board_lines
  for insert with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.agent_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  );

grant select, insert on public.agent_board_lines to authenticated;
grant select, insert, update, delete on public.agent_board_lines to service_role;

-- A fight is tens of lines; a conversation of many fights is hundreds. The ceiling keeps a page that loops, or a
-- client that means harm, from filling the table through its own conversation.
create or replace function public.agent_board_lines_within_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.agent_board_lines l where l.session_id = new.session_id) >= 5000 then
    raise exception using
      errcode = '54000',
      message = 'agent_board_lines: this conversation holds as many board lines as it may';
  end if;
  return new;
end;
$$;

revoke execute on function public.agent_board_lines_within_limit() from public, anon, authenticated;

create trigger agent_board_lines_within_limit
  before insert on public.agent_board_lines
  for each row execute procedure public.agent_board_lines_within_limit();
