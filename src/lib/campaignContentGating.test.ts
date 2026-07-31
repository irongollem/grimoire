import { describe, it, expect } from "vitest";
import { allowedSpecies, allowedSystemClasses, allowedCampaignScoped } from "@/lib/campaignContentGating";

const CAMPAIGN = "11111111-1111-1111-1111-111111111111";
const OTHER    = "22222222-2222-2222-2222-222222222222";

const species = [
  { id: "srd-2024_elf", campaign_id: null },          // shared SRD row (slug id)
  { id: "srd-2024_dwarf", campaign_id: null },
  { id: "aaaa-custom-uuid", campaign_id: null },      // DM's universal homebrew
  { id: "bbbb-custom-uuid", campaign_id: CAMPAIGN },  // exclusive to this campaign
  { id: "cccc-custom-uuid", campaign_id: OTHER },     // exclusive to another
];

describe("allowedSpecies", () => {
  it("drops blocklisted species — slug or uuid, since #303 both live in the same text[]", () => {
    const result = allowedSpecies(species, {
      campaignId: CAMPAIGN,
      disabledIds: ["srd-2024_elf", "aaaa-custom-uuid"],
    });
    expect(result.map((s) => s.id)).toEqual(["srd-2024_dwarf", "bbbb-custom-uuid"]);
  });

  it("keeps this campaign's exclusive species and hides another campaign's", () => {
    const ids = allowedSpecies(species, { campaignId: CAMPAIGN, disabledIds: [] }).map((s) => s.id);
    expect(ids).toContain("bbbb-custom-uuid");
    expect(ids).not.toContain("cccc-custom-uuid");
  });

  it("blocks a campaign-exclusive species the DM also disabled", () => {
    const ids = allowedSpecies(species, {
      campaignId: CAMPAIGN,
      disabledIds: ["bbbb-custom-uuid"],
    }).map((s) => s.id);
    expect(ids).not.toContain("bbbb-custom-uuid");
  });

  it("applies exclusivity but no blocklist when no campaign is loaded", () => {
    const ids = allowedSpecies(species, { campaignId: null, disabledIds: undefined }).map((s) => s.id);
    expect(ids).toEqual(["srd-2024_elf", "srd-2024_dwarf", "aaaa-custom-uuid"]);
  });

  it("returns an empty list while the species query is unsettled", () => {
    expect(allowedSpecies(undefined, { campaignId: CAMPAIGN, disabledIds: [] })).toEqual([]);
  });
});

describe("allowedSystemClasses", () => {
  const classes = [
    { class_name: "Barbarian" },
    { class_name: "Monk" },
    { class_name: "Wizard" },
  ];

  it("hides classes on the campaign blocklist", () => {
    expect(allowedSystemClasses(classes, ["Monk"]).map((c) => c.class_name))
      .toEqual(["Barbarian", "Wizard"]);
  });

  it("keeps every class when nothing is disabled or no campaign is loaded", () => {
    expect(allowedSystemClasses(classes, []).length).toBe(3);
    expect(allowedSystemClasses(classes, undefined).length).toBe(3);
  });

  it("returns an empty list while the class query is unsettled", () => {
    expect(allowedSystemClasses(undefined, ["Monk"])).toEqual([]);
  });
});

describe("allowedCampaignScoped", () => {
  const classes = [
    { class_name: "Bloodhunter", campaign_id: null },
    { class_name: "Stormcaller", campaign_id: CAMPAIGN },
    { class_name: "Duskblade",   campaign_id: OTHER },
  ];

  it("keeps universal and own-campaign homebrew, hides another campaign's", () => {
    expect(allowedCampaignScoped(classes, CAMPAIGN).map((c) => c.class_name))
      .toEqual(["Bloodhunter", "Stormcaller"]);
  });

  it("keeps only universal rows when no campaign is loaded", () => {
    expect(allowedCampaignScoped(classes, null).map((c) => c.class_name)).toEqual(["Bloodhunter"]);
  });

  it("returns an empty list while the query is unsettled", () => {
    expect(allowedCampaignScoped(undefined, CAMPAIGN)).toEqual([]);
  });
});
