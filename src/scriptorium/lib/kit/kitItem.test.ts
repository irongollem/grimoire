import { describe, expect, it } from "vitest";
import { dropCaption, parseKitItem } from "./kitItem";

describe("parseKitItem", () => {
  // Fails on: a drop from outside the app (any text, a file name, other JSON) being inserted into the book.
  it.each([
    ["not json"],
    ["null"],
    ['"block"'],
    ['{"kind":"block"}'],
    ['{"kind":"block","label":""}'],
    ['{"kind":"entity","entityType":"dragon","entityId":"1","name":"x"}'],
    ['{"kind":"entity","entityType":"npc","entityId":"","name":"x"}'],
    ['{"kind":"art","src":""}'],
    ['{"kind":"other"}'],
  ])("refuses %s", (raw) => {
    expect(parseKitItem(raw)).toBeNull();
  });

  it("reads the three shapes the kit sends", () => {
    expect(parseKitItem('{"kind":"block","label":"Table"}')).toEqual({ kind: "block", label: "Table" });
    expect(parseKitItem('{"kind":"entity","entityType":"quest","entityId":"q1","name":"The Locked Door"}')).toEqual({
      kind: "entity",
      entityType: "quest",
      entityId: "q1",
      name: "The Locked Door",
    });
    expect(parseKitItem('{"kind":"art","src":"https://x/y.png"}')).toEqual({ kind: "art", src: "https://x/y.png" });
  });

  it("captions the drop line the way frame 13 does", () => {
    expect(dropCaption({ kind: "block", label: "Descriptive (Read-Aloud)" })).toBe("Drop: Read-aloud");
    expect(dropCaption({ kind: "block", label: "Vertical Spacer \u2014 S (8 px)" })).toBe("Drop: Vertical Spacer \u2014 S (8 px)");
    expect(dropCaption({ kind: "entity", entityType: "npc", entityId: "n", name: "Rosie Sugarfoot" })).toBe("Drop: NPC Rosie Sugarfoot");
  });
});
