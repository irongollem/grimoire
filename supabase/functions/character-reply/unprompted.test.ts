import { describe, expect, it } from "vitest";
import type { StandIn } from "../_shared/agent/standIn";
import { mentionsName, namesInLine, properNamesIn, unpromptedLeft } from "./unprompted";

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

describe("namesInLine", () => {
  const known = { partyNames: ["Folio"], questTitles: ["The Drowned Ledger"] };
  it("finds the party, quests, memories and sheet, but never the character's own name", () => {
    expect(namesInLine({ line: "folio and Wren went to the gloamwood, about the drowned ledger", character: wren, memories: [], known }))
      .toEqual(["Folio", "The Drowned Ledger", "Gloamwood"]);
  });
});

describe("unpromptedLeft", () => {
  it("is what is left of three", () => {
    expect([0, 2, 3, 5].map(unpromptedLeft)).toEqual([3, 1, 0, 0]);
  });
});
