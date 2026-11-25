import type { CanonEntry } from "@/types/canon.types";

/**
 * A canon entry for a test. Every column has a default, so a test names only what it is about, and a column added to
 * `CanonEntry` later is added here once instead of in every test that builds an entry.
 */
export function canonEntry(over: Partial<CanonEntry> = {}): CanonEntry {
  return {
    id: "e1",
    user_id: "u",
    campaign_id: "c1",
    part: "truth",
    premise_kind: null,
    knowledge: null,
    title: "x",
    body: null,
    sort_order: 0,
    player_visible_to: [],
    revealed_at: null,
    revealed_session_id: null,
    cover_story: null,
    loose_end_left_at: null,
    if_succeeds: null,
    wants: null,
    clock_size: null,
    image_url: null,
    reference_images: [],
    lore_kind: null,
    world_year: null,
    world_month: null,
    world_day: null,
    party_member_id: null,
    ai_provenance: null,
    closed_as: null,
    closed_at: null,
    closed_note: null,
    became_entry_id: null,
    from_fact_id: null,
    arc_id: null,
    habitat_id: null,
    created_at: "2026-11-19T10:00:00Z",
    updated_at: "2026-11-19T10:00:00Z",
    ...over,
  };
}
