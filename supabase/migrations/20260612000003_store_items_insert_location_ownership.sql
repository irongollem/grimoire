-- Migration: store_items_insert_location_ownership
-- Security fix for the global unique (location_id, item_id) constraint added in
-- 20260612000001. The store_items_insert policy only checked
-- `auth.uid() = user_id` — it never verified the caller owns the location. A
-- campaign member can read every location UUID in the campaign, so they could
-- insert an (own user_id, victim location_id, item_id) row: invisible to the
-- victim DM (whose reads filter user_id = auth.uid()) but occupying the now-
-- global unique key. That enabled (a) blocking the DM from stocking that item
-- (their plain .insert() hits a duplicate-key error) and (b) an existence
-- oracle for the DM's store contents via ignoreDuplicates upsert + read-back.
--
-- Fix at the root: require the inserted row to point at a location the caller
-- owns. Verified zero existing rows violate this (store_items is owner-scoped
-- in practice), so the tightened policy rejects nothing legitimate.

drop policy if exists store_items_insert on store_items;
create policy store_items_insert on store_items
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from locations l
      where l.id = location_id and l.user_id = auth.uid()
    )
  );
