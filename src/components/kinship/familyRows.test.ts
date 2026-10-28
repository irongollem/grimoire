import { describe, expect, it } from "vitest";
import { bondChoices, buildFamilyGroups, kinAsConnection, kinOptions, kinRetypePatch, lifeMeta, retypedSentence, surnameOf } from "@/components/kinship/familyRows";
import { buildKinGraph } from "@/lib/kinship/graph";
import { edge, k, person, testClock } from "@/components/kinship/testGraph";

const people = [
  person("old", "Old Bren Thane", 1428, { dead: true }),
  person("mum", "Maera Thane", 1431),
  person("me", "Brenna Ashe", 1459),
  person("bro", "Tomas Thane", 1462),
  person("pcs", "Ilse Thane", 1465, { isPc: true }),
  person("hub", "Corwin Ashe", 1456),
  person("ex", "Harl Voss", 1450),
  person("kid", "Wren Ashe", 1483),
  person("cuz", "Edda Holt", null),
  person("hubdad", "Gar Ashe", 1420),
];
const edges = [
  edge("1", "old", "me", "parent", { adoptive: true }),
  edge("2", "mum", "me", "parent", { parent_role: "mother" }),
  edge("3", "old", "bro", "parent"),
  edge("4", "mum", "bro", "parent"),
  edge("5", "old", "pcs", "parent"),
  edge("6", "me", "hub", "spouse"),
  edge("7", "me", "ex", "former_spouse"),
  edge("8", "me", "kid", "parent"),
  edge("9", "me", "cuz", "relative"),
  edge("10", "hubdad", "hub", "parent"),
];
const graph = buildKinGraph(people, edges);
const map = new Map(people.map((p) => [p.key, p]));

describe("buildFamilyGroups", () => {
  const groups = buildFamilyGroups(graph, map, k("me"), testClock(), new Map([["9", "cousin"]]));

  it("orders the groups and drops the empty ones", () => {
    expect(groups.map((g) => g.id)).toEqual(["parents", "spouses", "siblings", "children", "relatives"]);
    expect(buildFamilyGroups(graph, map, k("kid"), testClock()).map((g) => g.id)).toEqual(["parents"]);
  });

  it("marks adoptive and parent role on parents, oldest first", () => {
    const parents = groups[0].rows;
    expect(parents.map((r) => r.person.name)).toEqual(["Old Bren Thane", "Maera Thane"]);
    expect(parents[0].meta).toEqual(["born 1428", "dead", "adoptive"]);
    expect(parents[1].meta).toEqual(["born 1431", "64"]);
    expect(parents[1].word).toBe("mother");
  });

  it("draws current spouses before former ones, with a door for one who has a family", () => {
    const spouses = groups[1].rows;
    expect(spouses.map((r) => r.person.name)).toEqual(["Corwin Ashe", "Harl Voss"]);
    expect(spouses[0].door).toBe("Ashe");
    expect(spouses[1].door).toBeNull();
    expect(spouses[1].word).toBe("former spouse");
  });

  it("captions derived siblings and gives them no link to remove", () => {
    const siblings = groups[2];
    expect(siblings.caption).toBe("from shared parents");
    expect(siblings.rows.every((r) => r.link === null)).toBe(true);
    expect(siblings.rows.find((r) => r.person.isPc)?.meta).toContain("PC");
  });

  it("gives a spouse no door when they have no family of their own", () => {
    const solo = buildKinGraph(people, [edge("6", "me", "hub", "spouse")]);
    expect(buildFamilyGroups(solo, map, k("me"), testClock())[0]!.rows[0]!.door).toBeNull();
  });

  it("gives a spouse a door when they have a sibling but no parents on record", () => {
    const withSibling = buildKinGraph([...people, person("hsis", "Hild Ashe", 1458)], [edge("6", "me", "hub", "spouse"), edge("11", "hub", "hsis", "sibling")]);
    const spouse = buildFamilyGroups(withSibling, new Map([...map, [k("hsis"), person("hsis", "Hild Ashe", 1458)]]), k("me"), testClock())[0]!.rows[0]!;
    expect(spouse.door).toBe("Ashe");
  });

  it("labels a relative with the link note", () => {
    expect(groups[4].rows[0].word).toBe("cousin");
    expect(buildFamilyGroups(graph, map, k("me"), testClock())[4].rows[0].word).toBe("relative");
  });
});

describe("lifeMeta", () => {
  it("gives birth year and age to the living, birth year and 'dead' to the dead", () => {
    expect(lifeMeta({ key: k("a"), name: "A", bornYear: 1459, diedYear: null, dead: false, isPc: false }, testClock())).toEqual(["born 1459", "36"]);
    expect(lifeMeta({ key: k("a"), name: "A", bornYear: 1428, diedYear: null, dead: true, isPc: false }, testClock())).toEqual(["born 1428", "dead"]);
  });
  it("says nothing for an unknown birth year", () => {
    expect(lifeMeta({ key: k("a"), name: "A", bornYear: null, diedYear: null, dead: false, isPc: false }, testClock())).toEqual([]);
  });
});

