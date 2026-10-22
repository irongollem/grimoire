import { describe, expect, it } from "vitest";
import {
  checkRelation,
  draftKinFor,
  existingWord,
  flipRelation,
  updateFor,
  yearsAfter,
} from "@/components/kinship/addRelative";
import { buildKinGraph } from "@/lib/kinship/graph";
import { kinInsertFor } from "@/lib/kinship/keys";
import { edge, k, person } from "@/components/kinship/testGraph";

const people = [
  person("old", "Old Bren", 1428),
  person("mum", "Maera", 1431),
  person("me", "Brenna", 1459),
  person("bro", "Tomas", 1462),
  person("stranger", "Hale", null),
  person("young", "Pip", 1488),
  person("late", "Lorn", 1500),
];
const graph = buildKinGraph(people, [
  edge("1", "old", "me", "parent"),
  edge("2", "mum", "me", "parent"),
  edge("3", "old", "bro", "parent"),
  edge("4", "me", "young", "parent"),
]);

describe("checkRelation", () => {
  it("accepts a plain new pair", () => {
    expect(checkRelation(graph, k("me"), "parent", k("stranger"))).toEqual({ kind: "ok" });
  });

  it("flags a parent born after the child, whichever way the sentence runs", () => {
    // Brenna (1459) as the Parent of Old Bren (1428)
    expect(checkRelation(graph, k("me"), "parent", k("old"))).toMatchObject({ kind: "existing" });
    expect(checkRelation(graph, k("late"), "parent", k("mum"))).toEqual({ kind: "dates", parentBorn: 1500, childBorn: 1431 });
    // Same pair as a Child of: Mum (1431) as the child of Lorn (1500)
    expect(checkRelation(graph, k("mum"), "child", k("late"))).toEqual({ kind: "dates", parentBorn: 1500, childBorn: 1431 });
  });

  it("says siblings are implied by shared parents and names them", () => {
    expect(checkRelation(graph, k("me"), "sibling", k("bro"))).toEqual({ kind: "implied-sibling", sharedParents: [k("old")] });
  });

  it("reports the link a pair already has, and whether it is the same one", () => {
    const parentOfChild = checkRelation(graph, k("me"), "parent", k("young"));
    expect(parentOfChild).toMatchObject({ kind: "existing", same: true });
    const swapped = checkRelation(graph, k("me"), "child", k("young"));
    expect(swapped).toMatchObject({ kind: "existing", same: false });
    expect(checkRelation(graph, k("me"), "spouse", k("young"))).toMatchObject({ kind: "existing", same: false });
  });

  it("refuses a loop", () => {
    expect(checkRelation(graph, k("young"), "parent", k("old"))).toEqual({ kind: "cycle" });
    expect(checkRelation(graph, k("old"), "child", k("young"))).toEqual({ kind: "cycle" });
  });
});

describe("helpers", () => {
  it("flips only parent and child", () => {
    expect(flipRelation("parent")).toBe("child");
    expect(flipRelation("child")).toBe("parent");
    expect(flipRelation("spouse")).toBe("spouse");
  });

  it("drafts the inverse: the subject a Parent of means the new NPC is their child", () => {
    expect(draftKinFor("parent")).toBe("child");
    expect(draftKinFor("child")).toBe("parent");
    expect(draftKinFor("spouse")).toBe("spouse");
    expect(draftKinFor("sibling")).toBe("sibling");
    expect(draftKinFor("former_spouse")).toBeNull();
    expect(draftKinFor("relative")).toBeNull();
  });

  it("puts the gap in words", () => {
    expect(yearsAfter(1459, 1428)).toBe("31 years after");
    expect(yearsAfter(1429, 1428)).toBe("1 year after");
    expect(yearsAfter(1428, 1428)).toBe("the same year as");
  });

  it("names the other end of an existing link", () => {
    const link = edge("x", "me", "young", "parent");
    expect(existingWord(link, k("me"))).toBe("child");
    expect(existingWord(link, k("young"))).toBe("parent");
    expect(existingWord(edge("y", "a", "b", "former_spouse"), k("a"))).toBe("former spouse");
  });

  it("builds the update columns from the insert row and clears needs_sorting", () => {
    const row = kinInsertFor(k("me"), "parent", k("young"), { parent_role: "mother", adoptive: true, note: "n" });
    expect(updateFor(row)).toMatchObject({
      from_npc_id: "me",
      to_npc_id: "young",
      kind: "parent",
      parent_role: "mother",
      adoptive: true,
      note: "n",
      needs_sorting: false,
    });
  });
});
