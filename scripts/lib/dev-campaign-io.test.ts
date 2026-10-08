import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSkipped, pullCampaignTables } from "./dev-campaign-io";
import * as stack from "./dev-stack";

describe("parseSkipped", () => {
  it("reads a lenient import's dev-skip notices and ignores psql's other output", () => {
    const stderr = [
      "psql:/tmp/import.sql:12: NOTICE:  dev-skip|character_spells|1|srd_x is not on the Paladin spell list",
      "psql:/tmp/import.sql:12: NOTICE:  some other notice",
      "psql:/tmp/import.sql:12: NOTICE:  dev-skip|loot_placements|2|Item is not available | to this campaign",
      "",
    ].join("\n");
    expect(parseSkipped(stderr)).toEqual([
      { table: "character_spells", count: 1, reason: "srd_x is not on the Paladin spell list" },
      // A reason may itself contain the separator.
      { table: "loot_placements", count: 2, reason: "Item is not available | to this campaign" },
    ]);
  });

  it("is empty for a clean import", () => {
    expect(parseSkipped("")).toEqual([]);
  });
});


describe("pullCampaignTables ownership", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["quest_threads", "created_by=eq."],
    ["quest_beats", "or=(created_by.eq."],
  ])("filters %s in the remote GET", async (table, creatorPrefix) => {
    const source = "12121212-3434-5656-7878-909090909090";
    const remote = new URL("https://example.invalid");
    const rows = vi.spyOn(stack, "remoteRows").mockResolvedValue([]);
    vi.spyOn(stack, "remoteCount").mockResolvedValue(0);
    await pullCampaignTables(remote, "synthetic-key", [
      { table, tier: 1, orderBy: "id", deferColumns: [], parentColumn: null, parentTable: null },
    ], new Map([[table, ["id", "created_by"]]]), "campaign-id", source);
    const creator = creatorPrefix + source + (table === "quest_beats" ? ",created_by.is.null)" : "");
    expect(rows).toHaveBeenCalledWith(remote, "synthetic-key", table, `campaign_id=eq.campaign-id&${creator}`, "id");
  });
});
