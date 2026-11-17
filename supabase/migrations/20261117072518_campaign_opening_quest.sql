-- Where a campaign's story begins (#1021). "We do have to be able to define somehow where a whole campaign starts.
-- I'm assuming with some form of prologue quest" (maintainer, 17 Nov 2026).
--
-- A campaign names the quest its story opens with. The AI table's first sitting then begins at that quest's entry
-- beat: at the place the beat is staged, with the quest put in play, and the beat's read-aloud as the opening
-- scene. Later sittings pick the story up where it was left; this is read once, at the very start.
--
-- A plain uuid, not a foreign key, on purpose. The demo copy (`private.copy_demo_template`) inserts the campaign
-- row before any quest exists and remaps every id inside it as text (`remap_demo_ids`), so the copy's opening quest
-- comes out pointing at the copy's own quest with no change to that function; a foreign key would need the column
-- set aside and restored there, as `current_location_id` is. What a key would have guaranteed is held another way:
--   - an UPDATE that names a quest is refused unless that quest is this campaign's (the trigger below; the copy
--     writes the row by INSERT, before its quests exist, which is why an insert is not checked);
--   - a quest that was deleted leaves a dangling id, which every reader treats as "no opening quest": the table
--     looks the quest up inside the campaign and begins nowhere in particular when it is not there.
-- Only the campaign's owner chooses it, like the other owner columns.

alter table public.campaigns add column opening_quest_id uuid;

comment on column public.campaigns.opening_quest_id is
  'The quest the campaign''s story opens with (the prologue). The AI table''s first sitting begins at its entry beat. Not a foreign key: see migration 20261117072518. A value that matches no quest of this campaign means none.';

create function private.guard_campaign_opening_quest()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.opening_quest_id is not null and not exists (
    select 1 from public.quests q where q.id = new.opening_quest_id and q.campaign_id = new.id
  ) then
    raise exception 'The opening quest must be a quest of this campaign' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_campaign_opening_quest() from public, anon, authenticated;

create trigger campaigns_guard_opening_quest
  before update of opening_quest_id on public.campaigns
  for each row
  when (new.opening_quest_id is distinct from old.opening_quest_id)
  execute procedure private.guard_campaign_opening_quest();

-- The owner's choice, beside the other owner columns: a co-DM may run the table but does not move where the story begins.
create or replace function private.guard_campaign_owner_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null or old.user_id = (select auth.uid()) then
    return new;
  end if;
  -- spotify_client_id is not here: it is a public OAuth client id and travels
  -- with the campaign (#180). The AI keys are the owner's own credentials.
  if new.user_id           is distinct from old.user_id
     or new.openai_api_key    is distinct from old.openai_api_key
     or new.anthropic_api_key is distinct from old.anthropic_api_key
     or new.gemini_api_key    is distinct from old.gemini_api_key
     or new.text_provider     is distinct from old.text_provider
     or new.image_provider    is distinct from old.image_provider
     or new.ai_enabled        is distinct from old.ai_enabled
     or new.ical_token        is distinct from old.ical_token
     or new.is_archived       is distinct from old.is_archived
     or new.opening_quest_id  is distinct from old.opening_quest_id then
    raise exception 'Only the campaign''s owner can change that'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;
