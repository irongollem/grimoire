import { describe, expect, it } from "vitest";
import { askSystem } from "./askPrompt.ts";
import { ASK_RECORD_TYPES } from "./askTools.ts";
import { ASK_VOCABULARY } from "./askVocabulary.ts";

describe("ASK_VOCABULARY", () => {
  // Bug caught: a type the readers do not take ("player", "place"), which the model would then ask `list` for and be refused.
  it("names only record types the readers take, each once", () => {
    const types = ASK_VOCABULARY.map((entry) => entry.type);
    expect(types.filter((type) => !ASK_RECORD_TYPES.includes(type))).toEqual([]);
    expect(new Set(types).size).toBe(types.length);
  });

  // Bug caught: "heroes" under both the party and the NPCs, so the list sends the model to either.
  it("gives a word to one type only, whatever its case", () => {
    const seen = new Map<string, string>();
    const twice: string[] = [];
    for (const entry of ASK_VOCABULARY) {
      for (const word of entry.words) {
        const key = word.toLowerCase();
        if (seen.has(key)) twice.push(`${word}: ${seen.get(key)} and ${entry.type}`);
        seen.set(key, entry.type);
      }
    }
    expect(twice).toEqual([]);
  });
});

describe("askSystem and the DM's own words", () => {
  const system = askSystem({ campaignName: "Kind Country", fiveE: true });
  const lineFor = (type: string) => system.split("\n").find((line) => line.startsWith(`- ${type} (`)) ?? "";

  // The incident (maintainer, 25 Nov 2026): "which champions are in this game" needed a follow-up before Ask read the party.
  it("files champions under the party's record type, not under the people the DM plays", () => {
    expect(lineFor("party_member")).toContain("champions");
    expect(lineFor("npc")).not.toContain("champions");
  });

  // Bug caught: a type added to the list but never drawn into the instructions, or drawn without its words.
  it("carries every type's words into the instructions", () => {
    const missing = ASK_VOCABULARY.flatMap((entry) => entry.words.filter((word) => !lineFor(entry.type).includes(word)).map((word) => `${entry.type}: ${word}`));
    expect(missing).toEqual([]);
  });
});
