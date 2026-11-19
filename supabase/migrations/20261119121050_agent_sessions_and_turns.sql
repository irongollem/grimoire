-- A conversation the server holds with a model (#1205): the session and its messages.
--
-- Every AI call until now was one request in and one answer out, and nothing was kept. A table the AI runs is a
-- conversation of hundreds of messages with tool calls in the middle, so it has to be stored: to continue it on the
-- next message, to show it again after a reload, to summarise the old part instead of resending it, and to know what
-- it has cost.
--
--   agent_sessions  one conversation: whose it is, in which campaign, on which model, its rolling summary and what
--                   it has used so far.
--   agent_turns     one message of it, in order: the blocks as the runtime holds them (`_shared/agent/types.ts`:
--                   text, tool calls, tool results) and, on a message the model wrote, the tokens that call used.
--
-- WHO WRITES. Only the server. A turn is written by the edge function that ran it, with the service role, after the
-- model and the tools have answered; a client that could insert a message could put words in the model's mouth or
-- a tool result that never happened into a conversation the next request trusts. So there is no insert or update
-- policy and no insert or update grant for `authenticated`: that is deliberate, not a missing pair of the usual four.
--
-- WHO READS. The account the conversation belongs to, and nobody else: not other members of the campaign and not
-- its DM. What a player types to the model is theirs. The owner may delete a session, which takes its messages.
--
-- PERSONAL DATA. Both tables carry `user_id` with a cascading reference to `auth.users`, so erasing an account
-- erases its conversations, and `export_user_data` (which walks every such reference) includes both without being
-- told. `agent_turns.user_id` repeats the session's owner for exactly that reason: the export does not follow the
-- session to find its messages. Kept until the owner deletes the session, the campaign or the account
-- (context/compliance/retention.md).

create table public.agent_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  -- What the conversation is for. One kind today; a check and not an enum so the next kind is one line.
  kind text not null check (kind in ('solo_table')),
  title text,
  provider text not null,
  model text not null,
  -- The old part of the conversation, in the model's own words, so a long game does not resend itself. Messages up
  -- to and including `summary_through_seq` are covered by it and are no longer sent.
  summary text,
  summary_through_seq integer not null default 0 check (summary_through_seq >= 0),
  -- Running totals, raised by the server with each turn; the per-call figures are on the turns.
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  cache_read_tokens bigint not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens bigint not null default 0 check (cache_write_tokens >= 0),
  credits_spent numeric(10, 2) not null default 0 check (credits_spent >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index agent_sessions_user_id_idx on public.agent_sessions (user_id, updated_at desc);
create index agent_sessions_campaign_id_idx on public.agent_sessions (campaign_id);

create trigger agent_sessions_updated_at
  before update on public.agent_sessions
  for each row execute procedure update_updated_at();

alter table public.agent_sessions enable row level security;

-- A conversation is its account's, and only while that account is still in the campaign: what the narrator was
-- given (hidden facts, the Dungeon Master's notes) must not stay readable by someone who has left or been removed.
create policy "agent_sessions_select" on public.agent_sessions
  for select using (
    (select auth.uid()) = user_id
    and (private.is_campaign_member(campaign_id) or private.is_campaign_dm(campaign_id))
  );
create policy "agent_sessions_delete" on public.agent_sessions
  for delete using ((select auth.uid()) = user_id);

grant select, delete on public.agent_sessions to authenticated;
grant select, insert, update, delete on public.agent_sessions to service_role;

create table public.agent_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.agent_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The message's place in the conversation, from 1, with no gaps the server did not intend.
  seq integer not null check (seq > 0),
  role text not null check (role in ('user', 'assistant')),
  -- The message as the runtime holds it: an array of blocks.
  blocks jsonb not null check (jsonb_typeof(blocks) = 'array'),
  -- What the model call that produced this message used. Null on a message the model did not write.
  provider text,
  model text,
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  cache_read_tokens integer check (cache_read_tokens >= 0),
  cache_write_tokens integer check (cache_write_tokens >= 0),
  created_at timestamptz not null default now(),
  unique (session_id, seq)
);

-- `unique (session_id, seq)` is the index the reads use (a session's messages in order) and covers the foreign key.
create index agent_turns_user_id_idx on public.agent_turns (user_id);

alter table public.agent_turns enable row level security;

-- Read through the conversation it belongs to, so the same rule holds: gone from the campaign, gone from view.
create policy "agent_turns_select" on public.agent_turns
  for select using (
    (select auth.uid()) = user_id
    and exists (select 1 from public.agent_sessions s where s.id = agent_turns.session_id)
  );

grant select on public.agent_turns to authenticated;
grant select, insert, update, delete on public.agent_turns to service_role;

-- The demo campaign copy starts with no conversations (a session has `campaign_id`, so it must say so; its turns
-- hang off a table that is not copied and need no entry).
insert into private.demo_campaign_tables (table_name, tier, copy, reason)
values ('agent_sessions', 1, false, 'a conversation with the model: the copy starts with none');
