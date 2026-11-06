import { describe, expect, it } from "vitest";
import { upgradeLegacyGameSystem } from "./legacyGameSystem";

describe("upgradeLegacyGameSystem", () => {
  // Bug: a pre-#934 backup restored as 5e 2014 whatever edition it played.
  it.each([
    ["2014", "dnd5e-2014"],
    ["2024", "dnd5e-2024"],
  ])("reads an old file's %s edition as %s", (ruleset, system) => {
    expect(upgradeLegacyGameSystem({ name: "Old", ruleset })).toEqual({ name: "Old", game_system: system });
  });

  // Bug: the old key rode into the campaign insert, and the column is gone.
  it("drops the old key even when the file already names a system", () => {
    expect(upgradeLegacyGameSystem({ ruleset: "2014", game_system: "dnd5e-2024" })).toEqual({ game_system: "dnd5e-2024" });
  });

  // Bug: an unrecognised edition was guessed to be 2014.
  it("guesses no system for an edition it does not know", () => {
    expect(upgradeLegacyGameSystem({ ruleset: "3.5" })).toEqual({});
  });
});
