-- A character played by the AI while its player is away, at a real table (#1021 row 26).
--
-- The maintainer, 19 Nov 2026: "any real table is billed to the dm ('players always play for free') its also a dm
-- call to have an absent player be represented anyway", and the character "works in normal chat and responds on @
-- and whispers". So two words are needed before a character answers in chat, each from the one whose word it is:
--   `ai_speaks`     the player's, on their own sheet (20261119121121): the AI may speak as my character;
--   `ai_stands_in`  the Dungeon Master's, per character: tonight this absent character is played, on my credits.
-- Neither may be given by the other. `ai_speaks` had no guard: a Dungeon Master could switch on a consent that is
-- the player's to give. This closes that too.

alter table public.party_members
  add column ai_stands_in boolean not null default false;

comment on column public.party_members.ai_stands_in is
  'The Dungeon Master''s word that this character is played by the AI while its player is away, at the DM''s cost (#1021 row 26). Only the campaign''s DM may change it.';

create or replace function private.guard_party_member_ai_play()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_has_player boolean;
  v_is_its_player boolean;
begin
  -- The server and migrations write as they must; this holds the people.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.ai_stands_in is distinct from old.ai_stands_in
     and not coalesce(old.campaign_id is not null and private.is_campaign_dm(old.campaign_id), false) then
    raise exception 'Only the Dungeon Master decides whether an absent character is played'
      using errcode = '42501';
  end if;

  if new.ai_speaks is distinct from old.ai_speaks then
    v_has_player := old.owner_user_id is not null
      or exists (select 1 from public.campaign_members cm where cm.party_member_id = old.id);
    v_is_its_player := coalesce(old.owner_user_id = v_uid, false)
      or exists (select 1 from public.campaign_members cm where cm.party_member_id = old.id and cm.user_id = v_uid);
    -- A character with a player: only that player. One nobody has claimed: whoever may edit it (the row policy).
    if v_has_player and not v_is_its_player then
      raise exception 'Only a character''s own player may let the AI speak for it'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.guard_party_member_ai_play() from public, anon, authenticated;

create trigger party_members_guard_ai_play
  before update of ai_speaks, ai_stands_in on public.party_members
  for each row execute procedure private.guard_party_member_ai_play();
