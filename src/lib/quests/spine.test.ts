import { describe, expect, it } from "vitest";
import {
  deriveObjectiveStatuses,
  describeSpineRoutes,
  planObjectiveConsequences,
  planSpineBeats,
  planSpineRoutes,
} from "./spine";
import type { QuestObjectiveResult, QuestSpineBeatResult, QuestSpineRouteResult } from "@/ai/types";

const twoBeats: QuestSpineBeatResult[] = [
  { key: "opening", title: "The bell rings", dm_content: "A bell tolls under the church.", kind: "social" },
  { key: "confront", title: "Face the ringer", dm_content: "Something answers the ringing.", kind: "combat" },
];
const oneRoute: QuestSpineRouteResult[] = [{ from: "opening", to: "confront" }];
const twoObjectives: QuestObjectiveResult[] = [
  { description: "Learn who rings the bell", raised_by: "opening" },
  { description: "Confront the ringer", raised_by: "confront" },
];

describe("planSpineBeats", () => {
  it("returns nothing when beats is absent", () => {
    expect(planSpineBeats(undefined)).toEqual([]);
  });

  it("normalizes an unknown kind to neutral", () => {
    const beats: QuestSpineBeatResult[] = [{ key: "a", title: "A beat", dm_content: "", kind: "mystical" }];
    expect(planSpineBeats(beats)).toEqual([
      { key: "a", title: "A beat", kind: "neutral", dmContentPlain: "" },
    ]);
  });

  it("keeps a recognized kind as-is", () => {
    const drafts = planSpineBeats(twoBeats);
    expect(drafts.map((b) => b.kind)).toEqual(["social", "combat"]);
  });

  it("drops beats with a blank key or title, and de-duplicates keys", () => {
    const beats: QuestSpineBeatResult[] = [
      { key: "a", title: "First", dm_content: "", kind: "neutral" },
      { key: "", title: "No key", dm_content: "", kind: "neutral" },
      { key: "b", title: "", dm_content: "", kind: "neutral" },
      { key: "a", title: "Duplicate key", dm_content: "", kind: "neutral" },
    ];
    expect(planSpineBeats(beats).map((b) => b.key)).toEqual(["a"]);
  });

  it("normalizes a non-string kind to neutral rather than throwing", () => {
    // JSON.parse output is never actually checked against these interfaces at
    // runtime (see the module doc comment) — a model that returns a number
    // where "kind" belongs must degrade, not crash the whole write path.
    const beats = [
      { key: "a", title: "A beat", dm_content: "", kind: 42 },
    ] as unknown as QuestSpineBeatResult[];
    expect(planSpineBeats(beats)[0]?.kind).toBe("neutral");
  });

  it("returns nothing when beats itself isn't an array", () => {
    expect(planSpineBeats("not-an-array" as unknown as QuestSpineBeatResult[])).toEqual([]);
  });

  it("caps a degenerate response rather than inserting dozens of beats", () => {
    const beats: QuestSpineBeatResult[] = Array.from({ length: 20 }, (_, i) => ({
      key: `beat-${i}`,
      title: `Beat ${i}`,
      dm_content: "",
      kind: "neutral",
    }));
    expect(planSpineBeats(beats).length).toBeLessThan(20);
  });
});

describe("planSpineRoutes", () => {
  it("returns nothing when routes is absent", () => {
    expect(planSpineRoutes(planSpineBeats(twoBeats), undefined)).toEqual([]);
  });

  it("returns nothing when there are no beats", () => {
    expect(planSpineRoutes([], oneRoute)).toEqual([]);
  });

  it("drops self-loops, duplicate pairs, and routes to an undeclared beat", () => {
    const beats = planSpineBeats([
      { key: "a", title: "A", dm_content: "", kind: "neutral" },
      { key: "b", title: "B", dm_content: "", kind: "neutral" },
    ]);
    const routes: QuestSpineRouteResult[] = [
      { from: "a", to: "a" },
      { from: "a", to: "b" },
      { from: "a", to: "b" },
      { from: "a", to: "ghost" },
    ];
    expect(planSpineRoutes(beats, routes)).toEqual([{ from: "a", to: "b" }]);
  });

  it("returns nothing when routes itself isn't an array", () => {
    const beats = planSpineBeats(twoBeats);
    expect(planSpineRoutes(beats, "not-an-array" as unknown as QuestSpineRouteResult[])).toEqual([]);
  });
});

describe("planObjectiveConsequences", () => {
  it("returns nothing when there are no objectives", () => {
    expect(planObjectiveConsequences(undefined, planSpineBeats(twoBeats))).toEqual([]);
  });

  it("returns nothing when there are no beats", () => {
    expect(planObjectiveConsequences(twoObjectives, [])).toEqual([]);
  });

  it("resolves one entry per objective whose raised_by names a declared beat, skipping unwired or dangling ones", () => {
    const beats = planSpineBeats([{ key: "opening", title: "Open", dm_content: "", kind: "neutral" }]);
    const objectives: QuestObjectiveResult[] = [
      { description: "Wired to opening", raised_by: "opening" },
      { description: "Wired to a beat that doesn't exist", raised_by: "ghost" },
      { description: "Not wired at all" },
    ];
    expect(planObjectiveConsequences(objectives, beats)).toEqual([{ beatKey: "opening", objectiveIndex: 0 }]);
  });
});

describe("deriveObjectiveStatuses", () => {
  it("returns all-pending when there are no objectives", () => {
    expect(deriveObjectiveStatuses(undefined, planSpineBeats(twoBeats))).toEqual([]);
  });

  it("returns all-pending when there are no beats at all", () => {
    expect(deriveObjectiveStatuses(twoObjectives, [])).toEqual(["pending", "pending"]);
  });

  it("lands a root-raised objective pending and a later-beat-raised one dormant", () => {
    // objective 0: raised_by the root ("opening") -> pending
    // objective 1: raised_by "confront", the second beat -> dormant
    const beats = planSpineBeats(twoBeats);
    expect(deriveObjectiveStatuses(twoObjectives, beats)).toEqual(["pending", "dormant"]);
  });

  it("lands an unwired objective pending — conservative, never hides a checklist item", () => {
    const beats = planSpineBeats(twoBeats);
    const objectives: QuestObjectiveResult[] = [
      { description: "No raised_by at all" },
      { description: "raised_by names a beat the hook never declared", raised_by: "ghost" },
    ];
    expect(deriveObjectiveStatuses(objectives, beats)).toEqual(["pending", "pending"]);
  });
});

describe("describeSpineRoutes", () => {
  it("returns nothing when there are no beats", () => {
    expect(describeSpineRoutes([], oneRoute)).toEqual([]);
  });

  it("numbers beats by position and renders each route as \"n → n\"", () => {
    const beats = planSpineBeats(twoBeats);
    expect(describeSpineRoutes(beats, oneRoute)).toEqual(["1 → 2"]);
  });

  it("supports branching — one beat routing to two others", () => {
    const beats = planSpineBeats([
      { key: "opening", title: "Open", dm_content: "", kind: "neutral" },
      { key: "left", title: "Left", dm_content: "", kind: "neutral" },
      { key: "right", title: "Right", dm_content: "", kind: "neutral" },
    ]);
    const routes: QuestSpineRouteResult[] = [
      { from: "opening", to: "left" },
      { from: "opening", to: "right" },
    ];
    expect(describeSpineRoutes(beats, routes)).toEqual(["1 → 2", "1 → 3"]);
  });
});
