import { describe, expect, it } from "vitest";
import { liftCredits, liftLabel, paintLabel, removeBackgroundLabel } from "./costLabels";

describe("cost labels", () => {
  it("Lift is priced as two pictures, Paint and Remove background as one", () => {
    // Bug: Lift quoted at one picture, so the DM is charged double what the button said.
    expect(liftCredits(3)).toBe(6);
    expect(liftLabel(3)).toBe("Lift · 6 credits");
    expect(paintLabel(3)).toBe("Paint · 3 credits");
    expect(removeBackgroundLabel(3)).toBe("Remove background · 3 credits");
  });
  it("says one credit in the singular", () => {
    expect(paintLabel(1)).toBe("Paint · 1 credit");
  });
});
