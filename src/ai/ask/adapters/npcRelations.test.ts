import { describe, expect, it } from "vitest";
import { ASK_GENERATORS, NPC_RELATIONS } from "@edge-shared/agent/askContract";
import { ASSOCIATE_CHOICES, associateId } from "@/lib/npcGenerator/associate";
import { GENERATOR_KIN_RELATIONS } from "@/lib/npcGenerator/kinPrompt";
import { ASSOCIATE_WORDS, npcRelation } from "./npcRelations";

describe("npcRelation", () => {
  it("reaches every tie the page's associate picker offers, so no catalogue tie is missing from Ask", () => {
    const reached = new Set(Object.values(ASSOCIATE_WORDS));
    expect(ASSOCIATE_CHOICES.map(associateId).filter((id) => !reached.has(id))).toEqual([]);
  });

  it("lists in the contract exactly the kin words and the associate words, so the model is offered what the adapter reads", () => {
    expect([...NPC_RELATIONS].sort()).toEqual([...GENERATOR_KIN_RELATIONS, ...Object.keys(ASSOCIATE_WORDS)].sort());
    const schema = ASK_GENERATORS.find((g) => g.id === "npc")?.inputs.relation;
    expect(schema).toMatchObject({ type: "string", enum: NPC_RELATIONS });
  });

  it("reads every contract word to a page choice", () => {
    expect(NPC_RELATIONS.filter((word) => npcRelation(word) === null)).toEqual([]);
  });

  it("reads a direction from the new NPC: betrayed is the new NPC betraying, betrayed_by the reverse", () => {
    const betrayed = npcRelation("betrayed");
    const betrayedBy = npcRelation("betrayed_by");
    expect(betrayed).toMatchObject({ kind: "tie", label: "Betrayed", choice: { key: "betrayed", subjectIsFrom: true } });
    expect(betrayedBy).toMatchObject({ kind: "tie", label: "Betrayed by", choice: { key: "betrayed", subjectIsFrom: false } });
  });

  it("sends the family words to the kinship write and an unknown word nowhere", () => {
    expect(npcRelation("sibling")).toEqual({ kind: "kin", kin: "sibling", label: "Sibling of" });
    expect(npcRelation("cousin")).toBeNull();
    expect(npcRelation(null)).toBeNull();
  });
});
