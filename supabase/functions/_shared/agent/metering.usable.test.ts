import { describe, expect, it } from "vitest";
import { usableCalibration } from "./metering";

describe("usableCalibration", () => {
  it("play would run unmetered on a zero, negative, null or non-finite calibration", () => {
    for (const bad of [
      { usdPerCredit: 0, margin: 2 },
      { usdPerCredit: -0.01, margin: 2 },
      { usdPerCredit: null, margin: 2 },
      { usdPerCredit: Number.POSITIVE_INFINITY, margin: 2 },
      { usdPerCredit: Number.NaN, margin: 2 },
      { usdPerCredit: 0.01, margin: 0 },
      { usdPerCredit: 0.01, margin: -1 },
      { usdPerCredit: 0.01, margin: Number.NaN },
    ]) {
      expect(usableCalibration(bad)).toBeNull();
    }
    expect(usableCalibration(null)).toBeNull();
    expect(usableCalibration({ usdPerCredit: 0.01, margin: 3 })).toEqual({ usdPerCredit: 0.01, margin: 3 });
  });
});
