import { describe, expect, it } from "vitest";
import type { StandIn } from "../_shared/agent/standIn";
import { mentionsName, namesAsKnown, namesInLine, namesOfPartyMember, properNamesIn, unpromptedLeft } from "./unprompted";

const wren = { id: "wren", name: "Wren", about: "A ferryman's daughter who sails from Saltmarsh Ferry and fears the Gloamwood." } as StandIn;

describe("properNamesIn", () => {
  it("takes capitalised words inside a sentence, as runs and singly, and not the sentence's first word", () => {
    expect(properNamesIn("Sam owes the smith in Saltmarsh Ferry. Aye, he does.")).toEqual(["Saltmarsh", "Ferry", "Saltmarsh Ferry"]);
  });
});

describe("mentionsName", () => {
  it("is case-insensitive and whole-word", () => {
    expect(mentionsName("what about SALTMARSH?", "Saltmarsh")).toBe(true);
    expect(mentionsName("wrenches", "Wren")).toBe(false);
  });
});

describe("namesOfPartyMember", () => {
  // Bug caught (seen live, 24 Nov 2026): a sheet name with a nickname never matched the name the table uses.
  it("gives the whole name, the nickname between quotes and each capitalised word", () => {
    expect(namesOfPartyMember('Rosetta "Rosie" Vermeil')).toEqual(['Rosetta "Rosie" Vermeil', "Rosie", "Rosetta", "Vermeil"]);
    expect(namesOfPartyMember("Toddy Bellows")).toEqual(["Toddy Bellows", "Toddy", "Bellows"]);
  });
});

describe("namesInLine", () => {
  const known = { partyNames: ["Folio"] };
  // Bug caught (seen live, 24 Nov 2026): the party matched only by the full sheet name, so "Rosie" drew no one.
  it("finds a party member by the nickname the table uses", () => {
    expect(namesInLine({ line: "has anyone checked on Rosie?", character: wren, memories: [], known: { partyNames: ['Rosetta "Rosie" Vermeil'] } }))
      .toEqual(["Rosie"]);
  });

  it("finds the party, memories and sheet, but never the character's own name", () => {
    expect(namesInLine({ line: "folio and Wren went to the gloamwood", character: wren, memories: [], known }))
      .toEqual(["Folio", "Gloamwood"]);
  });
});

describe("unpromptedLeft", () => {
  it("is what is left of three", () => {
    expect([0, 2, 3, 5].map(unpromptedLeft)).toEqual([3, 1, 0, 0]);
  });
});

// Bug caught (seen live, 24 Nov 2026): the judge given a bare "Rosie" scored lines about a companion 0.29 to 0.40.
describe("namesAsKnown", () => {
  it("tells a companion from a name in the character's own memories", () => {
    expect(namesAsKnown(["Rosie", "Gloamwood"], { partyNames: ['Rosetta "Rosie" Vermeil'] }))
      .toEqual(["Rosie (a companion who travels with them in their party)", "Gloamwood (named in their own memories or story)"]);
  });
});
