import { describe, expect, it } from "vitest";
import { buildFamilyGroups, lifeMeta, surnameOf } from "@/components/kinship/familyRows";
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
    expect(parents[1].meta).toEqual(["born 1431", "64", "mother"]);
  });

  it("draws current spouses before former ones, with a door for one who has a family", () => {
    const spouses = groups[1].rows;
    expect(spouses.map((r) => r.person.name)).toEqual(["Corwin Ashe", "Harl Voss"]);
    expect(spouses[0].door).toBe("Ashe");
    expect(spouses[1].door).toBeNull();
    expect(spouses[1].meta).toContain("former");
  });

  it("captions derived siblings and gives them no link to remove", () => {
    const siblings = groups[2];
    expect(siblings.caption).toBe("from shared parents");
    expect(siblings.rows.every((r) => r.link === null)).toBe(true);
    expect(siblings.rows.find((r) => r.person.isPc)?.meta).toContain("PC");
  });

  it("labels a relative with the link note", () => {
    expect(groups[4].rows[0].meta).toEqual(["cousin"]);
    expect(buildFamilyGroups(graph, map, k("me"), testClock())[4].rows[0].meta).toEqual(["relative"]);
  });
});

describe("lifeMeta", () => {
  it("gives birth year and age to the living, birth year and 'dead' to the dead", () => {
    expect(lifeMeta({ key: k("a"), name: "A", bornYear: 1459, dead: false, isPc: false }, testClock())).toEqual(["born 1459", "36"]);
    expect(lifeMeta({ key: k("a"), name: "A", bornYear: 1428, dead: true, isPc: false }, testClock())).toEqual(["born 1428", "dead"]);
  });
  it("says nothing for an unknown birth year", () => {
    expect(lifeMeta({ key: k("a"), name: "A", bornYear: null, dead: false, isPc: false }, testClock())).toEqual([]);
  });
});

describe("surnameOf", () => {
  it("takes the last word", () => {
    expect(surnameOf("Corwin Ashe")).toBe("Ashe");
    expect(surnameOf("Hale")).toBe("Hale");
  });
});
