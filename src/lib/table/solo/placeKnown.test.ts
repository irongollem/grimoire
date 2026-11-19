import { describe, expect, it } from "vitest";
import { placeSummaryFor } from "./placeKnown";

const place = (over: Partial<{ player_summary: string | null; player_visible_to: string[] | null }> = {}) => ({
  player_summary: "A sealed workshop, dark for twelve years.",
  player_visible_to: ["rosie"],
  ...over,
});

describe("placeSummaryFor", () => {
  // Bug caught: the DM's row read straight onto the page, describing a place the character has never been shown.
  it("says nothing of a place that has not been shown to the played character", () => {
    expect(placeSummaryFor(place({ player_visible_to: ["fresco"] }), "rosie")).toBeNull();
    expect(placeSummaryFor(place({ player_visible_to: null }), "rosie")).toBeNull();
  });

  it("gives the player summary once the place has been shown to them", () => {
    expect(placeSummaryFor(place(), "rosie")).toBe("A sealed workshop, dark for twelve years.");
  });

  // Bug caught: a sitting with no readable character treated as "everyone".
  it("says nothing when nobody is played", () => {
    expect(placeSummaryFor(place(), null)).toBeNull();
  });

  // Bug caught: an empty paragraph under the place's name for a place with no summary written.
  it("says nothing for a blank summary", () => {
    expect(placeSummaryFor(place({ player_summary: "   " }), "rosie")).toBeNull();
    expect(placeSummaryFor(place({ player_summary: null }), "rosie")).toBeNull();
  });
});
