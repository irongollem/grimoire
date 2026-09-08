import { describe, expect, it } from "vitest";
import { deriveQuestConsistency, type QuestConsistencyInput } from "./consistency";
import type { QuestConsequenceAction, QuestConsequenceObjectiveStatus, QuestObjectiveStatus } from "@/types/quest.types";

const beat = (id: string, over: { title?: string; kind?: string; is_improvised?: boolean } = {}) => ({
  id,
  title: over.title ?? id,
  kind: over.kind ?? "neutral",
  is_improvised: over.is_improvised ?? false,
});

const edge = (source_beat_id: string, target_beat_id: string) => ({ source_beat_id, target_beat_id });

const objective = (id: string, status: QuestObjectiveStatus, description = id) => ({ id, description, status });

const rule = (
  action: QuestConsequenceAction,
  target_objective_id: string | null,
  on_objective_id: string | null = null,
) => ({ action, on_objective_id, target_objective_id });

const gate = (edge_id: string, objective_id: string, status: QuestConsequenceObjectiveStatus) =>
  ({ edge_id, objective_id, status });

const empty: QuestConsistencyInput = { beats: [], edges: [], objectives: [], consequences: [], gates: [] };
const check = (over: Partial<QuestConsistencyInput>) => deriveQuestConsistency({ ...empty, ...over });
const kinds = (findings: ReturnType<typeof deriveQuestConsistency>) => findings.map((f) => f.kind);

