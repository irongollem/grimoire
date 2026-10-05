import { describe, expect, it } from "vitest";
import { stateReadScope } from "./stateReadScope";

describe("stateReadScope", () => {
  it("is just the place for a leaf room", () => {
    expect(stateReadScope("room-1", [])).toEqual(["room-1"]);
  });

  it("is empty until the children are known, so no partial read goes out first", () => {
    expect(stateReadScope("site-1", undefined)).toEqual([]);
  });

  it("adds the interior children and leaves nested sites and levels out", () => {
    const scope = stateReadScope("site-1", [
      { id: "room-a", location_type: "room" },
      { id: "yard", location_type: "grounds" },
      { id: "annex", location_type: "building" },
    ]);
    expect(scope).toEqual(["site-1", "room-a", "yard"]);
  });
});
