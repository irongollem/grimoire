-- Whether a conversation at the AI table opened the play session it belongs to (#1021).
--
-- Sitting down opens the campaign's play session, or joins the one already running. Leaving the table should end
-- the session only in the first case: a DM who was already running an evening and tried the table in the middle
-- of it must not have that evening closed under them. Nothing on the row said which of the two had happened.
--
-- Written only by the server, like the rest of the row.

alter table public.agent_sessions
  add column opened_play_session boolean not null default false;

comment on column public.agent_sessions.opened_play_session is
  'True when this conversation started its play session; false when it joined one that was already open.';

-- When the player got up from the table. Null while the sitting is still going.
alter table public.agent_sessions
  add column left_at timestamptz;

comment on column public.agent_sessions.left_at is
  'When the player left the table. A conversation that was left takes no further turns.';
