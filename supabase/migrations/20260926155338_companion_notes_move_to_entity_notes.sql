-- Companion notes live in entity_notes, like every other entity's.
--
-- `companions` carried two note columns that no screen read or wrote:
-- `notes`, which the companion form round-tripped without ever showing, and
-- `party_notes`, whose only writer was the RPC `update_companion_party_notes`.
-- Nothing in the app called that RPC since player notes moved to the generic
-- `entity_notes` table (#587, 20260730000006), so three companions' party notes
-- sat in production where no one could see them. Found while adding pets to
-- the demo campaign: a DM had nowhere to keep a note on a companion.
--
-- Notes on a companion now go through `EntityNotesPanel` (DM) and
-- `PlayerNotesWidget` (players), both on `entity_notes`, where a private note is
-- private by RLS rather than by the UI declining to render it.
--
-- `party_notes` rows become non-private notes by the companion's owner, which
-- is what "party" notes meant: visible to the campaign. `notes` has no rows with
-- content in production; any elsewhere become the owner's private notes.
--
-- The RPC also had the NULL-predicate shape from CLAUDE.md's SECURITY DEFINER
-- item 3: `if not private.is_campaign_member(v_campaign_id)` on a companion with
-- a null `campaign_id` fell through. Dropping it removes one authenticated
-- definer finding from the advisor baseline (110 -> 109).

insert into public.entity_notes (user_id, entity_type, entity_id, content, is_private, shared_with_dm, campaign_id, created_at, updated_at)
select c.user_id, 'companion', c.id::text, c.party_notes, false, false, c.campaign_id, c.updated_at, c.updated_at
from public.companions c
where c.party_notes is not null
  and btrim(c.party_notes) <> ''
  and not exists (
    select 1 from public.entity_notes en
    where en.entity_type = 'companion'
      and en.entity_id = c.id::text
      and en.content = c.party_notes
  );

insert into public.entity_notes (user_id, entity_type, entity_id, content, is_private, shared_with_dm, campaign_id, created_at, updated_at)
select c.user_id, 'companion', c.id::text, c.notes, true, false, c.campaign_id, c.updated_at, c.updated_at
from public.companions c
where c.notes is not null
  and btrim(c.notes) <> ''
  and not exists (
    select 1 from public.entity_notes en
    where en.entity_type = 'companion'
      and en.entity_id = c.id::text
      and en.content = c.notes
  );

drop function if exists public.update_companion_party_notes(uuid, text);

alter table public.companions
  drop column party_notes,
  drop column notes;
