import { describe, expect, it } from "vitest";
import { ABOUT_MAX, alreadyRecorded, NAME_MAX, parseIntroduction } from "./introduce";

describe("parseIntroduction", () => {
  it("takes a name and what is true of them, known to the player and not here unless said otherwise", () => {
    expect(parseIntroduction({ name: " Master Floret ", about: "Bought Rosie as a child on the Old Buy-Floor." })).toEqual({
      ok: true,
      value: { replaces: null, name: "Master Floret", about: "Bought Rosie as a child on the Old Buy-Floor.", occupation: null, here: false, known: true },
    });
  });

  // Bug caught: someone the narrator means to keep hidden shown to the player among the people they know.
  it("keeps a person hidden only when the narrator says so", () => {
    const hidden = parseIntroduction({ name: "The Buyer", about: "Watches the house.", known: false });
    expect(hidden.ok && hidden.value.known).toBe(false);
  });

  // Bug caught: a nameless or empty record written into the campaign.
  it.each([
    ["no name", { about: "Someone." }],
    ["a blank name", { name: "  ", about: "Someone." }],
    ["nothing about them", { name: "Floret" }],
    ["a name past its ceiling", { name: "x".repeat(NAME_MAX + 1), about: "Someone." }],
    ["a whole biography", { name: "Floret", about: "x".repeat(ABOUT_MAX + 1) }],
    ["here that is not a yes or no", { name: "Floret", about: "Someone.", here: "yes" }],
  ])("refuses %s", (_what, input) => {
    expect(parseIntroduction(input).ok).toBe(false);
  });
});

describe("alreadyRecorded", () => {
  const found = [{ id: "n1", shownName: "Master Floret" }, { id: "n2", shownName: "Floret the Younger" }];

  // Bug caught: a second Master Floret made every time the name comes up again.
  it("finds the record that carries the name, whatever the capitals", () => {
    expect(alreadyRecorded("master floret", found)).toEqual(found[0]);
  });

  // Bug caught: "Floret" refused because a longer name contains it, so a new person can never share part of a name.
  it("is not put off by a name that only contains it", () => {
    expect(alreadyRecorded("Floret", found)).toBeNull();
  });
});
