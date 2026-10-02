import { describe, expect, it } from "vitest";
import { normalizeEntityName } from "./entityName";

describe("normalizeEntityName", () => {
  it("de-pluralises the trailing word and drops a leading article", () => {
    // The SQL migration's own worked example.
    expect(normalizeEntityName("The Giant Rats")).toBe("giant rat");
  });

  it("de-pluralises the head noun of an 'X of Y' name, not the tail", () => {
    expect(normalizeEntityName("Potions of Healing")).toBe("potion of healing");
  });

  it("returns null for whitespace-only input", () => {
    expect(normalizeEntityName("   ")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(normalizeEntityName("")).toBeNull();
  });

  it("lowercases and trims", () => {
    expect(normalizeEntityName("  Waterdeep  ")).toBe("waterdeep");
  });

  it("collapses internal whitespace runs to one space", () => {
    expect(normalizeEntityName("Giant   Rat")).toBe("giant rat");
  });

  it("drops 'a', 'an' or 'the' only as a leading whole word", () => {
    expect(normalizeEntityName("A Kobold")).toBe("kobold");
    expect(normalizeEntityName("An Owlbear")).toBe("owlbear");
    expect(normalizeEntityName("The Blue Clam")).toBe("blue clam");
    // "answer" starts with "an" but has no whitespace after it, so the article
    // rule must not fire mid-word.
    expect(normalizeEntityName("Answer")).toBe("answer");
  });

  it("does not de-pluralise a word shorter than three letters", () => {
    // Guards the {3,} quantifier: a two-letter word ending in "s" is left
    // alone rather than mangled into a one-letter stub.
    expect(normalizeEntityName("Gas")).toBe("gas");
  });

  it("makes 'Blue Clam' and 'The blue clam' meet at the same key", () => {
    // The bug this replaces `findByName`'s old lowercase+trim rule to fix
    // (see importPlan.ts): the extracted heading carried no article at all.
    expect(normalizeEntityName("Blue Clam")).toBe(normalizeEntityName("The blue clam"));
  });

  it("leaves a name with no article and no trailing plural unchanged but lowercased", () => {
    expect(normalizeEntityName("Waterdeep")).toBe("waterdeep");
  });

  // The cases below are the ones a real chapter missed on 2 Oct 2026: a book
  // typesets punctuation a DM types differently, or not at all. Each expected
  // key is what `private.normalize_entity_name` returns for the same input.
  it("makes a typeset apostrophe and a typed one meet at the same key", () => {
    expect(normalizeEntityName("Dougan’s Hole")).toBe("dougans hole");
    expect(normalizeEntityName("Dougan's Hole")).toBe("dougans hole");
  });

  it("makes a hyphenated name and its spaced form meet at the same key", () => {
    expect(normalizeEntityName("Ten-Towns")).toBe("ten town");
    expect(normalizeEntityName("Ten Towns")).toBe("ten town");
    expect(normalizeEntityName("Old Nerrik Two-Boot")).toBe("old nerrik two boot");
  });

  it("keys a keyed room or a parenthesised variant on its words alone", () => {
    expect(normalizeEntityName("L5. Garagai’s Icy Tomb")).toBe("l5 garagais icy tomb");
    expect(normalizeEntityName("Potion of Healing (Greater)")).toBe("potion of healing greater");
  });

  it("keeps a plus sign, which tells one magic item from another", () => {
    expect(normalizeEntityName("+1 Longsword")).toBe("+1 longsword");
  });

  it("returns null for a name that is nothing but punctuation", () => {
    expect(normalizeEntityName("???")).toBeNull();
  });
});
