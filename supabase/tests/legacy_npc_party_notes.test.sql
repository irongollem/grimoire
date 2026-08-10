begin;

create extension if not exists pgtap with schema extensions;
select plan(1);

select hasnt_function(
  'public',
  'update_npc_party_notes',
  array['uuid', 'text'],
  'the unusable legacy NPC party-notes RPC is no longer exposed'
);

select * from finish();
rollback;