describe("surnameOf", () => {
  it("takes the last word", () => {
    expect(surnameOf("Corwin Ashe")).toBe("Ashe");
    expect(surnameOf("Hale")).toBe("Hale");
  });
});

describe("changing a relation in place", () => {
  const groups = buildFamilyGroups(graph, map, k("me"), testClock(), new Map([["9", "cousin"]]));
  const rowFor = (key: string) => groups.flatMap((g) => g.rows).find((r) => r.key === k(key))!;

  it("gives each row its word and relation", () => {
    expect(rowFor("mum").word).toBe("mother");
    expect(rowFor("old").word).toBe("parent");
    expect(rowFor("ex").word).toBe("former spouse");
    expect(rowFor("cuz").word).toBe("cousin");
    expect(rowFor("kid").relation).toBe("child");
  });

  it("marks the current relation and leaves a clean choice unspoken", () => {
    const opts = kinOptions(graph, k("me"), rowFor("mum"));
    expect(opts.find((o) => o.current)?.id).toBe("parent:mother");
    expect(opts.find((o) => o.id === "spouse")).toMatchObject({ problem: null, blocked: false });
  });

  it("speaks the dates and blocks a loop or an implied sibling", () => {
    const kid = kinOptions(graph, k("me"), rowFor("kid"));
    expect(kid.find((o) => o.id === "parent")?.problem).toBe("Wren Ashe was born 24 years after Brenna Ashe.");
    expect(kid.find((o) => o.id === "parent")?.blocked).toBe(false);
    // Hub's father Gar is also a parent line above Corwin; making Corwin Brenna's parent loops nothing,
    // but making Brenna's own child Wren her parent while Wren is nobody's ancestor does not either: a loop needs an ancestor.
    const loop = buildKinGraph(people, [...edges, edge("11", "kid", "cuz", "parent")]);
    const cycleRows = buildFamilyGroups(loop, map, k("cuz"), testClock());
    const meRow = cycleRows.flatMap((g) => g.rows).find((r) => r.key === k("me"));
    expect(meRow).toBeDefined();
    const brenna = kinOptions(loop, k("cuz"), meRow!);
    expect(brenna.find((o) => o.id === "child")?.blocked).toBe(true);
  });

  it("writes the pair the other way round when parent becomes child, keeping adoption", () => {
    const old = rowFor("old");
    const opts = kinOptions(graph, k("me"), old);
    const child = opts.find((o) => o.id === "child")!;
    const patch = kinRetypePatch(old.link!, k("me"), old.key, child, "");
    expect(patch).toMatchObject({ kind: "parent", from_npc_id: "me", to_npc_id: "old", adoptive: true, parent_role: null });
  });

  it("clears a relative's note word when it leaves relative, and keeps a free note otherwise", () => {
    const cuz = rowFor("cuz");
    const sib = kinOptions(graph, k("me"), cuz).find((o) => o.id === "sibling")!;
    expect(kinRetypePatch(cuz.link!, k("me"), cuz.key, sib, "cousin").note).toBe("");
    const mum = rowFor("mum");
    const spouse = kinOptions(graph, k("me"), mum).find((o) => o.id === "spouse")!;
    expect(kinRetypePatch(mum.link!, k("me"), mum.key, spouse, "dear").note).toBe("dear");
  });

  it("adapts a kin row to the Connection the retype mutation reads", () => {
    const kid = rowFor("kid");
    expect(kinAsConnection(kid.link!, k("me"), kid, "")).toMatchObject({
      source: "kin", row_id: "8", type: "parent_of", outward: true, other_kind: "npc", other_id: "kid", other_name: "Wren Ashe", note: null,
    });
    const mum = rowFor("mum");
    expect(kinAsConnection(mum.link!, k("me"), mum, "dear")).toMatchObject({ outward: false, note: "dear" });
  });

  it("offers bonds only, never a record home, the common ones first", () => {
    const bonds = bondChoices(k("me"), k("mum"));
    expect(bonds.length).toBeGreaterThan(0);
    expect(bonds.every((c) => !c.home)).toBe(true);
    const firstRare = bonds.findIndex((c) => !c.common);
    expect(firstRare).toBeGreaterThan(0);
    expect(bonds.slice(firstRare).some((c) => c.common)).toBe(false);
  });

  it("says what the row became, in the subject's possessive", () => {
    const opts = kinOptions(graph, k("me"), rowFor("mum"));
    expect(retypedSentence("Maera", "Brenna", opts.find((o) => o.id === "spouse")!)).toBe("Maera is now Brenna’s spouse.");
  });

  it("keeps a chosen parent role and drops one the move leaves behind", () => {
    const mum = rowFor("mum");
    const father = kinOptions(graph, k("me"), mum).find((o) => o.id === "parent:father")!;
    expect(kinRetypePatch(mum.link!, k("me"), mum.key, father, "").parent_role).toBe("father");
    const spouse = kinOptions(graph, k("me"), mum).find((o) => o.id === "spouse")!;
    expect(kinRetypePatch(mum.link!, k("me"), mum.key, spouse, "").parent_role).toBeNull();
  });
});
