import { describe, expect, it } from "vitest";
import type { CanonClue, CanonEntry } from "@/types/canon.types";
import { isNewCanon, wayInSteps } from "./canonWayIn";

const entry = (over: Partial<CanonEntry>): CanonEntry => ({ id: "e", part: "truth", premise_kind: null, body: null, ...over }) as CanonEntry;
const clue = (secret_id: string) => ({ id: `c-${secret_id}`, secret_id }) as CanonClue;
const doc = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const done = (steps: ReturnType<typeof wayInSteps>) => steps.map((s) => s.done);

describe("wayInSteps", () => {
  // Bug caught: a pitch entry created empty (the "Write the pitch" button) counting as a written pitch.
  it("counts a pitch only when it has words, and only a pitch", () => {
    const blank = entry({ id: "p", part: "premise", premise_kind: "pitch", body: null });
    expect(wayInSteps([blank], [])[0].done).toBe(false);
    expect(wayInSteps([entry({ ...blank, body: doc("A drowned kingdom") })], [])[0].done).toBe(true);
    expect(wayInSteps([entry({ ...blank, premise_kind: "theme", body: doc("x") })], [])[0].done).toBe(false);
  });

  // Bug caught: two truths finishing the step, or a fourth pushing the count past three.
  it("wants three truths and caps the count at three", () => {
    const truths = (n: number) => Array.from({ length: n }, (_, i) => entry({ id: `t${i}`, part: "truth" }));
    expect(wayInSteps(truths(2), [])[1]).toEqual({ id: "truths", done: false, count: 2 });
    expect(wayInSteps(truths(5), [])[1]).toEqual({ id: "truths", done: true, count: 3 });
  });

  // Bug caught: a secret with no clue (or a clue of another secret) finishing the last step.
  it("finishes the secret step only for a secret that has a clue of its own", () => {
    const secret = entry({ id: "s", part: "secret" });
    expect(wayInSteps([secret], [])[3].done).toBe(false);
    expect(wayInSteps([secret], [clue("other")])[3].done).toBe(false);
    expect(wayInSteps([secret], [clue("s")])[3].done).toBe(true);
    expect(wayInSteps([entry({ part: "force" })], [])[2].done).toBe(true);
  });
});

describe("isNewCanon", () => {
  // Bug caught: the way in disappearing with one step still open, or never going away once all are done.
  it("is new until every step is done", () => {
    expect(isNewCanon([], wayInSteps([], []))).toBe(true);
    const all = [
      entry({ id: "p", part: "premise", premise_kind: "pitch", body: doc("x") }),
      entry({ id: "t1" }), entry({ id: "t2" }), entry({ id: "t3" }),
      entry({ id: "f", part: "force" }), entry({ id: "s", part: "secret" }),
    ];
    const steps = wayInSteps(all, [clue("s")]);
    expect(done(steps)).toEqual([true, true, true, true]);
    expect(isNewCanon(all, steps)).toBe(false);
  });

  // Bug caught: an established canon with no secret yet (the maintainer's own: seven truths, four forces) had its chapters
  // replaced by the way in.
  it("is not new once the canon is established, even with a step still open", () => {
    const established = Array.from({ length: 8 }, (_, i) => entry({ id: `t${i}` }));
    expect(isNewCanon(established, wayInSteps(established, []))).toBe(false);
    expect(isNewCanon(established.slice(0, 7), wayInSteps(established.slice(0, 7), []))).toBe(true);
  });
});
