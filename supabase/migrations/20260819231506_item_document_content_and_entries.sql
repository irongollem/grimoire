-- Migration: item_document_content_and_entries
-- Document items (a ledger, a contract, a scroll): in-world written content on
-- the item itself, plus player-authored entries. `items.content` is the text
-- the object carries (the contract's clauses, the ledger's original pages) —
-- distinct from `description`, which is meta text *about* the item. Player
-- writing is a separate append-only child table rather than a shared column:
-- entries carry authorship, survive concurrent writers without clobbering, and
-- "nobody can rewrite someone else's ink" is RLS structure instead of a rule.

-- ── 1. items: the DM-authored document ─────────────────────────────────────────

alter table items
  add column content text,
  add column content_player_writable boolean not null default false,
  add column content_updated_at timestamptz;

comment on column items.content is
  'In-world written content (Tiptap JSON string) — what the object itself says. NULL = not a document item. Distinct from description (meta, about the item).';
comment on column items.content_player_writable is
  'When true, campaign members may append item_entries to this item.';
comment on column items.content_updated_at is
  'Bumped by trigger when content changes; player unread dots key on this rather than updated_at so unrelated item edits do not re-flag.';

-- Server-side stamp so the unread signal cannot be forgotten by a client path.
create or replace function public.items_touch_content_updated_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.content is not null then
      new.content_updated_at := now();
    end if;
  elsif new.content is distinct from old.content then
    new.content_updated_at := now();
  end if;
  return new;
end;
$$;

-- Trigger functions never need EXECUTE (the trigger system bypasses the
-- check); keep it off the PostgREST RPC surface.
revoke execute on function public.items_touch_content_updated_at() from public, anon, authenticated;

create trigger items_content_updated_at
  before insert or update on items
  for each row execute procedure items_touch_content_updated_at();

-- ── 2. Recreate get_player_visible_items with the new columns ─────────────────
-- The projection is `returns setof items` with a hand-maintained positional
-- column list, so every widening of `items` must recreate it (see
-- 20260724000005 for the outage this prevents). Body identical to
-- 20260724000005 + 20260804000010 (ai_provenance), plus the three new columns:
-- `content` is gated exactly like `description` — hidden while any of the
-- player's copies is unidentified.

create or replace function get_player_visible_items()
returns setof items
language sql stable security definer
set search_path = public
as $$
  with vault as (
    select pi.item_id,
           bool_and(pi.is_identified)  as all_identified,
           bool_and(pi.curse_revealed) as all_curse_revealed
    from party_inventory pi
    join campaign_members cm on cm.campaign_id = pi.campaign_id
    where cm.user_id = (select auth.uid())
      and pi.item_id is not null
    group by pi.item_id
  )
  select
    i.id,
    i.user_id,
    i.name,
    i.item_type,
    i.subtype,
    i.rarity,
    i.requires_attunement,
    i.attunement_requirements,
    i.weight,
    i.cost,
    i.damage_rolls,
    i.armor_class,
    i.properties,
    i.charges,
    i.recharge,
    i.spell_ids,
    case when v.item_id is not null and not v.all_identified then null else i.description end,
    i.source,
    i.tags,
    case when v.item_id is not null and not v.all_identified then null else i.image_url end,
    i.created_at,
    i.updated_at,
    case when v.item_id is not null and not v.all_identified then null else i.image_focal_point end,
    i.weapon_range,
    i.versatile_damage,
    i.source_title,
    i.source_url,
    case when v.item_id is not null and v.all_curse_revealed then i.curse_description else null end,
    i.is_arcane_focus,
    i.mundane_description,
    i.mundane_image_url,
    i.mundane_image_focal_point,
    i.bundle_items,
    i.campaign_id,
    null::text,                      -- dm_notes (DM-only)
    i.ruleset,
    i.conceptual_key,
    i.source_document_key,
    i.source_record_key,
    i.source_revision,
    i.source_license,
    i.provenance,
    i.mastery,
    i.ai_provenance,
    case when v.item_id is not null and not v.all_identified then null else i.content end,
    i.content_player_writable,
    i.content_updated_at
  from items i
  left join vault v on v.item_id = i.id
  where
    exists (
      select 1
      from party_inventory pi
      join campaign_members cm on cm.campaign_id = pi.campaign_id
      where pi.item_id = i.id
        and cm.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from store_items si
      join locations l on l.id = si.location_id
      join campaign_members cm on cm.campaign_id = l.campaign_id
      where si.item_id = i.id
        and cm.user_id = (select auth.uid())
        and cm.party_member_id = any (l.player_visible_to)
        and l.is_inventory_shared = true
        and si.visible = true
    );
$$;