describe("deriveQuestConsistency", () => {
  it("finds nothing in an empty quest", () => {
    expect(deriveQuestConsistency(empty)).toEqual([]);
  });

  describe("a beat nothing reaches", () => {
    it("passes a plain chain from its root", () => {
      const findings = check({ beats: [beat("a"), beat("b")], edges: [edge("a", "b")] });
      expect(kinds(findings)).not.toContain("unreachable_beat");
    });

    it("catches a chain hanging off nothing — the case the per-beat gap misses", () => {
      // Every beat here HAS an edge, so `isDisconnected` is false for all of
      // them, yet none traces back to an opening: b→c is its own island because
      // `a` never points into it and b's incoming edge makes it not a root.
      const findings = check({
        beats: [beat("a"), beat("b"), beat("c")],
        edges: [edge("b", "c"), edge("c", "b")],
      });
      expect(findings.filter((f) => f.kind === "unreachable_beat").flatMap((f) => f.beatIds ?? []))
        .toEqual(expect.arrayContaining(["b", "c"]));
    });

    it("ignores archived and improvised beats", () => {
      const findings = check({
        beats: [beat("a"), beat("gone", { kind: "archived" }), beat("improv", { is_improvised: true })],
        edges: [],
      });
      expect(kinds(findings)).not.toContain("unreachable_beat");
    });

    it("truncates a long title rather than printing an essay", () => {
      const [finding] = check({ beats: [beat("a"), beat("b", { title: "x".repeat(90) })], edges: [edge("b", "a")] })
        .filter((f) => f.kind === "unreachable_beat");
      expect(finding).toBeUndefined();
      const [long] = check({ beats: [beat("lonely", { title: "y".repeat(90) })], edges: [edge("other", "lonely")] })
        .filter((f) => f.kind === "unreachable_beat");
      expect(long?.message).toContain("…");
      expect(long?.message.length).toBeLessThan(140);
    });
  });

  describe("a dormant objective nothing raises", () => {
    it("reports one with no rule behind it", () => {
      const findings = check({ objectives: [objective("o1", "dormant")] });
      expect(kinds(findings)).toContain("objective_never_raised");
    });

    it("stays quiet when a rule raises it", () => {
      const findings = check({ objectives: [objective("o1", "dormant")], consequences: [rule("raise", "o1")] });
      expect(kinds(findings)).not.toContain("objective_never_raised");
    });

    it("treats reveal as raising, because revealing implies raising", () => {
      const findings = check({ objectives: [objective("o1", "dormant")], consequences: [rule("reveal", "o1")] });
      expect(kinds(findings)).not.toContain("objective_never_raised");
    });

    it("does not count a world action as raising anything", () => {
      const findings = check({
        objectives: [objective("o1", "dormant")],
        consequences: [rule("send_broadcast", null), rule("create_calendar_event", null)],
      });
      expect(kinds(findings)).toContain("objective_never_raised");
    });

    it("says nothing about an objective that is already pending", () => {
      const findings = check({ objectives: [objective("o1", "pending")] });
      expect(kinds(findings)).not.toContain("objective_never_raised");
    });
  });

  describe("a gate that can never open", () => {
    it("reports a route waiting on a status nothing produces", () => {
      const findings = check({
        objectives: [objective("o1", "pending", "Free the prisoner")],
        gates: [gate("e1", "o1", "complete")],
      });
      const [finding] = findings.filter((f) => f.kind === "gate_never_opens");
      expect(finding?.edgeId).toBe("e1");
      expect(finding?.message).toContain("Free the prisoner");
    });

    it("stays quiet when a rule can produce the required status", () => {
      const findings = check({
        objectives: [objective("o1", "pending")],
        consequences: [rule("complete", "o1")],
        gates: [gate("e1", "o1", "complete")],
      });
      expect(kinds(findings)).not.toContain("gate_never_opens");
    });

    it("stays quiet when the objective is already in that status", () => {
      const findings = check({
        objectives: [objective("o1", "complete")],
        gates: [gate("e1", "o1", "complete")],
      });
      expect(kinds(findings)).not.toContain("gate_never_opens");
    });

    it("distinguishes failed from complete — the wrong verb does not open the gate", () => {
      const findings = check({
        objectives: [objective("o1", "pending")],
        consequences: [rule("complete", "o1")],
        gates: [gate("e1", "o1", "failed")],
      });
      expect(kinds(findings)).toContain("gate_never_opens");
    });

    it("leaves a gate on an unknown objective to the database's foreign key", () => {
      const findings = check({ objectives: [], gates: [gate("e1", "ghost", "complete")] });
      expect(kinds(findings)).not.toContain("gate_never_opens");
    });
  });

  describe("a consequence cycle", () => {
    it("reports a two-objective loop", () => {
      const findings = check({
        objectives: [objective("o1", "pending"), objective("o2", "pending")],
        consequences: [rule("fail", "o2", "o1"), rule("raise", "o1", "o2")],
      });
      const [finding] = findings.filter((f) => f.kind === "consequence_cycle");
      expect(finding).toBeDefined();
      expect(finding?.objectiveIds).toEqual(expect.arrayContaining(["o1", "o2"]));
    });

    it("reports a three-objective loop once, not once per entry point", () => {
      const findings = check({
        objectives: [objective("o1", "pending"), objective("o2", "pending"), objective("o3", "pending")],
        consequences: [rule("raise", "o2", "o1"), rule("raise", "o3", "o2"), rule("raise", "o1", "o3")],
      });
      expect(findings.filter((f) => f.kind === "consequence_cycle")).toHaveLength(1);
    });

    it("does not call a diamond a cycle", () => {
      const findings = check({
        objectives: ["o1", "o2", "o3", "o4"].map((id) => objective(id, "pending")),
        consequences: [rule("raise", "o2", "o1"), rule("raise", "o3", "o1"), rule("raise", "o4", "o2"), rule("raise", "o4", "o3")],
      });
      expect(kinds(findings)).not.toContain("consequence_cycle");
    });

    it("ignores rules a beat fires, since the engine cannot re-enter those itself", () => {
      const findings = check({
        objectives: [objective("o1", "pending")],
        consequences: [rule("raise", "o1", null)],
      });
      expect(kinds(findings)).not.toContain("consequence_cycle");
    });
  });

  describe("an objective nothing resolves", () => {
    it("is advisory, because ticking by hand is supported", () => {
      const [finding] = check({ objectives: [objective("o1", "pending")] })
        .filter((f) => f.kind === "objective_never_resolves");
      expect(finding?.advisory).toBe(true);
    });

    it("says nothing once a rule completes it", () => {
      const findings = check({ objectives: [objective("o1", "pending")], consequences: [rule("complete", "o1")] });
      expect(kinds(findings)).not.toContain("objective_never_resolves");
    });

    it("says nothing about one already settled", () => {
      const findings = check({
        objectives: [objective("done", "complete"), objective("lost", "failed")],
      });
      expect(kinds(findings)).not.toContain("objective_never_resolves");
    });
  });

  it("orders findings cause before symptom", () => {
    const findings = check({
      beats: [beat("orphan"), beat("root")],
      edges: [edge("ghost", "orphan")],
      objectives: [objective("o1", "dormant")],
      gates: [gate("e1", "o1", "complete")],
    });
    expect(kinds(findings)[0]).toBe("unreachable_beat");
  });
});

describe("cause suppresses symptom", () => {
  it("does not also call a never-raised objective un-resolvable", () => {
    // Both checks are individually true of this objective. Reporting both makes
    // one fault look like two, which is what the rendered panel showed.
    const findings = deriveQuestConsistency({
      beats: [], edges: [], gates: [], consequences: [],
      objectives: [{ id: "o1", description: "Avenge the scribe", status: "dormant" }],
    });
    expect(findings.map((f) => f.kind)).toEqual(["objective_never_raised"]);
  });

  it("still reports an un-resolvable objective that IS raised", () => {
    const findings = deriveQuestConsistency({
      beats: [], edges: [], gates: [],
      consequences: [{ action: "raise", on_objective_id: null, target_objective_id: "o1" }],
      objectives: [{ id: "o1", description: "Win them over", status: "dormant" }],
    });
    expect(findings.map((f) => f.kind)).toEqual(["objective_never_resolves"]);
  });

  it("suppresses it for an objective already blamed by a gate", () => {
    const findings = deriveQuestConsistency({
      beats: [], edges: [], consequences: [],
      objectives: [{ id: "o1", description: "Win them over", status: "pending" }],
      gates: [{ edge_id: "e1", objective_id: "o1", status: "complete" }],
    });
    expect(findings.map((f) => f.kind)).toEqual(["gate_never_opens"]);
  });
});
