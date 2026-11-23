import { describe, expect, it } from "vitest";
import { canonEntry } from "@/test/canonEntry";
import { aboutByTruth, filterTruths, groupTruths } from "./canonTruthView";
import type { WorldTie } from "@/lib/worldWeb/ties";

const truths = [
  canonEntry({ id: "a", part: "truth", knowledge: "all", arc_id: "arc1" }),
  canonEntry({ id: "b", part: "truth", knowledge: "some", arc_id: null }),
  canonEntry({ id: "c", part: "truth", knowledge: "secret", arc_id: "arc1" }),
  canonEntry({ id: "d", part: "truth", knowledge: "all", arc_id: null }),
];
const ids = (list: { id: string }[]) => list.map((t) => t.id);
const tie = (over: Partial<WorldTie>): WorldTie => ({ source: "link", type: "about", from_kind: "canon", from_id: "a", to_kind: "npc", to_id: "n1", to_name: "Sift", ...over }) as WorldTie;

describe("filterTruths", () => {
  it("keeps every truth for All", () => {
    expect(ids(filterTruths(truths, "any"))).toEqual(["a", "b", "c", "d"]);
  });

  // Bug caught: "Known to all" also listing the secret and some-knowledge truths (the filter matching on anything set).
  it("keeps only the truths with the chosen mark", () => {
    expect(ids(filterTruths(truths, "all"))).toEqual(["a", "d"]);
    expect(ids(filterTruths(truths, "some"))).toEqual(["b"]);
    expect(ids(filterTruths(truths, "secret"))).toEqual(["c"]);
  });

  // Bug caught: "No arc" reading as "not the chosen arc", so it hid the truths nobody had placed in an arc.
  it("keeps only the truths that belong to no arc for No arc", () => {
    expect(ids(filterTruths(truths, "no-arc"))).toEqual(["b", "d"]);
  });
});

describe("aboutByTruth", () => {
  // Bug caught: a `known_to` link, or an `about` link running the other way (a lore entry about a truth), grouping the truth.
  it("reads only about links that run from a truth to a record", () => {
    const about = aboutByTruth([tie({ type: "known_to", from_id: "b" }), tie({ from_kind: "npc", from_id: "c" }), tie({ source: "membership", from_id: "d" }), tie({})]);
    expect([...about.keys()]).toEqual(["a"]);
    expect(about.get("a")).toEqual({ kind: "npc", id: "n1", name: "Sift" });
  });

  it("keeps the first record when a truth is about several", () => {
    expect(aboutByTruth([tie({}), tie({ to_id: "n2", to_name: "Wren" })]).get("a")!.name).toBe("Sift");
  });
});

describe("groupTruths", () => {
  const about = aboutByTruth([tie({ from_id: "a", to_id: "n2", to_name: "Wren" }), tie({ from_id: "c", to_id: "n2", to_name: "Wren" }), tie({ from_id: "d", to_kind: "location", to_id: "l1", to_name: "Alder Mill" })]);

  // Bug caught: the truths about no one dropped from the grouped view, or listed before the named groups.
  it("groups by what each is about, named groups by name and the rest last, each in the order it came", () => {
    const groups = groupTruths(truths, about);
    expect(groups.map((g) => [g.label, ids(g.truths)])).toEqual([
      ["Alder Mill", ["d"]],
      ["Wren", ["a", "c"]],
      [null, ["b"]],
    ]);
  });

  // Bug caught: an empty "not about anyone" group drawn with a heading and no rows.
  it("has no rest group when every truth is about something", () => {
    expect(groupTruths([truths[0]], about).map((g) => g.label)).toEqual(["Wren"]);
  });

  // Bug caught: two records with the same name merged into one group.
  it("keeps two records of one name apart", () => {
    const same = aboutByTruth([tie({ from_id: "a", to_id: "n1", to_name: "Sift" }), tie({ from_id: "b", to_kind: "location", to_id: "l9", to_name: "Sift" })]);
    expect(groupTruths(truths, same).filter((g) => g.label === "Sift")).toHaveLength(2);
  });
});
