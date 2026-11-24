import { describe, expect, it } from "vitest";
import { lineCredits, voiceCostLine } from "./voiceCost";

describe("voiceCostLine", () => {
  // Bug caught: the cheaper service's rate quoted as the price, so the player is charged four times what the
  // page said.
  it("names the dearest rate, and mentions a cheaper one when there is one", () => {
    const line = voiceCostLine({ on: true, perMinute: { elevenlabs: 10.9, inworld: 2.8 } });
    expect(line).toContain("up to 10.9 credits for a minute of speech");
    expect(line).toContain("some voices cost about 2.8");
  });

  it("names one rate plainly when only one service speaks", () => {
    expect(voiceCostLine({ on: true, perMinute: { elevenlabs: 1, inworld: null } })).toContain("about 1 credit for a minute of speech");
  });

  // Bug caught: a price shown for voices that are off, or "0 credits" for a service with no price.
  it("says nothing when voices are off or nothing is priced", () => {
    expect(voiceCostLine({ on: false, perMinute: { elevenlabs: 10.9, inworld: 2.8 } })).toBeNull();
    expect(voiceCostLine({ on: true, perMinute: { elevenlabs: null, inworld: null } })).toBeNull();
  });
});

describe("lineCredits", () => {
  // Bug caught (seen live): every voice line priced "about 1 credit" while a 200-character line cost 3.
  it("prices a line by its length at the dearest rate, rounded up, at least 1", () => {
    const rates = { on: true, perMinute: { elevenlabs: 10.9, inworld: 3 } };
    expect(lineCredits("x".repeat(200), rates)).toBe(3);
    expect(lineCredits("Hi.", rates)).toBe(1);
    expect(lineCredits("x".repeat(200), { on: false, perMinute: { elevenlabs: 10.9, inworld: null } })).toBeNull();
    expect(lineCredits("x".repeat(200), { on: true, perMinute: { elevenlabs: null, inworld: null } })).toBeNull();
  });
});

