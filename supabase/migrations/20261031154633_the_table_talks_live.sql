-- The table talks live: pings, measure lines and drawings on the battle map (#1125 decision 12).
--
-- A ping, a ruler held across the map and a stroke drawn on it are moments, not records: each lasts a few seconds or
-- a turn, everyone at the table sees it, and nothing keeps it. So they travel as Realtime Broadcast messages sent by
-- a client on a private topic of their own, `table:<campaign id>`, and are never written to a table.
--
-- The doorbell (`doorbell:<campaign id>`, 20261009233206) stays receive-only: only the database rings it, so no
-- client can make every tab of a campaign refetch. The table topic is the one a member may also send on. Who may:
-- a member of that campaign, DM or player (the DM has a campaign_members row too). Nobody else may hear or send.
--
-- Both predicates are total (true or false, never NULL), as CLAUDE.md requires of an authorization predicate.

create or replace function private.can_hear_realtime_topic(p_topic text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    case
      when p_topic ~ '^doorbell:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then private.is_campaign_member(substring(p_topic from 10)::uuid)
      when p_topic ~ '^table:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then private.is_campaign_member(substring(p_topic from 7)::uuid)
    end,
    false);
$$;

-- Sending: the table topic only. A doorbell topic, any other prefix and a malformed id are false.
create function private.can_send_realtime_topic(p_topic text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    case
      when p_topic ~ '^table:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then private.is_campaign_member(substring(p_topic from 7)::uuid)
    end,
    false);
$$;
revoke execute on function private.can_send_realtime_topic(text) from public, anon;
grant execute on function private.can_send_realtime_topic(text) to authenticated, service_role;

-- Realtime checks this policy when a client broadcasts on a private channel. As with the select policy, the row's
-- topic must be the joined one, so a session cannot send to a topic other than the one it was authorized to join.
create policy "realtime_messages_insert" on realtime.messages
  for insert to authenticated
  with check (
    extension = 'broadcast'
    and topic = (select realtime.topic())
    and private.can_send_realtime_topic((select realtime.topic()))
  );
