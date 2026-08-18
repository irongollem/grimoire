import { describe, it, expect } from "vitest";
import {
  fieldsForFirstReveal,
  NPC_DEFAULT_REVEAL_FIELDS,
  NPC_PLAYER_FIELDS,
} from "./npcDisplay";

describe("fieldsForFirstReveal", () => {
  it("seeds name + portrait when the DM has never chosen any", () => {
    // Revealing an NPC with no fields ticked puts a blank card in the players'
    // portal — the reveal appears to do nothing at all.
    expect(fieldsForFirstReveal([])).toEqual([...NPC_DEFAULT_REVEAL_FIELDS]);
  });

  it("leaves an existing choice alone", () => {
    expect(fieldsForFirstReveal(["occupation"])).toEqual(["occupation"]);
  });

  it("does not re-add a default the DM removed", () => {
    // The failure this guards: a DM unticks "portrait", hides the NPC, reveals
    // it again, and the portrait is back. Re-revealing is not a fresh start.
    const chosen = ["name"];
    expect(fieldsForFirstReveal(chosen)).toEqual(["name"]);
    expect(fieldsForFirstReveal(chosen)).not.toContain("portrait");
  });

  it("copies rather than aliasing, so the caller cannot mutate the defaults", () => {
    const first = fieldsForFirstReveal([]);
    first.push("occupation");
    expect(fieldsForFirstReveal([])).toEqual([...NPC_DEFAULT_REVEAL_FIELDS]);
  });
});

describe("NPC_DEFAULT_REVEAL_FIELDS", () => {
  it("only names fields the DM can actually toggle", () => {
    // A default outside NPC_PLAYER_FIELDS would be stored on reveal and then be
    // invisible and un-untickable in every reveal control.
    const togglable = new Set<string>(NPC_PLAYER_FIELDS.map((f) => f.key));
    for (const key of NPC_DEFAULT_REVEAL_FIELDS) expect(togglable).toContain(key);
  });
});
