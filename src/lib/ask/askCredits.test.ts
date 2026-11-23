import { describe, expect, it } from "vitest";
import { creditsText } from "./askCredits";

describe("creditsText", () => {
  // Bug caught: the quote card and the confirmed line said "1 credits".
  it("is singular for exactly one", () => {
    expect(creditsText(1)).toBe("1 credit");
    expect(creditsText(0)).toBe("0 credits");
    expect(creditsText(3)).toBe("3 credits");
  });
});
