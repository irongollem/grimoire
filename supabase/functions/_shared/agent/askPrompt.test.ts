import { describe, expect, it } from "vitest";
import { ASK_GENERATORS } from "./askContract.ts";
import { askState, askSystem } from "./askPrompt.ts";
import { systemWithSummary } from "./transcript.ts";

describe("askSystem", () => {
  it("names every generator of the contract, so one added there is never missing from what the model may choose", () => {
    const system = askSystem({ campaignName: "Kind Country", fiveE: true });
    for (const g of ASK_GENERATORS) expect(system).toContain(`- ${g.id}:`);
  });

  it("leaves the 5e generators out where the campaign plays no 5e system", () => {
    const system = askSystem({ campaignName: "Kind Country", fiveE: false });
    expect(system).not.toContain("- monster:");
    expect(system).toContain("- npc:");
  });

  it("is byte-identical turn to turn, and the summary only follows it, so the provider's prompt cache holds", () => {
    const a = askSystem({ campaignName: "Kind Country", fiveE: true });
    expect(askSystem({ campaignName: "Kind Country", fiveE: true })).toBe(a);
    expect(systemWithSummary(a, "The party met Harl.").startsWith(a)).toBe(true);
    expect(systemWithSummary(a, null)).toBe(a);
  });

  it("never lets the model say it created something, and keeps prices out of its questions", () => {
    const system = askSystem({ campaignName: "c", fiveE: true });
    expect(system).toMatch(/Never say you created/);
    expect(system).toMatch(/never name a price/);
  });

  it("holds no em-dash and nothing that changes from turn to turn", () => {
    expect(askSystem({ campaignName: "c", fiveE: true })).not.toContain("—");
  });
});

describe("askState", () => {
  it("says where the DM is and names the open record by the name the campaign has for it", () => {
    const text = askState({ context: { route: "/npcs/n1", record: { type: "npc", id: "n1" } }, recordName: "Harl" });
    expect(text).toContain("/npcs/n1");
    expect(text).toContain('"Harl"');
  });

  it("says nothing of a record that was not found in the campaign", () => {
    const text = askState({ context: { route: "/npcs/n1", record: { type: "npc", id: "n1" } }, recordName: null });
    expect(text).not.toContain("n1\"");
    expect(text).not.toContain("open:");
  });

  it("has a sentence for a DM with no context", () => {
    expect(askState({ context: undefined, recordName: null })).toContain("no record open");
  });
});
