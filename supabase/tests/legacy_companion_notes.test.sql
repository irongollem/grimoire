begin;

create extension if not exists pgtap with schema extensions;
select plan(3);

-- Companion notes live in entity_notes (migration 20260926155338). The two
-- columns no screen read and the RPC nothing called are gone, so a note
-- cannot be written where no one will ever see it again.

select hasnt_function(
  'public',
  'update_companion_party_notes',
  array['uuid', 'text'],
  'the unused companion party-notes RPC is no longer exposed'
);

select hasnt_column('public', 'companions', 'party_notes', 'companions has no party_notes column');
select hasnt_column('public', 'companions', 'notes', 'companions has no notes column');

select * from finish();
rollback;
