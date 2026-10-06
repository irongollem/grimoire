import { describe, expect, it } from "vitest";
import { effectiveHallCampaign, filterHall, hallCampaignOptions } from "./hallView";
import type { CharacterMemorial } from "@/types/memorial.types";

function m(id: string, campaign: string, kind: "fallen" | "retired"): CharacterMemorial {
  return {
    id, party_member_id: id, campaign_id: campaign, owner_user_id: null, marked_by: null, kind,
    restored_at: null, game_date: null, real_date: "2026-01-01", account: null, last_words: null,
    last_blow: null, survived_by: [], player_name: null, character_name: id, portrait_url: null,
    portrait_focal_point: null, species_name: null, class_name: null, level: null,
    campaign_name: `Campaign ${campaign}`, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  };
}

const wall = [m("a", "b", "fallen"), m("b", "a", "retired"), m("c", "a", "fallen")];

describe("hallCampaignOptions", () => {
  it("lists each campaign once, by name", () => {
    expect(hallCampaignOptions(wall).map((o) => o.id)).toEqual(["a", "b"]);
  });
});

describe("effectiveHallCampaign", () => {
  const options = hallCampaignOptions(wall);
  it("defaults a player to All and a DM to the active campaign", () => {
    expect(effectiveHallCampaign(null, "player", "a", options)).toBe("all");
    expect(effectiveHallCampaign(null, "dm", "a", options)).toBe("a");
  });
  it("falls back to All when the DM's active campaign has nobody on the wall", () => {
    expect(effectiveHallCampaign(null, "dm", "zzz", options)).toBe("all");
    expect(effectiveHallCampaign(null, "dm", null, options)).toBe("all");
  });
  it("honours an explicit pick, and drops one that has left the wall", () => {
    expect(effectiveHallCampaign("all", "dm", "a", options)).toBe("all");
    expect(effectiveHallCampaign("b", "dm", "a", options)).toBe("b");
    expect(effectiveHallCampaign("gone", "player", null, options)).toBe("all");
  });
});

describe("filterHall", () => {
  it("filters by campaign and kind together", () => {
    expect(filterHall(wall, "all", "all")).toHaveLength(3);
    expect(filterHall(wall, "a", "all").map((x) => x.id)).toEqual(["b", "c"]);
    expect(filterHall(wall, "a", "fallen").map((x) => x.id)).toEqual(["c"]);
    expect(filterHall(wall, "all", "retired").map((x) => x.id)).toEqual(["b"]);
  });
});
