import { describe, expect, it } from "vitest";
import { mergeAvailableSources, resolveLibrarySlugs } from "./useEnabledSources";

const CAMPAIGN_ENABLED = [{ source_slug: "srd-2014" }, { source_slug: "tob" }];
const USER_ENABLED = [{ source_slug: "toh" }, { source_slug: "srd-2014" }];

describe("resolveLibrarySlugs", () => {
  it("returns the campaign's enabled sources when not standalone", () => {
    expect(
      resolveLibrarySlugs({ standalone: false, campaignEnabled: CAMPAIGN_ENABLED, userEnabled: USER_ENABLED }),
    ).toEqual(["srd-2014", "tob"]);
  });

  it("returns null while a table's enabled sources are still loading", () => {
    // Load-bearing: callers gate their library query on `!== null`. Returning
    // [] here would fire a query matching nothing and cache the empty result.
    expect(resolveLibrarySlugs({ standalone: false, campaignEnabled: undefined, userEnabled: [] })).toBeNull();
  });

  it("returns an empty list when a table has genuinely disabled everything", () => {
    expect(resolveLibrarySlugs({ standalone: false, campaignEnabled: [], userEnabled: [] })).toEqual([]);
  });

  it("returns both SRDs plus the player's books when standalone, without duplicates", () => {
    expect(
      resolveLibrarySlugs({ standalone: true, campaignEnabled: undefined, userEnabled: USER_ENABLED }),
    ).toEqual(["srd-2014", "srd-2024", "toh"]);
  });

  it("returns just the SRDs when the player enabled nothing, and never null", () => {
    // #736/#737: the campaign query is disabled without a campaign, so its data
    // never arrives. A standalone read must not wait on it.
    const slugs = resolveLibrarySlugs({ standalone: true, campaignEnabled: undefined, userEnabled: [] });
    expect(slugs).toEqual(["srd-2014", "srd-2024"]);
  });

  it("returns null while the player's own rows are still loading", () => {
    expect(resolveLibrarySlugs({ standalone: true, campaignEnabled: undefined, userEnabled: undefined })).toBeNull();
  });

  it("ignores the campaign's sources when standalone", () => {
    // A table-less character viewed from inside a campaign reads the player's books.
    expect(
      resolveLibrarySlugs({ standalone: true, campaignEnabled: CAMPAIGN_ENABLED, userEnabled: [] }),
    ).toEqual(["srd-2014", "srd-2024"]);
  });
});

describe("mergeAvailableSources", () => {
  it("sums counts per source and sorts by title", () => {
    const merged = mergeAvailableSources([
      { source: "toh", source_title: "Tome of Heroes", count: 5 },
      { source: "kp", source_title: "Kobold Press", count: 2 },
      { source: "toh", source_title: "Tome of Heroes", count: 7 },
    ]);
    expect(merged).toEqual([
      { source: "kp", source_title: "Kobold Press", count: 2 },
      { source: "toh", source_title: "Tome of Heroes", count: 12 },
    ]);
  });

  it("sorts an untitled source by its slug", () => {
    const merged = mergeAvailableSources([
      { source: "zzz", source_title: null, count: 1 },
      { source: "aaa", source_title: null, count: 1 },
    ]);
    expect(merged.map((m) => m.source)).toEqual(["aaa", "zzz"]);
  });
});
