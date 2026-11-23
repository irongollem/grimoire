import { describe, expect, it } from "vitest";
import { typeChoices } from "@/lib/worldLinks/connections";
import { linkChipLabel, linksContextLine, sameLink, type GeneratorLink } from "./generatorLinks";

const link = (kind: "deity" | "npc", key: string, subjectIsFrom: boolean, name = "Auril", id = "d1"): GeneratorLink => ({
  kind, id, name, choice: typeChoices("npc", kind).find((c) => c.key === key && c.subjectIsFrom === subjectIsFrom)!,
});

describe("generator links", () => {
  it("words a chip and the model's line from the new record's side", () => {
    expect(linkChipLabel(link("deity", "worships", true))).toBe("Worships · Auril");
    expect(linksContextLine([link("deity", "worships", true), link("npc", "mentor_of", false, "Brenna", "n1")])).toBe("Ties: worships Auril; apprentice of Brenna");
    expect(linksContextLine([])).toBeNull();
  });

  // Bug caught: "mentor of" and "apprentice of" share a key, so a key-only match merged two opposite ties.
  it("tells two directions of one type apart", () => {
    expect(sameLink(link("npc", "mentor_of", true, "B", "n1"), link("npc", "mentor_of", false, "B", "n1"))).toBe(false);
    expect(sameLink(link("npc", "mentor_of", true, "B", "n1"), link("npc", "mentor_of", true, "B", "n1"))).toBe(true);
  });
});
