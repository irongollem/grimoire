import { describe, expect, it } from "vitest";
import { isLocationOutOfEra } from "@/lib/locations/era";

describe("isLocationOutOfEra", () => {
  it("is never out of era when both bounds are unset", () => {
    expect(isLocationOutOfEra({ era_start: null, era_end: null }, 1495)).toBe(false);
  });

  it("is out of era before era_start", () => {
    expect(isLocationOutOfEra({ era_start: 1500, era_end: null }, 1499)).toBe(true);
    expect(isLocationOutOfEra({ era_start: 1500, era_end: null }, 1500)).toBe(false);
  });

  it("is out of era after era_end", () => {
    expect(isLocationOutOfEra({ era_start: null, era_end: 1500 }, 1501)).toBe(true);
    expect(isLocationOutOfEra({ era_start: null, era_end: 1500 }, 1500)).toBe(false);
  });

  it("is in era within a closed range", () => {
    expect(isLocationOutOfEra({ era_start: 1400, era_end: 1500 }, 1450)).toBe(false);
    expect(isLocationOutOfEra({ era_start: 1400, era_end: 1500 }, 1399)).toBe(true);
    expect(isLocationOutOfEra({ era_start: 1400, era_end: 1500 }, 1501)).toBe(true);
  });
});
