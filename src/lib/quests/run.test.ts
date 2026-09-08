import { describe, expect, it } from "vitest";
import { formatSiteSummary, rankQuestJumpTargets, resolveCurrentSite, soleOpenOutgoingEdgeId } from "./run";
import type { SiteGraphLocation } from "./run";
import type { QuestRuntimeChoice, QuestRuntimeJumpTarget } from "@/types/quest.types";

const target = (beat_id: string, beat_title = beat_id): QuestRuntimeJumpTarget => ({
  beat_id, quest_id: "q1", quest_title: "Main", beat_title, beat_kind: "neutral", is_improvised: false,
});

const choice = (edge_id: string, gate: QuestRuntimeChoice["gate"] = null): QuestRuntimeChoice => ({
  edge_id, quest_id: "q1", beat_id: `beat-${edge_id}`, beat_title: edge_id, beat_kind: "neutral", gate, effects: [],
});
const openGate = { objective_id: "o1", objective: "Save the princess", required_status: "complete", current_status: "complete", is_open: true } as const;
const closedGate = { ...openGate, current_status: "pending", is_open: false } as const;

describe("run-mode jump ranking", () => {
  it("ranks recently visited beats ahead of the rest", () => {
    const ranked = rankQuestJumpTargets(
      [target("cellar"), target("attic"), target("hall")],
      ["hall"],
    );
    expect(ranked.map((row) => row.beat_id)).toEqual(["hall", "attic", "cellar"]);
  });

  it("falls back to beat title so the order never depends on fetch order", () => {
    const ranked = rankQuestJumpTargets([target("b", "Beta"), target("a", "Alpha")], []);
    expect(ranked.map((row) => row.beat_title)).toEqual(["Alpha", "Beta"]);
  });

  it("preserves the order recent beats were visited in", () => {
    const ranked = rankQuestJumpTargets(
      [target("first"), target("second"), target("cold")],
      ["second", "first"],
    );
    expect(ranked.map((row) => row.beat_id)).toEqual(["second", "first", "cold"]);
  });
});

describe("soleOpenOutgoingEdgeId", () => {
  it("advances through an ungated route when it is the only one", () => {
    expect(soleOpenOutgoingEdgeId([choice("e1")])).toBe("e1");
  });

  it("refuses to guess between two open routes", () => {
    expect(soleOpenOutgoingEdgeId([choice("e1"), choice("e2")])).toBeNull();
  });

  it("does not count a closed route as a candidate, so it cannot block the shortcut", () => {
    expect(soleOpenOutgoingEdgeId([choice("e1", closedGate), choice("e2", openGate)])).toBe("e2");
  });

  it("refuses when every route is closed", () => {
    expect(soleOpenOutgoingEdgeId([choice("e1", closedGate), choice("e2", closedGate)])).toBeNull();
  });

  it("refuses at a dead end", () => {
    expect(soleOpenOutgoingEdgeId([])).toBeNull();
  });
});

const loc = (id: string, location_type: SiteGraphLocation["location_type"], parent_id: string | null): SiteGraphLocation => ({ id, location_type, parent_id });

describe("resolveCurrentSite", () => {
  const dungeon = loc("dungeon-1", "dungeon", null);
  const room = loc("room-1", "room", "dungeon-1");
  const locations = [dungeon, room, loc("town-1", "town", null)];

  it("walks up from a room to its site", () => {
    expect(resolveCurrentSite("room-1", locations)).toBe(dungeon);
  });

  it("returns the site itself when the party stands there but has entered no room yet", () => {
    expect(resolveCurrentSite("dungeon-1", locations)).toBe(dungeon);
  });

  it("returns null when the party's position is not inside any site", () => {
    expect(resolveCurrentSite("town-1", locations)).toBeNull();
  });

  it("returns null when the party's position is unknown", () => {
    expect(resolveCurrentSite(null, locations)).toBeNull();
  });

  it("returns null for a stale or missing location id", () => {
    expect(resolveCurrentSite("ghost", locations)).toBeNull();
  });

  it("does not loop forever on a malformed ancestor cycle", () => {
    const cyclic = [loc("a", "room", "b"), loc("b", "room", "a")];
    expect(resolveCurrentSite("a", cyclic)).toBeNull();
  });
});

describe("formatSiteSummary", () => {
  it("reads as one line: name, type, room count, explored count", () => {
    expect(formatSiteSummary({ name: "The Sunken Vault", location_type: "dungeon" }, 5, 2))
      .toBe("The Sunken Vault · dungeon · 5 rooms · 2 explored");
  });

  it("singularizes a lone room", () => {
    expect(formatSiteSummary({ name: "The Ossuary", location_type: "dungeon" }, 1, 0))
      .toBe("The Ossuary · dungeon · 1 room · 0 explored");
  });
});
