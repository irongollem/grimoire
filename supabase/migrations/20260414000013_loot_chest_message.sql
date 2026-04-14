-- Migration: loot_chest_message
-- "Chest" message type for the campaign chat (issue #121, part B).
--
-- A loot table can be dropped into chat as a clickable chest containing
-- a fixed roster of items (rolled at drop time) and a fixed claim count
-- (rolled from a dice expression at drop time). Players race to click —
-- first-click-wins, no per-player reservation, no DM-side management.
--
-- Storage strategy:
--   - Chest state lives on the campaign_messages row's metadata JSONB
--     (LootChestMetadata in src/types/chat.types.ts), matching the
--     existing item_drop / currency_drop / vendor_offer pattern.
--   - rolled_atoms[] is the flat list of individual claimable items
--     (qty 2 → two atoms with the same item_id, distinct atom_id).
--   - claims[] is appended to atomically by claim_loot_chest_atom().
--
-- Race-safe claim:
--   - claim_loot_chest_atom() takes a `FOR UPDATE` row lock so concurrent
--     clicks serialise on the row; the second clicker on the last atom
--     gets a clean "already claimed" / "chest is empty" exception rather
--     than silently double-counting.

-- ── 1. Extend message type allowlist ────────────────────────────────────────
alter table public.campaign_messages
  drop constraint campaign_messages_type_check;

alter table public.campaign_messages
  add constraint campaign_messages_type_check
  check (type in ('chat', 'roll', 'system', 'item_drop', 'currency_drop', 'vendor_offer', 'player_offer', 'loot_chest'));

-- The existing campaign_messages_claim policy only covers item_drop.
-- Widen it to also allow loot_chest updates by any campaign member —
-- though in practice every claim should go through the RPC below, this
-- keeps direct UPDATEs (e.g. DM closing a chest manually) authorised.
drop policy if exists "campaign_messages_claim" on public.campaign_messages;
create policy "campaign_messages_claim" on public.campaign_messages
  for update using (
    type in ('item_drop', 'loot_chest')
    and public.is_campaign_member(campaign_id)
  );

-- ── 2. Atomic claim function ────────────────────────────────────────────────
-- Returns the new metadata blob so the client can update its local copy
-- without an extra round-trip.
--
-- Failure modes (raised as exceptions for the client to surface):
--   - 'Chest not found'       — bad p_message_id
--   - 'Not a campaign member' — caller can't see the chest
--   - 'Chest is empty'        — claims_total reached
--   - 'Item not in chest'     — atom_id doesn't exist in rolled_atoms
--   - 'Item already claimed'  — atom_id already in claims (lost the race)

create or replace function public.claim_loot_chest_atom(
  p_message_id   uuid,
  p_atom_id      text,
  p_claimer_name text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg          public.campaign_messages;
  v_meta         jsonb;
  v_claims       jsonb;
  v_claims_total int;
begin
  -- Lock row so concurrent claims serialise.
  select * into v_msg
  from public.campaign_messages
  where id = p_message_id and type = 'loot_chest'
  for update;

  if v_msg is null then
    raise exception 'Chest not found';
  end if;

  if not public.is_campaign_member(v_msg.campaign_id) then
    raise exception 'Not a campaign member';
  end if;

  v_meta         := coalesce(v_msg.metadata, '{}'::jsonb);
  v_claims       := coalesce(v_meta->'claims', '[]'::jsonb);
  v_claims_total := coalesce((v_meta->>'claims_total')::int, 0);

  if jsonb_array_length(v_claims) >= v_claims_total then
    raise exception 'Chest is empty';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(coalesce(v_meta->'rolled_atoms', '[]'::jsonb)) atom
    where atom->>'atom_id' = p_atom_id
  ) then
    raise exception 'Item not in chest';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_claims) claim
    where claim->>'atom_id' = p_atom_id
  ) then
    raise exception 'Item already claimed';
  end if;

  v_meta := jsonb_set(
    v_meta,
    '{claims}',
    v_claims || jsonb_build_object(
      'atom_id',             p_atom_id,
      'claimed_by_user_id',  auth.uid()::text,
      'claimed_by_name',     p_claimer_name,
      'claimed_at',          to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    )
  );

  update public.campaign_messages set metadata = v_meta where id = p_message_id;
  return v_meta;
end;
$$;

grant execute on function public.claim_loot_chest_atom(uuid, text, text) to authenticated;
