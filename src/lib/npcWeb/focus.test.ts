import { describe, expect, it } from "vitest";

import { dimNonMembers } from "./focus";

const faded = (c: string) => `dim(${c})`;
const nodes = () => ({
  "npc:a": { nodeColor: "red", dimmed: false },
  "npc:b": { nodeColor: "blue", dimmed: false },
  "pc:c": { nodeColor: "gold", dimmed: false },
});

describe("dimNonMembers", () => {
  it("fades everyone outside the faction and leaves members alone", () => {
    const result = dimNonMembers(nodes(), new Set(["npc:a"]), faded);

    expect(result["npc:a"]).toEqual({ nodeColor: "red", dimmed: false });
    expect(result["npc:b"]).toEqual({ nodeColor: "dim(blue)", dimmed: true });
    expect(result["pc:c"].dimmed).toBe(true);
  });

  it("does nothing when no faction is focused", () => {
    const result = dimNonMembers(nodes(), new Set(), faded);
    expect(Object.values(result).every((n) => !n.dimmed)).toBe(true);
  });

  // The edge case this exists for: narrow the search until no member of the
  // focused faction is left and an ungated version fades every node and lights
  // none — a graph that looks broken rather than one that is empty.
  it("does nothing when the faction has nobody on screen", () => {
    const result = dimNonMembers(nodes(), new Set(["npc:elsewhere"]), faded);

    expect(Object.values(result).every((n) => !n.dimmed)).toBe(true);
    expect(result["npc:a"].nodeColor).toBe("red");
  });

  it("fades nobody when everyone present is a member", () => {
    const result = dimNonMembers(nodes(), new Set(["npc:a", "npc:b", "pc:c"]), faded);
    expect(Object.values(result).every((n) => !n.dimmed)).toBe(true);
  });

  it("copes with an empty graph", () => {
    expect(dimNonMembers({}, new Set(["npc:a"]), faded)).toEqual({});
  });
});
