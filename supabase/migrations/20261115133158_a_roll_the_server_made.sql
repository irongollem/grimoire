-- #1204: a roll in the campaign log that nobody could have typed.
--
-- A roll reaches campaign_messages as a row its author writes, and nothing checks the numbers in its metadata: any
-- member can post any total. That is fine for dice rolled on the table and typed in, and it is how the app has always
-- worked. It is not enough for a table the AI runs (#1021), where "the model never rolls" has to be something the log
-- can show, nor for a fight the server advances (#1201).
--
-- `server_rolled` says the dice were rolled by Grimoire's own server code and written with the service role. A client
-- cannot set it: the trigger below clears it on any insert by a signed-in or anonymous caller, the same way
-- private.stamp_need_or_greed keeps a client from writing a loot roll. There is no update policy on this table, so a
-- stamped row cannot be edited by its author afterwards either; the pgTAP file pins both.
--
-- A real column, not a key in metadata: metadata is the roll's own content and is copied about freely (the demo copy,
-- backups), while this is a statement about who wrote the row.

alter table public.campaign_messages
  add column server_rolled boolean not null default false;

comment on column public.campaign_messages.server_rolled is
  'True only when Grimoire''s server rolled the dice in this message (service role). A client insert is always false.';

create function private.guard_server_rolled()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.server_rolled := false;
  end if;
  -- Only a roll can be a server roll; anything else carrying the mark is a mistake in server code.
  if new.server_rolled and new.type not in ('roll', 'dm_roll') then
    raise exception 'server_rolled is only for roll messages' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_server_rolled() from public, anon, authenticated;

create trigger guard_server_rolled
  before insert on public.campaign_messages
  for each row execute function private.guard_server_rolled();
