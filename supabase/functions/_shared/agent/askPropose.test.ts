import { describe, expect, it, vi } from "vitest";
import { ASK_GENERATORS } from "./askContract.ts";
import { checkProposal, generatorsFor } from "./askPropose.ts";

const ID = "00000000-0000-4000-8000-0000000000f1";
const found = async () => ({ name: "Harl" });
const none = async () => null;
const five = { fiveE: true, loadTarget: found };

describe("checkProposal", () => {
  it("accepts a generator of the contract with its concept and inputs", async () => {
    const out = await checkProposal({ generator: "npc", concept: "a baker who lies", inputs: { name: "Mara", age: 41 } }, five);
    expect(out).toEqual({ ok: true, proposal: { generator: "npc", concept: "a baker who lies", inputs: { name: "Mara", age: 41 } }, dropped: [] });
  });

  it("refuses a generator the contract does not list, and says which ones it may choose", async () => {
    const out = await checkProposal({ generator: "wish", concept: "x" }, five);
    expect(out).toMatchObject({ ok: false });
    expect((out as { error: string }).error).toContain("npc");
  });

  it("refuses a 5e generator where the campaign plays no 5e system, and offers it where it does", async () => {
    expect(await checkProposal({ generator: "monster", concept: "a bog thing" }, { fiveE: false, loadTarget: found })).toMatchObject({ ok: false });
    expect(await checkProposal({ generator: "monster", concept: "a bog thing" }, five)).toMatchObject({ ok: true });
    expect(generatorsFor(false).some((g) => g.fiveE === true)).toBe(false);
    expect(generatorsFor(true)).toHaveLength(ASK_GENERATORS.length);
  });

  it("needs a concept", async () => {
    expect(await checkProposal({ generator: "npc", concept: "   " }, five)).toMatchObject({ ok: false });
  });

  it("drops input keys the generator does not take, and values of the wrong type, range or enum", async () => {
    const out = await checkProposal({
      generator: "monster",
      concept: "x",
      inputs: { challenge_rating: "3", size: "colossal", image: "yes", secret_flag: true, monster_type: "beast" },
    }, five);
    expect(out).toMatchObject({ ok: true, proposal: { inputs: { challenge_rating: "3", monster_type: "beast" } } });
    expect((out as { dropped: string[] }).dropped.sort()).toEqual(["image", "secret_flag", "size"]);
  });

  it("drops an id input that is not a uuid, so a made-up id never reaches the quote", async () => {
    const out = await checkProposal({ generator: "npc", concept: "x", inputs: { location_id: "the mill", faction_id: ID } }, five);
    expect(out).toMatchObject({ ok: true, proposal: { inputs: { faction_id: ID } } });
  });

  it("keeps the links an NPC can be given (related person, relation word, other parent, role) and drops a word that is not one", async () => {
    const ok = await checkProposal({
      generator: "npc", concept: "x",
      inputs: { related_npc_id: ID, relation: "betrayed_by", related_pc_id: ID, second_parent_id: ID, faction_role: "Spy" },
    }, five);
    expect(ok).toMatchObject({ ok: true, dropped: [], proposal: { inputs: { related_npc_id: ID, relation: "betrayed_by", related_pc_id: ID, second_parent_id: ID, faction_role: "Spy" } } });
    const bad = await checkProposal({ generator: "npc", concept: "x", inputs: { related_npc_id: "Perf the smuggler", relation: "cousin" } }, five);
    expect((bad as { dropped: string[] }).dropped.sort()).toEqual(["related_npc_id", "relation"]);
  });

  it("keeps every link id of the other generators that can tie into the campaign, and drops a name given in its place", async () => {
    const links: [string, string][] = [
      ["faction", "leader_npc_id"], ["faction", "headquarters_id"], ["location", "parent_id"], ["location", "keeper_npc_id"],
      ["deity", "pantheon_id"], ["recipe", "output_item_id"], ["encounter", "location_id"],
    ];
    for (const [generator, key] of links) {
      const kept = await checkProposal({ generator, concept: "x", inputs: { [key]: ID } }, five);
      expect(kept, `${generator}.${key}`).toMatchObject({ ok: true, proposal: { inputs: { [key]: ID } } });
      const named = await checkProposal({ generator, concept: "x", inputs: { [key]: "Thornkeep" } }, five);
      expect((named as { dropped: string[] }).dropped, `${generator}.${key} by name`).toEqual([key]);
    }
  });

  it("drops an integer out of the generator's range", async () => {
    const out = await checkProposal({ generator: "spell", concept: "x", inputs: { level: 12 } }, five);
    expect((out as { proposal: { inputs: object } }).proposal.inputs).toEqual({});
  });

  it("needs a target for a generator that works on an existing record", async () => {
    expect(await checkProposal({ generator: "portrait", concept: "x" }, five)).toMatchObject({ ok: false });
  });

  it("refuses a target of a kind the generator does not list", async () => {
    const out = await checkProposal({ generator: "portrait", concept: "x", target: { type: "quest", id: ID } }, five);
    expect(out).toMatchObject({ ok: false });
  });

  it("refuses a target that is not a record of the campaign, with the same answer as one that does not exist", async () => {
    const loadTarget = vi.fn(none);
    const out = await checkProposal({ generator: "portrait", concept: "x", target: { type: "npc", id: ID } }, { fiveE: true, loadTarget });
    expect(out).toMatchObject({ ok: false });
    expect(loadTarget).toHaveBeenCalledWith("npc", ID);
  });

  it("names the target by the name the campaign has for it, not the model's", async () => {
    const out = await checkProposal({ generator: "portrait", concept: "x", target: { type: "npc", id: ID, name: "Impostor" } }, five);
    expect(out).toMatchObject({ ok: true, proposal: { target: { type: "npc", id: ID, name: "Harl" } } });
  });

  it("does not look up a target for a generator that takes none", async () => {
    const loadTarget = vi.fn(found);
    const out = await checkProposal({ generator: "npc", concept: "x", target: { type: "npc", id: ID } }, { fiveE: true, loadTarget });
    expect(loadTarget).not.toHaveBeenCalled();
    expect((out as { proposal: object }).proposal).not.toHaveProperty("target");
  });
});
