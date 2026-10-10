import { describe, expect, it } from "vitest";
import {
  LEGACY_NPC_RATING_KEY,
  planLegacyNpcRatingBackfill,
  readLegacyNpcRating,
} from "./usePlayerNpcRatings";

function storage(values: Record<string, string>): Pick<Storage, "getItem"> {
  return { getItem: (key) => values[key] ?? null };
}

describe("legacy NPC rating backfill", () => {
  it("accepts only complete ratings from one to five", () => {
    const local = storage({
      [`${LEGACY_NPC_RATING_KEY}one`]: "1",
      [`${LEGACY_NPC_RATING_KEY}five`]: "5",
      [`${LEGACY_NPC_RATING_KEY}zero`]: "0",
      [`${LEGACY_NPC_RATING_KEY}large`]: "6",
      [`${LEGACY_NPC_RATING_KEY}decimal`]: "3.5",
      [`${LEGACY_NPC_RATING_KEY}junk`]: "nope",
    });

    expect(readLegacyNpcRating(local, "one")).toBe(1);
    expect(readLegacyNpcRating(local, "five")).toBe(5);
    expect(readLegacyNpcRating(local, "zero")).toBe(0);
    expect(readLegacyNpcRating(local, "large")).toBe(0);
    expect(readLegacyNpcRating(local, "decimal")).toBe(0);
    expect(readLegacyNpcRating(local, "junk")).toBe(0);
  });

  it("builds rows only for rated NPCs visible in the active campaign", () => {
    const local = storage({
      [`${LEGACY_NPC_RATING_KEY}npc-a`]: "4",
      [`${LEGACY_NPC_RATING_KEY}npc-hidden`]: "5",
    });

    expect(planLegacyNpcRatingBackfill(local, [{ id: "npc-a" }, { id: "npc-b" }], "user-1", "campaign-1"))
      .toEqual([{ user_id: "user-1", campaign_id: "campaign-1", npc_id: "npc-a", rating: 4 }]);
  });
});
