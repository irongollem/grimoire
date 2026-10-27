-- Migration: handout_refuses_a_lens_pair
-- A Scriptorium document shared with players cannot hold a lens pair (#1115).
--
-- The Deep half of a lens pair is the DM's alone (20261027012548), and every
-- entity projection withholds it through private.withhold_secret_blocks. A
-- handout has no projection: a player reads the shared row of
-- `scriptorium_documents` directly (scriptorium_documents_select, #970), and RLS
-- decides rows, not what a column holds. So a handout carrying a pair would hand
-- its Deep reading to every recipient, raw row and rendered reader alike.
--
-- Refused where the row is written rather than stripped on the way out, which
-- covers every path that shares one at once: the DM's share_handout, a quest's
-- give_handout consequence, a notice board pin, and an autosave of a document
-- already shared. The Scriptorium offers the pair because a setting book prints
-- both readings; a book is not a handout. A DM who wants players to read a Deep
-- line puts it in the handout as ordinary text.
--
-- Content that looks like JSON but does not parse cannot be checked, so it
-- counts as holding a pair (fail closed), the same rule withhold_secret_blocks
-- applies.

-- One function, the trigger itself: it runs as the user writing the row, so a
-- helper it called would need EXECUTE granted to every client role.
create or replace function private.scriptorium_documents_handout_no_lens_pair()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_doc jsonb;
  v_holds boolean;
begin
  -- A private draft is never parsed: only a shared document pays for the check.
  if new.player_visible_to = '{}'::uuid[] or new.content is null or new.content !~ '^\s*{' then
    return new;
  end if;

  begin
    v_doc := new.content::jsonb;
    v_holds := coalesce(jsonb_path_exists(v_doc, 'strict $.** ? (@.type == "lensPair" || @.type == "lensDeep")'), true);
  exception when others then
    v_holds := true;
  end;

  if v_holds then
    -- The message is the whole explanation: the share dialog and the editor's
    -- save line both show an error's message and nothing else.
    raise exception 'A handout cannot hold a lens pair: players would read its Deep half. Remove the pair, or put what players may read in an ordinary block.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function private.scriptorium_documents_handout_no_lens_pair() from public, anon, authenticated;

create trigger scriptorium_documents_handout_no_lens_pair
  before insert or update of content, player_visible_to on public.scriptorium_documents
  for each row execute procedure private.scriptorium_documents_handout_no_lens_pair();
