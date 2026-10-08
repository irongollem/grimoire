import { describe, expect, it } from "vitest";
import { parseSkipped } from "./dev-campaign-io";

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
