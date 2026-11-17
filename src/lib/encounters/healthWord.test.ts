import { describe, expect, it } from "vitest";
import { healthWord } from "./healthWord";

// The cut points are the app's own convention (25 / 50 / 75 percent), so these cases pin the
// edge of each band: the boundary value belongs to the lower band, one hit point more to the higher.
describe("healthWord", () => {
  it("calls zero hit points Dead, and one hit point of a hundred Bloodied", () => {
    // Bug caught: a creature at 0 shown as Bloodied (<= 0 check dropped or made < 0).
    expect(healthWord(0, 100)).toBe("Dead");
    expect(healthWord(-5, 100)).toBe("Dead");
    expect(healthWord(1, 100)).toBe("Bloodied");
  });

  it("puts exactly 25 percent in Bloodied and 26 in Wounded", () => {
    // Bug caught: <= 0.25 written as < 0.25, so a quarter-health creature reads Wounded.
    expect(healthWord(25, 100)).toBe("Bloodied");
    expect(healthWord(26, 100)).toBe("Wounded");
  });

  it("puts exactly 50 percent in Wounded and 51 in Hurt", () => {
    // Bug caught: <= 0.5 written as < 0.5.
    expect(healthWord(50, 100)).toBe("Wounded");
    expect(healthWord(51, 100)).toBe("Hurt");
  });

  it("puts exactly 75 percent in Hurt and 76 in Healthy", () => {
    // Bug caught: <= 0.75 written as < 0.75, so a three-quarters creature reads Healthy.
    expect(healthWord(75, 100)).toBe("Hurt");
    expect(healthWord(76, 100)).toBe("Healthy");
  });

  it("calls a creature at full hit points Healthy", () => {
    // Bug caught: the top band missing, or max compared against itself wrongly.
    expect(healthWord(100, 100)).toBe("Healthy");
  });
});
