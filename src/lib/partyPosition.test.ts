import { describe, it, expect } from "vitest";
import { effectiveLocationId } from "@/lib/partyPosition";

const PARTY_LOCATION = "78600000-0000-4000-8000-000000000020";
const OVERRIDE_LOCATION = "78600000-0000-4000-8000-000000000021";

describe("effectiveLocationId", () => {
  it("a member with no override is wherever the party is", () => {
    expect(effectiveLocationId({ current_location_id: null }, PARTY_LOCATION)).toBe(PARTY_LOCATION);
  });

  it("a member with an override is where the override says", () => {
    expect(effectiveLocationId({ current_location_id: OVERRIDE_LOCATION }, PARTY_LOCATION)).toBe(
      OVERRIDE_LOCATION,
    );
  });

  it("moving the party moves the follower, with no write to their row", () => {
    // Same follower, the campaign's location changes underneath them.
    expect(effectiveLocationId({ current_location_id: null }, OVERRIDE_LOCATION)).toBe(OVERRIDE_LOCATION);
  });

  it("a member who stayed behind is not dragged along when the party moves", () => {
    // The override wins regardless of where the campaign moves to.
    expect(effectiveLocationId({ current_location_id: OVERRIDE_LOCATION }, PARTY_LOCATION)).toBe(
      OVERRIDE_LOCATION,
    );
  });

  it("is null when neither the member nor the campaign has a location", () => {
    // Not coerced to a default location — "nobody knows where the party is"
    // is the correct answer here, not an absent value to paper over.
    expect(effectiveLocationId({ current_location_id: null }, null)).toBeNull();
  });
});
