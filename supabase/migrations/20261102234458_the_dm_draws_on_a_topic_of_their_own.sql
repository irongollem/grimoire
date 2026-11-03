-- The DM draws on a topic of their own (#1133 review).
--
-- Realtime decides who may send on a topic when a client joins it, never per message, so the content of a message
-- cannot be held to its sender's role. On `table:<campaign id>` any member may send, which let a player clear the
-- DM's pinned drawings (`draw-clear all`) or post marks with the DM's name. So the table now has two topics:
--
--   table:<campaign id>     any member sends: pings, the one mark a player makes. Every member hears it.
--   table-dm:<campaign id>  only the campaign's DM sends: measure lines, drawings and clearing them. Every member
--                           hears it, and clients take a measure, a drawing or a clear from this topic only.
--
-- Both predicates stay total (true or false, never NULL).

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
      when p_topic ~ '^table-dm:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then private.is_campaign_member(substring(p_topic from 10)::uuid)
    end,
    false);
$$;

create or replace function private.can_send_realtime_topic(p_topic text)
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
      when p_topic ~ '^table-dm:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then private.is_campaign_dm(substring(p_topic from 10)::uuid)
    end,
    false);
$$;
