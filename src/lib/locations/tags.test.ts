import { describe, it, expect } from "vitest";
import { tagRestatesType, visibleTags } from "./tags";
import type { LocationType } from "@/types/location.types";

function at(location_type: LocationType, tags: string[]) {
  return { location_type, tags };
}

describe("visibleTags", () => {
  it("drops a tag that restates the location's own type", () => {
    expect(visibleTags(at("tavern", ["tavern", "frozen"]))).toEqual(["frozen"]);
  });

  it("KEEPS the tag on the legacy shape it came from", () => {
    // Before store/tavern/inn types existed, a DM typed these `building` and
    // said what they were with a tag. There the tag is the only thing carrying
    // the meaning — hiding it would delete information from the screen.
    expect(visibleTags(at("building", ["tavern"]))).toEqual(["tavern"]);
    expect(visibleTags(at("building", ["shop", "store"]))).toEqual(["shop", "store"]);
  });

  it("matches regardless of case, spacing or separators", () => {
    expect(visibleTags(at("tavern", ["Tavern"]))).toEqual([]);
    expect(visibleTags(at("tavern", ["  TAVERN  "]))).toEqual([]);
    expect(visibleTags(at("wilderness", ["Wilderness"]))).toEqual([]);
  });

  it("leaves everything else alone", () => {
    const tags = ["north", "frozen", "ten-towns", "reghed"];
    expect(visibleTags(at("town", tags))).toEqual(tags);
  });

  it("handles a place with no tags", () => {
    expect(visibleTags(at("city", []))).toEqual([]);
  });

  it("does not collapse duplicates that are not the type", () => {
    // Deduplication is a different concern and not this function's job.
    expect(visibleTags(at("city", ["port", "port"]))).toEqual(["port", "port"]);
  });
});

describe("tagRestatesType", () => {
  it("is true only for the matching type", () => {
    expect(tagRestatesType("tavern", "tavern")).toBe(true);
    expect(tagRestatesType("tavern", "building")).toBe(false);
    expect(tagRestatesType("inn", "tavern")).toBe(false);
  });
});
