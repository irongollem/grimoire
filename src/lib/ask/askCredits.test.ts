import { describe, expect, it } from "vitest";
import { NOTABLE_CREDITS, creditsText, showsPrice } from "./askCredits";

describe("creditsText", () => {
  // Bug caught: the quote card and the confirmed line said "1 credits".
  it("is singular for exactly one", () => {
    expect(creditsText(1)).toBe("1 credit");
    expect(creditsText(0)).toBe("0 credits");
    expect(creditsText(3)).toBe("3 credits");
  });
});

describe("showsPrice", () => {
  // Bug caught: the line drawn in the wrong place, so a 2-credit draft wore its price or a 3-credit one hid it
  // (maintainer, 27 Nov 2026: "if its more than just a few credits we mention it if its like 1 we dont").
  it("names a price from three credits up, and never an unknown one", () => {
    expect(NOTABLE_CREDITS).toBe(3);
    expect(showsPrice(2)).toBe(false);
    expect(showsPrice(3)).toBe(true);
    expect(showsPrice(null)).toBe(false);
  });
});
