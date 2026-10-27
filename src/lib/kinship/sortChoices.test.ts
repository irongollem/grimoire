import { describe, expect, it } from "vitest";
import { buildKinGraph } from "./graph";
import { buildSortRows, choicesFor, planSort, sortPatch, type SortRow } from "./sortChoices";
import type { SortChoice } from "./sortSuggestions";
import type { KinPerson } from "./graph";
import type { KinLink, PersonKey } from "@/types/kinship.types";

const person = (id: string, name: string, bornYear: number | null, isPc = false): KinPerson => ({
  key: `${isPc ? "pc" : "npc"}:${id}` as PersonKey,
  name,
  bornYear,
  diedYear: null,
  dead: false,
  isPc,
});

function link(over: Partial<KinLink> = {}): KinLink {
  return {
    id: "l1",
    user_id: "u",
    campaign_id: "c",
    from_npc_id: "a",
    from_party_member_id: null,
    to_npc_id: "b",
    to_party_member_id: null,
    kind: "relative",
    parent_role: null,
    adoptive: false,
    note: "",
    needs_sorting: true,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

const bren = person("a", "Old Bren Thane", 1428);
const brenna = person("b", "Brenna Ashe", 1459);
const row = (over: Partial<SortRow> = {}): SortRow => ({ link: link(), from: bren, to: brenna, suggestion: null, ...over });

describe("buildSortRows", () => {
  it("keeps only unsorted links whose people exist, with a suggestion", () => {
    const people = new Map<PersonKey, KinPerson>([
      [bren.key, bren],
      [brenna.key, brenna],
    ]);
    const ends = () => ({ from: bren.key, to: brenna.key });
    const rows = buildSortRows([link(), link({ id: "l2", needs_sorting: false })], ends, people);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.suggestion?.choice.relation).toBe("child");
    expect(buildSortRows([link()], () => ({ from: bren.key, to: "npc:gone" }), people)).toEqual([]);
  });
});

describe("choicesFor", () => {
  it("offers six answers and carries the suggestion's label", () => {
    const suggestion = { choice: { relation: "relative" as const, parentRole: null, label: "aunt" }, reason: "x" };
    const labels = choicesFor(row({ suggestion })).map((c) => c.label);
    expect(labels).toEqual([
      "Brenna Ashe is Old Bren Thane's parent",
      "Old Bren Thane is Brenna Ashe's parent",
      "Spouses",
      "Former spouses",
      "Siblings",
      "Relatives · aunt",
    ]);
  });
});

describe("sortPatch", () => {
  it("writes the parent as the from end when `to` is the parent", () => {
    const patch = sortPatch(row(), { relation: "parent", parentRole: "mother", label: null });
    expect(patch).toMatchObject({ kind: "parent", from_npc_id: "b", to_npc_id: "a", parent_role: "mother", needs_sorting: false, adoptive: false });
  });
  it("keeps the ends when `from` is the parent", () => {
    const patch = sortPatch(row(), { relation: "child", parentRole: null, label: null });
    expect(patch).toMatchObject({ kind: "parent", from_npc_id: "a", to_npc_id: "b" });
  });
  it("settles a spouse without touching the ends", () => {
    const patch = sortPatch(row(), { relation: "former_spouse", parentRole: null, label: null });
    expect(patch).toMatchObject({ kind: "former_spouse", needs_sorting: false });
    expect(patch).not.toHaveProperty("from_npc_id");
  });
  it("puts a relative's label in an empty note only", () => {
    const choice = { relation: "relative" as const, parentRole: null, label: "aunt" };
    expect(sortPatch(row(), choice).note).toBe("aunt");
    expect(sortPatch(row({ link: link({ note: "his aunt" }) }), choice).note).toBe("his aunt");
  });
});

describe("planSort", () => {
  const a = person("a", "Ann", null);
  const b = person("b", "Bo", null);
  const c = person("c", "Cy", null);
  const mk = (id: string, from: KinPerson, to: KinPerson): SortRow => ({
    link: link({ id }),
    from,
    to,
    suggestion: null,
  });
  // "child": `from` is the parent of `to`.
  const asParent: SortChoice = { relation: "child", parentRole: null, label: null };

  it("refuses the choice that closes a loop through earlier choices in the same run", () => {
    const rows = [mk("1", a, b), mk("2", b, c), mk("3", c, a)];
    const graph = buildKinGraph([a, b, c], []);
    const plan = planSort(graph, rows, new Map(rows.map((r) => [r.link.id, asParent])));
    expect(plan.entries.map((e) => e.row.link.id)).toEqual(["1", "2"]);
    expect([...plan.refused]).toEqual(["3"]);
  });

  it("lets a stored parent link be turned round without it counting against itself", () => {
    // Bo is stored as Ann's child (Ann -> Bo). Choosing "Bo is Ann's parent" reverses it; the old direction must not make that look like a loop.
    const stored = { id: "1", from: a.key, to: b.key, kind: "parent" as const, parent_role: null, adoptive: false };
    const graph = buildKinGraph([a, b], [stored]);
    const plan = planSort(graph, [mk("1", a, b)], new Map([["1", { relation: "parent", parentRole: null, label: null } satisfies SortChoice]]));
    expect(plan.refused.size).toBe(0);
    expect(plan.entries).toHaveLength(1);
  });

  it("saves everything when nothing loops, and ignores unchosen rows", () => {
    const rows = [mk("1", a, b), mk("2", b, c)];
    const graph = buildKinGraph([a, b, c], []);
    const plan = planSort(graph, rows, new Map([["1", asParent]]));
    expect(plan.entries).toHaveLength(1);
    expect(plan.refused.size).toBe(0);
  });
});
