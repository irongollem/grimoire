import { describe, expect, it } from "vitest";
import { impliedSiblings, parentDateProblem, wouldCycle } from "@/lib/kinship/checks";
import { buildKinGraph, type KinPerson } from "@/lib/kinship/graph";
import type { PersonKey } from "@/types/kinship.types";

const k = (n: string): PersonKey => `npc:${n}`;
const p = (n: string, bornYear: number | null): KinPerson => ({ key: k(n), name: n, bornYear, diedYear: null, dead: false, isPc: false });
const parent = (id: string, a: string, b: string) => ({
  id,
  from: k(a),
  to: k(b),
  kind: "parent" as const,
  parent_role: null,
  adoptive: false,
});

describe("parentDateProblem", () => {
  it("flags a parent not born before the child", () => {
    expect(parentDateProblem(p("a", 1050), p("b", 1040))).toEqual({ parentBorn: 1050, childBorn: 1040 });
    expect(parentDateProblem(p("a", 1040), p("b", 1040))).not.toBeNull();
  });
  it("is quiet when the dates fit or are unknown", () => {
    expect(parentDateProblem(p("a", 1000), p("b", 1030))).toBeNull();
    expect(parentDateProblem(p("a", null), p("b", 1030))).toBeNull();
    expect(parentDateProblem(p("a", 1000), p("b", null))).toBeNull();
  });
});

describe("graph checks", () => {
  const g = buildKinGraph(
    [p("a", 1), p("b", 2), p("c", 3), p("d", 3), p("z", 4)],
    [parent("1", "a", "b"), parent("2", "b", "c"), parent("3", "b", "d")],
  );
  it("implies siblings from a shared parent", () => {
    expect(impliedSiblings(g, k("c"), k("d"))).toBe(true);
    expect(impliedSiblings(g, k("c"), k("z"))).toBe(false);
    expect(impliedSiblings(g, k("c"), k("c"))).toBe(false);
  });
  it("sees a loop when the child is the parent or an ancestor of it", () => {
    expect(wouldCycle(g, k("c"), k("a"))).toBe(true);
    expect(wouldCycle(g, k("c"), k("b"))).toBe(true);
    expect(wouldCycle(g, k("c"), k("c"))).toBe(true);
    expect(wouldCycle(g, k("a"), k("c"))).toBe(false);
    expect(wouldCycle(g, k("z"), k("a"))).toBe(false);
  });
  it("terminates on bad data that already loops", () => {
    const loop = buildKinGraph([p("a", 1), p("b", 2), p("c", 3)], [parent("1", "a", "b"), parent("2", "b", "a")]);
    expect(wouldCycle(loop, k("a"), k("c"))).toBe(false);
  });
});
