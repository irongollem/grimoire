import { describe, expect, it } from "vitest";
import { parseSetRight } from "./hitPoints";

const sheet = { current: 0, max: 27 };

describe("parseSetRight", () => {
  // #1021 row 23: "she was only knocked out" is a character back on her feet. Bug caught: the correction unable
  // to bring a character up from 0 without a roll, so the death the player overruled stands on the sheet.
  it("puts the hit points where the corrected story has them, with no roll", () => {
    const up = parseSetRight({ hit_points: 4, why: "Only knocked out, not killed" }, { hitPoints: sheet });
    expect(up).toMatchObject({ ok: true, value: { change: "heal", after: 4, rolled: 4, max: 27, used: null } });
    const down = parseSetRight({ hit_points: 3, why: "The fall did hurt" }, { hitPoints: { current: 20, max: 27 } });
    expect(down).toMatchObject({ ok: true, value: { change: "harm", after: 3, rolled: 17 } });
  });

  // Bug caught: a correction used to hand out hit points past the sheet's most, or taken with a number that is
  // not one ("lots"), or with no word of why for the player to read.
  it("keeps to the sheet's most and refuses what is not a whole number or has no reason", () => {
    expect(parseSetRight({ hit_points: 90, why: "Fully healed" }, { hitPoints: sheet })).toMatchObject({ ok: true, value: { after: 27 } });
    expect(parseSetRight({ hit_points: -3, why: "x" }, { hitPoints: sheet }).ok).toBe(false);
    expect(parseSetRight({ hit_points: 4.5, why: "x" }, { hitPoints: sheet }).ok).toBe(false);
    expect(parseSetRight({ hit_points: 4, why: " " }, { hitPoints: sheet }).ok).toBe(false);
  });

  // Bug caught: a "change" to where they already stand filed and shown to the player as healing by 0.
  it("changes nothing when they already stand there, or have no hit points on their sheet", () => {
    expect(parseSetRight({ hit_points: 0, why: "Still down" }, { hitPoints: sheet }).ok).toBe(false);
    expect(parseSetRight({ hit_points: 4, why: "Up" }, { hitPoints: null }).ok).toBe(false);
  });
});
