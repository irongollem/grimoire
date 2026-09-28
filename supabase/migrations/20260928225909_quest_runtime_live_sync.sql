-- Migration: quest_runtime_live_sync
-- Put the quest runtime and the players' session banner on the campaign_sync
-- doorbell (20260904230420), so neither has to poll.
--
-- ── Why ──────────────────────────────────────────────────────────────────────
--
-- The quest runtime (#755, #850) never reached `useCampaignLiveSync`. Its four
-- queries (a thread's cursor, the run context, the live chains, the thread
-- list) each refetched every 5 seconds instead, so a DM with the app open sent
-- a runtime request about once a second whether anything was running or not:
-- about 12 `get_campaign_live_quests` calls a minute per tab in production,
-- before counting the other three.
--
-- ── Why the doorbell and not the tables themselves ───────────────────────────
--
-- Publishing the runtime tables would have been the ordinary route, and it is
-- closed on purpose: 20260810000012 took the raw quest topology and its history
-- out of `supabase_realtime` so that no DM-only quest row ever travels as a
-- realtime payload, whatever RLS on the subscription does, and
-- player_quest_beats_security.test.sql holds it there. The doorbell honours
-- that. It carries a campaign id and a table name and never a row, so what
-- reaches a subscriber is "the runtime changed", after which the DM's client
-- re-reads through the same gated RPCs it always used. A player's client hears
-- the bell too and has no runtime query to refresh; what it learns is that the
-- DM's quest runtime moved, at the moment it moved, which is what the table
-- sees happen anyway.
--
-- The three tables are the runtime's writes: a transition moves a cursor
-- (quest_runtime_state), logs itself (quest_beat_transitions) and sometimes
-- opens or closes a thread (quest_threads). The client maps all three to every
-- runtime cache, so it does not matter which of them rang.
--
-- `campaign_session_state` is the other poll this removes, for the same shape
-- of reason. The DM already receives its row events; players may not read the
-- row (they read the `get_player_session_state` projection), so a subscription
-- delivered nothing to them and `usePlayerSessionState` polled every 60s. They
-- are entitled to the fact the bell reveals, since the projection tells them
-- whether a session is running.
--
-- One transition table per trigger, since Postgres allows one event per trigger
-- that uses them, hence three triggers per table. A table that rings on write
-- rings on delete too, whether or not it is ever deleted alone; the signal
-- function already skips a delete cascading from the campaign itself.

do $$
declare
  t text;
  ev text;
begin
  foreach t in array array[
    'quest_runtime_state', 'quest_threads', 'quest_beat_transitions', 'campaign_session_state'
  ]
  loop
    foreach ev in array array['insert', 'update', 'delete']
    loop
      execute format('drop trigger if exists %I on public.%I', t || '_signal_' || ev, t);
      execute format(
        'create trigger %I after %s on public.%I '
        'referencing %s table as changed '
        'for each statement execute procedure public.signal_campaign_change()',
        t || '_signal_' || ev, ev, t, case ev when 'delete' then 'old' else 'new' end);
    end loop;
  end loop;
end;
$$;
