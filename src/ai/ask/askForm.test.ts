import { describe, expect, it } from "vitest";
import { ASK_GENERATORS } from "@edge-shared/agent/askContract";
import { formRows, groupSummary, inputLabel, isShown, optionLabel, pruneHidden } from "./askForm";

const npc = ASK_GENERATORS.find((g) => g.id === "npc")!;

describe("isShown", () => {
  // Bug caught: a faction role asked for with no faction to be a role in.
  it("hides an input until the one it hangs on is set", () => {
    const role = npc.inputs.faction_role;
    expect(isShown(role, {})).toBe(false);
    expect(isShown(role, { faction_id: "  " })).toBe(false);
    expect(isShown(role, { faction_id: "x" })).toBe(true);
  });

  // Bug caught: the other parent offered for a sibling, where only a child has one.
  it("shows the other parent only for the word it names", () => {
    const parent = npc.inputs.second_parent_id;
    expect(isShown(parent, { relation: "sibling" })).toBe(false);
    expect(isShown(parent, { relation: "child" })).toBe(true);
  });

  // Bug caught: relation shown only for an NPC, so a bond to a party member could never be worded.
  it("shows the relation for either person", () => {
    const relation = npc.inputs.relation;
    expect(isShown(relation, { related_pc_id: "x" })).toBe(true);
    expect(isShown(relation, { related_npc_id: "x" })).toBe(true);
    expect(isShown(relation, {})).toBe(false);
  });
});

describe("pruneHidden", () => {
  // Bug caught: a value the DM can no longer see riding along into the quote (a faction role after the faction is cleared).
  it("drops what depends on an input that was cleared", () => {
    expect(pruneHidden(npc, { faction_role: "Spy", race: "elf" })).toEqual({ race: "elf" });
  });

  // Bug caught: only one level pruned, leaving the other parent behind once the person and then the relation are gone.
  it("follows the chain: no person, so no relation, so no other parent", () => {
    expect(pruneHidden(npc, { relation: "child", second_parent_id: "p" })).toEqual({});
  });

  it("keeps everything while the conditions hold", () => {
    const held = { related_npc_id: "n", relation: "child", second_parent_id: "p" };
    expect(pruneHidden(npc, held)).toEqual(held);
  });
});

describe("formRows", () => {
  // Bug caught: the fold rows' members scattered through the form, or the form reading in a different order than the contract.
  it("folds a group into one row where its first member stands, and leaves the rest in contract order", () => {
    const rows = formRows(npc, { faction_id: "f" });
    const names = rows.map((r) => (r.kind === "input" ? r.key : `[${r.name}]`));
    expect(names).toEqual(["name", "race", "age", "alignment", "role", "[Where they stand]", "[At the table]", "portrait", "alter_ego"]);
    const where = rows.find((r) => r.kind === "group" && r.name === "Where they stand");
    expect(where?.kind === "group" && where.members.map((m) => m.key)).toEqual(["location_id", "faction_id", "faction_role", "related_npc_id", "related_pc_id", "links"]);
  });

  // Bug caught: an empty fold row for a group whose members are all hidden.
  it("has no row for a group with nothing to show", () => {
    const gen = { ...npc, inputs: { a: { type: "string", description: "a", group: "G", when: { key: "b" } }, b: { type: "boolean", description: "b" } } } as const;
    expect(formRows(gen, {}).map((r) => (r.kind === "input" ? r.key : r.name))).toEqual(["b"]);
  });
});

describe("labels and summaries", () => {
  it("uses the contract's label, and the key with spaces only when there is none", () => {
    expect(inputLabel("faction_role", npc.inputs.faction_role)).toBe("Role in faction");
    expect(inputLabel("some_key", { type: "boolean", description: "x" })).toBe("some key");
  });

  // Bug caught: a fold row that says nothing about what is inside, so the DM opens every one to look.
  it("says what the row holds, in order, or that it holds nothing", () => {
    const members = [{ key: "faction_id" }, { key: "faction_role" }, { key: "location_id" }];
    const show = (_k: string, v: unknown) => String(v);
    expect(groupSummary(members, { faction_id: "Tidewardens", faction_role: "Envoy" }, show)).toBe("Tidewardens · Envoy");
    expect(groupSummary(members, {}, show)).toBe("Nothing set");
  });
});

// Fails if enum words reach the DM raw: "betrayed_by" on a chip, "unknown" in lower case.
describe("optionLabel", () => {
  it("reads an enum value as words, capitalised", () => {
    expect(optionLabel({ type: "string", description: "", enum: ["betrayed_by"] }, "betrayed_by")).toBe("Betrayed by");
  });
  it("prefers the contract's own word when it gives one", () => {
    expect(optionLabel({ type: "string", description: "", enum: ["creditor"], optionLabels: { creditor: "Is owed by them" } }, "creditor")).toBe("Is owed by them");
  });
});
