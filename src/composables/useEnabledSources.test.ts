import { describe, expect, it } from "vitest";
import { resolveLibrarySlugs } from "./useEnabledSources";

const CAMPAIGN = "campaign-1";
const ENABLED = [{ source_slug: "srd-2014" }, { source_slug: "tob" }];

describe("resolveLibrarySlugs", () => {
  it("returns the campaign's enabled sources when there is a campaign", () => {
    expect(resolveLibrarySlugs(CAMPAIGN, ENABLED)).toEqual(["srd-2014", "tob"]);
  });

  it("returns null while a campaign's enabled sources are still loading", () => {
    // Load-bearing: callers gate their library query on `!== null`. Returning
    // [] here would fire a query matching nothing and cache the empty result.
    expect(resolveLibrarySlugs(CAMPAIGN, undefined)).toBeNull();
  });

  it("returns an empty list when a campaign has genuinely disabled everything", () => {
    // Distinct from the loading case above: the DM's choice is honoured, and
    // the query runs and legitimately finds nothing.
    expect(resolveLibrarySlugs(CAMPAIGN, [])).toEqual([]);
  });

  it("falls back to the SRD baseline with no campaign, and never to null", () => {
    // #736/#737: useEnabledSources is *disabled* without a campaign, so its
    // data never arrives. Deriving slugs straight from it left the list at
    // null forever and every shared-content surface empty — no spells, items,
    // monsters or species for a standalone player.
    const slugs = resolveLibrarySlugs(null, undefined);

    expect(slugs).toEqual(["srd-2014"]);
    expect(slugs).not.toBeNull();
  });

  it("ignores stale enabled sources once the campaign is gone", () => {
    // Leaving a campaign must not keep its sources in play; the cached rows
    // may still be in hand when activeCampaignId has already cleared.
    expect(resolveLibrarySlugs(null, ENABLED)).toEqual(["srd-2014"]);
  });
});
