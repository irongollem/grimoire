import { describe, expect, it } from "vitest";
import { composerPlaceholder, stopChapterPath, stopEyebrow } from "./askWalkCopy";

const mira = { step: "backstories", memberId: "m1", memberName: "Mira" } as const;
const pip = { step: "backstories", memberId: "m2", memberName: "Pip" } as const;
const voice = { step: "voice", memberId: null, memberName: null } as const;

describe("askWalkCopy", () => {
  // Bug caught: two characters' stops both reading "Backstories" (the name dropped), or counted from 0.
  it("names a character's stop by the character and counts from one", () => {
    expect(stopEyebrow(pip, [voice, mira, pip])).toBe("Notes on Pip · 3 of 3");
    expect(stopEyebrow(voice, [voice, mira, pip])).toBe("Voice · 1 of 3");
  });

  // Bug caught: a character's link opening the bare chapter, so the DM lands on the list, not on that backstory.
  it("sends a character to their own backstory and a section to its chapter", () => {
    expect(stopChapterPath(mira)).toBe("/canon/backstories?backstory=m1");
    expect(stopChapterPath(voice)).toBe("/canon/premise");
  });

  // Bug caught: the composer keeping its generic line while the walk waits, or telling the DM to change a draft that is not there.
  it("asks for the awaited answer, else for a change to a draft, else leaves the usual line", () => {
    expect(composerPlaceholder({ awaiting: voice, drafted: false })).toMatch(/^e\.g\. Dry and warm/);
    expect(composerPlaceholder({ awaiting: null, drafted: true })).toBe("Type what to change, or keep what you like");
    expect(composerPlaceholder({ awaiting: null, drafted: false })).toBeNull();
  });
});
