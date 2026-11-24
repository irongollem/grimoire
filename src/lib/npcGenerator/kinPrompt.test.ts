import { describe, expect, it } from "vitest";
import type { KinLink } from "@/types/kinship.types";
import { kinCardInputs, kinPromptLine, onlySpouseOf, parseKinQueryKey } from "./kinPrompt";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

function spouse(a: string, b: string): KinLink {
  return {
    id: `l-${a}-${b}`, user_id: "u", campaign_id: "c", from_npc_id: a, from_party_member_id: null,
    to_npc_id: b, to_party_member_id: null, kind: "spouse", parent_role: null, adoptive: false,
    note: "", needs_sorting: false, created_at: "", updated_at: "",
  };
}

describe("kinPromptLine", () => {
  it("names both parents with birth years and current ages", () => {
    expect(
      kinPromptLine("child", [{ name: "Brenna Ashe", bornYear: 1459, species: null }, { name: "Corwin Ashe", bornYear: 1456, species: null }], 1495),
    ).toBe(
      "The new NPC is the child of Brenna Ashe (born 1459, 36 now) and Corwin Ashe (born 1456, 39 now). The current year is 1495. Give an age that fits. Unless the request says otherwise, they are of the same people as their blood kin.",
    );
  });

  it("leaves out what is unknown", () => {
    expect(kinPromptLine("spouse", [{ name: "Pip", bornYear: null, species: null }], null)).toBe(
      "The new NPC is the spouse of Pip. Give an age that fits.",
    );
    expect(kinPromptLine("parent", [{ name: "Pip", bornYear: 1490, species: null }], null)).toContain("Pip (born 1490)");
  });

  // Bug caught (live run, 23 Nov 2026): a halfling innkeeper's younger sister was made human, because the line
  // named the relative but never their people.
  it("names the relative's people, and keeps blood kin of it while a spouse may differ", () => {
    const sibling = kinPromptLine("sibling", [{ name: "Perf Innkeeper", bornYear: null, species: "Halfling" }], null);
    expect(sibling).toContain("Perf Innkeeper (Halfling)");
    expect(sibling).toContain("same people as their blood kin");
    expect(kinPromptLine("spouse", [{ name: "Perf Innkeeper", bornYear: null, species: "Halfling" }], null)).not.toContain("same people");
  });
});

describe("onlySpouseOf", () => {
  it("finds a single spouse from either end", () => {
    const key = `npc:${id(1)}` as const;
    expect(onlySpouseOf([spouse(id(1), id(2))], key)).toBe(`npc:${id(2)}`);
    expect(onlySpouseOf([spouse(id(2), id(1))], key)).toBe(`npc:${id(2)}`);
  });

  it("does not mistake a parent link for a spouse", () => {
    const key = `npc:${id(1)}` as const;
    const parent: KinLink = { ...spouse(id(1), id(3)), kind: "parent", parent_role: "mother" };
    expect(onlySpouseOf([parent, spouse(id(1), id(2))], key)).toBe(`npc:${id(2)}`);
  });

  it("gives nothing for none or several", () => {
    const key = `npc:${id(1)}` as const;
    expect(onlySpouseOf([], key)).toBeNull();
    expect(onlySpouseOf([spouse(id(1), id(2)), spouse(id(3), id(1))], key)).toBeNull();
  });
});

describe("parseKinQueryKey", () => {
  it("accepts npc and pc keys only", () => {
    expect(parseKinQueryKey(`npc:${id(1)}`)).toBe(`npc:${id(1)}`);
    expect(parseKinQueryKey(`pc:${id(1)}`)).toBe(`pc:${id(1)}`);
    expect(parseKinQueryKey("faction:x")).toBeNull();
    expect(parseKinQueryKey("npc:abc")).toBeNull();
    expect(parseKinQueryKey(undefined)).toBeNull();
  });
});

describe("kinCardInputs", () => {
  // Bug caught: the "Add relative" link opening the card with the relative on the wrong side (an NPC read as a character) or with no word.
  it("names the relative, the word, and for a child the other parent", () => {
    expect(kinCardInputs({ kin: "child", of: `npc:${id(1)}`, also: `pc:${id(2)}` })).toEqual({ related_npc_id: id(1), relation: "child", second_parent_id: id(2) });
    expect(kinCardInputs({ kin: "sibling", of: `pc:${id(1)}` })).toEqual({ related_pc_id: id(1), relation: "sibling" });
  });

  // Bug caught: a second parent filled in for a spouse, who has none.
  it("ignores `also` unless the new person is a child", () => {
    expect(kinCardInputs({ kin: "spouse", of: `npc:${id(1)}`, also: `npc:${id(2)}` })).toEqual({ related_npc_id: id(1), relation: "spouse" });
  });

  // Bug caught: a stray or hand-edited link opening a card tied to nobody.
  it("is null for a link that does not name a relative", () => {
    expect(kinCardInputs({ kin: "child" })).toBeNull();
    expect(kinCardInputs({ kin: "cousin", of: `npc:${id(1)}` })).toBeNull();
    expect(kinCardInputs({ kin: "child", of: "npc:abc" })).toBeNull();
  });
});
