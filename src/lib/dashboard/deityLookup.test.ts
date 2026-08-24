import { describe, it, expect } from "vitest";
import { buildDeityLookupGroups, formatDeityLookupRow, type DeityWithPantheon } from "./deityLookup";

// A minimal, fully-populated deity — every field a real row would have, so
// each test only overrides what it is actually exercising rather than
// re-listing the whole shape.
const deity = (overrides: Partial<DeityWithPantheon> & { id: string; name: string }): DeityWithPantheon => ({
  user_id: "user-1",
  campaign_id: "campaign-1",
  titles: null,
  alternate_names: [],
  pantheon_id: null,
  alignment: null,
  symbol: null,
  symbol_image_url: null,
  portrait_url: null,
  portrait_focal_point: null,
  domains: [],
  portfolio: null,
  description: null,
  dm_notes: null,
  tags: [],
  player_visible_to: [],
  setting_source: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  pantheon: null,
  ...overrides,
});

describe("formatDeityLookupRow", () => {
  it("links to the deity's own detail page", () => {
    expect(formatDeityLookupRow(deity({ id: "d1", name: "Lathander" })).to).toBe("/deities/d1");
  });

  it("keeps titles, alignment and symbol as given when filled in", () => {
    const row = formatDeityLookupRow(
      deity({
        id: "d1",
        name: "Lathander",
        titles: "The Morninglord",
        alignment: "Neutral Good",
        symbol: "A road disappearing into the sunrise",
      }),
    );
    expect(row.titles).toBe("The Morninglord");
    expect(row.alignment).toBe("Neutral Good");
    expect(row.symbol).toBe("A road disappearing into the sunrise");
  });

  it("collapses a blank-after-trim field to null rather than an empty line", () => {
    const row = formatDeityLookupRow(deity({ id: "d1", name: "Lathander", titles: "   ", alignment: "" }));
    expect(row.titles).toBeNull();
    expect(row.alignment).toBeNull();
  });

  // The `domains` column is a non-null `text[]` in the schema, so a genuinely
  // `undefined` value never reaches this function — "empty/absent" in
  // practice means the array a homebrew deity has not had domains set for
  // yet, which is `[]`. This asserts that state renders as a real (empty)
  // list rather than throwing or fabricating a placeholder domain.
  it("formats a deity with no domains as an empty list, not a crash", () => {
    expect(formatDeityLookupRow(deity({ id: "d1", name: "A Nameless Spirit", domains: [] })).domains).toEqual([]);
  });

  it("trims domains and drops blank entries", () => {
    const row = formatDeityLookupRow(deity({ id: "d1", name: "Lathander", domains: [" Life ", "", "Light", "   "] }));
    expect(row.domains).toEqual(["Life", "Light"]);
  });
});

describe("buildDeityLookupGroups", () => {
  it("returns nothing for no deities", () => {
    expect(buildDeityLookupGroups([])).toEqual([]);
  });

  it("renders deities with no pantheon as one flat, unlabeled group", () => {
    const groups = buildDeityLookupGroups([
      deity({ id: "d1", name: "Kord", pantheon: null }),
      deity({ id: "d2", name: "Erathis", pantheon: null }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].pantheonLabel).toBeNull();
    expect(groups[0].rows.map((r) => r.name)).toEqual(["Erathis", "Kord"]);
  });

  it("renders a single shared pantheon as one flat, unlabeled group", () => {
    const groups = buildDeityLookupGroups([
      deity({ id: "d1", name: "Kord", pantheon: { id: "p1", name: "The Core Pantheon" } }),
      deity({ id: "d2", name: "Erathis", pantheon: { id: "p1", name: "The Core Pantheon" } }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].pantheonLabel).toBeNull();
    expect(groups[0].rows.map((r) => r.name)).toEqual(["Erathis", "Kord"]);
  });

  it("groups and labels deities across two pantheons, sorted alphabetically by pantheon name", () => {
    const groups = buildDeityLookupGroups([
      deity({ id: "d1", name: "Kord", pantheon: { id: "p2", name: "The Seldarine" } }),
      deity({ id: "d2", name: "Corellon", pantheon: { id: "p1", name: "The Elven Pantheon" } }),
      deity({ id: "d3", name: "Erathis", pantheon: { id: "p2", name: "The Seldarine" } }),
    ]);
    expect(groups.map((g) => g.pantheonLabel)).toEqual(["The Elven Pantheon", "The Seldarine"]);
    expect(groups[0].rows.map((r) => r.name)).toEqual(["Corellon"]);
    // Within a group, deities sort by name — Erathis before Kord.
    expect(groups[1].rows.map((r) => r.name)).toEqual(["Erathis", "Kord"]);
  });

  it("sorts an 'Unaffiliated' section last, even alphabetically ahead of a real pantheon", () => {
    const groups = buildDeityLookupGroups([
      deity({ id: "d1", name: "A Stray God", pantheon: null }),
      deity({ id: "d2", name: "Kord", pantheon: { id: "p1", name: "Zealot's Court" } }),
    ]);
    expect(groups.map((g) => g.pantheonLabel)).toEqual(["Zealot's Court", "Unaffiliated"]);
    expect(groups[1].rows.map((r) => r.name)).toEqual(["A Stray God"]);
  });

  it("gives every row a stable link out regardless of grouping", () => {
    const groups = buildDeityLookupGroups([
      deity({ id: "d1", name: "Kord", pantheon: { id: "p1", name: "Pantheon A" } }),
      deity({ id: "d2", name: "Erathis", pantheon: { id: "p2", name: "Pantheon B" } }),
    ]);
    const allRows = groups.flatMap((g) => g.rows);
    expect(allRows.map((r) => r.to).sort()).toEqual(["/deities/d1", "/deities/d2"]);
  });
});