-- CREATE OR REPLACE preserves grants; keep the login-only boundary explicit in
-- the migration that recreates the function (idiom from 20260804000010).
revoke execute on function public.get_player_visible_items() from public, anon;
grant execute on function public.get_player_visible_items() to authenticated, service_role;

-- ── 3. RLS helper: does this item accept player entries? ──────────────────────
-- Lives in `private` (not exposed by PostgREST); SECURITY DEFINER because the
-- caller (a player) cannot read `items` — owner-only RLS — so an inline
-- subquery in the policy would always see zero rows. coalesce keeps the
-- predicate total: a dangling item_id must mean false, never NULL.

create or replace function private.item_allows_player_entries(p_item_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select i.content_player_writable from items i where i.id = p_item_id),
    false
  );
$$;

-- authenticated/anon keep EXECUTE so RLS can resolve the predicate; `private`
-- is never exposed as an RPC surface.
revoke all on function private.item_allows_player_entries(uuid) from public;
grant execute on function private.item_allows_player_entries(uuid) to authenticated, anon, service_role;

-- ── 4. item_entries: append-only player (and DM) writing ──────────────────────

create table item_entries (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The in-fiction hand that wrote it; null for the DM (or a departed member).
  party_member_id uuid references party_members(id) on delete set null,
  -- Tiptap JSON string, like every rich-text column. Images are bucket URLs,
  -- not data URIs, so the cap is generous; it exists because this is the
  -- app's first player-writable long-text column.
  content text not null check (char_length(content) <= 50000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table item_entries is
  'Writing added to a document item (items.content is the DM-authored base text). Append-only by construction: authors own their entries, nobody edits anyone else''s.';

create index item_entries_item_campaign_idx on item_entries (item_id, campaign_id);

create trigger item_entries_updated_at
  before update on item_entries
  for each row execute procedure update_updated_at();

-- Anchors are immutable. The UPDATE policy's WITH CHECK cannot see OLD, so on
-- its own it would let an author retarget an existing row — onto a locked item
-- (bypassing content_player_writable, which INSERT enforces) or into another
-- campaign they belong to. A trigger is the only place OLD exists; precedent:
-- guard_party_member_campaign_transition (20260814221409). party_member_id may
-- only fall to null — the ON DELETE SET NULL referential action performs a real
-- UPDATE that fires this trigger, so that transition must stay legal; moving to
-- a *different* hand is what's forged, and what's blocked.
create or replace function public.guard_item_entry_anchors()
returns trigger
language plpgsql
as $$
begin
  if new.item_id is distinct from old.item_id
     or new.campaign_id is distinct from old.campaign_id
     or new.user_id is distinct from old.user_id
     or (new.party_member_id is not null
         and new.party_member_id is distinct from old.party_member_id) then
    raise exception 'item_entries rows are anchored: item, campaign and author cannot change'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

-- Trigger functions never need EXECUTE; keep it off the RPC surface.
revoke execute on function public.guard_item_entry_anchors() from public, anon, authenticated;

create trigger item_entries_guard_anchors
  before update on item_entries
  for each row execute procedure guard_item_entry_anchors();

alter table item_entries enable row level security;

-- Reading follows the campaign, like party_inventory — deliberately WITHOUT an
-- item-visibility gate: entries are the table's own writing, not DM secrets.
-- Text the players must not read yet belongs in items.content (masked by the
-- projection until identified), never in an entry.
create policy "item_entries_select" on item_entries
  for select using (private.is_campaign_member(campaign_id));

-- Authorship is pinned; players need the item's writable flag, the DM writes
-- regardless (is_campaign_dm implies is_campaign_member). party_member_id may
-- only claim the member's own character.
create policy "item_entries_insert" on item_entries
  for insert with check (
    (select auth.uid()) = user_id
    and private.is_campaign_member(campaign_id)
    and (private.is_campaign_dm(campaign_id) or private.item_allows_player_entries(item_id))
    and (party_member_id is null or party_member_id = private.my_party_member_id(campaign_id))
  );

-- Soft ink: authors may revise their own entries while still in the campaign;
-- nobody else's. Drop this policy to make entries immutable ("hard ink").
create policy "item_entries_update" on item_entries
  for update using (
    (select auth.uid()) = user_id
    and private.is_campaign_member(campaign_id)
  )
  with check (
    (select auth.uid()) = user_id
    and private.is_campaign_member(campaign_id)
  );

-- Authors can retract their own; the DM can moderate anything at the table.
create policy "item_entries_delete" on item_entries
  for delete using (
    (select auth.uid()) = user_id
    or private.is_campaign_dm(campaign_id)
  );

-- ── 5. Realtime ────────────────────────────────────────────────────────────────

alter publication supabase_realtime add table item_entries;
alter table item_entries replica identity default;
