import { describe, expect, it } from "vitest";
import { guessKind, kindForWord, tagsFromFrontmatter } from "./kindHints";

const guess = (over: Partial<Parameters<typeof guessKind>[0]> = {}) =>
  guessKind({ frontmatter: {}, tags: [], folders: [], ...over });

describe("kindForWord", () => {
  it("matches singular, plural, spelling and separator variants", () => {
    expect(kindForWord("NPCs")).toBe("npc");
    expect(kindForWord("People")).toBe("npc");
    expect(kindForWord("Organisations")).toBe("faction");
    expect(kindForWord("Settlements")).toBe("location");
    expect(kindForWord("Non-Player Characters")).toBe("npc");
    expect(kindForWord("Treasure")).toBe("item");
    expect(kindForWord("Adventures")).toBe("quest");
  });
  it("never matches a substring", () => {
    expect(kindForWord("Cityscape")).toBeNull();
    expect(kindForWord("")).toBeNull();
  });
});

describe("guessKind precedence", () => {
  it("our own type frontmatter wins, and party members are skipped", () => {
    expect(guess({ frontmatter: { type: "faction", grimoire_id: "x" }, folders: ["NPCs"] })).toEqual({ kind: "faction", reason: "Grimoire export: faction" });
    expect(guess({ frontmatter: { type: "party_member", grimoire_id: "x" } })).toEqual({ kind: "skip", reason: "player characters are not imported" });
  });
  it("then frontmatter type/category/template, then a World Anvil template, tags, folders", () => {
    expect(guess({ frontmatter: { category: "Places" }, tags: ["npc"] }).reason).toBe("frontmatter category: Places");
    expect(guess({ templateHint: "Settlement", tags: ["npc"], folders: ["Items"] })).toEqual({ kind: "location", reason: "World Anvil template: Settlement" });
    expect(guess({ tags: ["world/faction"], folders: ["NPCs"] })).toEqual({ kind: "faction", reason: "tag: #world/faction" });
    expect(guess({ folders: ["Characters"] })).toEqual({ kind: "npc", reason: "folder: Characters" });
  });
  it("uses the nearest folder and falls back to note", () => {
    expect(guess({ folders: ["NPCs", "Waterdeep", "Items"] }).kind).toBe("item");
    expect(guess({ folders: ["NPCs", "Waterdeep"] }).kind).toBe("npc");
    expect(guess()).toEqual({ kind: "note", reason: "no kind hint found" });
  });
});

describe("tagsFromFrontmatter", () => {
  it("strips hashes, splits legacy space lists and dedupes", () => {
    expect(tagsFromFrontmatter({ tags: ["#a", "b c"], tag: "a" })).toEqual(["a", "b", "c"]);
  });
});
