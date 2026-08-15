-- Migration: preserve_claimed_characters_on_creator_erasure (#735)
--
-- party_members.user_id is the row's creator/campaign custodian and has an
-- auth.users ON DELETE CASCADE FK. owner_user_id is the player who claimed the
-- character. Once those differ, deleting the creator must not erase another
-- person's character through a referential cascade.
--
-- Keep user_id NOT NULL and keep its cascade for unclaimed and self-owned
-- characters. Immediately before an auth user is deleted, transfer only rows
-- claimed by a different account to that surviving owner. This runs for every
-- auth.users deletion path, including the supported prepare_user_erasure ->
-- GoTrue delete flow and direct administrative deletion.

create or replace function private.preserve_claimed_characters_on_creator_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.party_members
     set user_id = owner_user_id
   where user_id = old.id
     and owner_user_id is not null
     and owner_user_id is distinct from old.id;

  return old;
end;
$$;

revoke all on function private.preserve_claimed_characters_on_creator_delete()
  from public, anon, authenticated;

drop trigger if exists preserve_claimed_characters_on_creator_delete on auth.users;
create trigger preserve_claimed_characters_on_creator_delete
  before delete on auth.users
  for each row execute procedure private.preserve_claimed_characters_on_creator_delete();

comment on function private.preserve_claimed_characters_on_creator_delete() is
  'Before an auth user is deleted, re-stamps party_members they created but another user owns so the creator FK cascade cannot erase another player''s claimed character (#735).';
