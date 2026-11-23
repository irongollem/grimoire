import { describe, expect, it } from "vitest";
import { LINK_KINDS } from "../worldLinkCatalogue.ts";
import { choiceForRelation, linkChoices, linkableKinds, relationWord, relationWords } from "./askLinks.ts";

describe("relation words", () => {
  it("name catalogue choices read from the new record, accents folded", () => {
    expect(relationWords("npc", "deity")).toContain("worships");
    expect(relationWords("npc", "location")).toContain("works_at");
    expect(relationWords("npc", "npc")).toContain("protege_of");
  });

  it("are unique per pair of kinds, so a word can never stand for two choices (a link written the wrong way round)", () => {
    for (const subject of LINK_KINDS) {
      for (const other of LINK_KINDS) {
        const words = relationWords(subject, other);
        expect(new Set(words).size, `${subject} to ${other}`).toBe(words.length);
      }
    }
  });

  it("keep the two directions of a person tie apart: mentor mentors, apprentice is mentored", () => {
    expect(choiceForRelation("npc", "npc", "mentor_of")).toMatchObject({ key: "mentor_of", subjectIsFrom: true });
    expect(choiceForRelation("npc", "npc", "apprentice_of")).toMatchObject({ key: "mentor_of", subjectIsFrom: false });
  });

  it("never offer kin: family has its own table and input", () => {
    expect(linkChoices("npc", "npc").some((c) => c.home === "kin")).toBe(false);
    expect(choiceForRelation("npc", "npc", "parent_of")).toBeNull();
    expect(choiceForRelation("npc", "npc", "child_of")).toBeNull();
  });

  it("resolve a word only between kinds that hold it", () => {
    expect(choiceForRelation("npc", "deity", "worships")).toMatchObject({ key: "worships" });
    expect(choiceForRelation("npc", "item", "worships")).toBeNull();
    expect(relationWord({ word: "Works at" })).toBe("works_at");
  });

  it("list only kinds a new record can be tied to", () => {
    expect(linkableKinds("npc", ["deity", "canon"])).toContain("deity");
  });
});
