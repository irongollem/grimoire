import { describe, expect, it } from "vitest";
import { convergeMatters } from "./converge";

describe("convergeMatters", () => {
  it("needs an incoming route and a parallel route in the quest", () => {
    const edges = [
      { target_beat_id: "b", route_kind: "parallel" as const },
      { target_beat_id: "c", route_kind: "choice" as const },
    ];
    expect(convergeMatters("b", edges)).toBe(true);
    expect(convergeMatters("c", edges)).toBe(true);
    expect(convergeMatters("a", edges)).toBe(false);
  });

  it("is irrelevant in a quest of only choices", () => {
    expect(convergeMatters("b", [{ target_beat_id: "b", route_kind: "choice" }])).toBe(false);
  });
});
